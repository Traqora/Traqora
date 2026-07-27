import express from 'express';
import request from 'supertest';
import { createFlightRoutes } from '../../src/api/routes/flights';
import type { FlightSearchService } from '../../src/services/flightSearchService';
import type { FlexibleSearchService, MultiCityItinerary } from '../../src/services/multi-city-search';

/**
 * Mounts createFlightRoutes on a bare express app (no createApp(), no
 * DB init, no unrelated middleware). The multi-city route only depends on
 * FlexibleSearchService, so it is mocked directly.
 */
function buildApp(flexibleSearchService: Partial<FlexibleSearchService>) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1/flights',
    createFlightRoutes(
      {} as FlightSearchService,
      undefined,
      flexibleSearchService as FlexibleSearchService,
    ),
  );
  // Minimal error handler mirroring the shape asyncHandler-wrapped errors expect
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.statusCode || 400).json({ error: err.message, details: err.details });
  });
  return app;
}

const sampleItinerary: MultiCityItinerary = {
  segments: [],
  totalPrice: 450,
  totalDuration: 900,
  isOpenJaw: true,
  baggageAllowance: { checkIn: 23, carryOn: 10, currency: 'kg', note: 'test' },
};

describe('POST /api/v1/flights/multi-city (issue #372)', () => {
  it('returns 400 when fewer than 2 segments are provided', async () => {
    const searchMultiCity = jest.fn();
    const app = buildApp({ searchMultiCity });

    const res = await request(app)
      .post('/api/v1/flights/multi-city')
      .send({
        segments: [{ origin: 'JFK', destination: 'LHR', date: '2026-08-01', passengers: 1 }],
        passengers: 1,
      });

    expect(res.status).toBe(400);
    expect(searchMultiCity).not.toHaveBeenCalled();
  });

  it('returns 400 when more than MAX_SEGMENTS segments are provided', async () => {
    const searchMultiCity = jest.fn();
    const app = buildApp({ searchMultiCity });

    const segment = { origin: 'JFK', destination: 'LHR', date: '2026-08-01', passengers: 1 };
    const res = await request(app)
      .post('/api/v1/flights/multi-city')
      .send({ segments: Array(6).fill(segment), passengers: 1 });

    expect(res.status).toBe(400);
    expect(searchMultiCity).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed segment (bad date, wrong airport code length)', async () => {
    const searchMultiCity = jest.fn();
    const app = buildApp({ searchMultiCity });

    const res = await request(app)
      .post('/api/v1/flights/multi-city')
      .send({
        segments: [
          { origin: 'JFK', destination: 'LHR', date: '2026-08-01', passengers: 1 },
          { origin: 'LHR', destination: 'CDGX', date: 'not-a-date', passengers: 1 },
        ],
        passengers: 1,
      });

    expect(res.status).toBe(400);
    expect(searchMultiCity).not.toHaveBeenCalled();
  });

  it('uppercases airport codes and forwards segments to the service', async () => {
    const searchMultiCity = jest.fn().mockResolvedValue(sampleItinerary);
    const app = buildApp({ searchMultiCity });

    const res = await request(app)
      .post('/api/v1/flights/multi-city')
      .send({
        segments: [
          { origin: 'jfk', destination: 'lhr', date: '2026-08-01', passengers: 2 },
          { origin: 'lhr', destination: 'cdg', date: '2026-08-05', passengers: 2 },
        ],
        passengers: 2,
        sortBy: 'total_duration',
        sortOrder: 'desc',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(sampleItinerary);

    expect(searchMultiCity).toHaveBeenCalledWith({
      segments: [
        { origin: 'JFK', destination: 'LHR', date: '2026-08-01', passengers: 2, travelClass: undefined },
        { origin: 'LHR', destination: 'CDG', date: '2026-08-05', passengers: 2, travelClass: undefined },
      ],
      passengers: 2,
      sortBy: 'total_duration',
      sortOrder: 'desc',
    });
  });

  it('returns the open-jaw flag from the service response', async () => {
    const searchMultiCity = jest.fn().mockResolvedValue({ ...sampleItinerary, isOpenJaw: true });
    const app = buildApp({ searchMultiCity });

    const res = await request(app)
      .post('/api/v1/flights/multi-city')
      .send({
        segments: [
          { origin: 'JFK', destination: 'LHR', date: '2026-08-01', passengers: 1 },
          { origin: 'CDG', destination: 'JFK', date: '2026-08-05', passengers: 1 },
        ],
        passengers: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.isOpenJaw).toBe(true);
  });

  it('propagates service errors as 400s', async () => {
    const searchMultiCity = jest.fn().mockRejectedValue(new Error('no flights available'));
    const app = buildApp({ searchMultiCity });

    const res = await request(app)
      .post('/api/v1/flights/multi-city')
      .send({
        segments: [
          { origin: 'JFK', destination: 'LHR', date: '2026-08-01', passengers: 1 },
          { origin: 'LHR', destination: 'CDG', date: '2026-08-05', passengers: 1 },
        ],
        passengers: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('no flights available');
  });
});
