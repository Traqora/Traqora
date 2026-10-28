import { DataSource, FindOptionsWhere, In, IsNull, Not } from 'typeorm';
import { AppDataSource } from '../db/dataSource';
import { Booking, BookingStatus } from '../db/entities/Booking';
import { ContractEventLog } from '../db/entities/ContractEventLog';
import { ContractReconciliationAttempt } from '../db/entities/ContractReconciliationAttempt';
import {
  ContractEventSource,
  IndexedContractEvent,
  ReconciliationAttemptStore,
  ReconciliationBooking,
  ReconciliationBookingStore,
  RepairAttemptInput,
} from './contractBookingReconciliation';

export class TypeOrmContractEventSource implements ContractEventSource {
  constructor(private readonly dataSource: DataSource = AppDataSource) {}

  async listAuthoritativeEvents(options: {
    contractIds?: string[];
    limit: number;
  }): Promise<IndexedContractEvent[]> {
    const repo = this.dataSource.getRepository(ContractEventLog);
    const where: FindOptionsWhere<ContractEventLog> = {
      sorobanBookingId: Not(IsNull()),
    };

    if (options.contractIds && options.contractIds.length > 0) {
      where.contractId = In(options.contractIds);
    }

    const rows = await repo.find({
      where,
      order: { ledger: 'DESC', indexedAt: 'DESC' },
      take: options.limit,
    });

    return rows.map((row) => ({
      id: row.id,
      contractId: row.contractId,
      eventType: row.eventType,
      ledger: row.ledger,
      sorobanBookingId: row.sorobanBookingId,
      indexedAt: row.indexedAt,
    }));
  }
}

export class TypeOrmReconciliationBookingStore implements ReconciliationBookingStore {
  constructor(private readonly dataSource: DataSource = AppDataSource) {}

  async findBySorobanBookingIds(ids: string[]): Promise<ReconciliationBooking[]> {
    if (ids.length === 0) return [];

    const rows = await this.dataSource.getRepository(Booking).find({
      where: { sorobanBookingId: In(ids) },
      select: ['id', 'status', 'sorobanBookingId'],
    });

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      sorobanBookingId: row.sorobanBookingId ?? null,
    }));
  }

  async saveStatus(bookingId: string, status: BookingStatus): Promise<void> {
    await this.dataSource.getRepository(Booking).update({ id: bookingId }, { status });
  }
}

export class TypeOrmReconciliationAttemptStore implements ReconciliationAttemptStore {
  constructor(private readonly dataSource: DataSource = AppDataSource) {}

  async record(attempt: RepairAttemptInput): Promise<void> {
    await this.dataSource.getRepository(ContractReconciliationAttempt).insert(attempt);
  }
}
