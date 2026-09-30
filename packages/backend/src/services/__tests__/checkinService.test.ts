import { CheckInService, getCheckInWindow } from '../checkinService';
import { MockFactories } from '../../testing/mockFactories';
import { ConflictError } from '../../utils/errors'; // Adjust path if it causes an error

describe('CheckInService Unit Tests', () => {
  let service: CheckInService;

  beforeEach(() => {
    service = new CheckInService();
  });

  test('getCheckInWindow returns open status within 24h of departure', () => {
    const flight = MockFactories.createFlight({
      departureTime: new Date(Date.now() + 10 * 60 * 60 * 1000), // 10 hours from now
    });

    const window = getCheckInWindow(flight);
    expect(window.isOpen).toBe(true);
    expect(window.opensAt).toBeDefined();
    expect(window.closesAt).toBeDefined();
  });

  test('getCheckInWindow returns closed status if flight is in 30 days', () => {
    const flight = MockFactories.createFlight({
      departureTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    });

    const window = getCheckInWindow(flight);
    expect(window.isOpen).toBe(false);
  });

  // =========================================================================
  // NEW HARDENING TESTS
  // =========================================================================

  test('checkIn throws ConflictError if flight status is CANCELED', async () => {
    const mockBooking = { id: 'book_cancelled_1', status: 'CANCELED' };
    jest.spyOn(service as any, 'getBookingById').mockResolvedValue(mockBooking);

    await expect(
      service.checkIn({ bookingId: 'book_cancelled_1' })
    ).rejects.toThrow(ConflictError);
  });

  test('checkIn handles already checked-in passengers idempotently by returning data', async () => {
    const mockBooking = { id: 'book_dup_2', status: 'confirmed' };
    const mockExistingCheckIn = { id: 'chk_dup_2', status: 'checked_in' };

    // Mock internal methods so it skips straight to finding the pre-existing check-in
    jest.spyOn(service as any, 'getBookingById').mockResolvedValue(mockBooking);
    jest.spyOn(service as any, 'getWindow').mockResolvedValue({ booking: mockBooking, window: { isOpen: true } });
    jest.spyOn((service as any).checkInRepo, 'findOne').mockResolvedValue(mockExistingCheckIn);

    const result = await service.checkIn({ bookingId: 'book_dup_2' });
    
    // Assert that it returned the data successfully instead of throwing a ConflictError
    expect(result).toEqual(mockExistingCheckIn);
  });
});
