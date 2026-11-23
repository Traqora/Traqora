/**
 * Apple Wallet boarding-pass export — issue #769.
 *
 * Builds the `pass.json` payload for a checked-in booking. Contract (see docs/WALLET_PASS.md):
 *  - Only checked-in bookings whose booking is not failed/refunded get a pass.
 *  - `barcodes` lives at the top level of pass.json (Apple ignores it inside `boardingPass`).
 *  - `passTypeIdentifier` / `teamIdentifier` come from APPLE_WALLET_PASS_TYPE_ID / APPLE_WALLET_TEAM_ID.
 *  - `relevantDate` is the departure time; `expirationDate` is departure + PASS_EXPIRY_HOURS.
 *
 * Errors:
 *  - ConflictError (409): not checked in, or booking failed/refunded.
 *  - UnprocessableEntityError (422): flight/passenger data or boarding-pass code missing/invalid.
 *  - InternalServerError (500): Apple Wallet identifiers not configured in production.
 */

import { Booking, BookingStatus } from '../db/entities/Booking';
import { CheckIn } from '../db/entities/CheckIn';
import { ConflictError, InternalServerError, UnprocessableEntityError } from '../utils/errors';

export const DEFAULT_PASS_TYPE_IDENTIFIER = 'pass.com.traqora.boardingpass';
export const DEV_TEAM_IDENTIFIER = 'TRAQORADEV';
export const PASS_EXPIRY_HOURS = 24;

/** Booking statuses for which a boarding pass must never be issued. */
export const WALLET_PASS_BLOCKED_BOOKING_STATUSES: BookingStatus[] = ['failed', 'refunded'];

export interface AppleWalletConfig {
  passTypeIdentifier: string;
  teamIdentifier: string;
  organizationName: string;
}

interface PassField {
  key: string;
  label: string;
  value: string;
  dateStyle?: 'PKDateStyleShort' | 'PKDateStyleMedium';
  timeStyle?: 'PKDateStyleShort';
}

export interface AppleWalletBoardingPass {
  formatVersion: 1;
  passTypeIdentifier: string;
  teamIdentifier: string;
  serialNumber: string;
  description: string;
  organizationName: string;
  relevantDate: string;
  expirationDate: string;
  boardingPass: {
    transitType: 'PKTransitTypeAir';
    headerFields: PassField[];
    primaryFields: PassField[];
    secondaryFields: PassField[];
    auxiliaryFields: PassField[];
  };
  barcodes: Array<{
    format: 'PKBarcodeFormatQR';
    message: string;
    messageEncoding: 'iso-8859-1';
    altText: string;
  }>;
}

export function getAppleWalletConfig(env: NodeJS.ProcessEnv = process.env): AppleWalletConfig {
  const passTypeIdentifier = env.APPLE_WALLET_PASS_TYPE_ID?.trim();
  const teamIdentifier = env.APPLE_WALLET_TEAM_ID?.trim();

  if (env.NODE_ENV === 'production' && (!passTypeIdentifier || !teamIdentifier)) {
    throw new InternalServerError('Apple Wallet is not configured (APPLE_WALLET_PASS_TYPE_ID, APPLE_WALLET_TEAM_ID)');
  }

  return {
    passTypeIdentifier: passTypeIdentifier || DEFAULT_PASS_TYPE_IDENTIFIER,
    teamIdentifier: teamIdentifier || DEV_TEAM_IDENTIFIER,
    organizationName: env.APPLE_WALLET_ORGANIZATION_NAME?.trim() || 'Traqora',
  };
}

function assertPassable(checkIn: CheckIn): Required<Pick<Booking, 'flight' | 'passenger'>> & { departure: Date } {
  if (checkIn.status !== 'checked_in') {
    throw new ConflictError('Wallet pass is only available after check-in');
  }

  const booking = checkIn.booking;
  if (!booking) {
    throw new UnprocessableEntityError('Check-in is not linked to a booking');
  }
  if (WALLET_PASS_BLOCKED_BOOKING_STATUSES.includes(booking.status)) {
    throw new ConflictError(`Wallet pass is not available for ${booking.status} bookings`);
  }

  const { flight, passenger } = booking;
  if (!flight || !flight.fromAirport || !flight.toAirport || !flight.flightNumber) {
    throw new UnprocessableEntityError('Booking is missing flight details required for a wallet pass');
  }
  if (!passenger || !passenger.firstName || !passenger.lastName) {
    throw new UnprocessableEntityError('Booking is missing passenger details required for a wallet pass');
  }
  if (!checkIn.boardingPassCode) {
    throw new UnprocessableEntityError('Check-in has no boarding pass code');
  }

  const departure = new Date(flight.departureTime);
  if (Number.isNaN(departure.getTime())) {
    throw new UnprocessableEntityError('Flight departure time is invalid');
  }

  return { flight, passenger, departure };
}

export function buildAppleWalletPass(checkIn: CheckIn, config: AppleWalletConfig): AppleWalletBoardingPass {
  const { flight, passenger, departure } = assertPassable(checkIn);
  const flightCode = `${flight.airlineCode || ''}${flight.flightNumber}`;
  const expiration = new Date(departure.getTime() + PASS_EXPIRY_HOURS * 60 * 60 * 1000);

  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeIdentifier,
    teamIdentifier: config.teamIdentifier,
    serialNumber: checkIn.id,
    description: `${flightCode} boarding pass`,
    organizationName: config.organizationName,
    relevantDate: departure.toISOString(),
    expirationDate: expiration.toISOString(),
    boardingPass: {
      transitType: 'PKTransitTypeAir',
      headerFields: [{ key: 'gate', label: 'GATE', value: flight.gate || 'TBD' }],
      primaryFields: [
        { key: 'origin', label: 'FROM', value: flight.fromAirport },
        { key: 'destination', label: 'TO', value: flight.toAirport },
      ],
      secondaryFields: [
        { key: 'passenger', label: 'PASSENGER', value: `${passenger.firstName} ${passenger.lastName}` },
        { key: 'seat', label: 'SEAT', value: checkIn.seatNumber || 'N/A' },
      ],
      auxiliaryFields: [
        { key: 'flight', label: 'FLIGHT', value: flightCode },
        { key: 'terminal', label: 'TERMINAL', value: flight.terminal || 'TBD' },
        {
          key: 'departure',
          label: 'DEPARTS',
          value: departure.toISOString(),
          dateStyle: 'PKDateStyleShort',
          timeStyle: 'PKDateStyleShort',
        },
      ],
    },
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: checkIn.boardingPassCode,
        messageEncoding: 'iso-8859-1',
        altText: checkIn.boardingPassCode,
      },
    ],
  };
}
