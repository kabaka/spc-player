import type { ExportSlice, SliceCreator } from '../types';

export const createExportSlice: SliceCreator<ExportSlice> = (set) => ({
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
        const activeCount = jobs.filter(
          (j) =>
            j.status === 'queued' ||
            j.status === 'rendering' ||
            j.status === 'encoding',
        ).length;

        return {
          jobs,
          isExporting: activeCount > 0,
          queueSize: jobs.filter((j) => j.status === 'queued').length,
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
        const activeCount = jobs.filter(
          (j) =>
            j.status === 'queued' ||
            j.status === 'rendering' ||
            j.status === 'encoding',
        ).length;

        return {
          jobs,
          isExporting: activeCount > 0,
          queueSize: jobs.filter((j) => j.status === 'queued').length,
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
        const activeCount = jobs.filter(
          (j) =>
            j.status === 'queued' ||
            j.status === 'rendering' ||
            j.status === 'encoding',
        ).length;

        return {
          jobs,
          isExporting: activeCount > 0,
          queueSize: jobs.filter((j) => j.status === 'queued').length,
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

  enqueueExport: (_options, _spcData, _label) => {
    console.warn(
      'enqueueExport: not implemented until export pipeline is ready',
    );
    return '';
  },

  enqueueBatch: (_files) => {
    console.warn(
      'enqueueBatch: not implemented until export pipeline is ready',
    );
    return [];
  },

  cancelExport: (_jobId) => {
    console.warn(
      'cancelExport: not implemented until export pipeline is ready',
    );
  },

  cancelAllExports: () => {
    console.warn(
      'cancelAllExports: not implemented until export pipeline is ready',
    );
  },
});
