import { AppDataSource } from '../db/dataSource';
import {
  Feedback,
  FeedbackStatus,
  FeedbackTargetType,
  CategoryRatings,
} from '../db/entities/Feedback';
import { FeedbackVote, VoteValue } from '../db/entities/FeedbackVote';
import { Booking } from '../db/entities/Booking';
import { logger } from '../utils/logger';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';

export interface SubmitFeedbackParams {
  userId: string;
  targetType: FeedbackTargetType;
  targetId: string;
  rating: number;
  categoryRatings?: CategoryRatings | null;
  title?: string | null;
  comment?: string | null;
  bookingId?: string | null;
}

export interface FeedbackFilters {
  targetType?: FeedbackTargetType;
  targetId?: string;
  userId?: string;
  status?: FeedbackStatus;
  minRating?: number;
  page?: number;
  limit?: number;
}

export interface RatingAggregate {
  targetType: FeedbackTargetType;
  targetId: string;
  averageRating: number;
  totalCount: number;
  verifiedCount: number;
  /** Count of approved feedback per star value, keyed "1".."5". */
  distribution: Record<string, number>;
  categoryAverages: Record<string, number>;
}

export interface FeedbackAnalytics {
  totalSubmissions: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  flaggedCount: number;
  averageRating: number;
  verifiedShare: number;
  byTargetType: Record<string, { count: number; averageRating: number }>;
  topHelpful: Array<{ id: string; helpfulCount: number; rating: number }>;
}

const CATEGORY_KEYS: Array<keyof CategoryRatings> = [
  'comfort',
  'service',
  'punctuality',
  'value',
  'cleanliness',
  'bookingEase',
];

/** Feedback at or below this rating is held for moderation rather than auto-approved. */
export const AUTO_APPROVE_MIN_RATING = 2;

/** Comments containing these are always routed to the moderation queue. */
const FLAGGED_TERMS = ['scam', 'fraud', 'http://', 'https://'];

/**
 * Decides the landing status for newly submitted feedback.
 *
 * Pure, so the moderation policy is testable in isolation. Low ratings and
 * comments carrying spam markers are held as `pending`; everything else is
 * auto-approved so the common case stays fast.
 */
export function classifySubmission(
  rating: number,
  comment?: string | null,
): FeedbackStatus {
  const haystack = (comment ?? '').toLowerCase();
  if (FLAGGED_TERMS.some((term) => haystack.includes(term))) return 'pending';
  if (rating <= AUTO_APPROVE_MIN_RATING) return 'pending';
  return 'approved';
}

export class FeedbackService {
  private static instance: FeedbackService;

  private get feedbackRepo() {
    return AppDataSource.getRepository(Feedback);
  }

  private get voteRepo() {
    return AppDataSource.getRepository(FeedbackVote);
  }

  private get bookingRepo() {
    return AppDataSource.getRepository(Booking);
  }

  static getInstance(): FeedbackService {
    if (!FeedbackService.instance) {
      FeedbackService.instance = new FeedbackService();
    }
    return FeedbackService.instance;
  }

  static resetForTesting(): void {
    FeedbackService.instance = undefined as unknown as FeedbackService;
  }

  async submitFeedback(params: SubmitFeedbackParams): Promise<Feedback> {
    this.validateRating(params.rating, 'rating');
    this.validateCategoryRatings(params.categoryRatings);

    if (!params.targetId?.trim()) {
      throw new BadRequestError('targetId is required');
    }

    const existing = await this.feedbackRepo.findOne({
      where: {
        userId: params.userId,
        targetType: params.targetType,
        targetId: params.targetId,
      },
    });
    if (existing) {
      throw new ConflictError('You have already submitted feedback for this item');
    }

    // A confirmed booking upgrades the entry to "verified", but its absence
    // does not block submission — unverified feedback is still useful signal.
    let isVerified = false;
    if (params.bookingId) {
      const booking = await this.bookingRepo.findOne({
        where: { id: params.bookingId },
      });
      if (!booking) throw new NotFoundError('Booking not found');
      isVerified = booking.status === 'confirmed' || booking.status === 'paid';
    }

    const feedback = this.feedbackRepo.create({
      userId: params.userId,
      targetType: params.targetType,
      targetId: params.targetId,
      rating: params.rating,
      categoryRatings: params.categoryRatings ?? null,
      title: params.title ?? null,
      comment: params.comment ?? null,
      bookingId: params.bookingId ?? null,
      isVerified,
      status: classifySubmission(params.rating, params.comment),
      helpfulCount: 0,
      unhelpfulCount: 0,
    });

    const saved = await this.feedbackRepo.save(feedback);
    logger.info('Feedback submitted', {
      feedbackId: saved.id,
      targetType: saved.targetType,
      targetId: saved.targetId,
      status: saved.status,
    });
    return saved;
  }

  async getFeedback(id: string): Promise<Feedback> {
    const feedback = await this.feedbackRepo.findOne({ where: { id } });
    if (!feedback) throw new NotFoundError('Feedback not found');
    return feedback;
  }

  async listFeedback(
    filters: FeedbackFilters = {},
  ): Promise<{ items: Feedback[]; total: number; page: number; limit: number }> {
    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);

    const qb = this.feedbackRepo.createQueryBuilder('feedback');

    if (filters.targetType) {
      qb.andWhere('feedback.targetType = :targetType', {
        targetType: filters.targetType,
      });
    }
    if (filters.targetId) {
      qb.andWhere('feedback.targetId = :targetId', { targetId: filters.targetId });
    }
    if (filters.userId) {
      qb.andWhere('feedback.userId = :userId', { userId: filters.userId });
    }
    if (filters.status) {
      qb.andWhere('feedback.status = :status', { status: filters.status });
    }
    if (filters.minRating !== undefined) {
      qb.andWhere('feedback.rating >= :minRating', { minRating: filters.minRating });
    }

    const [items, total] = await qb
      .orderBy('feedback.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit };
  }

  /**
   * Rolls approved feedback for one target into an average, a star
   * distribution, and per-category averages.
   */
  async getRatingAggregate(
    targetType: FeedbackTargetType,
    targetId: string,
  ): Promise<RatingAggregate> {
    const entries = await this.feedbackRepo.find({
      where: { targetType, targetId, status: 'approved' },
    });

    const distribution: Record<string, number> = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };
    for (const entry of entries) {
      const key = String(entry.rating);
      if (key in distribution) distribution[key] += 1;
    }

    const categoryAverages: Record<string, number> = {};
    for (const key of CATEGORY_KEYS) {
      const scores = entries
        .map((e) => e.categoryRatings?.[key])
        .filter((v): v is number => typeof v === 'number');
      if (scores.length > 0) {
        categoryAverages[key] = Number(
          (scores.reduce((sum, v) => sum + v, 0) / scores.length).toFixed(2),
        );
      }
    }

    return {
      targetType,
      targetId,
      averageRating:
        entries.length === 0
          ? 0
          : Number(
              (
                entries.reduce((sum, e) => sum + e.rating, 0) / entries.length
              ).toFixed(2),
            ),
      totalCount: entries.length,
      verifiedCount: entries.filter((e) => e.isVerified).length,
      distribution,
      categoryAverages,
    };
  }

  /** Oldest-first so the moderation backlog drains in submission order. */
  async getModerationQueue(
    page = 1,
    limit = 20,
  ): Promise<{ items: Feedback[]; total: number; page: number; limit: number }> {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const [items, total] = await this.feedbackRepo
      .createQueryBuilder('feedback')
      .where('feedback.status IN (:...statuses)', {
        statuses: ['pending', 'flagged'],
      })
      .orderBy('feedback.createdAt', 'ASC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();

    return { items, total, page: safePage, limit: safeLimit };
  }

  async moderateFeedback(
    id: string,
    status: FeedbackStatus,
    moderatorId: string,
    note?: string,
  ): Promise<Feedback> {
    if (status === 'pending') {
      throw new BadRequestError('Moderation must resolve to a terminal status');
    }

    const feedback = await this.getFeedback(id);
    feedback.status = status;
    feedback.moderatedBy = moderatorId;
    feedback.moderationNote = note ?? null;
    feedback.moderatedAt = new Date();

    const saved = await this.feedbackRepo.save(feedback);
    logger.info('Feedback moderated', { feedbackId: id, status, moderatorId });
    return saved;
  }

  /**
   * Records a helpful/unhelpful vote. Re-voting with the same value is a
   * no-op; voting the other way moves the tally across.
   */
  async voteFeedback(
    feedbackId: string,
    userId: string,
    value: VoteValue,
  ): Promise<Feedback> {
    const feedback = await this.getFeedback(feedbackId);

    if (feedback.userId === userId) {
      throw new BadRequestError('You cannot vote on your own feedback');
    }

    const existing = await this.voteRepo.findOne({
      where: { feedbackId, userId },
    });

    if (existing) {
      if (existing.value === value) return feedback;

      existing.value = value;
      await this.voteRepo.save(existing);

      if (value === 'helpful') {
        feedback.helpfulCount += 1;
        feedback.unhelpfulCount = Math.max(feedback.unhelpfulCount - 1, 0);
      } else {
        feedback.unhelpfulCount += 1;
        feedback.helpfulCount = Math.max(feedback.helpfulCount - 1, 0);
      }
    } else {
      await this.voteRepo.save(this.voteRepo.create({ feedbackId, userId, value }));
      if (value === 'helpful') feedback.helpfulCount += 1;
      else feedback.unhelpfulCount += 1;
    }

    return this.feedbackRepo.save(feedback);
  }

  async removeVote(feedbackId: string, userId: string): Promise<Feedback> {
    const feedback = await this.getFeedback(feedbackId);
    const existing = await this.voteRepo.findOne({ where: { feedbackId, userId } });
    if (!existing) return feedback;

    await this.voteRepo.delete({ id: existing.id });
    if (existing.value === 'helpful') {
      feedback.helpfulCount = Math.max(feedback.helpfulCount - 1, 0);
    } else {
      feedback.unhelpfulCount = Math.max(feedback.unhelpfulCount - 1, 0);
    }

    return this.feedbackRepo.save(feedback);
  }

  async getAnalytics(): Promise<FeedbackAnalytics> {
    const entries = await this.feedbackRepo.find();

    const byStatus = (status: FeedbackStatus) =>
      entries.filter((e) => e.status === status).length;

    const byTargetType: Record<string, { count: number; averageRating: number }> = {};
    for (const type of ['flight', 'airline', 'booking_experience'] as const) {
      const scoped = entries.filter((e) => e.targetType === type);
      if (scoped.length === 0) continue;
      byTargetType[type] = {
        count: scoped.length,
        averageRating: Number(
          (scoped.reduce((sum, e) => sum + e.rating, 0) / scoped.length).toFixed(2),
        ),
      };
    }

    return {
      totalSubmissions: entries.length,
      approvedCount: byStatus('approved'),
      pendingCount: byStatus('pending'),
      rejectedCount: byStatus('rejected'),
      flaggedCount: byStatus('flagged'),
      averageRating:
        entries.length === 0
          ? 0
          : Number(
              (
                entries.reduce((sum, e) => sum + e.rating, 0) / entries.length
              ).toFixed(2),
            ),
      verifiedShare:
        entries.length === 0
          ? 0
          : Number(
              ((entries.filter((e) => e.isVerified).length / entries.length) * 100).toFixed(
                2,
              ),
            ),
      byTargetType,
      topHelpful: [...entries]
        .sort((a, b) => b.helpfulCount - a.helpfulCount)
        .slice(0, 5)
        .map((e) => ({ id: e.id, helpfulCount: e.helpfulCount, rating: e.rating })),
    };
  }

  private validateRating(value: number, label: string): void {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new BadRequestError(`${label} must be an integer between 1 and 5`);
    }
  }

  private validateCategoryRatings(ratings?: CategoryRatings | null): void {
    if (!ratings) return;
    for (const key of CATEGORY_KEYS) {
      const value = ratings[key];
      if (value !== undefined) this.validateRating(value, key);
    }
  }
}
