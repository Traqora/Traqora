import type { DataSource } from 'typeorm';
import { AdminAuditLog } from '../src/db/entities/AdminAuditLog';
import { Booking, BookingStatus } from '../src/db/entities/Booking';
import { BookingDeadLetter } from '../src/db/entities/BookingDeadLetter';
import { IdempotencyKey } from '../src/db/entities/IdempotencyKey';
import {
    BookingRecoveryService,
    RecoverBookingInput,
} from '../src/services/bookingRecoveryService';

interface Storable {
    id?: string;
    [key: string]: unknown;
}

/** Minimal in-memory repository, enough to exercise the service transaction logic. */
class MemoryRepository<T extends Storable> {
    private readonly rows = new Map<string, T>();
    private sequence = 0;

    create(data: Partial<T>): T {
        return { ...data } as T;
    }

    async save(entity: T): Promise<T> {
        const saved = { ...entity };
        if (!saved.id) saved.id = `generated-${++this.sequence}`;
        this.rows.set(saved.id as string, saved);
        return saved;
    }

    async findOne(options: { where: Record<string, unknown> }): Promise<T | null> {
        for (const row of this.rows.values()) {
            const matches = Object.entries(options.where).every(
                ([key, value]) => (row as Storable)[key] === value,
            );
            if (matches) return row;
        }
        return null;
    }

    async find(options: { where: Record<string, unknown> }): Promise<T[]> {
        const result: T[] = [];
        for (const row of this.rows.values()) {
            const matches = Object.entries(options.where).every(
                ([key, value]) => (row as Storable)[key] === value,
            );
            if (matches) result.push(row);
        }
        return result;
    }

    async count(): Promise<number> {
        return this.rows.size;
    }
}

class MemoryDataSource {
    private readonly repositories = new Map<unknown, MemoryRepository<Storable>>();

    getRepository<T extends Storable>(entity: unknown): MemoryRepository<T> {
        if (!this.repositories.has(entity)) {
            this.repositories.set(entity, new MemoryRepository<Storable>());
        }
        return this.repositories.get(entity) as unknown as MemoryRepository<T>;
    }

    async transaction<T>(work: (manager: MemoryDataSource) => Promise<T>): Promise<T> {
        return work(this);
    }
}

describe('Booking recovery service (#1171)', () => {
    let dataSource: MemoryDataSource;
    let service: BookingRecoveryService;
    const bookingId = 'booking-1';

    const admin = {
        adminId: 'admin-1',
        email: 'admin@traqora.io',
        role: 'admin' as const,
    };

    const input = (overrides: Partial<RecoverBookingInput> = {}): RecoverBookingInput => ({
        bookingId,
        action: 'retry_confirmation',
        reason: 'Booking stuck pending on-chain confirmation',
        idempotencyKey: 'recovery-key-1',
        admin,
        ipAddress: '127.0.0.1',
        ...overrides,
    });

    beforeAll(async () => {
        dataSource = new MemoryDataSource();
        await dataSource.getRepository<Booking>(Booking).save({
            id: bookingId,
            status: 'onchain_submitted' as BookingStatus,
            amountCents: 50000,
            lastError: null,
        } as Booking);
        service = new BookingRecoveryService(dataSource as unknown as DataSource);
    });

    it('applies the status change and writes an audit log with reason and status transition', async () => {
        const result = await service.recoverBooking(input());

        expect(result.replayed).toBe(false);
        const booking = await dataSource.getRepository<Booking>(Booking).findOne({ where: { id: bookingId } });
        expect(booking?.status).toBe('onchain_pending');
        expect(booking?.lastError).toContain('stuck pending on-chain');

        const audit = await dataSource
            .getRepository<AdminAuditLog>(AdminAuditLog)
            .findOne({ where: { id: result.auditLogId } });
        expect(audit).toMatchObject({
            adminId: admin.adminId,
            adminEmail: admin.email,
            action: 'BOOKING_RECOVERY_RETRY_CONFIRMATION',
            resource: 'bookings',
            resourceId: bookingId,
            ipAddress: '127.0.0.1',
        });
        expect(audit?.details).toContain('onchain_submitted');
        expect(audit?.details).toContain('onchain_pending');
        expect(audit?.details).toContain('stuck pending on-chain');
    });

    it('replays the same key without repeating state change or audit writes', async () => {
        const before = await dataSource.getRepository<AdminAuditLog>(AdminAuditLog).count();
        const result = await service.recoverBooking(input());

        expect(result.replayed).toBe(true);
        expect(result.auditLogId).toBeTruthy();
        const after = await dataSource.getRepository<AdminAuditLog>(AdminAuditLog).count();
        expect(after).toBe(before);
    });

    it('rejects reuse of a key with different request data', async () => {
        await expect(
            service.recoverBooking(
                input({ idempotencyKey: 'recovery-key-2', reason: 'first reason' }),
            ),
        ).resolves.toMatchObject({ replayed: false });

        await expect(
            service.recoverBooking(
                input({ idempotencyKey: 'recovery-key-2', reason: 'different reason' }),
            ),
        ).rejects.toMatchObject({ statusCode: 409, code: 'RECOVERY_KEY_CONFLICT' });
    });

    it('requires a non-empty reason', async () => {
        await expect(service.recoverBooking(input({ reason: '   ' }))).rejects.toMatchObject({
            statusCode: 400,
            code: 'RECOVERY_REASON_REQUIRED',
        });
    });

    it('requires an idempotency key', async () => {
        await expect(service.recoverBooking(input({ idempotencyKey: '' }))).rejects.toMatchObject({
            statusCode: 400,
            code: 'RECOVERY_KEY_REQUIRED',
        });
    });

    it('rejects an unsupported action', async () => {
        await expect(
            service.recoverBooking(
                input({ action: 'delete_booking' as RecoverBookingInput['action'] }),
            ),
        ).rejects.toMatchObject({ statusCode: 400, code: 'RECOVERY_ACTION_INVALID' });
    });

    it('returns not found for an unknown booking', async () => {
        await expect(
            service.recoverBooking(
                input({ bookingId: 'missing-id', idempotencyKey: 'recovery-key-missing' }),
            ),
        ).rejects.toMatchObject({ statusCode: 404, code: 'RECOVERY_BOOKING_NOT_FOUND' });
    });

    it('namespaces idempotency keys by booking and caller key', async () => {
        await service.recoverBooking(input({ idempotencyKey: 'shared-key' }));
        const keys = await dataSource.getRepository<IdempotencyKey>(IdempotencyKey).find({
            where: { key: `booking-recovery:${bookingId}:shared-key` },
        });
        expect(keys).toHaveLength(1);
        expect(keys[0].path).toBe(`${'/api/v1/admin/bookings'}/${bookingId}/recovery`);
    });

    it('resolves open dead-letter entries when the booking is recovered', async () => {
        const stuckBookingId = 'booking-dead-letter-1';
        await dataSource.getRepository<Booking>(Booking).save({
            id: stuckBookingId,
            status: 'failed' as BookingStatus,
            amountCents: 50000,
            lastError: 'Confirmation retries exhausted after 3 attempts',
        } as Booking);

        const deadLetter = await dataSource
            .getRepository<BookingDeadLetter>(BookingDeadLetter)
            .save({
                id: 'dead-letter-1',
                bookingId: stuckBookingId,
                operation: 'CONFIRM_TRANSACTION',
                bookingStatus: 'failed',
                attempts: 3,
                reason: 'Confirmation retries exhausted after 3 attempts',
                state: 'open',
            } as BookingDeadLetter);

        const result = await service.recoverBooking(
            input({
                bookingId: stuckBookingId,
                idempotencyKey: 'dead-letter-recovery-key-1',
            }),
        );

        const resolved = await dataSource
            .getRepository<BookingDeadLetter>(BookingDeadLetter)
            .findOne({ where: { id: deadLetter.id } });

        expect(resolved).toMatchObject({
            state: 'resolved',
            resolvedBy: admin.adminId,
            resolutionAction: 'retry_confirmation',
            auditLogId: result.auditLogId,
        });
    });

    it('recovers from a dead-letter id and replays the same key safely', async () => {
        const stuckBookingId = 'booking-dead-letter-2';
        await dataSource.getRepository<Booking>(Booking).save({
            id: stuckBookingId,
            status: 'failed' as BookingStatus,
            amountCents: 50000,
            lastError: 'Confirmation retries exhausted after 3 attempts',
        } as Booking);

        const deadLetter = await dataSource
            .getRepository<BookingDeadLetter>(BookingDeadLetter)
            .save({
                id: 'dead-letter-2',
                bookingId: stuckBookingId,
                operation: 'CONFIRM_TRANSACTION',
                bookingStatus: 'failed',
                attempts: 3,
                reason: 'Confirmation retries exhausted after 3 attempts',
                state: 'open',
            } as BookingDeadLetter);

        const request = {
            deadLetterId: deadLetter.id,
            action: 'retry_confirmation' as const,
            reason: 'RPC recovered',
            idempotencyKey: 'dead-letter-recovery-key-2',
            admin,
            ipAddress: '127.0.0.1',
        };

        const first = await service.recoverFromDeadLetter(request);
        expect(first.replayed).toBe(false);
        expect(first.booking.status).toBe('onchain_pending');
        expect(first.deadLetter.state).toBe('resolved');
        expect(first.deadLetter.auditLogId).toBe(first.auditLogId);

        const second = await service.recoverFromDeadLetter(request);
        expect(second.replayed).toBe(true);
        expect(second.auditLogId).toBe(first.auditLogId);
    });

    it('returns not found for an unknown dead-letter id', async () => {
        await expect(
            service.recoverFromDeadLetter({
                deadLetterId: 'missing-dead-letter',
                action: 'mark_failed',
                reason: 'cleanup',
                idempotencyKey: 'dead-letter-missing',
                admin,
            }),
        ).rejects.toMatchObject({
            statusCode: 404,
            code: 'DEAD_LETTER_NOT_FOUND',
        });
    });
});
