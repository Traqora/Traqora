// @ts-ignore
import {
  passengerSchema,
  createBookingSchema,
} from '../../src/api/schemas/index';

describe('Booking Schema Contract Tests', () => {
  describe('passengerSchema', () => {
    const validPassenger = {
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
      sorobanAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA',
    };

    it('should accept valid passenger with all fields', () => {
      const result = passengerSchema.safeParse(validPassenger);
      expect(result.success).toBe(true);
    });

    it('should accept valid passenger without optional phone field', () => {
      const passengerWithoutPhone = { ...validPassenger, phone: undefined };
      const result = passengerSchema.safeParse(passengerWithoutPhone);
      expect(result.success).toBe(true);
    });

    it('should accept valid passenger without phone field at all', () => {
      const { phone, ...passengerWithoutPhone } = validPassenger;
      const result = passengerSchema.safeParse(passengerWithoutPhone);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email format', () => {
      const invalidEmail = { ...validPassenger, email: 'invalid-email' };
      const result = passengerSchema.safeParse(invalidEmail);
      expect(result.success).toBe(false);
    });

    it('should reject empty email', () => {
      const emptyEmail = { ...validPassenger, email: '' };
      const result = passengerSchema.safeParse(emptyEmail);
      expect(result.success).toBe(false);
    });

    it('should reject missing email', () => {
      const { email, ...passengerWithoutEmail } = validPassenger;
      const result = passengerSchema.safeParse(passengerWithoutEmail);
      expect(result.success).toBe(false);
    });

    it('should reject empty firstName', () => {
      const emptyFirstName = { ...validPassenger, firstName: '' };
      const result = passengerSchema.safeParse(emptyFirstName);
      expect(result.success).toBe(false);
    });

    it('should reject missing firstName', () => {
      const { firstName, ...passengerWithoutFirstName } = validPassenger;
      const result = passengerSchema.safeParse(passengerWithoutFirstName);
      expect(result.success).toBe(false);
    });

    it('should reject empty lastName', () => {
      const emptyLastName = { ...validPassenger, lastName: '' };
      const result = passengerSchema.safeParse(emptyLastName);
      expect(result.success).toBe(false);
    });

    it('should reject missing lastName', () => {
      const { lastName, ...passengerWithoutLastName } = validPassenger;
      const result = passengerSchema.safeParse(passengerWithoutLastName);
      expect(result.success).toBe(false);
    });

    it('should reject phone shorter than 4 characters', () => {
      const shortPhone = { ...validPassenger, phone: '123' };
      const result = passengerSchema.safeParse(shortPhone);
      expect(result.success).toBe(false);
    });

    it('should accept phone with exactly 4 characters', () => {
      const fourCharPhone = { ...validPassenger, phone: '1234' };
      const result = passengerSchema.safeParse(fourCharPhone);
      expect(result.success).toBe(true);
    });

    it('should reject empty sorobanAddress', () => {
      const emptyAddress = { ...validPassenger, sorobanAddress: '' };
      const result = passengerSchema.safeParse(emptyAddress);
      expect(result.success).toBe(false);
    });

    it('should reject missing sorobanAddress', () => {
      const { sorobanAddress, ...passengerWithoutAddress } = validPassenger;
      const result = passengerSchema.safeParse(passengerWithoutAddress);
      expect(result.success).toBe(false);
    });

    it('should accept email with special characters', () => {
      const specialEmail = { ...validPassenger, email: 'test.user+tag@example.co.uk' };
      const result = passengerSchema.safeParse(specialEmail);
      expect(result.success).toBe(true);
    });

    it('should accept firstName with spaces', () => {
      const spacedName = { ...validPassenger, firstName: 'Mary Jane' };
      const result = passengerSchema.safeParse(spacedName);
      expect(result.success).toBe(true);
    });

    it('should accept lastName with hyphens', () => {
      const hyphenatedName = { ...validPassenger, lastName: 'Smith-Jones' };
      const result = passengerSchema.safeParse(hyphenatedName);
      expect(result.success).toBe(true);
    });

    it('should accept phone with various formats', () => {
      const phoneFormats = [
        '+1234567890',
        '1234567890',
        '(123) 456-7890',
        '123-456-7890',
      ];
      phoneFormats.forEach((phone) => {
        const result = passengerSchema.safeParse({ ...validPassenger, phone });
        expect(result.success).toBe(true);
      });
    });

    it('should reject non-string email', () => {
      const result = passengerSchema.safeParse({ ...validPassenger, email: 123 });
      expect(result.success).toBe(false);
    });

    it('should reject null firstName', () => {
      const result = passengerSchema.safeParse({ ...validPassenger, firstName: null });
      expect(result.success).toBe(false);
    });
  });

  describe('createBookingSchema', () => {
    const validBooking = {
      flightId: '550e8400-e29b-41d4-a716-446655440000',
      passenger: {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        sorobanAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA',
      },
    };

    it('should accept valid booking payload', () => {
      const result = createBookingSchema.safeParse(validBooking);
      expect(result.success).toBe(true);
    });

    it('should accept valid booking with optional phone in passenger', () => {
      const bookingWithPhone = {
        ...validBooking,
        passenger: {
          ...validBooking.passenger,
          phone: '+1234567890',
        },
      };
      const result = createBookingSchema.safeParse(bookingWithPhone);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID format for flightId', () => {
      const invalidUuid = { ...validBooking, flightId: 'not-a-uuid' };
      const result = createBookingSchema.safeParse(invalidUuid);
      expect(result.success).toBe(false);
    });

    it('should reject empty flightId', () => {
      const emptyFlightId = { ...validBooking, flightId: '' };
      const result = createBookingSchema.safeParse(emptyFlightId);
      expect(result.success).toBe(false);
    });

    it('should reject missing flightId', () => {
      const { flightId, ...bookingWithoutFlightId } = validBooking;
      const result = createBookingSchema.safeParse(bookingWithoutFlightId);
      expect(result.success).toBe(false);
    });

    it('should reject missing passenger', () => {
      const { passenger, ...bookingWithoutPassenger } = validBooking;
      const result = createBookingSchema.safeParse(bookingWithoutPassenger);
      expect(result.success).toBe(false);
    });

    it('should reject invalid passenger object', () => {
      const invalidPassenger = {
        ...validBooking,
        passenger: { invalid: 'object' },
      };
      const result = createBookingSchema.safeParse(invalidPassenger);
      expect(result.success).toBe(false);
    });

    it('should reject booking with invalid passenger email', () => {
      const invalidEmail = {
        ...validBooking,
        passenger: { ...validBooking.passenger, email: 'invalid' },
      };
      const result = createBookingSchema.safeParse(invalidEmail);
      expect(result.success).toBe(false);
    });

    it('should accept various valid UUID formats', () => {
      const validUuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
      ];
      validUuids.forEach((uuid) => {
        const result = createBookingSchema.safeParse({ ...validBooking, flightId: uuid });
        expect(result.success).toBe(true);
      });
    });

    it('should reject UUID with uppercase letters in wrong positions', () => {
      const invalidUuid = { ...validBooking, flightId: '550E8400-E29B-41D4-A716-446655440000' };
      const result = createBookingSchema.safeParse(invalidUuid);
      expect(result.success).toBe(false);
    });

    it('should reject null flightId', () => {
      const result = createBookingSchema.safeParse({ ...validBooking, flightId: null });
      expect(result.success).toBe(false);
    });

    it('should reject null passenger', () => {
      const result = createBookingSchema.safeParse({ ...validBooking, passenger: null });
      expect(result.success).toBe(false);
    });

    it('should reject non-string flightId', () => {
      const result = createBookingSchema.safeParse({ ...validBooking, flightId: 123 });
      expect(result.success).toBe(false);
    });

    it('should reject UUID with missing segments', () => {
      const incompleteUuid = { ...validBooking, flightId: '550e8400-e29b-41d4' };
      const result = createBookingSchema.safeParse(incompleteUuid);
      expect(result.success).toBe(false);
    });

    it('should accept minimal valid passenger (required fields only)', () => {
      const minimalPassenger = {
        email: 'minimal@example.com',
        firstName: 'Min',
        lastName: 'Imal',
        sorobanAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA',
      };
      const result = createBookingSchema.safeParse({
        flightId: validBooking.flightId,
        passenger: minimalPassenger,
      });
      expect(result.success).toBe(true);
    });
  });
});
