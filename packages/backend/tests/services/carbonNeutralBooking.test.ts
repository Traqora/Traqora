import { AppDataSource, initDataSource } from '../../src/db/dataSource';
import { CarbonOffset } from '../../src/db/entities/CarbonOffset';
import { OffsetProject } from '../../src/db/entities/OffsetProject';
import { Flight } from '../../src/db/entities/Flight';
import { CarbonOffsetService } from '../../src/services/carbonOffsetService';

/**
 * Covers the carbon-neutral booking flow and platform reporting added on top
 * of the existing offset service. Unlike `carbonOffsetService.test.ts`, which
 * mocks repositories, this drives a real in-memory database so the report's
 * query-builder path and the duplicate-offset guard are exercised.
 *
 * The datasource is scoped to the entities this feature touches — the
 * app-wide test datasource cannot initialise under better-sqlite3, because
 * unrelated entities hardcode Postgres-only column types.
 */
jest.mock('../../src/db/dataSource', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DataSource } = require('typeorm');
  const entities = [
    require('../../src/db/entities/CarbonOffset').CarbonOffset,
    require('../../src/db/entities/OffsetProject').OffsetProject,
    require('../../src/db/entities/Flight').Flight,
  ];

  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    dropSchema: true,
    synchronize: true,
    entities,
    logging: false,
  });

  return {
    AppDataSource: dataSource,
    initDataSource: async () => {
      if (!dataSource.isInitialized) await dataSource.initialize();
    },
  };
});

const USER = 'user-1';

describe('carbon-neutral booking and reporting', () => {
  let service: CarbonOffsetService;
  let flightId: string;

  beforeAll(async () => {
    await initDataSource();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  beforeEach(async () => {
    await AppDataSource.getRepository(CarbonOffset).clear();
    await AppDataSource.getRepository(OffsetProject).clear();
    await AppDataSource.getRepository(Flight).clear();

    const flight = await AppDataSource.getRepository(Flight).save(
      AppDataSource.getRepository(Flight).create({
        flightNumber: 'TQ100',
        fromAirport: 'JFK',
        toAirport: 'LAX',
        airlineCode: 'TQ',
        seatsAvailable: 10,
        priceCents: 45000,
        departureTime: new Date('2026-08-01T08:00:00Z'),
        arrivalTime: new Date('2026-08-01T11:00:00Z'),
      } as Partial<Flight>),
    );
    flightId = flight.id;

    CarbonOffsetService.resetForTesting();
    service = CarbonOffsetService.getInstance();
  });

  describe('getCarbonNeutralQuote', () => {
    it('prices every active project, cheapest first', async () => {
      const quote = await service.getCarbonNeutralQuote(flightId);

      expect(quote.footprint.totalCO2kg).toBeGreaterThan(0);
      expect(quote.options.length).toBeGreaterThan(1);

      const costs = quote.options.map((o) => o.costCents);
      expect([...costs].sort((a, b) => a - b)).toEqual(costs);
      expect(quote.recommended).toEqual(quote.options[0]);
    });

    it('scales the footprint with the cabin class', async () => {
      const economy = await service.getCarbonNeutralQuote(flightId, 'economy');
      const first = await service.getCarbonNeutralQuote(flightId, 'first');

      expect(first.footprint.totalCO2kg).toBeGreaterThan(economy.footprint.totalCO2kg);
    });

    it('throws for an unknown flight', async () => {
      await expect(
        service.getCarbonNeutralQuote('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(/Flight not found/);
    });
  });

  describe('purchaseCarbonNeutralBooking', () => {
    it('offsets a booking using the cheapest project by default', async () => {
      const quote = await service.getCarbonNeutralQuote(flightId);

      const certificate = await service.purchaseCarbonNeutralBooking({
        userId: USER,
        flightId,
        bookingId: 'booking-1',
      });

      expect(certificate).toMatchObject({
        projectName: quote.recommended?.projectName,
        co2Kg: quote.footprint.totalCO2kg,
        userId: USER,
      });
      expect(certificate.certificateRef).toMatch(/^CRB-/);
    });

    it('honours an explicitly chosen project', async () => {
      const quote = await service.getCarbonNeutralQuote(flightId);
      const pricier = quote.options[quote.options.length - 1];

      const certificate = await service.purchaseCarbonNeutralBooking({
        userId: USER,
        flightId,
        bookingId: 'booking-1',
        projectId: pricier.projectId,
      });

      expect(certificate.projectName).toBe(pricier.projectName);
    });

    it('records the purchase against the booking', async () => {
      await service.purchaseCarbonNeutralBooking({
        userId: USER,
        flightId,
        bookingId: 'booking-1',
      });

      const stored = await AppDataSource.getRepository(CarbonOffset).findOne({
        where: { bookingId: 'booking-1' },
      });

      expect(stored).toMatchObject({ status: 'completed', userId: USER });
      expect(stored?.sorobanTxHash).toBeTruthy();
    });

    it('refuses to offset the same booking twice', async () => {
      await service.purchaseCarbonNeutralBooking({
        userId: USER,
        flightId,
        bookingId: 'booking-1',
      });

      await expect(
        service.purchaseCarbonNeutralBooking({
          userId: USER,
          flightId,
          bookingId: 'booking-1',
        }),
      ).rejects.toThrow(/already been offset/);
    });

    it('allows a different booking on the same flight', async () => {
      await service.purchaseCarbonNeutralBooking({
        userId: USER,
        flightId,
        bookingId: 'booking-1',
      });

      await expect(
        service.purchaseCarbonNeutralBooking({
          userId: USER,
          flightId,
          bookingId: 'booking-2',
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a project id that does not exist', async () => {
      await expect(
        service.purchaseCarbonNeutralBooking({
          userId: USER,
          flightId,
          bookingId: 'booking-1',
          projectId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toThrow(/No active offset project/);
    });
  });

  describe('getPlatformSustainabilityReport', () => {
    async function seedPurchases(): Promise<void> {
      await service.purchaseCarbonNeutralBooking({
        userId: 'user-1',
        flightId,
        bookingId: 'booking-1',
      });
      await service.purchaseCarbonNeutralBooking({
        userId: 'user-2',
        flightId,
        bookingId: 'booking-2',
      });
    }

    it('totals purchases across all users', async () => {
      await seedPurchases();

      const report = await service.getPlatformSustainabilityReport();

      expect(report).toMatchObject({
        totalPurchases: 2,
        uniqueContributors: 2,
        carbonNeutralBookings: 2,
      });
      expect(report.totalCO2OffsetKg).toBeGreaterThan(0);
      expect(report.treesEquivalent).toBe(Math.round(report.totalCO2OffsetKg / 21));
    });

    it('breaks totals down by project', async () => {
      await seedPurchases();

      const report = await service.getPlatformSustainabilityReport();

      expect(report.byProject).toHaveLength(1);
      expect(report.byProject[0]).toMatchObject({ purchases: 2 });
      expect(report.byProject[0].projectName).toBeTruthy();
    });

    it('buckets totals by calendar month', async () => {
      await seedPurchases();

      const report = await service.getPlatformSustainabilityReport();

      expect(report.byMonth).toHaveLength(1);
      expect(report.byMonth[0].month).toMatch(/^\d{4}-\d{2}$/);
      expect(report.byMonth[0].purchases).toBe(2);
    });

    it('honours a date range', async () => {
      await seedPurchases();

      const future = await service.getPlatformSustainabilityReport({
        from: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      expect(future.totalPurchases).toBe(0);

      const windowed = await service.getPlatformSustainabilityReport({
        from: new Date(Date.now() - 24 * 60 * 60 * 1000),
        to: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      expect(windowed.totalPurchases).toBe(2);
      expect(windowed.from).toBeInstanceOf(Date);
    });

    it('returns a zeroed report when nothing has been offset', async () => {
      expect(await service.getPlatformSustainabilityReport()).toMatchObject({
        totalPurchases: 0,
        totalCO2OffsetKg: 0,
        uniqueContributors: 0,
        byProject: [],
        byMonth: [],
        from: null,
        to: null,
      });
    });
  });
});
