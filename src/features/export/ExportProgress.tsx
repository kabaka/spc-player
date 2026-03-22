import { Progress as RadixProgress } from 'radix-ui';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/Button/Button';
import { useAppStore } from '@/store/store';

import styles from './ExportDialog.module.css';

// ── Constants ─────────────────────────────────────────────────────────

const ARIA_THROTTLE_MS = 250;
const MILESTONES = [25, 50, 75] as const;

// ── Single-file progress ──────────────────────────────────────────────

interface ExportProgressProps {
  readonly jobId: string;
}

export function ExportProgress({ jobId }: ExportProgressProps) {
  const announcementsId = useId();

  const job = useAppStore((s) => s.jobs.find((j) => j.id === jobId) ?? null);
  const cancelExport = useAppStore((s) => s.cancelExport);

  const [throttledProgress, setThrottledProgress] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [errorAnnouncement, setErrorAnnouncement] = useState('');
  const lastUpdateRef = useRef(0);
  const lastMilestoneRef = useRef(0);
  const prevStatusRef = useRef<string | null>(null);

  const progress = job?.progress ?? 0;
  const percentComplete = Math.round(progress * 100);

  const phase =
    job?.status === 'rendering' || job?.status === 'encoding'
      ? job.status
      : null;
  const isActive =
    job?.status === 'rendering' ||
    job?.status === 'encoding' ||
    job?.status === 'queued';

  // ── Throttle ARIA updates to 250ms ────────────────────────────────
  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdateRef.current;

    if (elapsed >= ARIA_THROTTLE_MS) {
      lastUpdateRef.current = now;
      setThrottledProgress(percentComplete);
      return;
    }

    const timer = setTimeout(() => {
      lastUpdateRef.current = Date.now();
      setThrottledProgress(percentComplete);
    }, ARIA_THROTTLE_MS - elapsed);

    return () => clearTimeout(timer);
  }, [percentComplete]);

  // ── Milestone announcements at 25%, 50%, 75% ─────────────────────
  useEffect(() => {
    for (const milestone of MILESTONES) {
      if (
        percentComplete >= milestone &&
        lastMilestoneRef.current < milestone
      ) {
        setAnnouncement(`Export ${milestone} percent complete`);
        lastMilestoneRef.current = milestone;
      }
    }
  }, [percentComplete]);

  // ── Lifecycle announcements ───────────────────────────────────────
  const jobStatus = job?.status ?? null;
  const jobLabel = job?.label ?? '';

  useEffect(() => {
    if (!jobStatus) return;
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = jobStatus;

    if (prevStatus === 'queued' && jobStatus === 'rendering') {
      setAnnouncement(`Export started: ${jobLabel}`);
    } else if (jobStatus === 'complete' && prevStatus !== 'complete') {
      setAnnouncement(`Export complete: ${jobLabel}`);
    } else if (jobStatus === 'failed' && prevStatus !== 'failed') {
      setErrorAnnouncement(`Export failed: ${jobLabel}`);
    } else if (jobStatus === 'cancelled' && prevStatus !== 'cancelled') {
      setAnnouncement(`Export cancelled: ${jobLabel}`);
    }
  }, [jobStatus, jobLabel]);

  // ── Reset milestone tracking when job changes ─────────────────────
  useEffect(() => {
    lastMilestoneRef.current = 0;
    prevStatusRef.current = null;
  }, [jobId]);

  // ── Escape cancels active export ──────────────────────────────────
  useEffect(() => {
    if (!isActive || !job) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelExport(job.id);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, job, cancelExport]);

  if (!job) return null;

  const phaseLabel = phase ?? 'Preparing';
  const valueText = `${phaseLabel}: ${throttledProgress} percent`;

  return (
    <div className={styles.progress} role="group" aria-label="Export progress">
      <div className={styles.progressInfo}>
        <span className={styles.progressLabel}>{job.label}</span>
        <span className={styles.progressPercent} aria-hidden="true">
          {percentComplete}%
        </span>
      </div>

      <RadixProgress.Root
        className={styles.progressBar}
        value={throttledProgress}
        max={100}
        aria-label={`Exporting: ${job.label}`}
        aria-valuetext={valueText}
      >
        <RadixProgress.Indicator
          className={styles.progressIndicator}
          style={{
            transform: `translateX(-${100 - throttledProgress}%)`,
          }}
        />
      </RadixProgress.Root>

      {isActive && (
        <span className={styles.progressPhase} aria-hidden="true">
          {phaseLabel}…
        </span>
      )}

      {isActive && (
        <div className={styles.progressActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => cancelExport(job.id)}
            aria-label={`Cancel export: ${job.label}`}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Screen reader announcements — polite for milestones and lifecycle */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className={styles.visuallyHidden}
        id={announcementsId}
      >
        {announcement}
      </div>

      {/* Screen reader announcements — assertive for errors */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className={styles.visuallyHidden}
      >
        {errorAnnouncement}
      </div>
    </div>
  );
}

// ── Batch progress ────────────────────────────────────────────────────

export function BatchExportProgress() {
  const announcementsId = useId();

  const batchProgress = useAppStore((s) => s.batchProgress);
  const jobs = useAppStore((s) => s.jobs);
  const cancelAllExports = useAppStore((s) => s.cancelAllExports);

  const [announcement, setAnnouncement] = useState('');
  const prevJobIdRef = useRef<string | null>(null);

  const totalJobs = batchProgress?.totalJobs ?? 0;
  const completedJobs = batchProgress?.completedJobs ?? 0;
  const failedJobs = batchProgress?.failedJobs ?? 0;
  const currentJobId = batchProgress?.currentJobId ?? null;

  const currentJob = currentJobId
    ? jobs.find((j) => j.id === currentJobId)
    : null;

  // ── Fix 7: Announce file boundary transitions via useEffect ───────
  useEffect(() => {
    if (currentJobId && currentJobId !== prevJobIdRef.current) {
      prevJobIdRef.current = currentJobId;
      const fileLabel = currentJob?.label ?? '';
      setAnnouncement(
        `Exporting file ${completedJobs + 1} of ${totalJobs}: ${fileLabel}`,
      );
    }
  }, [currentJobId, completedJobs, totalJobs, currentJob?.label]);

  // ── Fix 6: Batch completion announcement ──────────────────────────
  useEffect(() => {
    if (totalJobs > 0 && completedJobs + failedJobs === totalJobs) {
      setAnnouncement(
        `Batch export complete. ${completedJobs} files exported.`,
      );
    }
  }, [totalJobs, completedJobs, failedJobs]);

  if (!batchProgress) return null;

  const batchPercent =
    totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;

  const batchValueText = currentJob
    ? `Exporting file ${completedJobs + 1} of ${totalJobs}: ${currentJob.label}`
    : `${completedJobs} of ${totalJobs} complete`;

  return (
    <div
      className={styles.batchProgress}
      role="group"
      aria-label="Batch export progress"
    >
      <div className={styles.batchHeader}>
        <span className={styles.batchTitle}>Batch Export</span>
        <span className={styles.batchCount}>
          {completedJobs} / {totalJobs}
        </span>
      </div>

      {/* Overall batch progress */}
      <RadixProgress.Root
        className={styles.progressBar}
        value={completedJobs}
        max={totalJobs}
        aria-label="Batch export"
        aria-valuetext={batchValueText}
      >
        <RadixProgress.Indicator
          className={styles.progressIndicator}
          style={{
            transform: `translateX(-${100 - batchPercent}%)`,
          }}
        />
      </RadixProgress.Root>

      {/* Current file progress */}
      {currentJob && <ExportProgress jobId={currentJob.id} />}

      {/* Cancel all */}
      <div className={styles.progressActions}>
        <Button
          variant="secondary"
          size="sm"
          onClick={cancelAllExports}
          aria-label="Cancel all exports"
        >
          Cancel All
        </Button>
      </div>

      {/* Batch announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className={styles.visuallyHidden}
        id={announcementsId}
      >
        {announcement}
      </div>
    </div>
  );
}
