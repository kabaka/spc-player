/**
 * ExportQueueManager — main thread orchestration for the export pipeline.
 *
 * Owns the Web Worker lifecycle, FIFO job queue, and cancellation.
 * Publishes observable state to the Zustand export slice; the store
 * never reaches into this manager.
 *
 * @see docs/design/export-pipeline.md §3 (Queue Management)
 * @see docs/design/export-pipeline.md §5 (Cancellation)
 */

import { loadDspWasmBytes } from '@/audio/wasm-loader';
import {
  type ExportMetadata,
  type ExportPhase,
  type ExportWorkerToMain,
  type MainToExportWorker,
  PROTOCOL_VERSION,
} from '@/audio/worker-protocol';
import { exportError } from '@/errors/factories';
import { reportError } from '@/errors/report';
import { downloadBlob } from '@/export/download';
import { loadSpcFromStorage } from '@/storage/spc-storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Format mapping for wire protocol. */
const FORMAT_TO_WIRE = {
  wav: 'wav',
  flac: 'flac',
  ogg: 'ogg-vorbis',
  mp3: 'mp3',
  opus: 'opus',
} as const;

const MIME_TYPES: Record<string, string> = {
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  opus: 'audio/webm',
  webm: 'audio/webm',
  zip: 'application/zip',
};

/** DSP native sample rate. */
const DSP_SAMPLE_RATE = 32_000;

/** Internal job descriptor — operational state not exposed to Zustand. */
export interface ExportJobDescriptor {
  readonly id: string;
  readonly label: string;
  readonly format: 'wav' | 'flac' | 'ogg' | 'mp3' | 'opus';
  readonly sampleRate: 32000 | 44100 | 48000 | 96000;
  readonly durationSeconds: number;
  readonly fadeSeconds: number;
  readonly voiceMask: number;
  readonly quality: number;
  readonly metadata: ExportMetadata;
  /** SPC data source — either inline bytes or an IndexedDB hash for on-demand loading. */
  readonly spcSource:
    | { readonly type: 'buffer'; readonly data: Uint8Array }
    | { readonly type: 'indexeddb'; readonly hash: string };
  /** Batch ID if this job belongs to a batch. */
  readonly batchId: string | null;
}

/** Callbacks the queue manager uses to push state into the Zustand store. */
export interface ExportStoreCallbacks {
  onJobQueued: (id: string, label: string) => void;
  onJobStarted: (id: string) => void;
  onJobProgress: (id: string, progress: number, phase: ExportPhase) => void;
  onJobComplete: (id: string, outputSize: number) => void;
  onJobFailed: (id: string, error: string) => void;
  onJobCancelled: (id: string) => void;
}

/** Completed file data held for batch ZIP packaging. */
interface CompletedFile {
  readonly name: string;
  readonly data: Uint8Array;
}

// ---------------------------------------------------------------------------
// ExportQueueManager
// ---------------------------------------------------------------------------

export class ExportQueueManager {
  private pending: ExportJobDescriptor[] = [];
  private activeJob: ExportJobDescriptor | null = null;
  private worker: Worker | null = null;
  private wasmBytes: ArrayBuffer | null = null;
  private workerReady = false;
  private workerReadyResolve: (() => void) | null = null;
  private abortController: AbortController | null = null;
  private callbacks: ExportStoreCallbacks;
  private isDestroyed = false;

  /** Batch tracking: batchId → list of completed files. */
  private batchFiles = new Map<string, CompletedFile[]>();
  /** Batch tracking: batchId → total expected jobs. */
  private batchTotals = new Map<string, number>();

  constructor(callbacks: ExportStoreCallbacks) {
    this.callbacks = callbacks;
  }

  /** Number of pending + active jobs. */
  get queueLength(): number {
    return this.pending.length + (this.activeJob ? 1 : 0);
  }

  /** Enqueue a single export job and start processing if idle. */
  enqueue(descriptor: ExportJobDescriptor): void {
    this.pending.push(descriptor);
    this.callbacks.onJobQueued(descriptor.id, descriptor.label);
    this.processNext();
  }

  /** Enqueue multiple jobs as a batch. */
  enqueueBatch(descriptors: readonly ExportJobDescriptor[]): void {
    if (descriptors.length === 0) return;

    const batchId = descriptors[0].batchId;
    if (batchId) {
      this.batchTotals.set(batchId, descriptors.length);
      this.batchFiles.set(batchId, []);
    }

    for (const desc of descriptors) {
      this.pending.push(desc);
      this.callbacks.onJobQueued(desc.id, desc.label);
    }
    this.processNext();
  }

  /** Cancel a specific job. If active, sends cancel to worker. If pending, removes from queue. */
  cancel(jobId: string): void {
    // Check if it's the active job
    if (this.activeJob?.id === jobId) {
      this.sendToWorker({ type: 'cancel-export', jobId });
      this.abortController?.abort();
      return;
    }

    // Remove from pending queue
    const index = this.pending.findIndex((j) => j.id === jobId);
    if (index !== -1) {
      this.pending.splice(index, 1);
      this.callbacks.onJobCancelled(jobId);
    }
  }

  /** Cancel all jobs — active + pending. */
  cancelAll(): void {
    // Cancel active job
    if (this.activeJob) {
      this.sendToWorker({
        type: 'cancel-export',
        jobId: this.activeJob.id,
      });
      this.abortController?.abort();
    }

    // Cancel all pending jobs
    const pendingIds = this.pending.map((j) => j.id);
    this.pending = [];
    for (const id of pendingIds) {
      this.callbacks.onJobCancelled(id);
    }

    // Discard batch tracking
    this.batchFiles.clear();
    this.batchTotals.clear();
  }

  /** Tear down the worker and release all resources. */
  destroy(): void {
    this.isDestroyed = true;
    this.cancelAll();
    this.activeJob = null;
    this.terminateWorker();
    this.wasmBytes = null;
  }

  // -----------------------------------------------------------------------
  // Private — Worker lifecycle
  // -----------------------------------------------------------------------

  private async ensureWorker(): Promise<void> {
    if (this.worker && this.workerReady) return;

    if (!this.wasmBytes) {
      this.wasmBytes = await loadDspWasmBytes();
    }

    if (this.isDestroyed) return;

    this.worker = new Worker(
      new URL('../workers/export-worker.ts', import.meta.url),
      { type: 'module' },
    );

    this.workerReady = false;
    const readyPromise = new Promise<void>((resolve) => {
      this.workerReadyResolve = resolve;
    });

    this.worker.onmessage = (event: MessageEvent<ExportWorkerToMain>) => {
      this.handleWorkerMessage(event.data);
    };

    this.worker.onerror = (event: ErrorEvent) => {
      reportError(
        exportError('EXPORT_ENCODING_FAILED', {
          detail: event.message,
        }),
      );
      this.handleWorkerCrash();
    };

    // Send init with WASM bytes (cloned, not transferred)
    const initMsg: MainToExportWorker.Init = {
      type: 'init',
      version: PROTOCOL_VERSION,
      wasmBytes: this.wasmBytes,
    };
    this.worker.postMessage(initMsg);

    await readyPromise;
  }

  private terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.workerReady = false;
    this.workerReadyResolve = null;
  }

  private sendToWorker(
    msg: MainToExportWorker,
    transfer?: Transferable[],
  ): void {
    if (transfer) {
      this.worker?.postMessage(msg, transfer);
    } else {
      this.worker?.postMessage(msg);
    }
  }

  // -----------------------------------------------------------------------
  // Private — Job processing
  // -----------------------------------------------------------------------

  private async processNext(): Promise<void> {
    if (this.activeJob || this.pending.length === 0 || this.isDestroyed) return;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length guard above ensures non-empty
    const job = this.pending.shift()!;
    this.activeJob = job;
    this.abortController = new AbortController();

    try {
      await this.ensureWorker();
      if (this.isDestroyed || this.abortController.signal.aborted) return;

      // Load SPC data
      const spcData = await this.loadSpcData(job);
      if (!spcData) {
        this.callbacks.onJobFailed(job.id, 'Failed to load SPC file data');
        this.activeJob = null;
        this.abortController = null;
        this.processNext();
        return;
      }

      if (this.abortController.signal.aborted) {
        this.activeJob = null;
        this.abortController = null;
        this.processNext();
        return;
      }

      this.callbacks.onJobStarted(job.id);

      // Compute sample counts from seconds
      const durationSamples = Math.round(job.durationSeconds * DSP_SAMPLE_RATE);
      const fadeOutSamples = Math.round(job.fadeSeconds * DSP_SAMPLE_RATE);

      const startMsg: MainToExportWorker.StartExport = {
        type: 'start-export',
        jobId: job.id,
        spcData: spcData.buffer as ArrayBuffer,
        format: FORMAT_TO_WIRE[job.format],
        sampleRate: job.sampleRate,
        durationSamples,
        fadeOutSamples,
        voiceMask: job.voiceMask,
        quality: this.getQualityForFormat(job),
        bitDepth: 16,
        metadata: job.metadata,
      };

      // Transfer spcData buffer to worker (zero-copy)
      this.sendToWorker(startMsg, [startMsg.spcData]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.callbacks.onJobFailed(job.id, detail);
      this.activeJob = null;
      this.abortController = null;
      this.processNext();
    }
  }

  private async loadSpcData(
    job: ExportJobDescriptor,
  ): Promise<Uint8Array | null> {
    if (job.spcSource.type === 'buffer') {
      return job.spcSource.data;
    }

    const buffer = await loadSpcFromStorage(job.spcSource.hash);
    if (!buffer) return null;
    return new Uint8Array(buffer);
  }

  private getQualityForFormat(job: ExportJobDescriptor): number {
    switch (job.format) {
      case 'ogg':
        return 6; // OGG Vorbis quality default
      case 'mp3':
        return 2; // VBR quality default
      default:
        return 0;
    }
  }

  // -----------------------------------------------------------------------
  // Private — Worker message handling
  // -----------------------------------------------------------------------

  private handleWorkerMessage(msg: ExportWorkerToMain): void {
    switch (msg.type) {
      case 'ready':
        this.handleReady(msg);
        break;
      case 'progress':
        this.handleProgress(msg);
        break;
      case 'complete':
        this.handleComplete(msg);
        break;
      case 'error':
        this.handleError(msg);
        break;
      case 'cancelled':
        this.handleCancelled(msg);
        break;
    }
  }

  private handleReady(msg: ExportWorkerToMain.Ready): void {
    if (msg.version !== PROTOCOL_VERSION) {
      reportError(
        exportError('EXPORT_ENCODING_FAILED', {
          detail: `Protocol version mismatch: worker=${msg.version}, main=${PROTOCOL_VERSION}`,
        }),
      );
      this.terminateWorker();
      return;
    }
    this.workerReady = true;
    this.workerReadyResolve?.();
    this.workerReadyResolve = null;
  }

  private handleProgress(msg: ExportWorkerToMain.Progress): void {
    const phase =
      msg.phase === 'rendering' || msg.phase === 'encoding'
        ? msg.phase
        : ('encoding' as const);
    this.callbacks.onJobProgress(msg.jobId, msg.overallProgress, phase);
  }

  private handleComplete(msg: ExportWorkerToMain.Complete): void {
    const job = this.activeJob;
    const fileData = new Uint8Array(msg.fileData);

    this.callbacks.onJobComplete(msg.jobId, fileData.byteLength);

    // Clear active job before batch check so collectBatchFile can detect
    // that no active job belongs to the batch, triggering finalization.
    this.activeJob = null;
    this.abortController = null;

    // Handle batch vs single download
    if (job?.batchId) {
      this.collectBatchFile(job.batchId, msg.suggestedName, fileData);
    } else {
      downloadBlob(fileData, msg.suggestedName, msg.mimeType);
    }

    this.maybeTerminateWorker();
    this.processNext();
  }

  private handleError(msg: ExportWorkerToMain.Error): void {
    reportError(
      exportError('EXPORT_ENCODING_FAILED', {
        jobId: msg.jobId,
        detail: msg.message,
      }),
    );

    this.callbacks.onJobFailed(msg.jobId, msg.message);
    this.activeJob = null;
    this.abortController = null;
    this.maybeTerminateWorker();
    this.processNext();
  }

  private handleCancelled(msg: ExportWorkerToMain.Cancelled): void {
    this.callbacks.onJobCancelled(msg.jobId);
    this.activeJob = null;
    this.abortController = null;
    this.maybeTerminateWorker();
    this.processNext();
  }

  private handleWorkerCrash(): void {
    if (this.activeJob) {
      this.callbacks.onJobFailed(this.activeJob.id, 'Export worker crashed');
    }
    this.activeJob = null;
    this.abortController = null;
    this.worker = null;
    this.workerReady = false;
    this.processNext();
  }

  /** Terminate the worker when all jobs are done. */
  private maybeTerminateWorker(): void {
    if (this.pending.length === 0 && !this.activeJob) {
      this.terminateWorker();
    }
  }

  // -----------------------------------------------------------------------
  // Private — Batch ZIP packaging
  // -----------------------------------------------------------------------

  private collectBatchFile(
    batchId: string,
    filename: string,
    data: Uint8Array,
  ): void {
    const files = this.batchFiles.get(batchId);
    if (!files) return;

    files.push({ name: filename, data });

    const total = this.batchTotals.get(batchId) ?? 0;
    const remaining = this.pending.filter((j) => j.batchId === batchId).length;

    // All batch jobs are done when no more pending jobs with this batchId exist
    // and the active job (if any) isn't part of this batch
    if (remaining === 0 && this.activeJob?.batchId !== batchId) {
      this.finalizeBatch(batchId, files, total);
    }
  }

  private async finalizeBatch(
    batchId: string,
    files: CompletedFile[],
    _total: number,
  ): Promise<void> {
    this.batchFiles.delete(batchId);
    this.batchTotals.delete(batchId);

    if (files.length === 0) return;

    // For single-file batches, download directly
    if (files.length === 1) {
      const file = files[0];
      const ext = file.name.split('.').pop() ?? '';
      const mimeType = MIME_TYPES[ext] ?? 'application/octet-stream';
      downloadBlob(file.data, file.name, mimeType);
      return;
    }

    // Build ZIP using fflate
    try {
      const { zipSync } = await import('fflate');

      const zipEntries: Record<string, Uint8Array> = {};
      for (const file of files) {
        zipEntries[file.name] = file.data;
      }

      const zipped = zipSync(zipEntries);
      const zipFilename = `SPC Export - ${new Date().toISOString().slice(0, 10)}.zip`;
      downloadBlob(new Uint8Array(zipped), zipFilename, MIME_TYPES.zip);
    } catch {
      // Fallback: download files individually if ZIP fails
      for (const file of files) {
        const ext = file.name.split('.').pop() ?? '';
        const mimeType = MIME_TYPES[ext] ?? 'application/octet-stream';
        downloadBlob(file.data, file.name, mimeType);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: ExportQueueManager | null = null;

/** Get or create the singleton ExportQueueManager. */
export function getExportQueueManager(
  callbacks: ExportStoreCallbacks,
): ExportQueueManager {
  if (!instance) {
    instance = new ExportQueueManager(callbacks);
  }
  return instance;
}

/** Reset the singleton (for testing). */
export function resetExportQueueManager(): void {
  instance?.destroy();
  instance = null;
}
