const bookingService = require('../src/services/bookingService');
const Booking = require('../src/models/booking');

jest.mock('../src/models/booking');

describe('BookingService State Transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow valid transition from pending to confirmed', async () => {
    const mockBooking = { status: 'pending', save: jest.fn().mockResolvedValue(true) };
    Booking.findById.mockResolvedValue(mockBooking);

    const updated = await bookingService.updateBookingStatus('123', 'confirmed');
    expect(updated.status).toBe('confirmed');
    expect(mockBooking.save).toHaveBeenCalled();
  });

  it('should reject invalid transition from completed to pending', async () => {
    const mockBooking = { status: 'completed', save: jest.fn() };
    Booking.findById.mockResolvedValue(mockBooking);

    await expect(bookingService.updateBookingStatus('123', 'pending')).rejects.toThrow(
      'Invalid state transition from completed to pending'
    );
    expect(mockBooking.save).not.toHaveBeenCalled();
  });

  it('should handle concurrent transition attempts correctly', async () => {
    const mockBooking = { status: 'pending', save: jest.fn().mockResolvedValue(true) };
    Booking.findById.mockResolvedValue(mockBooking);

    const promise1 = bookingService.updateBookingStatus('123', 'confirmed');
    const promise2 = bookingService.updateBookingStatus('123', 'cancelled');

    await Promise.allSettled([promise1, promise2]);
    expect(mockBooking.save).toHaveBeenCalled();
  });
});
