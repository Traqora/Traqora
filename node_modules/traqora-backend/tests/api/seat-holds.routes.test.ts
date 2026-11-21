import express from 'express';
import request from 'supertest';
import servicesRouter from '../../src/api/routes/services';
import { seatAvailabilityService } from '../../src/services/seatAvailabilityService';

jest.mock('../../src/services/seatAvailabilityService', () => ({
  seatAvailabilityService: {
    getSeatAvailability: jest.fn(),
    getActiveGroupSeatHolds: jest.fn(),
  },
}));

jest.mock('../../src/services/inflightServicesService', () => ({
  inflightServicesService: {},
}));

jest.mock('../../src/db/dataSource', () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

jest.mock('../../src/utils/errorHandler', () => ({
  asyncHandler: (handler: (...args: any[]) => any) => handler,
}));

describe('GET /api/services/seats/:flightId/holds', () => {
  const app = express().use('/api/services', servicesRouter);

  beforeEach(() => {
    jest.clearAllMocks();
    (seatAvailabilityService.getSeatAvailability as jest.Mock).mockResolvedValue({
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
    });
    (seatAvailabilityService.getActiveGroupSeatHolds as jest.Mock).mockReturnValue([
      {
        groupBookingId: 'private-group-id',
        seatCount: 2,
        seats: ['3A', '3B'],
        lockedAt: new Date('2026-01-01T00:00:00.000Z'),
        expiresAt: new Date('2026-01-01T00:15:00.000Z'),
      },
    ]);
  });

  it('returns active seats and expiry metadata without group identifiers', async () => {
    const response = await request(app).get('/api/services/seats/flight-1/holds');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      flightId: 'flight-1',
      heldSeats: 2,
      holds: [{ seatCount: 2, seats: ['3A', '3B'] }],
    });
    expect(response.body.holds[0]).not.toHaveProperty('groupBookingId');
  });
});