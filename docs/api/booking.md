# Booking API V1

## Authorized Booking Detail Retrieval

Retrieval of booking details via `get_booking(caller: Address, booking_id: u64)` requires authorization from either the passenger (owner) or the explicitly authorized airline operator associated with the booking.
