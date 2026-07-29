import { AppDataSource } from '../db/dataSource';
import { Review, ReviewStatus } from '../db/entities/Review';
import { Booking } from '../db/entities/Booking';
import { User } from '../db/entities/User';
import { Flight } from '../db/entities/Flight';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface CreateReviewParams {
  airlineCode: string;
  bookingId: string;
  userId: string;
  rating: number;
  title?: string;
  content?: string;
  pros?: string[];
  cons?: string[];
}

export interface UpdateReviewParams {
  rating?: number;
  title?: string;
  content?: string;
  pros?: string[];
  cons?: string[];
  status?: ReviewStatus;
}

export interface ReviewFilters {
  airlineCode?: string;
  rating?: number;
  status?: ReviewStatus;
  isVerified?: boolean;
  limit?: number;
  offset?: number;
}

export class ReviewService {
  private static instance: ReviewService;

  private constructor() {}

  public static getInstance(): ReviewService {
    if (!ReviewService.instance) {
      ReviewService.instance = new ReviewService();
    }
    return ReviewService.instance;
  }

  /**
   * Create a new review
   * Only users with confirmed bookings can review the airline
   */
  async createReview(params: CreateReviewParams): Promise<Review> {
    const reviewRepo = AppDataSource.getRepository(Review);
    const bookingRepo = AppDataSource.getRepository(Booking);

    // Validate booking exists and is confirmed
    const booking = await bookingRepo.findOne({
      where: { id: params.bookingId },
      relations: ['flight', 'passenger'],
    });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.status !== 'confirmed' && booking.status !== 'paid') {
      throw new BadRequestError('Only confirmed bookings can leave reviews');
    }

    // Verify the booking belongs to the user
    if (booking.passenger?.walletAddress !== params.userId) {
      throw new ForbiddenError('You can only review flights you have booked');
    }

    // Check if user already reviewed this airline for this booking
    const existingReview = await reviewRepo.findOne({
      where: {
        booking: { id: params.bookingId },
        user: { walletAddress: params.userId },
        airlineCode: params.airlineCode,
      },
    });

    if (existingReview) {
      throw new BadRequestError('You have already reviewed this airline for this booking');
    }

    // Validate rating (1-5 stars)
    if (params.rating < 1 || params.rating > 5) {
      throw new BadRequestError('Rating must be between 1 and 5');
    }

    // Get user
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { walletAddress: params.userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const review = reviewRepo.create({
      airlineCode: params.airlineCode,
      booking,
      user,
      rating: params.rating,
      title: params.title,
      content: params.content,
      pros: params.pros,
      cons: params.cons,
      isVerified: true, // Since booking is confirmed
      status: 'approved', // Auto-approve for now (admin moderation can be added later)
    });

    const saved = await reviewRepo.save(review);

    logger.info(`Review created: ${saved.id} for airline ${params.airlineCode} by user ${params.userId}`);

    return saved;
  }

  /**
   * Get reviews with filters
   */
  async getReviews(filters: ReviewFilters): Promise<{ reviews: Review[]; total: number }> {
    const reviewRepo = AppDataSource.getRepository(Review);

    const qb = reviewRepo
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.user', 'user')
      .leftJoinAndSelect('review.booking', 'booking')
      .leftJoinAndSelect('booking.flight', 'flight');

    if (filters.airlineCode) {
      qb.andWhere('review.airlineCode = :airlineCode', { airlineCode: filters.airlineCode });
    }

    if (filters.rating) {
      qb.andWhere('review.rating = :rating', { rating: filters.rating });
    }

    if (filters.status) {
      qb.andWhere('review.status = :status', { status: filters.status });
    }

    if (filters.isVerified !== undefined) {
      qb.andWhere('review.isVerified = :isVerified', { isVerified: filters.isVerified });
    }

    const total = await qb.getCount();

    const reviews = await qb
      .orderBy('review.createdAt', 'DESC')
      .skip(filters.offset || 0)
      .take(filters.limit || 20)
      .getMany();

    return { reviews, total };
  }

  /**
   * Get review by ID
   */
  async getReviewById(id: string): Promise<Review | null> {
    const reviewRepo = AppDataSource.getRepository(Review);
    return await reviewRepo.findOne({
      where: { id },
      relations: ['user', 'booking', 'booking.flight'],
    });
  }

  /**
   * Update a review
   */
  async updateReview(
    id: string,
    userId: string,
    params: UpdateReviewParams
  ): Promise<Review> {
    const reviewRepo = AppDataSource.getRepository(Review);

    const review = await reviewRepo.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!review) {
      throw new NotFoundError('Review not found');
    }

    // Only the review owner can update
    if (review.user.walletAddress !== userId) {
      throw new ForbiddenError('You can only update your own reviews');
    }

    if (review.status === 'rejected') {
      throw new BadRequestError('Cannot update a rejected review');
    }

    if (params.rating !== undefined) {
      if (params.rating < 1 || params.rating > 5) {
        throw new BadRequestError('Rating must be between 1 and 5');
      }
      review.rating = params.rating;
    }

    if (params.title !== undefined) {
      review.title = params.title;
    }

    if (params.content !== undefined) {
      review.content = params.content;
    }

    if (params.pros !== undefined) {
      review.pros = params.pros;
    }

    if (params.cons !== undefined) {
      review.cons = params.cons;
    }

    const saved = await reviewRepo.save(review);

    logger.info(`Review updated: ${saved.id} by user ${userId}`);

    return saved;
  }

  /**
   * Delete (soft delete) a review
   */
  async deleteReview(id: string, userId: string): Promise<void> {
    const reviewRepo = AppDataSource.getRepository(Review);

    const review = await reviewRepo.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!review) {
      throw new NotFoundError('Review not found');
    }

    // Only the review owner or admin can delete
    if (review.user.walletAddress !== userId) {
      throw new ForbiddenError('You can only delete your own reviews');
    }

    // Soft delete by setting status to rejected
    review.status = 'rejected';
    await reviewRepo.save(review);

    logger.info(`Review deleted: ${review.id} by user ${userId}`);
  }

  /**
   * Get airline review statistics
   */
  async getAirlineStats(airlineCode: string): Promise<{
    airlineCode: string;
    averageRating: number;
    totalReviews: number;
    ratingDistribution: Record<number, number>;
    verifiedReviews: number;
    unverifiedReviews: number;
  }> {
    const reviewRepo = AppDataSource.getRepository(Review);

    const reviews = await reviewRepo.find({
      where: { airlineCode, status: 'approved' },
    });

    const totalReviews = reviews.length;

    if (totalReviews === 0) {
      return {
        airlineCode,
        averageRating: 0,
        totalReviews: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        verifiedReviews: 0,
        unverifiedReviews: 0,
      };
    }

    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const averageRating = sum / totalReviews;

    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let verifiedReviews = 0;
    let unverifiedReviews = 0;

    for (const review of reviews) {
      ratingDistribution[review.rating] = (ratingDistribution[review.rating] || 0) + 1;
      if (review.isVerified) {
        verifiedReviews++;
      } else {
        unverifiedReviews++;
      }
    }

    return {
      airlineCode,
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews,
      ratingDistribution,
      verifiedReviews,
      unverifiedReviews,
    };
  }

  /**
   * Check if user can review an airline for a booking
   */
  async canUserReview(airlineCode: string, bookingId: string, userId: string): Promise<boolean> {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const reviewRepo = AppDataSource.getRepository(Review);

    const booking = await bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['passenger', 'flight'],
    });

    if (!booking) {
      return false;
    }

    if (booking.status !== 'confirmed' && booking.status !== 'paid') {
      return false;
    }

    if (booking.passenger?.walletAddress !== userId) {
      return false;
    }

    // Check if review already exists
    const existing = await reviewRepo.findOne({
      where: {
        booking: { id: bookingId },
        user: { walletAddress: userId },
        airlineCode,
      },
    });

    return !existing;
  }

  /**
   * Admin: Moderate a review
   */
  async moderateReview(id: string, status: ReviewStatus, moderatorNote?: string): Promise<Review> {
    const reviewRepo = AppDataSource.getRepository(Review);

    const review = await reviewRepo.findOne({
      where: { id },
    });

    if (!review) {
      throw new NotFoundError('Review not found');
    }

    review.status = status;
    if (moderatorNote) {
      review.metadata = { ...review.metadata, moderatorNote };
    }

    const saved = await reviewRepo.save(review);

    logger.info(`Review ${saved.id} moderated to ${status}`);

    return saved;
  }
}