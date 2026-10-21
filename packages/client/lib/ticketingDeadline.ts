/**
 * Present a provider ticketing deadline without borrowing the departure
 * time (#906). A missing or unreadable deadline returns null so the
 * itinerary does not show departure in the ticket-by slot.
 */
export function presentTicketingDeadline(
  ticketingDeadline: string | null | undefined,
  departureTime: string,
): { heading: "Ticket by"; when: string; sameInstantAsDeparture: boolean } | null {
  if (!ticketingDeadline) return null;
  const deadline = new Date(ticketingDeadline);
  if (Number.isNaN(deadline.getTime())) return null;
  const departure = new Date(departureTime);
  const sameInstantAsDeparture =
    !Number.isNaN(departure.getTime()) && departure.getTime() === deadline.getTime();
  const when = deadline.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return { heading: "Ticket by", when: `${when} UTC`, sameInstantAsDeparture };
}
