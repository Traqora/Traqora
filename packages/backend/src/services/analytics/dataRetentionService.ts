/**
 * Data Retention and Archival service — issue #246.
 *
 * Provides:
 *  - Configurable retention periods per data type (via env vars or explicit config)
 *  - Archival of records older than the hot-storage threshold (90 days default)
 *  - Compression marker for archived records
 *  - Purge of records beyond the retention limit (2 years default)
 *  - Restore from archive by ID
 *  - Query over the archive store
 *
 * In production, swap the in-memory archive store for S3/GCS calls.
 */

export type DataType = string;

export interface RetentionPolicy {
  dataType: DataType;
  archiveAfterDays: number;
  purgeAfterDays: number;
}

export interface ArchiveRecord {
  id: string;
  dataType: DataType;
  data: unknown;
  originalCreatedAt: Date;
  archivedAt: Date;
  compressed: boolean;
}

export interface RetentionScanResult {
  dataType: DataType;
  archived: number;
  purged: number;
  remaining: number;
}

export interface RetentionConfig {
  policies: RetentionPolicy[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function envDays(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const DEFAULT_POLICIES: RetentionPolicy[] = [
  {
    dataType: 'analytics_events',
    archiveAfterDays: envDays('RETENTION_ARCHIVE_DAYS', 90),
    purgeAfterDays: envDays('RETENTION_PURGE_DAYS', 730),
  },
  {
    dataType: 'user_sessions',
    archiveAfterDays: envDays('RETENTION_SESSION_ARCHIVE_DAYS', 30),
    purgeAfterDays: envDays('RETENTION_SESSION_PURGE_DAYS', 365),
  },
  {
    dataType: 'audit_logs',
    archiveAfterDays: envDays('RETENTION_AUDIT_ARCHIVE_DAYS', 180),
    purgeAfterDays: envDays('RETENTION_AUDIT_PURGE_DAYS', 2555), // 7 years for compliance
  },
];

export class DataRetentionService {
  private readonly archiveStore = new Map<string, ArchiveRecord>();
  private readonly policyMap: Map<DataType, RetentionPolicy>;

  constructor(config?: RetentionConfig) {
    const policies = config?.policies ?? DEFAULT_POLICIES;
    this.policyMap = new Map(policies.map((p) => [p.dataType, p]));
  }

  /**
   * Runs the archival and purge pass over a dataset.
   * Records are classified by their `createdAt` field against the policy.
   * Returns the archived/purged/remaining counts and mutates the records array in place.
   */
  processDataType(
    dataType: DataType,
    records: Array<{ id: string; createdAt: Date; [key: string]: unknown }>,
  ): RetentionScanResult {
    const policy = this.policyMap.get(dataType);
    if (!policy) {
      return { dataType, archived: 0, purged: 0, remaining: records.length };
    }

    const now = Date.now();
    const archiveCutoff = now - policy.archiveAfterDays * MS_PER_DAY;
    const purgeCutoff = now - policy.purgeAfterDays * MS_PER_DAY;

    let archived = 0;
    let purged = 0;
    const toRemove: string[] = [];

    for (const record of records) {
      const age = record.createdAt.getTime();
      if (age < purgeCutoff) {
        toRemove.push(record.id);
        purged++;
      } else if (age < archiveCutoff) {
        this.archiveStore.set(record.id, {
          id: record.id,
          dataType,
          data: record,
          originalCreatedAt: record.createdAt,
          archivedAt: new Date(),
          compressed: true,
        });
        toRemove.push(record.id);
        archived++;
      }
    }

    // Remove archived/purged records from the live dataset
    const removeSet = new Set(toRemove);
    for (let i = records.length - 1; i >= 0; i--) {
      if (removeSet.has(records[i].id)) {
        records.splice(i, 1);
      }
    }

    return { dataType, archived, purged, remaining: records.length };
  }

  /** Retrieve a single archived record by its original ID. */
  restoreFromArchive(id: string): ArchiveRecord | null {
    return this.archiveStore.get(id) ?? null;
  }

  /** Query the archive by data type and optional date range. */
  queryArchive(dataType: DataType, opts?: { from?: Date; to?: Date }): ArchiveRecord[] {
    const results: ArchiveRecord[] = [];
    for (const record of this.archiveStore.values()) {
      if (record.dataType !== dataType) continue;
      if (opts?.from && record.originalCreatedAt < opts.from) continue;
      if (opts?.to && record.originalCreatedAt > opts.to) continue;
      results.push(record);
    }
    return results;
  }

  /** List all configured policies. */
  getPolicies(): RetentionPolicy[] {
    return Array.from(this.policyMap.values());
  }

  getPolicy(dataType: DataType): RetentionPolicy | null {
    return this.policyMap.get(dataType) ?? null;
  }

  /** Total number of archived records across all types. */
  archiveSize(): number {
    return this.archiveStore.size;
  }
}
