/**
 * Data source integration service — issue #260.
 *
 * Manages connectors to external APIs, an ETL ingestion pipeline, and a
 * data catalog. Each connector declares its schema; the pipeline transforms
 * raw payloads into a normalized record format.
 */

export interface DataSourceConfig {
  id: string;
  name: string;
  type: 'rest' | 'graphql' | 'webhook';
  url: string;
  schedule?: string; // cron-style schedule string
  headers?: Record<string, string>;
  transformFn?: (raw: unknown) => NormalizedRecord[];
}

export interface NormalizedRecord {
  sourceId: string;
  recordedAt: Date;
  payload: Record<string, unknown>;
  lineage: string[];
}

export interface CatalogEntry {
  sourceId: string;
  name: string;
  type: string;
  url: string;
  schedule?: string;
  lastIngested?: Date;
  recordCount: number;
}

export class DataSourceService {
  private sources: Map<string, DataSourceConfig> = new Map();
  private catalog: Map<string, CatalogEntry> = new Map();
  private records: Map<string, NormalizedRecord[]> = new Map();

  registerSource(config: DataSourceConfig): void {
    this.sources.set(config.id, config);
    this.catalog.set(config.id, {
      sourceId: config.id,
      name: config.name,
      type: config.type,
      url: config.url,
      schedule: config.schedule,
      recordCount: 0,
    });
    this.records.set(config.id, []);
  }

  /**
   * Ingest raw data from a source. In production this would call the external
   * API; here callers supply the raw payload directly (enables offline testing).
   */
  ingest(sourceId: string, raw: unknown): NormalizedRecord[] {
    const config = this.sources.get(sourceId);
    if (!config) throw new Error(`Unknown data source: ${sourceId}`);

    const defaultTransform = (data: unknown): NormalizedRecord[] => {
      const items = Array.isArray(data) ? data : [data];
      return items.map((item) => ({
        sourceId,
        recordedAt: new Date(),
        payload: typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : { value: item },
        lineage: [sourceId],
      }));
    };

    const transform = config.transformFn ?? defaultTransform;
    const normalized = transform(raw);

    const existing = this.records.get(sourceId) ?? [];
    existing.push(...normalized);
    this.records.set(sourceId, existing);

    const entry = this.catalog.get(sourceId)!;
    entry.lastIngested = new Date();
    entry.recordCount = existing.length;

    return normalized;
  }

  getCatalog(): CatalogEntry[] {
    return Array.from(this.catalog.values());
  }

  getRecords(sourceId: string): NormalizedRecord[] {
    return this.records.get(sourceId) ?? [];
  }

  getLineage(sourceId: string): string[][] {
    return (this.records.get(sourceId) ?? []).map((r) => r.lineage);
  }

  removeSource(sourceId: string): void {
    this.sources.delete(sourceId);
    this.catalog.delete(sourceId);
    this.records.delete(sourceId);
  }
}
