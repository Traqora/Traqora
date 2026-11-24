const Booking = require('../models/booking');

const VALID_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  cancelled: [],
  completed: [],
};

class BookingService {
  async updateBookingStatus(bookingId, newState) {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw new Error('Booking not found');
    }

    const currentStatus = booking.status;
    const allowed = VALID_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(newState)) {
      throw new Error(`Invalid state transition from ${currentStatus} to ${newState}`);
    }

    booking.status = newState;
    await booking.save();
    return booking;
  }
}

module.exports = new BookingService();
