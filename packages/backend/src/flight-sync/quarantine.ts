export interface ProviderRecord {
  id: string;
  payload: Record<string, unknown>;
}

export interface QuarantineResult {
  validRecords: ProviderRecord[];
  quarantinedRecords: Array<ProviderRecord & { reason: string; timestamp: string }>;
}

export function syncAndQuarantineBatch(records: ProviderRecord[], validator: (record: ProviderRecord) => boolean): QuarantineResult {
  const validRecords: ProviderRecord[] = [];
  const quarantinedRecords: Array<ProviderRecord & { reason: string; timestamp: string }> = [];

  for (const record of records) {
    try {
      if (!record || typeof record.id !== 'string' || !record.id) {
        quarantinedRecords.push({
          id: record?.id || 'unknown',
          payload: record?.payload || {},
          reason: 'Invalid or missing record identifier',
          timestamp: new Date().toISOString(),
        });
        continue;
      }
      if (validator(record)) {
        validRecords.push(record);
      } else {
        quarantinedRecords.push({
          id: record.id,
          payload: record.payload,
          reason: 'Validation failed for provider record',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      quarantinedRecords.push({
        id: record?.id || 'unknown',
        payload: record?.payload || {},
        reason: `Exception during validation: ${message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return { validRecords, quarantinedRecords };
}
