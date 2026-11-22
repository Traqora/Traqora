export interface BookingSubmissionParams {
  bookingId: string;
  itineraryId: string;
  passengerDetails: Record<string, any>;
  idempotencyKey?: string;
}

export interface BookingResult {
  success: boolean;
  bookingId: string;
  transactionHash?: string;
  error?: string;
}

export class BookingManager {
  private static submittedKeys = new Set<string>();
  private static inFlightBookings = new Set<string>();

  static async submitCheckout(params: BookingSubmissionParams, submitFn: (p: BookingSubmissionParams) => Promise<BookingResult>): Promise<BookingResult> {
    const key = params.idempotencyKey || `${params.bookingId}-${params.itineraryId}`;

    if (BookingManager.submittedKeys.has(key)) {
      return {
        success: false,
        bookingId: params.bookingId,
        error: 'Duplicate checkout submission detected. This booking has already been processed.'
      };
    }

    if (BookingManager.inFlightBookings.has(key)) {
      return {
        success: false,
        bookingId: params.bookingId,
        error: 'Checkout submission is already in progress.'
      };
    }

    BookingManager.inFlightBookings.add(key);

    try {
      const result = await submitFn(params);
      if (result.success) {
        BookingManager.submittedKeys.add(key);
      }
      return result;
    } catch (err: any) {
      return {
        success: false,
        bookingId: params.bookingId,
        error: err.message || 'Unknown checkout error'
      };
    } finally {
      BookingManager.inFlightBookings.delete(key);
    }
  }

  static resetState(): void {
    BookingManager.submittedKeys.clear();
    BookingManager.inFlightBookings.clear();
  }
}
