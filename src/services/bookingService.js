const db = require('../data/db');

async function createBooking(bookingData, passengers) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const bookingQuery = `
      INSERT INTO bookings (user_id, flight_id, status, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id;
    `;
    const bookingRes = await client.query(bookingQuery, [
      bookingData.userId,
      bookingData.flightId,
      bookingData.status || 'confirmed'
    ]);
    const bookingId = bookingRes.rows[0].id;

    for (const passenger of passengers) {
      const passengerQuery = `
        INSERT INTO passengers (booking_id, first_name, last_name, passport_number)
        VALUES ($1, $2, $3, $4);
      `;
      await client.query(passengerQuery, [
        bookingId,
        passenger.firstName,
        passenger.lastName,
        passenger.passportNumber
      ]);
    }

    await client.query('COMMIT');
    return { bookingId, success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createBooking
};
