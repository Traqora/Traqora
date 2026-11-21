import { Logger } from '../utils/logger';

export interface QuarantinedRecord {
  record: any;
  error: Error;
}

export class FlightSyncService {
  private logger = new Logger('FlightSyncService');

  async synchronizeBatch(records: any[]): Promise<{ processed: any[]; quarantined: QuarantinedRecord[] }> {
    const processed: any[] = [];
    const quarantined: QuarantinedRecord[] = [];

    for (const record of records) {
      try {
        this.validateRecord(record);
        processed.push(record);
      } catch (error: any) {
        this.quarantineRecord(record, error);
        quarantined.push({ record, error });
      }
    }

    return { processed, quarantined };
  }

  private validateRecord(record: any): void {
    if (!record || !record.id || !record.providerId) {
      throw new Error('Malformed provider record: missing required fields');
    }
  }

  private quarantineRecord(record: any, error: any): void {
    this.logger.error(`Quarantining malformed provider record ID: ${record?.id}, Error: ${error.message}`);
  }
}

export async function synchronizeBatch(records: any[]) {
  const service = new FlightSyncService();
  return service.synchronizeBatch(records);
}
