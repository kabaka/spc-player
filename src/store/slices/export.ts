import type {
  ExportJob,
  ExportSlice,
  ExportProgressPhase,
  SliceCreator,
} from '../types';

import {
  getExportQueueManager,
  type ExportJobDescriptor,
  type ExportStoreCallbacks,
} from '@/export/ExportQueueManager';

import type { ExportMetadata } from '@/audio/worker-protocol';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countActive(jobs: ExportJob[]): number {
  return jobs.filter(
    (j) =>
      j.status === 'queued' ||
      j.status === 'rendering' ||
      j.status === 'encoding',
  ).length;
}

function countQueued(jobs: ExportJob[]): number {
  return jobs.filter((j) => j.status === 'queued').length;
}

function makeJobId(): string {
  return crypto.randomUUID();
}

function makeBatchId(): string {
  return `batch-${crypto.randomUUID()}`;
}

/** Build store callbacks that call set() to push state into the slice. */
function buildCallbacks(
  set: Parameters<SliceCreator<ExportSlice>>[0],
): ExportStoreCallbacks {
  return {
    onJobQueued: (id, label) => {
      set(
        (state) => {
          const job: ExportJob = {
            id,
            label,
            status: 'queued',
            progress: 0,
            outputSize: null,
            error: null,
          };
          const jobs = [...state.jobs, job];
          return {
            jobs,
            isExporting: true,
            queueSize: countQueued(jobs),
          };
        },
        false,
        'export/jobQueued',
      );
    },

    onJobStarted: (id) => {
      set(
        (state) => ({
          jobs: state.jobs.map((j) =>
            j.id === id ? { ...j, status: 'rendering' as const } : j,
          ),
          batchProgress: state.batchProgress
            ? { ...state.batchProgress, currentJobId: id }
            : null,
        }),
        false,
        'export/jobStarted',
      );
    },

    onJobProgress: (id, progress, phase) => {
      // Map the 4-phase export model to the 2-value ExportProgressPhase
      const storePhase: ExportProgressPhase =
        phase === 'rendering' ? 'rendering' : 'encoding';
      set(
        (state) => ({
          jobs: state.jobs.map((j) =>
            j.id === id ? { ...j, progress, status: storePhase } : j,
          ),
        }),
        false,
        'export/jobProgress',
      );
    },

    onJobComplete: (id, outputSize) => {
      set(
        (state) => {
          const jobs = state.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: 'complete' as const,
                  progress: 1,
                  outputSize,
                }
              : j,
          );
          return {
            jobs,
            isExporting: countActive(jobs) > 0,
            queueSize: countQueued(jobs),
            batchProgress: state.batchProgress
              ? {
                  ...state.batchProgress,
                  completedJobs: state.batchProgress.completedJobs + 1,
                  currentJobId:
                    state.batchProgress.currentJobId === id
                      ? null
                      : state.batchProgress.currentJobId,
                }
              : null,
          };
        },
        false,
        'export/jobComplete',
      );
    },

    onJobFailed: (id, error) => {
      set(
        (state) => {
          const jobs = state.jobs.map((j) =>
            j.id === id ? { ...j, status: 'failed' as const, error } : j,
          );
          return {
            jobs,
            isExporting: countActive(jobs) > 0,
            queueSize: countQueued(jobs),
            batchProgress: state.batchProgress
              ? {
                  ...state.batchProgress,
                  failedJobs: state.batchProgress.failedJobs + 1,
                  currentJobId:
                    state.batchProgress.currentJobId === id
                      ? null
                      : state.batchProgress.currentJobId,
                }
              : null,
          };
        },
        false,
        'export/jobFailed',
      );
    },

    onJobCancelled: (id) => {
      set(
        (state) => {
          const jobs = state.jobs.map((j) =>
            j.id === id ? { ...j, status: 'cancelled' as const } : j,
          );
          return {
            jobs,
            isExporting: countActive(jobs) > 0,
            queueSize: countQueued(jobs),
          };
        },
        false,
        'export/jobCancelled',
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

export const createExportSlice: SliceCreator<ExportSlice> = (set) => {
  // Lazily-initialized queue manager callbacks bound to this slice's set()
  let queueManagerCallbacks: ExportStoreCallbacks | null = null;

  function getCallbacks(): ExportStoreCallbacks {
    if (!queueManagerCallbacks) {
      queueManagerCallbacks = buildCallbacks(set);
    }
    return queueManagerCallbacks;
  }

  function getManager() {
    return getExportQueueManager(getCallbacks());
  }

  return {
    jobs: [],
    isExporting: false,
    queueSize: 0,
    batchProgress: null,

    setExportJobs: (jobs) => {
      set(
        {
          jobs,
          isExporting: jobs.some(
            (j) =>
              j.status === 'queued' ||
              j.status === 'rendering' ||
              j.status === 'encoding',
          ),
          queueSize: jobs.filter((j) => j.status === 'queued').length,
        },
        false,
        'export/setExportJobs',
      );
    },

    updateJobProgress: (jobId, progress, phase) => {
      set(
        (state) => ({
          jobs: state.jobs.map((j) =>
            j.id === jobId ? { ...j, progress, status: phase } : j,
          ),
        }),
        false,
        'export/updateJobProgress',
      );
    },

    completeJob: (jobId, outputSize) => {
      set(
        (state) => {
          const jobs = state.jobs.map((j) =>
            j.id === jobId
              ? { ...j, status: 'complete' as const, progress: 1, outputSize }
              : j,
          );
          return {
            jobs,
            isExporting: countActive(jobs) > 0,
            queueSize: countQueued(jobs),
            batchProgress: state.batchProgress
              ? {
                  ...state.batchProgress,
                  completedJobs: state.batchProgress.completedJobs + 1,
                  currentJobId:
                    state.batchProgress.currentJobId === jobId
                      ? null
                      : state.batchProgress.currentJobId,
                }
              : null,
          };
        },
        false,
        'export/completeJob',
      );
    },

    failJob: (jobId, error) => {
      set(
        (state) => {
          const jobs = state.jobs.map((j) =>
            j.id === jobId ? { ...j, status: 'failed' as const, error } : j,
          );
          return {
            jobs,
            isExporting: countActive(jobs) > 0,
            queueSize: countQueued(jobs),
            batchProgress: state.batchProgress
              ? {
                  ...state.batchProgress,
                  failedJobs: state.batchProgress.failedJobs + 1,
                  currentJobId:
                    state.batchProgress.currentJobId === jobId
                      ? null
                      : state.batchProgress.currentJobId,
                }
              : null,
          };
        },
        false,
        'export/failJob',
      );
    },

    cancelJob: (jobId) => {
      set(
        (state) => {
          const jobs = state.jobs.map((j) =>
            j.id === jobId ? { ...j, status: 'cancelled' as const } : j,
          );
          return {
            jobs,
            isExporting: countActive(jobs) > 0,
            queueSize: countQueued(jobs),
          };
        },
        false,
        'export/cancelJob',
      );
    },

    clearCompletedJobs: () => {
      set(
        (state) => ({
          jobs: state.jobs.filter(
            (j) =>
              j.status !== 'complete' &&
              j.status !== 'failed' &&
              j.status !== 'cancelled',
          ),
        }),
        false,
        'export/clearCompletedJobs',
      );
    },

    enqueueExport: (options, spcSource, label) => {
      const id = makeJobId();
      const metadata: ExportMetadata = {
        title: label,
        comment: 'Exported by SPC Player',
      };

      const descriptor: ExportJobDescriptor = {
        id,
        label,
        format: options.format,
        sampleRate: options.sampleRate,
        durationSeconds: options.durationSeconds,
        fadeSeconds: options.fadeSeconds,
        voiceMask: options.voiceMask,
        quality: 0,
        metadata,
        spcSource,
        batchId: null,
      };

      getManager().enqueue(descriptor);
      return id;
    },

    enqueueBatch: (files) => {
      const batchId = makeBatchId();
      const ids: string[] = [];
      const descriptors: ExportJobDescriptor[] = [];

      for (const file of files) {
        const id = makeJobId();
        ids.push(id);

        const metadata: ExportMetadata = {
          title: file.label,
          comment: 'Exported by SPC Player',
        };

        descriptors.push({
          id,
          label: file.label,
          format: file.options.format,
          sampleRate: file.options.sampleRate,
          durationSeconds: file.options.durationSeconds,
          fadeSeconds: file.options.fadeSeconds,
          voiceMask: file.options.voiceMask,
          quality: 0,
          metadata,
          spcSource: file.spcSource,
          batchId,
        });
      }

      set(
        {
          batchProgress: {
            totalJobs: files.length,
            completedJobs: 0,
            failedJobs: 0,
            currentJobId: null,
          },
        },
        false,
        'export/batchStarted',
      );

      getManager().enqueueBatch(descriptors);
      return ids;
    },

    cancelExport: (jobId) => {
      getManager().cancel(jobId);
    },

    cancelAllExports: () => {
      getManager().cancelAll();
    },
  };
};
