# Separate-ticket self-transfer risk

## Overview

A **self-transfer itinerary** is one where a traveler holds two or more
**separate tickets** (separate booking references / PNRs) for connecting
flights and is responsible for making the connection themselves.

Traqora labels these itineraries so travelers can see the risk before they
book and take steps to protect themselves.

## What makes a self-transfer

A connection is flagged as a self-transfer when all of the following are true:

1. Two flight segments share the same passenger.
2. The arrival airport of the first segment is the departure airport of the
   next segment (a connection).
3. The layover is within the default connection window (24 hours).
4. The two segments are on **different booking references**, or one or both
   references are unknown (treated conservatively as separate tickets).

When both segments share the **same booking reference**, they are on a single
ticket and are **connection-protected**: if the first flight is delayed or
cancelled, the airline will rebook the traveler on the next available flight
and baggage is checked through.

## Separate-ticket risks

On separate tickets, each airline treats the flights as unrelated contracts.
The traveler carries the following risks:

| Risk | What it means |
|------|---------------|
| **No missed-connection protection** | If the first flight is delayed or cancelled, the operating airline is generally not obliged to rebook the traveler on the next separately ticketed flight. The traveler may have to buy a new ticket at their own cost. |
| **Baggage is not checked through** | Baggage is usually not interlined. The traveler must collect bags at the transfer airport, re-check them for the next flight, and clear security again. |
| **Separate contracts** | A schedule change, cancellation, or refund on one ticket does not automatically apply to the other ticket. |
| **Re-clear security and immigration** | Depending on the airport and country, the traveler may need to clear immigration, customs, and security again between tickets, which can consume a large part of the layover. |
| **Limited through check-in** | Boarding passes for the second flight may not be available at the start of the journey; check-in may only open at the transfer airport. |

## Severity grading

Self-transfer connections are severity-graded by layover length:

| Layover | Severity |
|---------|----------|
| Under 30 minutes | Severe |
| 30–60 minutes | High |
| Over 60 minutes | Medium |

Same-ticket connections are always low risk (protected).

## Recommended mitigations

- Allow at least 2 hours between self-transfer flights (3+ hours for
  international transfers involving immigration or a change of airport).
- Carry travel documents, medication, and essentials in cabin baggage in case
  checked bags miss the connection.
- Consider travel insurance that covers missed connections caused by separate
  tickets.
- Check visa and entry requirements for the transfer country — you may need to
  enter the country between tickets.
- Monitor the status of both flights separately; the airline will not protect
  the onward ticket.

## API

Traqora exposes a self-transfer analysis endpoint:

```
GET /api/v1/self-transfer/analyze?bookingIds=<id1>,<id2>
```

The response labels each segment, flags self-transfer connections, computes an
overall risk level, and returns a human-readable explanation plus mitigations.
Authentication is required and the caller must own all supplied bookings.
