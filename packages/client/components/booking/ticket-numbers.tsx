"use client"

export interface TicketNumbersProps {
  bookingReference?: string | null
  ticketNumbers?: string[] | null
  reservationConfirmed?: boolean
}

export function isTicketed(ticketNumbers?: string[] | null): boolean {
  return (ticketNumbers ?? []).filter(Boolean).length > 0
}

export function TicketNumbers({
  bookingReference,
  ticketNumbers,
  reservationConfirmed,
}: TicketNumbersProps) {
  const tickets = (ticketNumbers ?? []).filter(Boolean)
  const ticketed = tickets.length > 0

  return (
    <section aria-label="Ticketing">
      <p>
        <span className="font-medium">Booking reference (PNR)</span>: {bookingReference || "Pending"}
      </p>
      <p>
        <span className="font-medium">Ticket numbers</span>:{" "}
        {ticketed ? tickets.join(", ") : "Not issued"}
      </p>
      {reservationConfirmed && !ticketed ? (
        <p role="status">Reservation is confirmed but not ticketed until a ticket number exists.</p>
      ) : null}
    </section>
  )
}
