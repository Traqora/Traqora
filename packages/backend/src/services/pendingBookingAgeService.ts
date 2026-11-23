import type { DataSource } from 'typeorm';
import { AppDataSource } from '../db/dataSource';
import { Booking, BookingStatus } from '../db/entities/Booking';
import { pendingBookingAgeSeconds } from './metrics';

/** Statuses that must not remain pending indefinitely in v1. */
export const PENDING_BOOKING_STATUSES: readonly BookingStatus[] = [
    'awaiting_payment',
    'payment_processing',
    'onchain_pending',
    'onchain_submitted',
];

export interface PendingBookingAgeRow {
    status: BookingStatus;
    oldestAgeSeconds: number;
}

export interface BookingAgeRepository {
    findOldestByStatus(status: BookingStatus): Promise<{ updatedAt: Date } | null>;
}

/**
 * Adapter that uses the composite (status, updatedAt) index added in
 * 1756000000000. Each lookup is a bounded "oldest row for this status" scan.
 */
export class TypeOrmBookingAgeRepository implements BookingAgeRepository {
    constructor(private readonly dataSource: Pick<DataSource, 'getRepository'> = AppDataSource) {}

    async findOldestByStatus(status: BookingStatus): Promise<{ updatedAt: Date } | null> {
        const row = await this.dataSource.getRepository(Booking).findOne({
            where: { status },
            order: { updatedAt: 'ASC' },
            select: { updatedAt: true },
        });
        return row ? { updatedAt: row.updatedAt } : null;
    }
}

/**
 * Refreshes the low-cardinality pending-booking age gauge (#1174). The gauge is
 * reset first so statuses that no longer have pending bookings do not leave a
 * stale, permanently firing series behind.
 */
export class PendingBookingAgeService {
    constructor(
        private readonly repository: BookingAgeRepository = new TypeOrmBookingAgeRepository(),
        private readonly now: () => number = () => Date.now(),
    ) {}

    async refresh(): Promise<PendingBookingAgeRow[]> {
        pendingBookingAgeSeconds.reset();
        const rows: PendingBookingAgeRow[] = [];

        for (const status of PENDING_BOOKING_STATUSES) {
            const oldest = await this.repository.findOldestByStatus(status);
            if (!oldest) continue;

            const ageSeconds = Math.max(
                0,
                Math.floor((this.now() - new Date(oldest.updatedAt).getTime()) / 1000),
            );
            pendingBookingAgeSeconds.set({ status }, ageSeconds);
            rows.push({ status, oldestAgeSeconds: ageSeconds });
        }

        return rows;
    }
}

export const pendingBookingAgeService = new PendingBookingAgeService();
