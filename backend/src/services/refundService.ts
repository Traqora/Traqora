import { AppDataSource } from '../db/dataSource';
import { Refund, RefundReason, RefundStatus } from '../db/entities/Refund';
import { Booking } from '../db/entities/Booking';
import { stripe } from './stripe';
import { buildBatchBookingActionUnsignedXdr, submitSignedSorobanXdr, getTransactionStatus } from './soroban';
import { NotificationService } from './NotificationService';
import { RefundAuditService } from './refundAuditService';
import { logger } from '../utils/logger';
import { withRetries } from './retry';

export interface RefundEligibilityResult {
  isEligible: boolean;
  reason: string;
  refundPercentage: number;
  processingFeeCents: number;
  requiresManualReview: boolean;
}

export interface CreateRefundRequest {
  bookingId: string;
  reason: RefundReason;
  reasonDetails?: string;
  requestedBy?: string;
}

// Refund tier thresholds (in cents)
export const REFUND_TIER_THRESHOLDS = {
  IMMEDIATE_MAX: 10000, // $100
  DELAYED_HOURS: 48, // 48 hours delay for large refunds
} as const;

export class RefundService {
  private static instance: RefundService;
  private notificationService: NotificationService;
  private auditService: RefundAuditService;

  private constructor() {
    this.notificationService = NotificationService.getInstance();
    this.auditService = RefundAuditService.getInstance();
  }

  public static getInstance(): RefundService {
    if (!RefundService.instance) {
      RefundService.instance = new RefundService();
    }
    return RefundService.instance;
  }

  /**
   * Check refund eligibility based on booking status, flight timing, and policies
   */
  public async checkEligibility(booking: Booking): Promise<RefundEligibilityResult> {
    const now = new Date();
    const departureTime = booking.flight.departureTime;
    const hoursUntilDeparture = (departureTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Not eligible if booking is not confirmed or already refunded
    if (!['confirmed', 'paid', 'onchain_submitted'].includes(booking.status)) {
      return {
        isEligible: false,
        reason: 'Booking must be confirmed or paid to request refund',
        refundPercentage: 0,
        processingFeeCents: 0,
        requiresManualReview: false,
      };
    }

    // Check if flight has already departed
    if (hoursUntilDeparture < 0) {
      return {
        isEligible: false,
        reason: 'Cannot refund after flight departure',
        refundPercentage: 0,
        processingFeeCents: 0,
        requiresManualReview: true,
      };
    }

    // Refund policy based on time until departure
    let refundPercentage = 0;
    let processingFeeCents = 0;
    let requiresManualReview = false;

    if (hoursUntilDeparture >= 168) {
      // 7+ days: Full refund minus small processing fee
      refundPercentage = 100;
      processingFeeCents = Math.min(500, Math.floor(booking.amountCents * 0.02)); // 2% or $5 max
    } else if (hoursUntilDeparture >= 72) {
      // 3-7 days: 80% refund
      refundPercentage = 80;
      processingFeeCents = Math.floor(booking.amountCents * 0.05); // 5% processing fee
    } else if (hoursUntilDeparture >= 24) {
      // 1-3 days: 50% refund
      refundPercentage = 50;
      processingFeeCents = Math.floor(booking.amountCents * 0.10); // 10% processing fee
    } else if (hoursUntilDeparture >= 2) {
      // 2-24 hours: 25% refund, requires manual review
      refundPercentage = 25;
      processingFeeCents = Math.floor(booking.amountCents * 0.15); // 15% processing fee
      requiresManualReview = true;
    } else {
      // Less than 2 hours: No automatic refund, manual review required
      refundPercentage = 0;
      processingFeeCents = 0;
      requiresManualReview = true;
    }

    return {
      isEligible: refundPercentage > 0 || requiresManualReview,
      reason: requiresManualReview
        ? 'Refund requires manual review due to timing or policy'
        : `Eligible for ${refundPercentage}% refund`,
      refundPercentage,
      processingFeeCents,
      requiresManualReview,
    };
  }

  /**
   * Create a new refund request
   * Automatically determines if refund should be delayed based on amount
   */
  public async createRefundRequest(request: CreateRefundRequest): Promise<Refund> {
    return this.requestDelayedRefund(request);
  }

  /**
   * Approve a refund and calculate final amount
   */
  public async approveRefund(refundId: string, refundPercentage: number): Promise<Refund> {
    const refundRepo = AppDataSource.getRepository(Refund);
    const refund = await refundRepo.findOne({
      where: { id: refundId },
      relations: ['booking', 'booking.passenger'],
    });

    if (!refund) {
      throw new Error('Refund not found');
    }

    const refundAmount = Math.floor((refund.requestedAmountCents * refundPercentage) / 100);
    const finalAmount = refundAmount - refund.processingFeeCents;

    refund.approvedAmountCents = Math.max(0, finalAmount);
    refund.status = 'approved';
    await refundRepo.save(refund);

    // Log audit entry
    await this.auditService.logAction({
      refundId: refund.id,
      action: 'refund_approved',
      previousStatus: 'eligibility_check',
      newStatus: 'approved',
      metadata: {
        approvedAmount: refund.approvedAmountCents,
        refundPercentage,
      },
    });

    logger.info(`Refund ${refundId} approved for ${refund.approvedAmountCents} cents`);

    // Automatically process the refund
    await this.processRefund(refundId);

    return refund;
  }

  /**
   * Process an approved refund (Stripe + Soroban)
   */
  public async processRefund(refundId: string): Promise<Refund> {
    const refundRepo = AppDataSource.getRepository(Refund);
    const refund = await refundRepo.findOne({
      where: { id: refundId },
      relations: ['booking', 'booking.passenger', 'booking.flight'],
    });

    if (!refund) {
      throw new Error('Refund not found');
    }

    if (refund.status !== 'approved') {
      throw new Error('Refund must be approved before processing');
    }

    refund.status = 'processing';
    await refundRepo.save(refund);

    try {
      // Step 1: Process Stripe refund
      if (refund.booking.stripePaymentIntentId && refund.approvedAmountCents! > 0) {
        const stripeRefund = await withRetries(
          async () => {
            return await stripe.refunds.create({
              payment_intent: refund.booking.stripePaymentIntentId!,
              amount: refund.approvedAmountCents!,
              reason: 'requested_by_customer',
              metadata: {
                refundId: refund.id,
                bookingId: refund.booking.id,
              },
            });
          },
          { retries: 3, baseDelayMs: 500 }
        );

        refund.stripeRefundId = stripeRefund.id;
        refund.status = 'stripe_refunded';
        await refundRepo.save(refund);

        // Log audit entry
        await this.auditService.logAction({
          refundId: refund.id,
          action: 'stripe_refund_processed',
          previousStatus: 'processing',
          newStatus: 'stripe_refunded',
          metadata: {
            stripeRefundId: stripeRefund.id,
            amount: refund.approvedAmountCents,
          },
        });

        logger.info(`Stripe refund ${stripeRefund.id} created for refund ${refundId}`);
      }

      // Step 2: Build Soroban refund transaction
      if (refund.booking.sorobanBookingId) {
        const unsigned = await buildBatchBookingActionUnsignedXdr({
          actor: refund.booking.passenger.sorobanAddress,
          bookingIds: [Number(refund.booking.sorobanBookingId)],
          action: 'batch_refund_passenger',
        });

        refund.sorobanUnsignedXdr = unsigned.xdr;
        refund.status = 'onchain_pending';
        await refundRepo.save(refund);

        logger.info(`Soroban refund XDR prepared for refund ${refundId}`);
      } else {
        // No on-chain booking, mark as completed
        refund.status = 'completed';
        await refundRepo.save(refund);
      }

      // Send notification
      await this.notificationService.sendEmail(
        refund.booking.passenger.email,
        'Refund Processed',
        `Your refund of $${(refund.approvedAmountCents! / 100).toFixed(2)} has been processed and will appear in your account within 5-10 business days.`
      );

      return refund;
    } catch (error: any) {
      refund.status = 'failed';
      refund.lastError = error.message;
      await refundRepo.save(refund);
      logger.error(`Failed to process refund ${refundId}`, error);
      throw error;
    }
  }

  /**
   * Submit signed Soroban refund transaction
   */
  public async submitOnchainRefund(refundId: string, signedXdr: string): Promise<Refund> {
    const refundRepo = AppDataSource.getRepository(Refund);
    const refund = await refundRepo.findOne({
      where: { id: refundId },
      relations: ['booking', 'booking.passenger'],
    });

    if (!refund) {
      throw new Error('Refund not found');
    }

    if (refund.status !== 'onchain_pending') {
      throw new Error('Refund not ready for on-chain submission');
    }

    const result = await withRetries(
      async () => {
        return await submitSignedSorobanXdr(signedXdr);
      },
      { retries: 3, baseDelayMs: 300 }
    );

    refund.sorobanTxHash = result.txHash;
    refund.status = 'onchain_submitted';
    refund.contractSubmitAttempts = (refund.contractSubmitAttempts || 0) + 1;
    await refundRepo.save(refund);

    // Log audit entry
    await this.auditService.logAction({
      refundId: refund.id,
      action: 'onchain_refund_submitted',
      previousStatus: 'onchain_pending',
      newStatus: 'onchain_submitted',
      metadata: {
        txHash: result.txHash,
        attempts: refund.contractSubmitAttempts,
      },
    });

    logger.info(`Soroban refund transaction submitted: ${result.txHash}`);

    return refund;
  }

  /**
   * Check on-chain transaction status and update refund
   */
  public async checkOnchainStatus(refundId: string): Promise<Refund> {
    const refundRepo = AppDataSource.getRepository(Refund);
    const refund = await refundRepo.findOne({
      where: { id: refundId },
      relations: ['booking', 'booking.passenger'],
    });

    if (!refund || !refund.sorobanTxHash) {
      throw new Error('Refund or transaction hash not found');
    }

    const txStatus = await getTransactionStatus(refund.sorobanTxHash);

    if (txStatus.status === 'success' && refund.status !== 'completed') {
      refund.status = 'completed';
      await refundRepo.save(refund);

      // Log audit entry
      await this.auditService.logAction({
        refundId: refund.id,
        action: 'refund_completed',
        previousStatus: 'onchain_submitted',
        newStatus: 'completed',
        metadata: {
          txHash: refund.sorobanTxHash,
        },
      });

      await this.notificationService.sendEmail(
        refund.booking.passenger.email,
        'Refund Completed',
        `Your refund has been fully processed and confirmed on-chain.`
      );

      logger.info(`Refund ${refundId} completed successfully`);
    } else if (txStatus.status === 'failed') {
      refund.status = 'failed';
      refund.lastError = txStatus.error || 'On-chain transaction failed';
      await refundRepo.save(refund);

      // Log audit entry
      await this.auditService.logAction({
        refundId: refund.id,
        action: 'refund_failed',
        previousStatus: 'onchain_submitted',
        newStatus: 'failed',
        metadata: {
          error: refund.lastError,
        },
      });

      logger.error(`Refund ${refundId} on-chain transaction failed`);
    }

    return refund;
  }

  /**
   * Manually review and approve/reject a refund
   */
  public async manualReview(
    refundId: string,
    approved: boolean,
    reviewedBy: string,
    reviewNotes: string,
    customRefundPercentage?: number
  ): Promise<Refund> {
    const refundRepo = AppDataSource.getRepository(Refund);
    const refund = await refundRepo.findOne({
      where: { id: refundId },
      relations: ['booking', 'booking.passenger'],
    });

    if (!refund) {
      throw new Error('Refund not found');
    }

    refund.reviewedBy = reviewedBy;
    refund.reviewedAt = new Date();
    refund.reviewNotes = reviewNotes;

    // Log audit entry
    await this.auditService.logAction({
      refundId: refund.id,
      action: 'manual_review',
      actor: reviewedBy,
      previousStatus: refund.status,
      newStatus: approved ? 'approved' : 'rejected',
      metadata: {
        approved,
        reviewNotes,
        customRefundPercentage,
      },
    });

    if (approved) {
      const refundPercentage = customRefundPercentage || 100;
      await this.approveRefund(refundId, refundPercentage);
    } else {
      refund.status = 'rejected';
      await refundRepo.save(refund);

      await this.notificationService.sendEmail(
        refund.booking.passenger.email,
        'Refund Request Rejected',
        `Your refund request has been reviewed and rejected. Reason: ${reviewNotes}`
      );
    }

    logger.info(`Refund ${refundId} manually reviewed by ${reviewedBy}: ${approved ? 'approved' : 'rejected'}`);

    return refund;
  }

  /**
   * Get refunds requiring manual review
   */
  public async getManualReviewQueue(): Promise<Refund[]> {
    const refundRepo = AppDataSource.getRepository(Refund);
    return await refundRepo.find({
      where: { status: 'manual_review' },
      relations: ['booking', 'booking.passenger', 'booking.flight'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Get refund by ID
   */
  public async getRefund(refundId: string): Promise<Refund | null> {
    const refundRepo = AppDataSource.getRepository(Refund);
    return await refundRepo.findOne({
      where: { id: refundId },
      relations: ['booking', 'booking.passenger', 'booking.flight'],
    });
  }

  /**
   * Get refunds by booking ID
   */
  public async getRefundsByBooking(bookingId: string): Promise<Refund[]> {
    const refundRepo = AppDataSource.getRepository(Refund);
    return await refundRepo.find({
      where: { booking: { id: bookingId } },
      relations: ['booking', 'booking.passenger', 'booking.flight'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get all refunds with optional filters
   */
  public async getAllRefunds(filters?: {
    status?: RefundStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ refunds: Refund[]; total: number }> {
    const refundRepo = AppDataSource.getRepository(Refund);
    const queryBuilder = refundRepo
      .createQueryBuilder('refund')
      .leftJoinAndSelect('refund.booking', 'booking')
      .leftJoinAndSelect('booking.passenger', 'passenger')
      .leftJoinAndSelect('booking.flight', 'flight');

    if (filters?.status) {
      queryBuilder.where('refund.status = :status', { status: filters.status });
    }

    const total = await queryBuilder.getCount();

    queryBuilder.orderBy('refund.createdAt', 'DESC');

    if (filters?.limit) {
      queryBuilder.limit(filters.limit);
    }

    if (filters?.offset) {
      queryBuilder.offset(filters.offset);
    }

    const refunds = await queryBuilder.getMany();

    return { refunds, total };
  }

  /**
   * Request a delayed refund for amounts above threshold
   * Implements time-locked safety mechanism to prevent exploits
   */
  public async requestDelayedRefund(request: CreateRefundRequest): Promise<Refund> {
    const refundRepo = AppDataSource.getRepository(Refund);
    const bookingRepo = AppDataSource.getRepository(Booking);

    const booking = await bookingRepo.findOne({
      where: { id: request.bookingId },
      relations: ['flight', 'passenger'],
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    // Check if refund already exists
    const existingRefund = await refundRepo.findOne({
      where: { booking: { id: booking.id } },
    });

    if (existingRefund) {
      throw new Error('Refund request already exists for this booking');
    }

    // Check eligibility
    const eligibility = await this.checkEligibility(booking);

    // Determine if refund should be delayed based on amount
    const shouldDelay = booking.amountCents > REFUND_TIER_THRESHOLDS.IMMEDIATE_MAX;
    const delayedUntil = shouldDelay
      ? new Date(Date.now() + REFUND_TIER_THRESHOLDS.DELAYED_HOURS * 60 * 60 * 1000)
      : null;

    const refund = refundRepo.create({
      booking,
      status: shouldDelay ? 'delayed_pending' : 'eligibility_check',
      reason: request.reason,
      reasonDetails: request.reasonDetails,
      requestedAmountCents: booking.amountCents,
      isEligible: eligibility.isEligible,
      eligibilityNotes: eligibility.reason,
      processingFeeCents: eligibility.processingFeeCents,
      requiresManualReview: eligibility.requiresManualReview,
      requestedBy: request.requestedBy,
      isDelayed: shouldDelay,
      delayedUntil,
    });

    const saved = await refundRepo.save(refund);

    // Log audit entry
    await this.auditService.logAction({
      refundId: saved.id,
      action: shouldDelay ? 'delayed_refund_requested' : 'refund_requested',
      actor: request.requestedBy,
      newStatus: saved.status,
      metadata: {
        reason: request.reason,
        requestedAmount: booking.amountCents,
        isDelayed: shouldDelay,
        delayedUntil: delayedUntil?.toISOString(),
      },
    });

    logger.info(
      `Refund ${saved.id} requested: ${shouldDelay ? 'delayed until ' + delayedUntil?.toISOString() : 'immediate processing'}`
    );

    // Send notification
    const notificationMessage = shouldDelay
      ? `Your refund request for booking ${booking.id} has been received. Due to the refund amount ($${(booking.amountCents / 100).toFixed(2)}), it will be processed after ${delayedUntil?.toLocaleString()} for security purposes. You can cancel this request during the waiting period.`
      : `Your refund request for booking ${booking.id} has been received and is being processed.`;

    await this.notificationService.sendEmail(
      booking.passenger.email,
      'Refund Request Received',
      notificationMessage
    );

    // If not delayed, process immediately
    if (!shouldDelay) {
      if (eligibility.isEligible && !eligibility.requiresManualReview) {
        await this.approveRefund(saved.id, eligibility.refundPercentage);
      } else if (eligibility.requiresManualReview) {
        saved.status = 'manual_review';
        await refundRepo.save(saved);
      } else {
        saved.status = 'rejected';
        await refundRepo.save(saved);
      }
    }

    return saved;
  }

  /**
   * Cancel a delayed refund request during the waiting period
   */
  public async cancelDelayedRefund(
    refundId: string,
    cancelledBy: string,
    cancellationReason: string
  ): Promise<Refund> {
    const refundRepo = AppDataSource.getRepository(Refund);
    const refund = await refundRepo.findOne({
      where: { id: refundId },
      relations: ['booking', 'booking.passenger'],
    });

    if (!refund) {
      throw new Error('Refund not found');
    }

    if (!refund.isDelayed) {
      throw new Error('Only delayed refunds can be cancelled');
    }

    if (refund.status !== 'delayed_pending') {
      throw new Error('Refund is not in delayed pending status');
    }

    if (refund.delayedUntil && new Date() >= refund.delayedUntil) {
      throw new Error('Delay period has expired, refund cannot be cancelled');
    }

    refund.status = 'delayed_cancelled';
    refund.cancelledBy = cancelledBy;
    refund.cancelledAt = new Date();
    refund.cancellationReason = cancellationReason;

    await refundRepo.save(refund);

    // Log audit entry
    await this.auditService.logAction({
      refundId: refund.id,
      action: 'delayed_refund_cancelled',
      actor: cancelledBy,
      previousStatus: 'delayed_pending',
      newStatus: 'delayed_cancelled',
      metadata: {
        cancellationReason,
        cancelledAt: refund.cancelledAt.toISOString(),
      },
    });

    // Send notification
    await this.notificationService.sendEmail(
      refund.booking.passenger.email,
      'Refund Request Cancelled',
      `Your refund request for booking ${refund.booking.id} has been cancelled. Reason: ${cancellationReason}`
    );

    logger.info(`Delayed refund ${refundId} cancelled by ${cancelledBy}`);

    return refund;
  }

  /**
   * Process delayed refunds that have passed their timelock period
   */
  public async processDelayedRefund(refundId: string): Promise<Refund> {
    const refundRepo = AppDataSource.getRepository(Refund);
    const refund = await refundRepo.findOne({
      where: { id: refundId },
      relations: ['booking', 'booking.passenger', 'booking.flight'],
    });

    if (!refund) {
      throw new Error('Refund not found');
    }

    if (!refund.isDelayed) {
      throw new Error('Refund is not a delayed refund');
    }

    if (refund.status !== 'delayed_pending') {
      throw new Error('Refund is not in delayed pending status');
    }

    if (!refund.delayedUntil) {
      throw new Error('Refund does not have a delay expiration time');
    }

    // Check if delay period has expired
    if (new Date() < refund.delayedUntil) {
      throw new Error(
        `Delay period has not expired yet. Refund can be processed after ${refund.delayedUntil.toISOString()}`
      );
    }

    // Re-check eligibility in case flight status changed
    const eligibility = await this.checkEligibility(refund.booking);

    // Log audit entry
    await this.auditService.logAction({
      refundId: refund.id,
      action: 'delayed_refund_processing',
      previousStatus: 'delayed_pending',
      newStatus: 'eligibility_check',
      metadata: {
        delayExpired: refund.delayedUntil.toISOString(),
        reEligibilityCheck: eligibility,
      },
    });

    logger.info(`Processing delayed refund ${refundId} after timelock expiration`);

    // Update eligibility and process
    refund.isEligible = eligibility.isEligible;
    refund.eligibilityNotes = eligibility.reason;
    refund.processingFeeCents = eligibility.processingFeeCents;
    refund.requiresManualReview = eligibility.requiresManualReview;

    if (eligibility.isEligible && !eligibility.requiresManualReview) {
      await this.approveRefund(refundId, eligibility.refundPercentage);
    } else if (eligibility.requiresManualReview) {
      refund.status = 'manual_review';
      await refundRepo.save(refund);
      logger.info(`Delayed refund ${refundId} requires manual review`);
    } else {
      refund.status = 'rejected';
      await refundRepo.save(refund);
      logger.info(`Delayed refund ${refundId} rejected due to ineligibility`);
    }

    return refund;
  }

  /**
   * Emergency override to process a delayed refund immediately
   * Should only be used in genuine emergency situations
   */
  public async emergencyOverrideDelayedRefund(
    refundId: string,
    overrideBy: string,
    overrideReason: string
  ): Promise<Refund> {
    const refundRepo = AppDataSource.getRepository(Refund);
    const refund = await refundRepo.findOne({
      where: { id: refundId },
      relations: ['booking', 'booking.passenger', 'booking.flight'],
    });

    if (!refund) {
      throw new Error('Refund not found');
    }

    if (!refund.isDelayed) {
      throw new Error('Refund is not a delayed refund');
    }

    if (refund.status !== 'delayed_pending') {
      throw new Error('Refund is not in delayed pending status');
    }

    // Mark as emergency override
    refund.emergencyOverride = true;
    refund.emergencyOverrideBy = overrideBy;
    refund.emergencyOverrideReason = overrideReason;

    await refundRepo.save(refund);

    // Log audit entry
    await this.auditService.logAction({
      refundId: refund.id,
      action: 'emergency_override_applied',
      actor: overrideBy,
      previousStatus: 'delayed_pending',
      newStatus: 'eligibility_check',
      metadata: {
        overrideReason,
        overrideAt: new Date().toISOString(),
        originalDelayedUntil: refund.delayedUntil?.toISOString(),
      },
    });

    logger.warn(
      `Emergency override applied to delayed refund ${refundId} by ${overrideBy}: ${overrideReason}`
    );

    // Send notification
    await this.notificationService.sendEmail(
      refund.booking.passenger.email,
      'Refund Emergency Override',
      `Your refund request for booking ${refund.booking.id} has been expedited due to emergency circumstances.`
    );

    // Re-check eligibility and process
    const eligibility = await this.checkEligibility(refund.booking);
    refund.isEligible = eligibility.isEligible;
    refund.eligibilityNotes = eligibility.reason;
    refund.processingFeeCents = eligibility.processingFeeCents;
    refund.requiresManualReview = eligibility.requiresManualReview;

    if (eligibility.isEligible && !eligibility.requiresManualReview) {
      await this.approveRefund(refundId, eligibility.refundPercentage);
    } else if (eligibility.requiresManualReview) {
      refund.status = 'manual_review';
      await refundRepo.save(refund);
    } else {
      refund.status = 'rejected';
      await refundRepo.save(refund);
    }

    return refund;
  }

  /**
   * Get all delayed refunds ready for processing
   */
  public async getDelayedRefundsReadyForProcessing(): Promise<Refund[]> {
    const refundRepo = AppDataSource.getRepository(Refund);
    const now = new Date();

    return await refundRepo.find({
      where: {
        status: 'delayed_pending',
        isDelayed: true,
      },
      relations: ['booking', 'booking.passenger', 'booking.flight'],
      order: { delayedUntil: 'ASC' },
    }).then((refunds) => refunds.filter((r) => r.delayedUntil && r.delayedUntil <= now));
  }

  /**
   * Get all pending delayed refunds
   */
  public async getPendingDelayedRefunds(): Promise<Refund[]> {
    const refundRepo = AppDataSource.getRepository(Refund);

    return await refundRepo.find({
      where: {
        status: 'delayed_pending',
        isDelayed: true,
      },
      relations: ['booking', 'booking.passenger', 'booking.flight'],
      order: { delayedUntil: 'ASC' },
    });
  }
}
