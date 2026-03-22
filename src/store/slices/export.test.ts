import { beforeEach, describe, expect, it } from 'vitest';

import { createTestStore, makeJob } from '../test-helpers';
import type { ExportJob } from '../types';

describe('ExportSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('initial state', () => {
    it('has empty jobs', () => {
      expect(store.getState().jobs).toEqual([]);
    });

    it('is not exporting', () => {
      expect(store.getState().isExporting).toBe(false);
    });

    it('has queueSize 0', () => {
      expect(store.getState().queueSize).toBe(0);
    });

    it('has null batchProgress', () => {
      expect(store.getState().batchProgress).toBeNull();
    });
  });

  describe('setExportJobs', () => {
    it('replaces jobs array', () => {
      const j1 = makeJob({ id: 'j1', status: 'queued' });
      const j2 = makeJob({ id: 'j2', status: 'rendering' });
      store.getState().setExportJobs([j1, j2]);
      expect(store.getState().jobs).toEqual([j1, j2]);
    });

    it('sets isExporting when active jobs exist', () => {
      store.getState().setExportJobs([makeJob({ status: 'rendering' })]);
      expect(store.getState().isExporting).toBe(true);
    });

    it('clears isExporting when no active jobs', () => {
      store.getState().setExportJobs([makeJob({ status: 'complete' })]);
      expect(store.getState().isExporting).toBe(false);
    });

    it('counts queued jobs for queueSize', () => {
      store
        .getState()
        .setExportJobs([
          makeJob({ status: 'queued' }),
          makeJob({ status: 'queued' }),
          makeJob({ status: 'rendering' }),
          makeJob({ status: 'complete' }),
        ]);
      expect(store.getState().queueSize).toBe(2);
    });

    it('sets isExporting for encoding status', () => {
      store.getState().setExportJobs([makeJob({ status: 'encoding' })]);
      expect(store.getState().isExporting).toBe(true);
    });

    it('handles empty array', () => {
      store.getState().setExportJobs([makeJob({ status: 'queued' })]);
      store.getState().setExportJobs([]);
      expect(store.getState().isExporting).toBe(false);
      expect(store.getState().queueSize).toBe(0);
    });
  });

  describe('updateJobProgress', () => {
    it('updates progress and phase of matching job', () => {
      const j1 = makeJob({ id: 'j1', status: 'queued', progress: 0 });
      const j2 = makeJob({ id: 'j2', status: 'queued', progress: 0 });
      store.getState().setExportJobs([j1, j2]);

      store.getState().updateJobProgress('j1', 0.5, 'rendering');

      const updated = store.getState().jobs.find((j) => j.id === 'j1');
      if (updated === undefined) throw new Error('expected job j1');
      expect(updated.progress).toBe(0.5);
      expect(updated.status).toBe('rendering');
    });

    it('does not affect other jobs', () => {
      const j1 = makeJob({ id: 'j1', status: 'queued', progress: 0 });
      const j2 = makeJob({ id: 'j2', status: 'queued', progress: 0 });
      store.getState().setExportJobs([j1, j2]);

      store.getState().updateJobProgress('j1', 0.5, 'rendering');

      const other = store.getState().jobs.find((j) => j.id === 'j2');
      if (other === undefined) throw new Error('expected job j2');
      expect(other.progress).toBe(0);
      expect(other.status).toBe('queued');
    });

    it('handles non-existent jobId gracefully', () => {
      store.getState().setExportJobs([makeJob({ id: 'j1' })]);
      store.getState().updateJobProgress('nonexistent', 0.5, 'encoding');
      expect(store.getState().jobs).toHaveLength(1);
    });
  });

  describe('completeJob', () => {
    it('marks job as complete with output size', () => {
      store
        .getState()
        .setExportJobs([
          makeJob({ id: 'j1', status: 'rendering', progress: 0.9 }),
        ]);

      store.getState().completeJob('j1', 1024);

      const job = store.getState().jobs[0];
      expect(job.status).toBe('complete');
      expect(job.progress).toBe(1);
      expect(job.outputSize).toBe(1024);
    });

    it('clears isExporting when last job completes', () => {
      store
        .getState()
        .setExportJobs([makeJob({ id: 'j1', status: 'rendering' })]);
      expect(store.getState().isExporting).toBe(true);

      store.getState().completeJob('j1', 512);
      expect(store.getState().isExporting).toBe(false);
    });

    it('keeps isExporting true when other jobs remain active', () => {
      store
        .getState()
        .setExportJobs([
          makeJob({ id: 'j1', status: 'rendering' }),
          makeJob({ id: 'j2', status: 'queued' }),
        ]);

      store.getState().completeJob('j1', 512);
      expect(store.getState().isExporting).toBe(true);
    });

    it('updates batchProgress when batch is in progress', () => {
      store
        .getState()
        .setExportJobs([
          makeJob({ id: 'j1', status: 'rendering' }),
          makeJob({ id: 'j2', status: 'queued' }),
        ]);
      store.setState({
        batchProgress: {
          totalJobs: 2,
          completedJobs: 0,
          failedJobs: 0,
          currentJobId: 'j1',
        },
      });

      store.getState().completeJob('j1', 1024);

      const bp = store.getState().batchProgress;
      if (bp === null) throw new Error('expected non-null batchProgress');
      expect(bp.completedJobs).toBe(1);
      expect(bp.currentJobId).toBeNull();
    });
  });

  describe('failJob', () => {
    it('marks job as failed with error message', () => {
      store
        .getState()
        .setExportJobs([makeJob({ id: 'j1', status: 'rendering' })]);

      store.getState().failJob('j1', 'Encoding error');

      const job = store.getState().jobs[0];
      expect(job.status).toBe('failed');
      expect(job.error).toBe('Encoding error');
    });

    it('clears isExporting when last job fails', () => {
      store
        .getState()
        .setExportJobs([makeJob({ id: 'j1', status: 'rendering' })]);

      store.getState().failJob('j1', 'Error');
      expect(store.getState().isExporting).toBe(false);
    });

    it('updates batchProgress failedJobs count', () => {
      store
        .getState()
        .setExportJobs([makeJob({ id: 'j1', status: 'rendering' })]);
      store.setState({
        batchProgress: {
          totalJobs: 2,
          completedJobs: 0,
          failedJobs: 0,
          currentJobId: 'j1',
        },
      });

      store.getState().failJob('j1', 'Error');

      const bp = store.getState().batchProgress;
      if (bp === null) throw new Error('expected non-null batchProgress');
      expect(bp.failedJobs).toBe(1);
      expect(bp.currentJobId).toBeNull();
    });
  });

  describe('cancelJob', () => {
    it('marks job as cancelled', () => {
      store.getState().setExportJobs([makeJob({ id: 'j1', status: 'queued' })]);

      store.getState().cancelJob('j1');

      expect(store.getState().jobs[0].status).toBe('cancelled');
    });

    it('clears isExporting when last job is cancelled', () => {
      store.getState().setExportJobs([makeJob({ id: 'j1', status: 'queued' })]);

      store.getState().cancelJob('j1');
      expect(store.getState().isExporting).toBe(false);
    });

    it('updates queueSize when queued job is cancelled', () => {
      store
        .getState()
        .setExportJobs([
          makeJob({ id: 'j1', status: 'queued' }),
          makeJob({ id: 'j2', status: 'queued' }),
        ]);

      store.getState().cancelJob('j1');
      expect(store.getState().queueSize).toBe(1);
    });
  });

  describe('clearCompletedJobs', () => {
    it('removes completed jobs', () => {
      store
        .getState()
        .setExportJobs([
          makeJob({ id: 'j1', status: 'complete' }),
          makeJob({ id: 'j2', status: 'rendering' }),
        ]);

      store.getState().clearCompletedJobs();

      expect(store.getState().jobs).toHaveLength(1);
      expect(store.getState().jobs[0].id).toBe('j2');
    });

    it('removes failed jobs', () => {
      store
        .getState()
        .setExportJobs([
          makeJob({ id: 'j1', status: 'failed', error: 'oops' }),
          makeJob({ id: 'j2', status: 'queued' }),
        ]);

      store.getState().clearCompletedJobs();

      expect(store.getState().jobs).toHaveLength(1);
      expect(store.getState().jobs[0].id).toBe('j2');
    });

    it('removes cancelled jobs', () => {
      store
        .getState()
        .setExportJobs([
          makeJob({ id: 'j1', status: 'cancelled' }),
          makeJob({ id: 'j2', status: 'encoding' }),
        ]);

      store.getState().clearCompletedJobs();

      expect(store.getState().jobs).toHaveLength(1);
      expect(store.getState().jobs[0].id).toBe('j2');
    });

    it('keeps queued and active jobs', () => {
      const jobs: ExportJob[] = [
        makeJob({ id: 'j1', status: 'queued' }),
        makeJob({ id: 'j2', status: 'rendering' }),
        makeJob({ id: 'j3', status: 'encoding' }),
        makeJob({ id: 'j4', status: 'complete' }),
        makeJob({ id: 'j5', status: 'failed', error: 'err' }),
        makeJob({ id: 'j6', status: 'cancelled' }),
      ];
      store.getState().setExportJobs(jobs);

      store.getState().clearCompletedJobs();

      const remainingIds = store.getState().jobs.map((j) => j.id);
      expect(remainingIds).toEqual(['j1', 'j2', 'j3']);
    });

    it('handles empty jobs array', () => {
      store.getState().clearCompletedJobs();
      expect(store.getState().jobs).toEqual([]);
    });
  });
});
