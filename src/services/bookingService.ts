import { BookingStatus } from '../models/booking';

export const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingStatus.EXPIRED],
  [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.REFUNDED],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.EXPIRED]: [],
  [BookingStatus.COMPLETED]: [BookingStatus.REFUNDED],
  [BookingStatus.REFUNDED]: [],
};

export function isValidBookingTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export function enforceBookingTransition(currentStatus: BookingStatus, newStatus: BookingStatus): void {
  if (!isValidBookingTransition(currentStatus, newStatus)) {
    throw new Error(`Invalid booking state transition from ${currentStatus} to ${newStatus}`);
  }
}
