import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { ExportPhase } from '@/audio/worker-protocol';
import { PROTOCOL_VERSION } from '@/audio/worker-protocol';

import {
  ExportQueueManager,
  resetExportQueueManager,
  type ExportJobDescriptor,
  type ExportStoreCallbacks,
} from './ExportQueueManager';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/audio/wasm-loader', () => ({
  loadDspWasmBytes: vi.fn().mockResolvedValue(new ArrayBuffer(16)),
}));

vi.mock('@/storage/spc-storage', () => ({
  loadSpcFromStorage: vi.fn().mockResolvedValue(new ArrayBuffer(0x10200)),
}));

vi.mock('@/export/download', () => ({
  downloadBlob: vi.fn(),
}));

vi.mock('@/errors/report', () => ({
  reportError: vi.fn(),
}));

vi.mock('@/errors/factories', () => ({
  exportError: vi.fn((code: string, ctx: Record<string, unknown>) => ({
    code,
    message: `mock-${code}`,
    context: ctx,
  })),
}));

// Mock Worker
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  /** Simulate worker sending a message back. */
  simulateMessage(data: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

let mockWorkerInstance: MockWorker | null = null;

vi.stubGlobal(
  'Worker',
  class {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;

    constructor() {
      const mock = new MockWorker();
      this.postMessage = mock.postMessage;
      this.terminate = mock.terminate;
      // Wire up onmessage/onerror through the mock
      mockWorkerInstance = mock;

      // Proxy onmessage setter so mock stays in sync
      Object.defineProperty(this, 'onmessage', {
        get: () => mock.onmessage,
        set: (fn) => {
          mock.onmessage = fn;
        },
      });
      Object.defineProperty(this, 'onerror', {
        get: () => mock.onerror,
        set: (fn) => {
          mock.onerror = fn;
        },
      });
    }
  },
);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCallbacks(): ExportStoreCallbacks & {
  calls: Record<string, unknown[][]>;
} {
  const calls: Record<string, unknown[][]> = {
    onJobQueued: [],
    onJobStarted: [],
    onJobProgress: [],
    onJobComplete: [],
    onJobFailed: [],
    onJobCancelled: [],
  };

  return {
    calls,
    onJobQueued: vi.fn((...args: unknown[]) => {
      calls.onJobQueued.push(args);
    }),
    onJobStarted: vi.fn((...args: unknown[]) => {
      calls.onJobStarted.push(args);
    }),
    onJobProgress: vi.fn((...args: unknown[]) => {
      calls.onJobProgress.push(args);
    }),
    onJobComplete: vi.fn((...args: unknown[]) => {
      calls.onJobComplete.push(args);
    }),
    onJobFailed: vi.fn((...args: unknown[]) => {
      calls.onJobFailed.push(args);
    }),
    onJobCancelled: vi.fn((...args: unknown[]) => {
      calls.onJobCancelled.push(args);
    }),
  };
}

function makeDescriptor(
  overrides: Partial<ExportJobDescriptor> = {},
): ExportJobDescriptor {
  return {
    id: crypto.randomUUID(),
    label: 'Test Track.wav',
    format: 'wav',
    sampleRate: 44100,
    durationSeconds: 180,
    fadeSeconds: 10,
    voiceMask: 0xff,
    quality: 0,
    metadata: { title: 'Test Track' },
    spcSource: {
      type: 'buffer',
      data: new Uint8Array(0x10200),
    },
    batchId: null,
    ...overrides,
  };
}

/** Send Ready message from mock worker to complete initialization handshake. */
function sendWorkerReady(): void {
  mockWorkerInstance?.simulateMessage({
    type: 'ready',
    version: PROTOCOL_VERSION,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExportQueueManager', () => {
  let manager: ExportQueueManager;
  let callbacks: ReturnType<typeof makeCallbacks>;

  beforeEach(() => {
    callbacks = makeCallbacks();
    manager = new ExportQueueManager(callbacks);
    mockWorkerInstance = null;
  });

  afterEach(() => {
    manager.destroy();
    resetExportQueueManager();
  });

  // -----------------------------------------------------------------------
  // Queue ordering
  // -----------------------------------------------------------------------

  describe('FIFO queue ordering', () => {
    it('processes jobs in enqueue order', async () => {
      const job1 = makeDescriptor({ id: 'job-1', label: 'Song A' });
      const job2 = makeDescriptor({ id: 'job-2', label: 'Song B' });
      const job3 = makeDescriptor({ id: 'job-3', label: 'Song C' });

      manager.enqueue(job1);
      manager.enqueue(job2);
      manager.enqueue(job3);

      // All three should be queued
      expect(callbacks.onJobQueued).toHaveBeenCalledTimes(3);

      // Wait for worker init
      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      sendWorkerReady();

      // First job should start
      await vi.waitFor(() => {
        expect(callbacks.onJobStarted).toHaveBeenCalledWith('job-1');
      });

      // Complete job 1
      mockWorkerInstance?.simulateMessage({
        type: 'complete',
        jobId: 'job-1',
        fileData: new ArrayBuffer(100),
        mimeType: 'audio/wav',
        suggestedName: 'test.wav',
      });

      // Second job should start after first completes
      await vi.waitFor(() => {
        expect(callbacks.onJobStarted).toHaveBeenCalledWith('job-2');
      });
    });

    it('reports queueLength correctly', () => {
      expect(manager.queueLength).toBe(0);

      manager.enqueue(makeDescriptor({ id: 'a' }));
      manager.enqueue(makeDescriptor({ id: 'b' }));

      // Both pending, no active yet (async worker init not complete)
      // One is shifted to activeJob during processNext
      expect(manager.queueLength).toBeGreaterThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // Cancellation
  // -----------------------------------------------------------------------

  describe('cancellation', () => {
    it('cancels a pending job by removing it from the queue', () => {
      const job1 = makeDescriptor({ id: 'active' });
      const job2 = makeDescriptor({ id: 'pending' });

      manager.enqueue(job1);
      manager.enqueue(job2);

      // Cancel the pending job
      manager.cancel('pending');

      expect(callbacks.onJobCancelled).toHaveBeenCalledWith('pending');
    });

    it('sends cancel-export to worker for active job', async () => {
      const job = makeDescriptor({ id: 'active-job' });
      manager.enqueue(job);

      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      sendWorkerReady();

      await vi.waitFor(() => {
        expect(callbacks.onJobStarted).toHaveBeenCalledWith('active-job');
      });

      manager.cancel('active-job');

      expect(mockWorkerInstance?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cancel-export',
          jobId: 'active-job',
        }),
      );
    });

    it('cancelAll cancels active and all pending jobs', async () => {
      const job1 = makeDescriptor({ id: 'j1' });
      const job2 = makeDescriptor({ id: 'j2' });
      const job3 = makeDescriptor({ id: 'j3' });

      manager.enqueue(job1);
      manager.enqueue(job2);
      manager.enqueue(job3);

      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      sendWorkerReady();

      await vi.waitFor(() => {
        expect(callbacks.onJobStarted).toHaveBeenCalled();
      });

      manager.cancelAll();

      // Pending jobs should be cancelled
      const cancelledIds = (
        callbacks.onJobCancelled as ReturnType<typeof vi.fn>
      ).mock.calls.map((c: unknown[]) => c[0]);

      // At least the pending ones should be cancelled
      expect(cancelledIds.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -----------------------------------------------------------------------
  // Progress forwarding
  // -----------------------------------------------------------------------

  describe('progress forwarding', () => {
    it('forwards progress messages to onJobProgress callback', async () => {
      const job = makeDescriptor({ id: 'progress-job' });
      manager.enqueue(job);

      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      sendWorkerReady();

      await vi.waitFor(() => {
        expect(callbacks.onJobStarted).toHaveBeenCalledWith('progress-job');
      });

      // Simulate progress
      mockWorkerInstance?.simulateMessage({
        type: 'progress',
        jobId: 'progress-job',
        phase: 'rendering' as ExportPhase,
        fraction: 0.5,
        overallProgress: 0.1,
      });

      expect(callbacks.onJobProgress).toHaveBeenCalledWith(
        'progress-job',
        0.1,
        'rendering',
      );

      // Encoding phase
      mockWorkerInstance?.simulateMessage({
        type: 'progress',
        jobId: 'progress-job',
        phase: 'encoding' as ExportPhase,
        fraction: 0.75,
        overallProgress: 0.65,
      });

      expect(callbacks.onJobProgress).toHaveBeenCalledWith(
        'progress-job',
        0.65,
        'encoding',
      );
    });

    it('maps metadata/packaging phases to encoding for store', async () => {
      const job = makeDescriptor({ id: 'meta-job' });
      manager.enqueue(job);

      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      sendWorkerReady();

      await vi.waitFor(() => {
        expect(callbacks.onJobStarted).toHaveBeenCalledWith('meta-job');
      });

      mockWorkerInstance?.simulateMessage({
        type: 'progress',
        jobId: 'meta-job',
        phase: 'metadata' as ExportPhase,
        fraction: 1.0,
        overallProgress: 0.95,
      });

      // metadata phase should be mapped to 'encoding' since the store only has rendering|encoding
      expect(callbacks.onJobProgress).toHaveBeenCalledWith(
        'meta-job',
        0.95,
        'encoding',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Completion
  // -----------------------------------------------------------------------

  describe('completion', () => {
    it('calls onJobComplete and triggers download for single exports', async () => {
      const { downloadBlob } = await import('@/export/download');
      const job = makeDescriptor({ id: 'complete-job' });
      manager.enqueue(job);

      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      sendWorkerReady();

      await vi.waitFor(() => {
        expect(callbacks.onJobStarted).toHaveBeenCalledWith('complete-job');
      });

      const fileData = new ArrayBuffer(1024);
      mockWorkerInstance?.simulateMessage({
        type: 'complete',
        jobId: 'complete-job',
        fileData,
        mimeType: 'audio/wav',
        suggestedName: 'test-track.wav',
      });

      expect(callbacks.onJobComplete).toHaveBeenCalledWith(
        'complete-job',
        1024,
      );

      expect(downloadBlob).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        'test-track.wav',
        'audio/wav',
      );
    });

    it('calls onJobFailed on worker error', async () => {
      const job = makeDescriptor({ id: 'fail-job' });
      manager.enqueue(job);

      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      sendWorkerReady();

      await vi.waitFor(() => {
        expect(callbacks.onJobStarted).toHaveBeenCalledWith('fail-job');
      });

      mockWorkerInstance?.simulateMessage({
        type: 'error',
        jobId: 'fail-job',
        code: 'EXPORT_ENCODING_FAILED',
        message: 'FLAC encoder OOM',
        context: {},
      });

      expect(callbacks.onJobFailed).toHaveBeenCalledWith(
        'fail-job',
        'FLAC encoder OOM',
      );
    });

    it('calls onJobCancelled on worker cancelled response', async () => {
      const job = makeDescriptor({ id: 'cancel-ack' });
      manager.enqueue(job);

      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      sendWorkerReady();

      await vi.waitFor(() => {
        expect(callbacks.onJobStarted).toHaveBeenCalledWith('cancel-ack');
      });

      mockWorkerInstance?.simulateMessage({
        type: 'cancelled',
        jobId: 'cancel-ack',
      });

      expect(callbacks.onJobCancelled).toHaveBeenCalledWith('cancel-ack');
    });
  });

  // -----------------------------------------------------------------------
  // Worker initialization handshake
  // -----------------------------------------------------------------------

  describe('worker initialization handshake', () => {
    it('sends init message with WASM bytes and correct protocol version', async () => {
      const job = makeDescriptor({ id: 'init-test' });
      manager.enqueue(job);

      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      // The first postMessage should be the init message
      expect(mockWorkerInstance?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'init',
          version: PROTOCOL_VERSION,
          wasmBytes: expect.any(ArrayBuffer),
        }),
      );
    });

    it('does not start job processing until ready message is received', async () => {
      const job = makeDescriptor({ id: 'wait-ready' });
      manager.enqueue(job);

      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      // onJobStarted should NOT have been called yet
      expect(callbacks.onJobStarted).not.toHaveBeenCalled();

      // Now send ready
      sendWorkerReady();

      await vi.waitFor(() => {
        expect(callbacks.onJobStarted).toHaveBeenCalledWith('wait-ready');
      });
    });
  });

  // -----------------------------------------------------------------------
  // Batch ZIP packaging
  // -----------------------------------------------------------------------

  describe('batch ZIP packaging', () => {
    it('collects files and triggers batch download when all complete', async () => {
      const { downloadBlob } = await import('@/export/download');
      vi.mocked(downloadBlob).mockClear();

      const batchId = 'test-batch';
      const job1 = makeDescriptor({
        id: 'b1',
        label: 'Track 1',
        batchId,
      });
      const job2 = makeDescriptor({
        id: 'b2',
        label: 'Track 2',
        batchId,
      });

      manager.enqueueBatch([job1, job2]);

      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      sendWorkerReady();

      await vi.waitFor(() => {
        expect(callbacks.onJobStarted).toHaveBeenCalledWith('b1');
      });

      // Complete first job
      mockWorkerInstance?.simulateMessage({
        type: 'complete',
        jobId: 'b1',
        fileData: new ArrayBuffer(100),
        mimeType: 'audio/wav',
        suggestedName: 'track1.wav',
      });

      // Should NOT download yet — waiting for batch to complete
      expect(downloadBlob).not.toHaveBeenCalled();

      // Second job should start
      await vi.waitFor(() => {
        expect(callbacks.onJobStarted).toHaveBeenCalledWith('b2');
      });

      // Complete second job
      mockWorkerInstance?.simulateMessage({
        type: 'complete',
        jobId: 'b2',
        fileData: new ArrayBuffer(200),
        mimeType: 'audio/wav',
        suggestedName: 'track2.wav',
      });

      // Now the batch should finalize and download (as ZIP since 2 files)
      await vi.waitFor(() => {
        expect(downloadBlob).toHaveBeenCalled();
      });

      // Should be called with ZIP data
      const lastCall = vi.mocked(downloadBlob).mock.calls[0];
      expect(lastCall[2]).toBe('application/zip');
    });
  });

  // -----------------------------------------------------------------------
  // IndexedDB source loading
  // -----------------------------------------------------------------------

  describe('IndexedDB source loading', () => {
    it('loads SPC data from IndexedDB when source type is indexeddb', async () => {
      const { loadSpcFromStorage } = await import('@/storage/spc-storage');

      const job = makeDescriptor({
        id: 'idb-job',
        spcSource: { type: 'indexeddb', hash: 'abc123' },
      });

      manager.enqueue(job);

      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      sendWorkerReady();

      await vi.waitFor(() => {
        expect(loadSpcFromStorage).toHaveBeenCalledWith('abc123');
      });
    });

    it('fails job when IndexedDB returns null', async () => {
      const { loadSpcFromStorage } = await import('@/storage/spc-storage');
      vi.mocked(loadSpcFromStorage).mockResolvedValueOnce(null);

      const job = makeDescriptor({
        id: 'idb-fail',
        spcSource: { type: 'indexeddb', hash: 'missing' },
      });

      manager.enqueue(job);

      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      sendWorkerReady();

      await vi.waitFor(() => {
        expect(callbacks.onJobFailed).toHaveBeenCalledWith(
          'idb-fail',
          'Failed to load SPC file data',
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // Destroy
  // -----------------------------------------------------------------------

  describe('destroy', () => {
    it('terminates worker and clears queue on destroy', async () => {
      const job = makeDescriptor({ id: 'destroy-job' });
      manager.enqueue(job);

      await vi.waitFor(() => {
        expect(mockWorkerInstance).not.toBeNull();
      });

      manager.destroy();

      expect(mockWorkerInstance?.terminate).toHaveBeenCalled();
      expect(manager.queueLength).toBe(0);
    });
  });
});
