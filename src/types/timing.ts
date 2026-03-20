/**
 * Per-file timing override, persisted in IndexedDB.
 * Keyed by trackId (SHA-256 content hash of the SPC file).
 *
 * Null fields mean "use metadata or global default."
 *
 * @see docs/design/loop-playback.md §6.2
 */
export interface PerFileTimingOverride {
  /** SHA-256 hash of the SPC file content. Primary key. */
  readonly trackId: string;

  /** Custom loop count. Null = use xid6 tag or global default. */
  readonly loopCount: number | null;

  /** Custom total play duration in seconds. Null = use metadata or default. */
  readonly durationSeconds: number | null;

  /** Custom fade duration in seconds. Null = use metadata or default. */
  readonly fadeSeconds: number | null;

  /** Timestamp of last modification (epoch ms). */
  readonly updatedAt: number;
}
