import { DataSource } from 'typeorm';
import { AppDataSource } from '../db/dataSource';
import { AdminAuditLog } from '../db/entities/AdminAuditLog';
import { Booking, BookingStatus } from '../db/entities/Booking';
import { IdempotencyKey } from '../db/entities/IdempotencyKey';
import { AdminPayload } from '../middleware/adminAuth';
import { AppError } from './ErrorHandlingService';
import { getOrCreateIdempotencyKey, hashObject } from './idempotency';

/** Closed set of v1 recovery actions. Each has exactly one target status. */
export const RECOVERY_ACTIONS = ['retry_confirmation', 'mark_failed'] as const;
export type RecoveryAction = (typeof RECOVERY_ACTIONS)[number];

const ACTION_TARGET_STATUS: Record<RecoveryAction, BookingStatus> = {
    retry_confirmation: 'onchain_pending',
    mark_failed: 'failed',
};

const RECOVERY_PATH_PREFIX = '/api/v1/admin/bookings';

export interface RecoverBookingInput {
    bookingId: string;
    action: RecoveryAction;
    reason: string;
    idempotencyKey: string;
    admin: AdminPayload | null;
    ipAddress?: string;
}

export interface RecoverBookingResult {
    booking: Booking;
    auditLogId: string;
    replayed: boolean;
}

const appError = (statusCode: number, code: string, message: string): AppError =>
    new AppError(message, { statusCode, code });

/**
 * Safe manual booking recovery (#1171).
 *
 * A recovery is a single transaction that claims a namespaced idempotency key,
 * applies the status correction and writes an AdminAuditLog row. A retry with
 * the same key returns the original result without repeating the state change
 * or the audit entry. The caller supplies the role check; this service always
 * records the acting admin for accountability.
 */
export class BookingRecoveryService {
    constructor(private readonly dataSource: DataSource = AppDataSource) {}

    async recoverBooking(input: RecoverBookingInput): Promise<RecoverBookingResult> {
        const reason = input.reason?.trim() ?? '';
        if (!reason) {
            throw appError(400, 'RECOVERY_REASON_REQUIRED', 'A recovery reason is required.');
        }
        if (!RECOVERY_ACTIONS.includes(input.action)) {
            throw appError(400, 'RECOVERY_ACTION_INVALID', 'Unsupported recovery action.');
        }
        const keyValue = input.idempotencyKey?.trim() ?? '';
        if (!keyValue) {
            throw appError(400, 'RECOVERY_KEY_REQUIRED', 'An Idempotency-Key header is required.');
        }

        const key = `booking-recovery:${input.bookingId}:${keyValue}`;
        const path = `${RECOVERY_PATH_PREFIX}/${input.bookingId}/recovery`;
        const requestHash = hashObject({ bookingId: input.bookingId, action: input.action, reason });

        return this.dataSource.transaction(async (manager) => {
            const record = await getOrCreateIdempotencyKey(
                { key, method: 'POST', path, requestHash },
                manager,
            );
            if (
                record.method !== 'POST' ||
                record.path !== path ||
                record.requestHash !== requestHash
            ) {
                throw appError(
                    409,
                    'RECOVERY_KEY_CONFLICT',
                    'Recovery idempotency key was reused with different input.',
                );
            }

            // resourceId stores the audit row id so a replay returns the exact
            // same audit reference together with the current booking state.
            if (record.resourceId) {
                const existing = await manager.getRepository(Booking).findOne({
                    where: { id: input.bookingId },
                });
                if (!existing) {
                    throw appError(404, 'RECOVERY_BOOKING_NOT_FOUND', 'Booking not found.');
                }
                return { booking: existing, auditLogId: record.resourceId, replayed: true };
            }

            const booking = await manager.getRepository(Booking).findOne({
                where: { id: input.bookingId },
            });
            if (!booking) {
                throw appError(404, 'RECOVERY_BOOKING_NOT_FOUND', 'Booking not found.');
            }

            const previousStatus = booking.status;
            booking.status = ACTION_TARGET_STATUS[input.action];
            booking.lastError = reason;
            if (input.action === 'retry_confirmation') {
                booking.confirmationAttempts = 0;
                booking.confirmationNextAttemptAt = null;
            }
            const saved = await manager.getRepository(Booking).save(booking);

            const audit = manager.getRepository(AdminAuditLog).create({
                adminId: input.admin?.adminId ?? 'system',
                adminEmail: input.admin?.email ?? 'system@traqora.io',
                action: `BOOKING_RECOVERY_${input.action.toUpperCase()}`,
                resource: 'bookings',
                resourceId: saved.id,
                details: JSON.stringify({
                    action: input.action,
                    reason,
                    previousStatus,
                    newStatus: saved.status,
                }),
                ipAddress: input.ipAddress ?? 'unknown',
            });
            const savedAudit = await manager.getRepository(AdminAuditLog).save(audit);

            record.resourceId = savedAudit.id;
            await manager.getRepository(IdempotencyKey).save(record);

            return { booking: saved, auditLogId: savedAudit.id, replayed: false };
        });
    }
}

export const bookingRecoveryService = new BookingRecoveryService();
