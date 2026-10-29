import { AppError } from './ErrorHandlingService';

/**
 * Infant and child passenger rules (#907).
 *
 * Ages are completed years on the itinerary departure date (UTC), not on
 * the day the reservation is created.
 *
 *   infant  under 2
 *   child   2 until under 12
 *   youth   12 until under 18 (may travel without an adult)
 *   adult   18 or older
 *
 * A party with any infant or child needs at least one adult. Each infant
 * needs a distinct adult (one lap infant per adult). Youth do not count
 * as the accompanying adult.
 *
 * Failure returns PASSENGER_AGE_INVALID (HTTP 422) with one error per
 * problem. This is not retried automatically: correct the dates of birth
 * or add an adult, then submit the reservation again.
 */

export interface PassengerAgeInput {
  id?: string;
  dateOfBirth: string;
}

export type PassengerBand = 'infant' | 'child' | 'youth' | 'adult';

export interface ClassifiedPassenger {
  id?: string;
  band: PassengerBand;
  ageYears: number;
}

export type PassengerAgeErrorCode =
  | 'EMPTY_PARTY'
  | 'INVALID_DATE_OF_BIRTH'
  | 'ITINERARY_DEPARTURE_INVALID'
  | 'CHILD_REQUIRES_ADULT'
  | 'INFANT_REQUIRES_ADULT'
  | 'TOO_MANY_INFANTS';

export interface PassengerAgeError {
  code: PassengerAgeErrorCode;
  message: string;
  passengerId?: string;
}

export type PassengerAgeDecision =
  | { ok: true; passengers: ClassifiedPassenger[] }
  | { ok: false; errors: PassengerAgeError[]; passengers: ClassifiedPassenger[] };

export class PassengerAgeValidationError extends AppError {
  constructor(errors: PassengerAgeError[]) {
    super('Passenger age rules were not met. Correct the party and submit the reservation again.', {
      statusCode: 422,
      code: 'PASSENGER_AGE_INVALID',
      details: { errors },
    });
    this.name = 'PassengerAgeValidationError';
  }
}

function toUtcDate(value: string | Date | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function completedYears(dob: Date, on: Date): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const month = on.getUTCMonth() - dob.getUTCMonth();
  if (month < 0 || (month === 0 && on.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

function bandFor(ageYears: number): PassengerBand {
  if (ageYears < 2) return 'infant';
  if (ageYears < 12) return 'child';
  if (ageYears < 18) return 'youth';
  return 'adult';
}

export function validatePassengerAges(input: {
  passengers: PassengerAgeInput[];
  itineraryDeparture: string | Date;
}): PassengerAgeDecision {
  if (!input.passengers.length) {
    return {
      ok: false,
      passengers: [],
      errors: [
        {
          code: 'EMPTY_PARTY',
          message: 'At least one passenger is required before a reservation is created.',
        },
      ],
    };
  }

  const departure = toUtcDate(input.itineraryDeparture);
  if (!departure) {
    return {
      ok: false,
      passengers: [],
      errors: [
        {
          code: 'ITINERARY_DEPARTURE_INVALID',
          message: 'Itinerary departure is not a valid date, so passenger ages cannot be checked.',
        },
      ],
    };
  }

  const errors: PassengerAgeError[] = [];
  const passengers: ClassifiedPassenger[] = [];

  for (const passenger of input.passengers) {
    const dob = toUtcDate(passenger.dateOfBirth);
    if (!dob || dob.getTime() > departure.getTime()) {
      errors.push({
        code: 'INVALID_DATE_OF_BIRTH',
        message: 'Date of birth must be a real date on or before the itinerary departure.',
        passengerId: passenger.id,
      });
      continue;
    }
    const ageYears = completedYears(dob, departure);
    passengers.push({ id: passenger.id, band: bandFor(ageYears), ageYears });
  }

  const adults = passengers.filter((passenger) => passenger.band === 'adult').length;
  const infants = passengers.filter((passenger) => passenger.band === 'infant').length;
  const needsAdult = passengers.some(
    (passenger) => passenger.band === 'infant' || passenger.band === 'child',
  );

  if (needsAdult && adults === 0) {
    errors.push({
      code: 'CHILD_REQUIRES_ADULT',
      message: 'An infant or child must travel with an adult aged 18 or older on the departure date.',
    });
  }
  if (infants > 0 && adults === 0) {
    errors.push({
      code: 'INFANT_REQUIRES_ADULT',
      message: 'An infant must travel with an accompanying adult.',
    });
  }
  if (infants > adults) {
    errors.push({
      code: 'TOO_MANY_INFANTS',
      message: 'Each infant needs their own accompanying adult. Add an adult or remove an infant.',
    });
  }

  if (errors.length) return { ok: false, errors, passengers };
  return { ok: true, passengers };
}

export function assertPassengerAgeRules(input: {
  passengers: PassengerAgeInput[];
  itineraryDeparture: string | Date;
}): PassengerAgeDecision {
  const decision = validatePassengerAges(input);
  if (!decision.ok) throw new PassengerAgeValidationError(decision.errors);
  return decision;
}
