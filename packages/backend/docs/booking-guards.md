# Booking guards

Operational notes for the checkout, passenger, reserve, and ticketing checks.

## Stellar reserve before signing

Before a wallet or the server key signs a booking transaction, the source
account is checked against the classic minimum balance:

`minimum = max(0, 2 + subentries + extra subentries + sponsoring - sponsored) * 0.5 XLM`

The fee is subtracted first. If the remainder is below the minimum, the
API returns `STELLAR_INSUFFICIENT_RESERVE` (422) and does not return
signable XDR. Fund the account (or drop the extra subentries) and submit
again. If the account snapshot has no native balance, the check is skipped
because the reserve cannot be estimated; pass a Horizon balance snapshot
as `reserveAccount` when Soroban RPC omits balances.

## Checkout and offer expiry

Checkout is actionable until the earlier of the checkout session expiry
and the upstream flight-offer expiry. After that instant, creating a
reservation is refused with `OFFER_EXPIRED` (409). The response includes
`refreshPath`. Load a new offer and start a new checkout. Do not reuse
the expired session.

## Infant and child passengers

Ages are completed years on the itinerary departure date.

- Infant: under 2. Child: 2 until under 12. Youth: 12 until under 18. Adult: 18+.
- Any infant or child needs an adult on the departure date.
- Each infant needs a separate adult.
- Youth may travel alone and do not count as the accompanying adult.

Failure is `PASSENGER_AGE_INVALID` (422) with a list of problems. Fix the
dates of birth or add an adult, then submit again. The check runs only
when the booking request includes `passengers`, so older clients that
send a single passenger without a date of birth keep the previous path.

## Ticketing deadline

`bookings.ticketingDeadline` is the provider deadline. It is not the
flight `departureTime`. A date-only provider value is stored as 23:59:59
UTC on that date. An unreadable deadline is rejected and is not replaced
with the departure time. The itinerary labels the value "Ticket by".
When the two clock times happen to match, the itinerary still says the
value is the ticketing deadline, not the departure.
