import * as StellarSdk from '@stellar/stellar-sdk';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../db/dataSource';
import { ContractEventLog } from '../db/entities/ContractEventLog';
import { SorobanEventLike } from './contractEventIndexer';

/**
 * Durable archive of every indexed contract event (#934).
 *
 * The archive is what the reconciliation job compares against bookings. It is
 * written before a listener runs and before the cursor advances, so a failed
 * write retries the event instead of losing the on-chain record. Paging tokens
 * make replays after a handler failure idempotent.
 */
export interface ContractEventArchive {
  append(contractId: string, event: SorobanEventLike, eventType: string | null): Promise<void>;
}

const BOOKING_ID_KEYS = [
  'booking_id',
  'bookingId',
  'soroban_booking_id',
  'sorobanBookingId',
  'id',
];

const stringifyId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    return value.length > 0 && value.length <= 128 ? value : null;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'object' && 'toString' in value) {
    try {
      const rendered = String(value);
      return rendered.length > 0 && rendered.length <= 128 ? rendered : null;
    } catch {
      return null;
    }
  }

  return null;
};

/**
 * Decode the event value and pull a booking id out of it. Booking and refund
 * contracts emit the booking id as the first tuple element; map-shaped payloads
 * are supported for forward compatibility.
 */
export function extractSorobanBookingId(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    return stringifyId(value[0]);
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of BOOKING_ID_KEYS) {
      if (key in record) {
        const id = stringifyId(record[key]);
        if (id) return id;
      }
    }
  }

  return stringifyId(value);
}

export function decodeEventValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;

  try {
    return StellarSdk.scValToNative(value as StellarSdk.xdr.ScVal);
  } catch {
    // Event payloads are already plain JSON in some test doubles and in
    // archived rows; keep them as-is rather than failing the indexer.
    return value;
  }
}

export class TypeOrmContractEventArchive implements ContractEventArchive {
  constructor(private readonly dataSource: DataSource = AppDataSource) {}

  async append(
    contractId: string,
    event: SorobanEventLike,
    eventType: string | null,
  ): Promise<void> {
    if (!this.dataSource.isInitialized) return;

    const repo = this.dataSource.getRepository(ContractEventLog);
    const pagingToken =
      typeof event.pagingToken === 'string'
        ? event.pagingToken
        : typeof event.id === 'string'
          ? event.id
          : null;

    if (pagingToken) {
      const existing = await repo.findOne({
        where: { contractId, pagingToken },
      });
      if (existing) return;
    }

    const decodedValue = decodeEventValue(event.value);
    const ledger = Number(event.ledger);
    const archivedData: Record<string, any> = {
      value: decodedValue,
      topic: event.topic ?? [],
    };

    await repo.insert({
      contractId,
      eventType: eventType ?? 'unknown',
      ledger: Number.isFinite(ledger) ? ledger : 0,
      pagingToken,
      txHash: typeof event.txHash === 'string' ? event.txHash : null,
      sorobanBookingId: extractSorobanBookingId(decodedValue),
      walletAddress: null,
      data: archivedData,
    });
  }
}
