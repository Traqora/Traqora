/**
 * Support booking lookup workflow (#1165).
 *
 * Authorized support staff locate a booking with the privacy-safe public
 * reference (or an internal UUID) and verify that the person contacting
 * support owns the booking. Only a redacted booking summary is returned:
 * payment secrets, unsigned transactions and provider tokens never leave this
 * service. Every lookup is audited with the staff member, reason and outcome.
 */

import { AppDataSource } from '../db/dataSource';
import { Booking } from '../db/entities/Booking';
import { AdminAuditLog } from '../db/entities/AdminAuditLog';
import { isValidBookingReference } from './bookingReference';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface SupportLookupInput {
  /** Safe public reference (TRQ-...) or internal booking UUID. */
  reference: string;
  /** Email or phone the requester claims, used to verify booking ownership. */
  claimedContact?: string;
  /** Free-text reason recorded in the audit trail. */
  reason: string;
  /** Authenticated support/admin identity. */
  adminId: string;
  adminEmail: string;
  ipAddress?: string;
}

export interface SupportBookingSummary {
  id: string;
  reference: string | null;
  status: string;
  createdAt: Date;
  flight: {
    flightNumber: string;
    origin: string;
    destination: string;
    departureTime: Date;
  } | null;
  passenger: {
    firstName: string;
    lastName: string;
  };
  requesterVerified: boolean | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Normalize a claimed contact value for a non-cryptographic equality check. */
export const normalizeContact = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, '');

export class SupportBookingService {
  private bookings = AppDataSource.getRepository(Booking);
  private audit = AppDataSource.getRepository(AdminAuditLog);

  /** True when the supplied identifier is a safe reference or a UUID. */
  static isLookupIdentifier(value: string): boolean {
    if (!value || typeof value !== 'string') return false;
    return isValidBookingReference(value.trim()) || UUID_PATTERN.test(value.trim());
  }

  async lookup(input: SupportLookupInput): Promise<SupportBookingSummary> {
    const reference = (input.reference ?? '').trim();
    if (!SupportBookingService.isLookupIdentifier(reference)) {
      throw new BadRequestError(
        'A valid booking reference (TRQ-...) or booking UUID is required.'
      );
    }
    if (!input.reason || input.reason.trim().length === 0) {
      throw new BadRequestError('A lookup reason is required.');
    }

    const isSafeReference = isValidBookingReference(reference);
    const booking = await this.bookings.findOne({
      where: isSafeReference
        ? { bookingReference: reference }
        : { id: reference },
      relations: ['flight', 'passenger'],
    });

    if (!booking) {
      await this.writeAudit(input, reference, 'NOT_FOUND', null);
      throw new NotFoundError('No booking matches the supplied reference.');
    }

    const claimed = input.claimedContact
      ? normalizeContact(input.claimedContact)
      : null;
    const passengerEmail = booking.passenger?.email
      ? normalizeContact(booking.passenger.email)
      : null;
    const passengerPhone = booking.passenger?.phone
      ? normalizeContact(booking.passenger.phone)
      : null;
    const requesterVerified = claimed
      ? claimed === passengerEmail || claimed === passengerPhone
      : null;

    const summary = this.toSummary(booking, requesterVerified);
    await this.writeAudit(input, reference, requesterVerified === false ? 'VERIFICATION_FAILED' : 'FOUND', booking.id);
    return summary;
  }

  private toSummary(
    booking: Booking,
    requesterVerified: boolean | null
  ): SupportBookingSummary {
    const flight = booking.flight;
    return {
      id: booking.id,
      reference: booking.bookingReference ?? null,
      status: booking.status,
      createdAt: booking.createdAt,
      flight: flight
        ? {
            flightNumber: flight.flightNumber,
            origin: flight.fromAirport,
            destination: flight.toAirport,
            departureTime: flight.departureTime,
          }
        : null,
      passenger: {
        firstName: booking.passenger?.firstName ?? '',
        lastName: booking.passenger?.lastName ?? '',
      },
      requesterVerified,
    };
  }

  private async writeAudit(
    input: SupportLookupInput,
    reference: string,
    outcome: string,
    bookingId: string | null
  ): Promise<void> {
    try {
      const entry = this.audit.create({
        adminId: input.adminId,
        adminEmail: input.adminEmail,
        action: `BOOKING_SUPPORT_LOOKUP_${outcome}`,
        resource: 'bookings',
        resourceId: bookingId,
        details: JSON.stringify({
          reference,
          reason: input.reason.trim(),
          claimedContact: input.claimedContact
            ? normalizeContact(input.claimedContact)
            : null,
        }),
        ipAddress: input.ipAddress ?? 'unknown',
      });
      await this.audit.save(entry);
    } catch (error) {
      // Auditing must never hide a lookup failure from the caller, but a
      // missing audit row on a successful lookup is a security event.
      logger.warn('Failed to write support lookup audit', {
        adminId: input.adminId,
        reference,
        outcome,
        error: (error as Error).message,
      });
    }
  }
}

export const supportBookingService = new SupportBookingService();
