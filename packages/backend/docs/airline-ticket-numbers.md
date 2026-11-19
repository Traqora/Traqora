# Ticket numbers vs booking references (#905)

Airline ticket numbers are stored and presented separately from the booking
reference (PNR). A `confirmed` reservation is **not** ticketed until at least
one ticket number exists.

Implementation: `packages/backend/src/services/airlineTicketing.ts`,
`Booking.ticketNumbers`, and `packages/client/components/booking/ticket-numbers.tsx`.
