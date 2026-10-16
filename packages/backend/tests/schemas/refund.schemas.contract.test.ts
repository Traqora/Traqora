// @ts-ignore
import {
  createRefundSchema,
  manualReviewSchema,
  submitOnchainSchema,
} from '../../src/api/schemas/index';

describe('Refund Schema Contract Tests', () => {
  describe('createRefundSchema', () => {
    const validRefund = {
      bookingId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'customer_request' as const,
      reasonDetails: 'Testing refund flow',
      requestedBy: 'test@example.com',
    };

    it('should accept valid refund request with all fields', () => {
      const result = createRefundSchema.safeParse(validRefund);
      expect(result.success).toBe(true);
    });

    it('should accept valid refund with only required fields', () => {
      const minimalRefund = {
        bookingId: validRefund.bookingId,
        reason: validRefund.reason,
      };
      const result = createRefundSchema.safeParse(minimalRefund);
      expect(result.success).toBe(true);
    });

    it('should accept all valid reason enum values', () => {
      const validReasons = [
        'flight_cancelled',
        'flight_delayed',
        'customer_request',
        'duplicate_booking',
        'service_issue',
        'other',
      ] as const;
      validReasons.forEach((reason) => {
        const result = createRefundSchema.safeParse({
          bookingId: validRefund.bookingId,
          reason,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid UUID format for bookingId', () => {
      const invalidUuid = { ...validRefund, bookingId: 'not-a-uuid' };
      const result = createRefundSchema.safeParse(invalidUuid);
      expect(result.success).toBe(false);
    });

    it('should reject empty bookingId', () => {
      const emptyBookingId = { ...validRefund, bookingId: '' };
      const result = createRefundSchema.safeParse(emptyBookingId);
      expect(result.success).toBe(false);
    });

    it('should reject missing bookingId', () => {
      const { bookingId, ...refundWithoutBookingId } = validRefund;
      const result = createRefundSchema.safeParse(refundWithoutBookingId);
      expect(result.success).toBe(false);
    });

    it('should reject missing reason', () => {
      const { reason, ...refundWithoutReason } = validRefund;
      const result = createRefundSchema.safeParse(refundWithoutReason);
      expect(result.success).toBe(false);
    });

    it('should reject invalid reason value', () => {
      const invalidReason = { ...validRefund, reason: 'invalid_reason' };
      const result = createRefundSchema.safeParse(invalidReason);
      expect(result.success).toBe(false);
    });

    it('should accept empty string for optional reasonDetails', () => {
      const emptyDetails = { ...validRefund, reasonDetails: '' };
      const result = createRefundSchema.safeParse(emptyDetails);
      expect(result.success).toBe(true);
    });

    it('should accept long reasonDetails', () => {
      const longDetails = { ...validRefund, reasonDetails: 'a'.repeat(1000) };
      const result = createRefundSchema.safeParse(longDetails);
      expect(result.success).toBe(true);
    });

    it('should accept empty string for optional requestedBy', () => {
      const emptyRequestedBy = { ...validRefund, requestedBy: '' };
      const result = createRefundSchema.safeParse(emptyRequestedBy);
      expect(result.success).toBe(true);
    });

    it('should accept email-like requestedBy', () => {
      const emailRequestedBy = { ...validRefund, requestedBy: 'user@example.com' };
      const result = createRefundSchema.safeParse(emailRequestedBy);
      expect(result.success).toBe(true);
    });

    it('should reject null bookingId', () => {
      const result = createRefundSchema.safeParse({ ...validRefund, bookingId: null });
      expect(result.success).toBe(false);
    });

    it('should reject null reason', () => {
      const result = createRefundSchema.safeParse({ ...validRefund, reason: null });
      expect(result.success).toBe(false);
    });

    it('should reject non-string bookingId', () => {
      const result = createRefundSchema.safeParse({ ...validRefund, bookingId: 123 });
      expect(result.success).toBe(false);
    });

    it('should reject number for reason', () => {
      const result = createRefundSchema.safeParse({ ...validRefund, reason: 1 });
      expect(result.success).toBe(false);
    });

    it('should accept reasonDetails with special characters', () => {
      const specialDetails = {
        ...validRefund,
        reasonDetails: 'Customer missed flight due to illness (medical emergency)',
      };
      const result = createRefundSchema.safeParse(specialDetails);
      expect(result.success).toBe(true);
    });

    it('should accept requestedBy with special characters', () => {
      const specialRequestedBy = { ...validRefund, requestedBy: 'User-Name_123' };
      const result = createRefundSchema.safeParse(specialRequestedBy);
      expect(result.success).toBe(true);
    });
  });

  describe('manualReviewSchema', () => {
    const validReview = {
      approved: true,
      reviewedBy: 'admin@example.com',
      reviewNotes: 'Approved for testing',
      customRefundPercentage: 75,
    };

    it('should accept valid manual review with all fields', () => {
      const result = manualReviewSchema.safeParse(validReview);
      expect(result.success).toBe(true);
    });

    it('should accept valid manual review without customRefundPercentage', () => {
      const reviewWithoutPercentage = {
        approved: true,
        reviewedBy: 'admin@example.com',
        reviewNotes: 'Approved',
      };
      const result = manualReviewSchema.safeParse(reviewWithoutPercentage);
      expect(result.success).toBe(true);
    });

    it('should accept approved: true', () => {
      const approvedReview = {
        approved: true,
        reviewedBy: 'admin@example.com',
        reviewNotes: 'Approved',
      };
      const result = manualReviewSchema.safeParse(approvedReview);
      expect(result.success).toBe(true);
    });

    it('should accept approved: false', () => {
      const rejectedReview = {
        approved: false,
        reviewedBy: 'admin@example.com',
        reviewNotes: 'Rejected',
      };
      const result = manualReviewSchema.safeParse(rejectedReview);
      expect(result.success).toBe(true);
    });

    it('should reject missing approved field', () => {
      const { approved, ...reviewWithoutApproved } = validReview;
      const result = manualReviewSchema.safeParse(reviewWithoutApproved);
      expect(result.success).toBe(false);
    });

    it('should reject missing reviewedBy field', () => {
      const { reviewedBy, ...reviewWithoutReviewer } = validReview;
      const result = manualReviewSchema.safeParse(reviewWithoutReviewer);
      expect(result.success).toBe(false);
    });

    it('should reject missing reviewNotes field', () => {
      const { reviewNotes, ...reviewWithoutNotes } = validReview;
      const result = manualReviewSchema.safeParse(reviewWithoutNotes);
      expect(result.success).toBe(false);
    });

    it('should reject empty reviewedBy', () => {
      const emptyReviewer = { ...validReview, reviewedBy: '' };
      const result = manualReviewSchema.safeParse(emptyReviewer);
      expect(result.success).toBe(false);
    });

    it('should reject empty reviewNotes', () => {
      const emptyNotes = { ...validReview, reviewNotes: '' };
      const result = manualReviewSchema.safeParse(emptyNotes);
      expect(result.success).toBe(false);
    });

    it('should reject customRefundPercentage below 0', () => {
      const belowZero = { ...validReview, customRefundPercentage: -1 };
      const result = manualReviewSchema.safeParse(belowZero);
      expect(result.success).toBe(false);
    });

    it('should reject customRefundPercentage above 100', () => {
      const aboveHundred = { ...validReview, customRefundPercentage: 101 };
      const result = manualReviewSchema.safeParse(aboveHundred);
      expect(result.success).toBe(false);
    });

    it('should accept customRefundPercentage of 0', () => {
      const zeroPercent = { ...validReview, customRefundPercentage: 0 };
      const result = manualReviewSchema.safeParse(zeroPercent);
      expect(result.success).toBe(true);
    });

    it('should accept customRefundPercentage of 100', () => {
      const fullPercent = { ...validReview, customRefundPercentage: 100 };
      const result = manualReviewSchema.safeParse(fullPercent);
      expect(result.success).toBe(true);
    });

    it('should accept decimal customRefundPercentage', () => {
      const decimalPercent = { ...validReview, customRefundPercentage: 50.5 };
      const result = manualReviewSchema.safeParse(decimalPercent);
      expect(result.success).toBe(true);
    });

    it('should reject null approved', () => {
      const result = manualReviewSchema.safeParse({ ...validReview, approved: null });
      expect(result.success).toBe(false);
    });

    it('should reject string for approved', () => {
      const result = manualReviewSchema.safeParse({ ...validReview, approved: 'true' });
      expect(result.success).toBe(false);
    });

    it('should reject non-string reviewedBy', () => {
      const result = manualReviewSchema.safeParse({ ...validReview, reviewedBy: 123 });
      expect(result.success).toBe(false);
    });

    it('should reject non-string reviewNotes', () => {
      const result = manualReviewSchema.safeParse({ ...validReview, reviewNotes: 123 });
      expect(result.success).toBe(false);
    });

    it('should reject non-number customRefundPercentage', () => {
      const result = manualReviewSchema.safeParse({
        ...validReview,
        customRefundPercentage: '50',
      });
      expect(result.success).toBe(false);
    });

    it('should accept long reviewNotes', () => {
      const longNotes = { ...validReview, reviewNotes: 'a'.repeat(1000) };
      const result = manualReviewSchema.safeParse(longNotes);
      expect(result.success).toBe(true);
    });

    it('should accept email format for reviewedBy', () => {
      const emailReviewer = { ...validReview, reviewedBy: 'admin@company.com' };
      const result = manualReviewSchema.safeParse(emailReviewer);
      expect(result.success).toBe(true);
    });
  });

  describe('submitOnchainSchema', () => {
    const validSubmit = {
      signedXdr: 'AAA...signed_transaction_xdr_data...ZZZ',
    };

    it('should accept valid signed XDR', () => {
      const result = submitOnchainSchema.safeParse(validSubmit);
      expect(result.success).toBe(true);
    });

    it('should accept minimal signed XDR (length 1)', () => {
      const minimalXdr = { signedXdr: 'a' };
      const result = submitOnchainSchema.safeParse(minimalXdr);
      expect(result.success).toBe(true);
    });

    it('should accept long signed XDR', () => {
      const longXdr = { signedXdr: 'a'.repeat(10000) };
      const result = submitOnchainSchema.safeParse(longXdr);
      expect(result.success).toBe(true);
    });

    it('should reject empty signedXdr', () => {
      const emptyXdr = { signedXdr: '' };
      const result = submitOnchainSchema.safeParse(emptyXdr);
      expect(result.success).toBe(false);
    });

    it('should reject missing signedXdr field', () => {
      const result = submitOnchainSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject null signedXdr', () => {
      const result = submitOnchainSchema.safeParse({ signedXdr: null });
      expect(result.success).toBe(false);
    });

    it('should reject non-string signedXdr', () => {
      const result = submitOnchainSchema.safeParse({ signedXdr: 123 });
      expect(result.success).toBe(false);
    });

    it('should reject undefined signedXdr', () => {
      const result = submitOnchainSchema.safeParse({ signedXdr: undefined });
      expect(result.success).toBe(false);
    });

    it('should accept XDR with special characters', () => {
      const specialXdr = { signedXdr: 'AAAAAgAAAAAB...' };
      const result = submitOnchainSchema.safeParse(specialXdr);
      expect(result.success).toBe(true);
    });

    it('should accept XDR with base64 characters', () => {
      const base64Xdr = {
        signedXdr: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
      };
      const result = submitOnchainSchema.safeParse(base64Xdr);
      expect(result.success).toBe(true);
    });
  });
});
