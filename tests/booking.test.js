const Booking = require('../src/models/Booking');

describe('Booking State Transitions', () => {
  test('allows legal transition from pending to confirmed', async () => {
    const booking = new Booking({ status: 'pending' });
    await booking.updateStatus('confirmed');
    expect(booking.status).toBe('confirmed');
  });

  test('rejects illegal transition from completed to pending', async () => {
    const booking = new Booking({ status: 'completed' });
    await expect(booking.updateStatus('pending')).rejects.toThrow();
  });
});
