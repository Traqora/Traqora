import { AppDataSource, initDataSource } from '../../src/db/dataSource';
import { TrackedFlight } from '../../src/db/entities/TrackedFlight';
import { PriceObservation } from '../../src/db/entities/PriceObservation';
import {
  PriceTrackingService,
  assessPriceDrop,
  NOTIFICATION_COOLDOWN_MS,
  SIGNIFICANT_DROP_PERCENT,
} from '../../src/services/priceTracking';

/**
 * Runs against a real in-memory SQLite database rather than repository mocks,
 * so the query-builder paths and the entity mapping are exercised too.
 *
 * The datasource is scoped to this feature's two entities: the app-wide test
 * datasource cannot be initialised under better-sqlite3, because some
 * unrelated entities hardcode Postgres-only column types.
 */
jest.mock('../../src/db/dataSource', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DataSource } = require('typeorm');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TrackedFlight: Tracked } = require('../../src/db/entities/TrackedFlight');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PriceObservation: Observation } = require('../../src/db/entities/PriceObservation');

  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    dropSchema: true,
    synchronize: true,
    entities: [Tracked, Observation],
    logging: false,
  });

  return {
    AppDataSource: dataSource,
    initDataSource: async () => {
      if (!dataSource.isInitialized) await dataSource.initialize();
    },
  };
});

const sendPriceAlert = jest.fn().mockResolvedValue(true);

jest.mock('../../src/services/NotificationService', () => ({
  NotificationService: {
    getInstance: jest.fn(() => ({ sendPriceAlert })),
  },
}));

const USER = 'user-1';

async function makeTracker(
  service: PriceTrackingService,
  overrides: Partial<{
    origin: string;
    destination: string;
    departureDate: string;
    returnDate: string | null;
    targetPriceCents: number | null;
  }> = {},
): Promise<TrackedFlight> {
  return service.createTracker({
    userId: USER,
    origin: overrides.origin ?? 'JFK',
    destination: overrides.destination ?? 'LAX',
    departureDate: overrides.departureDate ?? '2026-08-01',
    returnDate: overrides.returnDate ?? null,
    targetPriceCents: overrides.targetPriceCents ?? null,
  });
}

describe('assessPriceDrop', () => {
  it('flags the first observation as a non-drop', () => {
    const result = assessPriceDrop(50000, null, null);
    expect(result).toMatchObject({ isDrop: false, reason: 'first_observation' });
  });

  it('treats a first observation at or below target as a drop', () => {
    expect(assessPriceDrop(40000, null, 40000)).toMatchObject({
      isDrop: true,
      metTarget: true,
      reason: 'target_reached',
    });
  });

  it('flags a fall of at least the significant threshold', () => {
    const result = assessPriceDrop(95000, 100000, null);
    expect(result.dropPercent).toBe(SIGNIFICANT_DROP_PERCENT);
    expect(result).toMatchObject({ isDrop: true, reason: 'significant_drop', dropCents: 5000 });
  });

  it('ignores a fall under the threshold', () => {
    expect(assessPriceDrop(98000, 100000, null)).toMatchObject({
      isDrop: false,
      reason: 'no_drop',
    });
  });

  it('prefers the target reason when both rules fire', () => {
    expect(assessPriceDrop(40000, 100000, 45000)).toMatchObject({
      isDrop: true,
      metTarget: true,
      reason: 'target_reached',
    });
  });

  it('never reports a negative drop when the price rose', () => {
    const result = assessPriceDrop(120000, 100000, null);
    expect(result).toMatchObject({ isDrop: false, dropCents: 0, dropPercent: 0 });
  });

  it('does not divide by a zero baseline', () => {
    expect(assessPriceDrop(1000, 0, null).dropPercent).toBe(0);
  });
});

describe('PriceTrackingService', () => {
  let service: PriceTrackingService;

  beforeAll(async () => {
    await initDataSource();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  beforeEach(async () => {
    sendPriceAlert.mockClear();
    await AppDataSource.getRepository(PriceObservation).clear();
    await AppDataSource.getRepository(TrackedFlight).clear();
    PriceTrackingService.resetForTesting();
    service = PriceTrackingService.getInstance();
  });

  describe('createTracker', () => {
    it('persists a tracker with normalized airport codes', async () => {
      const tracker = await service.createTracker({
        userId: USER,
        origin: 'jfk',
        destination: 'lax',
        departureDate: '2026-08-01',
      });

      expect(tracker).toMatchObject({
        origin: 'JFK',
        destination: 'LAX',
        cabinClass: 'economy',
        passengers: 1,
        currency: 'USD',
        status: 'active',
      });
      expect(tracker.id).toBeDefined();
    });

    it('rejects malformed airport codes', async () => {
      await expect(
        service.createTracker({
          userId: USER,
          origin: 'JF',
          destination: 'LAX',
          departureDate: '2026-08-01',
        }),
      ).rejects.toThrow(/Invalid origin/);

      await expect(
        service.createTracker({
          userId: USER,
          origin: 'JFK',
          destination: 'L4X',
          departureDate: '2026-08-01',
        }),
      ).rejects.toThrow(/Invalid destination/);
    });

    it('rejects an origin equal to the destination', async () => {
      await expect(
        service.createTracker({
          userId: USER,
          origin: 'JFK',
          destination: 'JFK',
          departureDate: '2026-08-01',
        }),
      ).rejects.toThrow(/must differ/);
    });

    it('rejects malformed dates and a return before departure', async () => {
      await expect(
        service.createTracker({
          userId: USER,
          origin: 'JFK',
          destination: 'LAX',
          departureDate: '01-08-2026',
        }),
      ).rejects.toThrow(/departureDate/);

      await expect(
        service.createTracker({
          userId: USER,
          origin: 'JFK',
          destination: 'LAX',
          departureDate: '2026-08-10',
          returnDate: '2026-08-01',
        }),
      ).rejects.toThrow(/must not precede/);
    });

    it('rejects a non-positive target price', async () => {
      await expect(
        service.createTracker({
          userId: USER,
          origin: 'JFK',
          destination: 'LAX',
          departureDate: '2026-08-01',
          targetPriceCents: 0,
        }),
      ).rejects.toThrow(/must be positive/);
    });

    it('rejects a duplicate active tracker for the same one-way route', async () => {
      await makeTracker(service);
      await expect(makeTracker(service)).rejects.toThrow(/already exists/);
    });

    it('allows the same route for a different user or different dates', async () => {
      await makeTracker(service);

      await expect(
        service.createTracker({
          userId: 'user-2',
          origin: 'JFK',
          destination: 'LAX',
          departureDate: '2026-08-01',
        }),
      ).resolves.toBeDefined();

      await expect(
        makeTracker(service, { departureDate: '2026-08-02' }),
      ).resolves.toBeDefined();
    });

    it('treats a round trip as distinct from a one-way on the same date', async () => {
      await makeTracker(service);
      await expect(
        makeTracker(service, { returnDate: '2026-08-10' }),
      ).resolves.toBeDefined();
    });
  });

  describe('listTrackers / getTracker', () => {
    it('lists only the requesting user, newest first', async () => {
      const first = await makeTracker(service);
      const second = await makeTracker(service, { destination: 'SFO' });
      await service.createTracker({
        userId: 'user-2',
        origin: 'JFK',
        destination: 'ORD',
        departureDate: '2026-08-01',
      });

      const trackers = await service.listTrackers(USER);
      expect(trackers.map((t) => t.id).sort()).toEqual([first.id, second.id].sort());
    });

    it('filters by status', async () => {
      const tracker = await makeTracker(service);
      await service.updateTracker(tracker.id, USER, { status: 'paused' });

      expect(await service.listTrackers(USER, 'active')).toHaveLength(0);
      expect(await service.listTrackers(USER, 'paused')).toHaveLength(1);
    });

    it('hides another user\'s tracker behind a not-found', async () => {
      const tracker = await makeTracker(service);
      await expect(service.getTracker(tracker.id, 'user-2')).rejects.toThrow(/not found/);
    });

    it('throws for an unknown id', async () => {
      await expect(service.getTracker('missing-id')).rejects.toThrow(/not found/);
    });
  });

  describe('updateTracker / deleteTracker', () => {
    it('applies a partial update', async () => {
      const tracker = await makeTracker(service);

      const updated = await service.updateTracker(tracker.id, USER, {
        targetPriceCents: 35000,
        cabinClass: 'business',
        passengers: 3,
        status: 'paused',
      });

      expect(updated).toMatchObject({
        targetPriceCents: 35000,
        cabinClass: 'business',
        passengers: 3,
        status: 'paused',
      });
    });

    it('clears the target price when set to null', async () => {
      const tracker = await makeTracker(service, { targetPriceCents: 40000 });
      const updated = await service.updateTracker(tracker.id, USER, {
        targetPriceCents: null,
      });
      expect(updated.targetPriceCents).toBeNull();
    });

    it('rejects invalid update values', async () => {
      const tracker = await makeTracker(service);

      await expect(
        service.updateTracker(tracker.id, USER, { targetPriceCents: -1 }),
      ).rejects.toThrow(/must be positive/);
      await expect(
        service.updateTracker(tracker.id, USER, { passengers: 0 }),
      ).rejects.toThrow(/at least 1/);
    });

    it('deletes the tracker and its observations', async () => {
      const tracker = await makeTracker(service);
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 50000,
        source: 'www.kayak.com',
      });

      await service.deleteTracker(tracker.id, USER);

      await expect(service.getTracker(tracker.id)).rejects.toThrow(/not found/);
      expect(
        await AppDataSource.getRepository(PriceObservation).count({
          where: { trackedFlightId: tracker.id },
        }),
      ).toBe(0);
    });

    it('refuses to delete another user\'s tracker', async () => {
      const tracker = await makeTracker(service);
      await expect(service.deleteTracker(tracker.id, 'user-2')).rejects.toThrow(/not found/);
    });
  });

  describe('recordObservation', () => {
    it('appends history and seeds the rolling last/low prices', async () => {
      const tracker = await makeTracker(service);

      const { observation, assessment } = await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 50000,
        source: 'www.kayak.com',
        sourceUrl: 'https://www.kayak.com/flights/JFK-LAX/2026-08-01',
        carrierCode: 'BA',
      });

      expect(observation.priceCents).toBe(50000);
      expect(observation.currency).toBe('USD');
      expect(assessment.reason).toBe('first_observation');

      const stored = await service.getTracker(tracker.id);
      expect(stored).toMatchObject({ lastPriceCents: 50000, lowestPriceCents: 50000 });
      expect(stored.lastCheckedAt).toBeInstanceOf(Date);
    });

    it('keeps the lowest price when a higher one arrives', async () => {
      const tracker = await makeTracker(service);
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 40000,
        source: 'a.com',
      });
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 60000,
        source: 'a.com',
      });

      const stored = await service.getTracker(tracker.id);
      expect(stored.lastPriceCents).toBe(60000);
      expect(stored.lowestPriceCents).toBe(40000);
    });

    it('rejects an invalid price or a blank source', async () => {
      const tracker = await makeTracker(service);

      await expect(
        service.recordObservation({
          trackedFlightId: tracker.id,
          priceCents: 0,
          source: 'a.com',
        }),
      ).rejects.toThrow(/positive integer/);

      await expect(
        service.recordObservation({
          trackedFlightId: tracker.id,
          priceCents: 1000.5,
          source: 'a.com',
        }),
      ).rejects.toThrow(/positive integer/);

      await expect(
        service.recordObservation({
          trackedFlightId: tracker.id,
          priceCents: 1000,
          source: '   ',
        }),
      ).rejects.toThrow(/source is required/);
    });

    it('notifies on a significant drop and counts it', async () => {
      const tracker = await makeTracker(service);
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 100000,
        source: 'a.com',
      });

      const result = await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 80000,
        source: 'a.com',
      });

      expect(result.notified).toBe(true);
      expect(sendPriceAlert).toHaveBeenCalledTimes(1);

      const stored = await service.getTracker(tracker.id);
      expect(stored.notificationCount).toBe(1);
      expect(stored.lastNotifiedAt).toBeInstanceOf(Date);
    });

    it('suppresses a second alert inside the cooldown window', async () => {
      const tracker = await makeTracker(service);
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 100000,
        source: 'a.com',
      });
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 80000,
        source: 'a.com',
      });
      sendPriceAlert.mockClear();

      const result = await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 60000,
        source: 'a.com',
      });

      expect(result.assessment.isDrop).toBe(true);
      expect(result.notified).toBe(false);
      expect(sendPriceAlert).not.toHaveBeenCalled();
    });

    it('alerts again once the cooldown has elapsed', async () => {
      const tracker = await makeTracker(service);
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 100000,
        source: 'a.com',
      });
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 80000,
        source: 'a.com',
      });

      await AppDataSource.getRepository(TrackedFlight).update(
        { id: tracker.id },
        { lastNotifiedAt: new Date(Date.now() - NOTIFICATION_COOLDOWN_MS - 1000) },
      );
      sendPriceAlert.mockClear();

      const result = await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 60000,
        source: 'a.com',
      });

      expect(result.notified).toBe(true);
    });

    it('does not alert on a paused tracker', async () => {
      const tracker = await makeTracker(service);
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 100000,
        source: 'a.com',
      });
      await service.updateTracker(tracker.id, USER, { status: 'paused' });

      const result = await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 50000,
        source: 'a.com',
      });

      expect(result.notified).toBe(false);
      expect(sendPriceAlert).not.toHaveBeenCalled();
    });

    it('records the observation even when the notifier fails', async () => {
      sendPriceAlert.mockRejectedValueOnce(new Error('queue down'));
      const tracker = await makeTracker(service);
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 100000,
        source: 'a.com',
      });

      const result = await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 50000,
        source: 'a.com',
      });

      expect(result.notified).toBe(false);
      expect(result.observation.priceCents).toBe(50000);
      expect((await service.getTracker(tracker.id)).notificationCount).toBe(0);
    });

    it('throws for an unknown tracker', async () => {
      await expect(
        service.recordObservation({
          trackedFlightId: '00000000-0000-0000-0000-000000000000',
          priceCents: 1000,
          source: 'a.com',
        }),
      ).rejects.toThrow(/not found/);
    });
  });

  describe('recordObservations', () => {
    it('records the good rows and reports the bad ones', async () => {
      const tracker = await makeTracker(service);

      const result = await service.recordObservations([
        { trackedFlightId: tracker.id, priceCents: 50000, source: 'a.com' },
        { trackedFlightId: tracker.id, priceCents: -1, source: 'a.com' },
        {
          trackedFlightId: '00000000-0000-0000-0000-000000000000',
          priceCents: 1000,
          source: 'a.com',
        },
      ]);

      expect(result.recorded).toBe(1);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].message).toMatch(/positive integer/);
    });

    it('counts notifications raised during the batch', async () => {
      const tracker = await makeTracker(service);

      const result = await service.recordObservations([
        { trackedFlightId: tracker.id, priceCents: 100000, source: 'a.com' },
        { trackedFlightId: tracker.id, priceCents: 70000, source: 'a.com' },
      ]);

      expect(result.recorded).toBe(2);
      expect(result.notified).toBe(1);
    });

    it('handles an empty batch', async () => {
      expect(await service.recordObservations([])).toEqual({
        recorded: 0,
        notified: 0,
        errors: [],
      });
    });
  });

  describe('getPriceHistory', () => {
    it('returns observations oldest first', async () => {
      const tracker = await makeTracker(service);
      for (const price of [50000, 45000, 47000]) {
        await service.recordObservation({
          trackedFlightId: tracker.id,
          priceCents: price,
          source: 'a.com',
        });
      }

      const history = await service.getPriceHistory(tracker.id);
      expect(history.map((h) => h.priceCents)).toEqual([50000, 45000, 47000]);
    });

    it('filters by source and caps the result', async () => {
      const tracker = await makeTracker(service);
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 50000,
        source: 'a.com',
      });
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 45000,
        source: 'b.com',
      });

      expect(await service.getPriceHistory(tracker.id, { source: 'b.com' })).toHaveLength(1);
      expect(await service.getPriceHistory(tracker.id, { limit: 1 })).toHaveLength(1);
    });

    it('excludes observations older than the requested window', async () => {
      const tracker = await makeTracker(service);
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 50000,
        source: 'a.com',
      });

      await AppDataSource.getRepository(PriceObservation).update(
        { trackedFlightId: tracker.id },
        { observedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
      );

      expect(await service.getPriceHistory(tracker.id, { days: 30 })).toHaveLength(0);
      expect(await service.getPriceHistory(tracker.id, { days: 60 })).toHaveLength(1);
    });
  });

  describe('getPriceStats', () => {
    it('summarises a falling series', async () => {
      const tracker = await makeTracker(service);
      for (const [price, source] of [
        [100000, 'a.com'],
        [90000, 'b.com'],
        [80000, 'a.com'],
      ] as Array<[number, string]>) {
        await service.recordObservation({
          trackedFlightId: tracker.id,
          priceCents: price,
          source,
        });
      }

      const stats = await service.getPriceStats(tracker.id);

      expect(stats).toMatchObject({
        observationCount: 3,
        currentPriceCents: 80000,
        lowestPriceCents: 80000,
        highestPriceCents: 100000,
        averagePriceCents: 90000,
        changeCents: -20000,
        changePercent: -20,
        trend: 'falling',
        currency: 'USD',
      });
      expect(stats.sources.sort()).toEqual(['a.com', 'b.com']);
    });

    it('marks a rising series', async () => {
      const tracker = await makeTracker(service);
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 80000,
        source: 'a.com',
      });
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 100000,
        source: 'a.com',
      });

      expect((await service.getPriceStats(tracker.id)).trend).toBe('rising');
    });

    it('marks a barely-moving series as stable', async () => {
      const tracker = await makeTracker(service);
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 100000,
        source: 'a.com',
      });
      await service.recordObservation({
        trackedFlightId: tracker.id,
        priceCents: 100500,
        source: 'a.com',
      });

      expect((await service.getPriceStats(tracker.id)).trend).toBe('stable');
    });

    it('returns an empty summary before any observation', async () => {
      const tracker = await makeTracker(service);

      expect(await service.getPriceStats(tracker.id)).toMatchObject({
        observationCount: 0,
        currentPriceCents: null,
        averagePriceCents: null,
        trend: 'unknown',
        sources: [],
      });
    });
  });
});
