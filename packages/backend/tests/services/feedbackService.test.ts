import { AppDataSource, initDataSource } from '../../src/db/dataSource';
import { Feedback } from '../../src/db/entities/Feedback';
import { FeedbackVote } from '../../src/db/entities/FeedbackVote';
import { Booking } from '../../src/db/entities/Booking';
import { Flight } from '../../src/db/entities/Flight';
import { Passenger } from '../../src/db/entities/Passenger';
import {
  FeedbackService,
  classifySubmission,
  AUTO_APPROVE_MIN_RATING,
} from '../../src/services/feedbackService';

/**
 * Backed by a real in-memory SQLite database scoped to the entities this
 * feature touches — the app-wide test datasource cannot initialise under
 * better-sqlite3 because unrelated entities hardcode Postgres column types.
 */
jest.mock('../../src/db/dataSource', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DataSource } = require('typeorm');
  const entities = [
    require('../../src/db/entities/Feedback').Feedback,
    require('../../src/db/entities/FeedbackVote').FeedbackVote,
    require('../../src/db/entities/Booking').Booking,
    require('../../src/db/entities/Flight').Flight,
    require('../../src/db/entities/Passenger').Passenger,
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
const OTHER_USER = 'user-2';

describe('classifySubmission', () => {
  it('auto-approves a positive rating with a clean comment', () => {
    expect(classifySubmission(5, 'Great flight, on time.')).toBe('approved');
    expect(classifySubmission(AUTO_APPROVE_MIN_RATING + 1, null)).toBe('approved');
  });

  it('holds low ratings for review', () => {
    expect(classifySubmission(1, 'Fine actually')).toBe('pending');
    expect(classifySubmission(AUTO_APPROVE_MIN_RATING, null)).toBe('pending');
  });

  it('holds comments carrying spam markers regardless of rating', () => {
    expect(classifySubmission(5, 'Visit https://cheap-flights.example')).toBe('pending');
    expect(classifySubmission(5, 'This is a SCAM')).toBe('pending');
  });
});

describe('FeedbackService', () => {
  let service: FeedbackService;

  beforeAll(async () => {
    await initDataSource();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  beforeEach(async () => {
    await AppDataSource.getRepository(FeedbackVote).clear();
    await AppDataSource.getRepository(Feedback).clear();
    FeedbackService.resetForTesting();
    service = FeedbackService.getInstance();
  });

  const submit = (overrides: Record<string, unknown> = {}) =>
    service.submitFeedback({
      userId: USER,
      targetType: 'flight',
      targetId: 'flight-1',
      rating: 5,
      ...overrides,
    } as Parameters<FeedbackService['submitFeedback']>[0]);

  /** Inserts a booking whose status decides whether feedback is "verified". */
  async function seedBooking(status: string): Promise<Booking> {
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

    const passenger = await AppDataSource.getRepository(Passenger).save(
      AppDataSource.getRepository(Passenger).create({
        walletAddress: USER,
        email: 'passenger@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
      } as Partial<Passenger>),
    );

    return AppDataSource.getRepository(Booking).save(
      AppDataSource.getRepository(Booking).create({
        flight,
        passenger,
        status,
        amountCents: 45000,
      } as Partial<Booking>),
    );
  }

  describe('submitFeedback', () => {
    it('stores an approved entry for a good rating', async () => {
      const feedback = await submit({ comment: 'Smooth boarding.' });

      expect(feedback).toMatchObject({
        targetType: 'flight',
        targetId: 'flight-1',
        rating: 5,
        status: 'approved',
        isVerified: false,
        helpfulCount: 0,
        unhelpfulCount: 0,
      });
    });

    it('routes a low rating to the moderation queue', async () => {
      expect((await submit({ rating: 1 })).status).toBe('pending');
    });

    it('stores per-category ratings', async () => {
      const feedback = await submit({
        categoryRatings: { comfort: 4, service: 5, punctuality: 3 },
      });
      expect(feedback.categoryRatings).toEqual({ comfort: 4, service: 5, punctuality: 3 });
    });

    it('rejects an out-of-range overall or category rating', async () => {
      await expect(submit({ rating: 0 })).rejects.toThrow(/between 1 and 5/);
      await expect(submit({ rating: 6 })).rejects.toThrow(/between 1 and 5/);
      await expect(submit({ rating: 4.5 })).rejects.toThrow(/between 1 and 5/);
      await expect(submit({ categoryRatings: { comfort: 9 } })).rejects.toThrow(
        /comfort must be an integer/,
      );
    });

    it('rejects a blank target', async () => {
      await expect(submit({ targetId: '   ' })).rejects.toThrow(/targetId is required/);
    });

    it('allows only one entry per user and target', async () => {
      await submit();
      await expect(submit()).rejects.toThrow(/already submitted/);
    });

    it('allows the same user to rate a different target', async () => {
      await submit();
      await expect(submit({ targetId: 'flight-2' })).resolves.toBeDefined();
      await expect(submit({ targetType: 'airline', targetId: 'flight-1' })).resolves.toBeDefined();
    });

    it('marks feedback verified when the booking is confirmed', async () => {
      const booking = await seedBooking('confirmed');
      expect((await submit({ bookingId: booking.id })).isVerified).toBe(true);
    });

    it('leaves feedback unverified for an unpaid booking', async () => {
      const booking = await seedBooking('created');
      expect((await submit({ bookingId: booking.id })).isVerified).toBe(false);
    });

    it('rejects an unknown booking id', async () => {
      await expect(
        submit({ bookingId: '00000000-0000-0000-0000-000000000000' }),
      ).rejects.toThrow(/Booking not found/);
    });
  });

  describe('getFeedback / listFeedback', () => {
    it('throws for an unknown id', async () => {
      await expect(service.getFeedback('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
        /not found/,
      );
    });

    it('filters by target, status, rating, and user', async () => {
      await submit({ targetId: 'flight-1', rating: 5 });
      await submit({ targetId: 'flight-2', rating: 1 });
      await submit({ userId: OTHER_USER, targetId: 'flight-1', rating: 4 });

      expect((await service.listFeedback({ targetId: 'flight-1' })).total).toBe(2);
      expect((await service.listFeedback({ status: 'pending' })).total).toBe(1);
      expect((await service.listFeedback({ minRating: 5 })).total).toBe(1);
      expect((await service.listFeedback({ userId: OTHER_USER })).total).toBe(1);
      expect((await service.listFeedback({ targetType: 'airline' })).total).toBe(0);
    });

    it('paginates and clamps the page size', async () => {
      for (let i = 0; i < 5; i += 1) {
        await submit({ targetId: `flight-${i}` });
      }

      const firstPage = await service.listFeedback({ page: 1, limit: 2 });
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.total).toBe(5);

      expect((await service.listFeedback({ page: 3, limit: 2 })).items).toHaveLength(1);
      expect((await service.listFeedback({ limit: 500 })).limit).toBe(100);
      expect((await service.listFeedback({ page: 0 })).page).toBe(1);
    });
  });

  describe('getRatingAggregate', () => {
    it('averages approved feedback and builds the star distribution', async () => {
      await submit({ userId: 'u1', rating: 5 });
      await submit({ userId: 'u2', rating: 4 });
      await submit({ userId: 'u3', rating: 3 });

      const aggregate = await service.getRatingAggregate('flight', 'flight-1');

      expect(aggregate).toMatchObject({
        averageRating: 4,
        totalCount: 3,
        verifiedCount: 0,
        distribution: { '1': 0, '2': 0, '3': 1, '4': 1, '5': 1 },
      });
    });

    it('excludes entries still awaiting moderation', async () => {
      await submit({ userId: 'u1', rating: 5 });
      await submit({ userId: 'u2', rating: 1 });

      const aggregate = await service.getRatingAggregate('flight', 'flight-1');
      expect(aggregate.totalCount).toBe(1);
      expect(aggregate.averageRating).toBe(5);
    });

    it('averages each rated category independently', async () => {
      await submit({ userId: 'u1', rating: 5, categoryRatings: { comfort: 4, service: 5 } });
      await submit({ userId: 'u2', rating: 5, categoryRatings: { comfort: 2 } });

      const aggregate = await service.getRatingAggregate('flight', 'flight-1');
      expect(aggregate.categoryAverages).toEqual({ comfort: 3, service: 5 });
    });

    it('returns a zeroed aggregate for a target with no feedback', async () => {
      expect(await service.getRatingAggregate('airline', 'XX')).toMatchObject({
        averageRating: 0,
        totalCount: 0,
        categoryAverages: {},
      });
    });
  });

  describe('moderation', () => {
    it('queues pending and flagged entries oldest first', async () => {
      const first = await submit({ userId: 'u1', targetId: 'f1', rating: 1 });
      await submit({ userId: 'u2', targetId: 'f2', rating: 5 });
      const third = await submit({ userId: 'u3', targetId: 'f3', rating: 2 });

      const queue = await service.getModerationQueue();

      expect(queue.total).toBe(2);
      expect(queue.items.map((i) => i.id)).toEqual([first.id, third.id]);
    });

    it('records the moderator, note, and timestamp', async () => {
      const feedback = await submit({ rating: 1 });

      const moderated = await service.moderateFeedback(
        feedback.id,
        'rejected',
        'admin-1',
        'Abusive language',
      );

      expect(moderated).toMatchObject({
        status: 'rejected',
        moderatedBy: 'admin-1',
        moderationNote: 'Abusive language',
      });
      expect(moderated.moderatedAt).toBeInstanceOf(Date);
    });

    it('removes an approved entry from the queue', async () => {
      const feedback = await submit({ rating: 1 });
      await service.moderateFeedback(feedback.id, 'approved', 'admin-1');

      expect((await service.getModerationQueue()).total).toBe(0);
      expect((await service.getRatingAggregate('flight', 'flight-1')).totalCount).toBe(1);
    });

    it('refuses to moderate back to pending', async () => {
      const feedback = await submit({ rating: 1 });
      await expect(
        service.moderateFeedback(feedback.id, 'pending', 'admin-1'),
      ).rejects.toThrow(/terminal status/);
    });

    it('throws for an unknown id', async () => {
      await expect(
        service.moderateFeedback('00000000-0000-0000-0000-000000000000', 'approved', 'admin-1'),
      ).rejects.toThrow(/not found/);
    });
  });

  describe('voting', () => {
    it('counts a helpful and an unhelpful vote', async () => {
      const feedback = await submit();

      expect((await service.voteFeedback(feedback.id, OTHER_USER, 'helpful')).helpfulCount).toBe(1);
      expect((await service.voteFeedback(feedback.id, 'user-3', 'unhelpful')).unhelpfulCount).toBe(
        1,
      );
    });

    it('is idempotent when the same vote is repeated', async () => {
      const feedback = await submit();

      await service.voteFeedback(feedback.id, OTHER_USER, 'helpful');
      const again = await service.voteFeedback(feedback.id, OTHER_USER, 'helpful');

      expect(again.helpfulCount).toBe(1);
      expect(await AppDataSource.getRepository(FeedbackVote).count()).toBe(1);
    });

    it('moves the tally across when a voter changes their mind', async () => {
      const feedback = await submit();

      await service.voteFeedback(feedback.id, OTHER_USER, 'helpful');
      const flipped = await service.voteFeedback(feedback.id, OTHER_USER, 'unhelpful');

      expect(flipped).toMatchObject({ helpfulCount: 0, unhelpfulCount: 1 });
      expect(await AppDataSource.getRepository(FeedbackVote).count()).toBe(1);
    });

    it('refuses a self-vote', async () => {
      const feedback = await submit();
      await expect(service.voteFeedback(feedback.id, USER, 'helpful')).rejects.toThrow(
        /your own feedback/,
      );
    });

    it('removes a vote and decrements the tally', async () => {
      const feedback = await submit();
      await service.voteFeedback(feedback.id, OTHER_USER, 'helpful');

      const cleared = await service.removeVote(feedback.id, OTHER_USER);

      expect(cleared.helpfulCount).toBe(0);
      expect(await AppDataSource.getRepository(FeedbackVote).count()).toBe(0);
    });

    it('is a no-op when removing a vote that was never cast', async () => {
      const feedback = await submit();
      expect((await service.removeVote(feedback.id, OTHER_USER)).helpfulCount).toBe(0);
    });

    it('never drives a tally negative', async () => {
      const feedback = await submit();
      await service.voteFeedback(feedback.id, OTHER_USER, 'helpful');
      await service.removeVote(feedback.id, OTHER_USER);
      await service.removeVote(feedback.id, OTHER_USER);

      expect((await service.getFeedback(feedback.id)).helpfulCount).toBe(0);
    });
  });

  describe('getAnalytics', () => {
    it('summarises volume, status mix, and averages', async () => {
      await submit({ userId: 'u1', targetType: 'flight', targetId: 'f1', rating: 5 });
      await submit({ userId: 'u2', targetType: 'flight', targetId: 'f2', rating: 3 });
      await submit({
        userId: 'u3',
        targetType: 'booking_experience',
        targetId: 'b1',
        rating: 1,
      });

      const analytics = await service.getAnalytics();

      expect(analytics).toMatchObject({
        totalSubmissions: 3,
        approvedCount: 2,
        pendingCount: 1,
        rejectedCount: 0,
        averageRating: 3,
        verifiedShare: 0,
      });
      expect(analytics.byTargetType).toEqual({
        flight: { count: 2, averageRating: 4 },
        booking_experience: { count: 1, averageRating: 1 },
      });
    });

    it('ranks the most helpful entries', async () => {
      const a = await submit({ userId: 'u1', targetId: 'f1' });
      const b = await submit({ userId: 'u2', targetId: 'f2' });

      await service.voteFeedback(b.id, 'voter-1', 'helpful');
      await service.voteFeedback(b.id, 'voter-2', 'helpful');
      await service.voteFeedback(a.id, 'voter-1', 'helpful');

      const analytics = await service.getAnalytics();
      expect(analytics.topHelpful[0]).toMatchObject({ id: b.id, helpfulCount: 2 });
    });

    it('returns zeros with no feedback at all', async () => {
      expect(await service.getAnalytics()).toMatchObject({
        totalSubmissions: 0,
        averageRating: 0,
        verifiedShare: 0,
        byTargetType: {},
        topHelpful: [],
      });
    });
  });
});
