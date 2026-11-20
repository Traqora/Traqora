const mockBookingFindOne = jest.fn();
const mockAuditCreate = jest.fn();
const mockAuditSave = jest.fn();

jest.mock('../db/dataSource', () => ({
  AppDataSource: {
    getRepository: jest.fn((entity: { name?: string }) =>
      entity?.name === 'AdminAuditLog'
        ? { create: mockAuditCreate, save: mockAuditSave }
        : { findOne: mockBookingFindOne }
    ),
  },
}));

import { SupportBookingService, normalizeContact } from './SupportBookingService';
import { generateBookingReference } from './bookingReference';
import { BadRequestError, NotFoundError } from '../utils/errors';

const REFERENCE_SECRET = 'test-booking-reference-secret';
const reference = generateBookingReference('booking-1', REFERENCE_SECRET);

const booking = {
  id: 'booking-1',
  bookingReference: reference,
  status: 'confirmed',
  createdAt: new Date('2026-11-19T00:00:00Z'),
  flight: {
    flightNumber: 'UA123',
    fromAirport: 'LOS',
    toAirport: 'ACC',
    departureTime: new Date('2026-12-01T10:00:00Z'),
  },
  passenger: {
    email: 'traveler@example.com',
    phone: '+2348012345678',
    firstName: 'Ada',
    lastName: 'Okafor',
  },
};

const baseInput = {
  reference,
  reason: 'Passenger called about schedule change',
  adminId: 'support-1',
  adminEmail: 'support@traqora.io',
};

describe('SupportBookingService', () => {
  let service: SupportBookingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SupportBookingService();
    mockBookingFindOne.mockResolvedValue(booking);
    mockAuditCreate.mockImplementation((value) => value);
    mockAuditSave.mockResolvedValue({});
  });

  test('accepts a safe reference and rejects malformed identifiers', () => {
    expect(SupportBookingService.isLookupIdentifier(reference)).toBe(true);
    expect(SupportBookingService.isLookupIdentifier('booking-1')).toBe(false);
    expect(SupportBookingService.isLookupIdentifier('')).toBe(false);
  });

  test('looks up by safe reference and returns a redacted summary', async () => {
    const result = await service.lookup(baseInput);

    expect(mockBookingFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingReference: reference },
        relations: ['flight', 'passenger'],
      })
    );
    expect(result).toMatchObject({
      id: 'booking-1',
      reference,
      status: 'confirmed',
      requesterVerified: null,
    });
    expect(result.flight).toEqual({
      flightNumber: 'UA123',
      origin: 'LOS',
      destination: 'ACC',
      departureTime: booking.flight.departureTime,
    });
    expect(result).not.toHaveProperty('stripeClientSecret');
    expect(result).not.toHaveProperty('sorobanUnsignedXdr');
  });

  test('verifies the requester by normalized email or phone', async () => {
    const byEmail = await service.lookup({
      ...baseInput,
      claimedContact: '  TRAVELER@Example.com ',
    });
    const byPhone = await service.lookup({
      ...baseInput,
      claimedContact: '+234 8012345678',
    });
    const wrong = await service.lookup({
      ...baseInput,
      claimedContact: 'stranger@example.com',
    });

    expect(byEmail.requesterVerified).toBe(true);
    expect(byPhone.requesterVerified).toBe(true);
    expect(wrong.requesterVerified).toBe(false);
    expect(normalizeContact('  TRAVELER@Example.com ')).toBe('traveler@example.com');
  });

  test('looks up by internal UUID and audits the outcome', async () => {
    const uuid = '123e4567-e89b-42d3-a456-426614174000';
    await service.lookup({ ...baseInput, reference: uuid });

    expect(mockBookingFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: uuid } })
    );
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BOOKING_SUPPORT_LOOKUP_FOUND',
        adminId: 'support-1',
        resourceId: 'booking-1',
      })
    );
    expect(mockAuditSave).toHaveBeenCalled();
  });

  test('rejects a missing reason before querying', async () => {
    await expect(service.lookup({ ...baseInput, reason: '  ' })).rejects.toBeInstanceOf(
      BadRequestError
    );
    expect(mockBookingFindOne).not.toHaveBeenCalled();
  });

  test('audits and reports a missing booking', async () => {
    mockBookingFindOne.mockResolvedValue(null);

    await expect(service.lookup(baseInput)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BOOKING_SUPPORT_LOOKUP_NOT_FOUND' })
    );
  });
});
