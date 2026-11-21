import React from 'react';
import { BookingManager, BookingSubmissionParams, BookingResult } from '../booking';

describe('BookingManager Duplicate Submission Prevention', () => {
  beforeEach(() => {
    BookingManager.resetState();
  });

  it('prevents concurrent duplicate submissions', async () => {
    const params: BookingSubmissionParams = {
      bookingId: 'bk-999',
      itineraryId: 'it-100',
      passengerDetails: { name: 'Jane Doe' },
      idempotencyKey: 'idem-key-1',
    };

    let callCount = 0;
    const mockSubmit = async (p: BookingSubmissionParams): Promise<BookingResult> => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { success: true, bookingId: p.bookingId, transactionHash: 'tx-hash-123' };
    };

    const promise1 = BookingManager.submitCheckout(params, mockSubmit);
    const promise2 = BookingManager.submitCheckout(params, mockSubmit);

    const [res1, res2] = await Promise.all([promise1, promise2]);

    expect(callCount).toBe(1);
    expect(res1.success).toBe(true);
    expect(res2.success).toBe(false);
    expect(res2.error).toContain('in progress');
  });

  it('prevents repeated submissions after successful checkout (idempotency)', async () => {
    const params: BookingSubmissionParams = {
      bookingId: 'bk-888',
      itineraryId: 'it-200',
      passengerDetails: { name: 'John Smith' },
      idempotencyKey: 'idem-key-2',
    };

    let callCount = 0;
    const mockSubmit = async (p: BookingSubmissionParams): Promise<BookingResult> => {
      callCount++;
      return { success: true, bookingId: p.bookingId, transactionHash: 'tx-hash-456' };
    };

    const res1 = await BookingManager.submitCheckout(params, mockSubmit);
    const res2 = await BookingManager.submitCheckout(params, mockSubmit);

    expect(callCount).toBe(1);
    expect(res1.success).toBe(true);
    expect(res2.success).toBe(false);
    expect(res2.error).toContain('already been processed');
  });

  it('handles failed submission and allows retry', async () => {
    const params: BookingSubmissionParams = {
      bookingId: 'bk-777',
      itineraryId: 'it-300',
      passengerDetails: { name: 'Alice Smith' },
      idempotencyKey: 'idem-key-3',
    };

    let callCount = 0;
    const mockSubmit = async (p: BookingSubmissionParams): Promise<BookingResult> => {
      callCount++;
      if (callCount === 1) {
        return { success: false, bookingId: p.bookingId, error: 'Network timeout' };
      }
      return { success: true, bookingId: p.bookingId, transactionHash: 'tx-hash-789' };
    };

    const res1 = await BookingManager.submitCheckout(params, mockSubmit);
    expect(res1.success).toBe(false);
    expect(res1.error).toBe('Network timeout');

    // Retry after failure should be allowed since it wasn't successfully processed
    const res2 = await BookingManager.submitCheckout(params, mockSubmit);
    expect(callCount).toBe(2);
    expect(res2.success).toBe(true);
    expect(res2.transactionHash).toBe('tx-hash-789');
  });
});
