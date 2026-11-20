# Booking event schema

Contract: `booking` (`contracts/packages/booking`). This is the v1 contract for
the events indexers, monitors and the backend read. It adds the names, the
fields to filter on, the versioning rules and the compatibility requirements.
The per-event field tables live in [`EVENTS.md`](EVENTS.md), which is checked
against the contract source by `./scripts/check-events-docs.sh`; this document
does not repeat them.

## Event names

Every booking event has two topics, `(booking, <action>)`, published through
`contract_events::emit` (`packages/shared/events`). The topic symbols are
defined once in that crate.

| Topic | Emitted by | Meaning |
|---|---|---|
| `(booking, oracle)` | `initialize_oracle` | Trusted oracle registered |
| `(booking, created)` | `create_booking` | Booking created, pending payment |
| `(booking, paid)` | `pay_for_booking` | Payment escrowed |
| `(booking, released)` | `release_payment_to_airline`, `batch_complete_bookings`, `oracle_release_payment` | Escrow released to the airline |
| `(booking, refunded)` | `refund_passenger`, `oracle_refund_airline_cancel` | Escrow refunded to the passenger |
| `(booking, cancelled)` | `settle_cancellation` | Booking cancelled, escrow split |

`released` and `refunded` are published from more than one entry point and the
first data field (the actor) differs between them: the airline or the oracle
for `released`, the passenger or the oracle for `refunded`. Consumers must not
assume one actor per action.

## Fields to filter on

Booking events carry **no indexed id topic**. `getEvents` can filter only on the
two topics, so a subscriber selects an action and then reads the booking id from
the data. Position is fixed:

| Data position | Field | Present on |
|---|---|---|
| 0 | actor (`Address`) | all, except it is the admin on `oracle` |
| 1 | ledger timestamp (`u64`) | all |
| 2 | `booking_id` (`u64`) | `created`, `paid`, `released`, `refunded`, `cancelled` |
| 3 and later | action-specific payload | see `EVENTS.md` |

`(booking, oracle)` has no `booking_id`: its third field is the oracle address.
To follow one booking, filter on `(booking, *)` and match `data[2]`.

## Versioning

Events carry **no explicit version field**. The schema version is implied by the
topic pair and the order and number of data fields. The v1 rules follow from that.

1. **Additive changes only within v1.** A new field may be appended to the end of
   an existing event's data. Existing fields are never reordered, retyped or
   removed.
2. **A new action is additive.** A new `(booking, <action>)` may be introduced at
   any time.
3. **A breaking change gets a new topic pair.** Renaming a topic symbol,
   reordering or removing a field, or changing a field's type is a breaking
   change. It ships as a new action (for example `(booking, created2)`) published
   next to the old event for a deprecation window announced in `EVENTS.md`, never
   as an in-place edit.
4. Topic symbols are Soroban short symbols (9 characters at most). `cancelled`
   already uses all 9, so a new action name must be short.

## Compatibility requirements

For consumers:

- Match on the topic pair, never on the number of data fields.
- Read fields by position and **ignore trailing fields you do not know**.
- **Ignore unknown actions** under `booking` instead of failing.
- Read the amount fields (`price`, `amount`, `released_amount`,
  `refunded_amount`, `passenger_refund`, `airline_amount`) as signed 128-bit
  integers (`i128`), never as JavaScript numbers.

For contract changes (the checklist for any PR that touches a booking event):

1. Edit the emit in `packages/booking/src/lib.rs` through `contract_events::emit`.
2. Update the table in `EVENTS.md` and run `./scripts/check-events-docs.sh`.
3. Update the contract snapshot tests (`test_booking_created_event`,
   `test_booking_paid_event` and the others under `contracts/test_snapshots`) and
   review the diff, as described in `docs/operations/CONTRACT_SNAPSHOT_REVIEW.md`.
4. State in the PR whether the change is additive (rules 1 and 2) or breaking
   (rule 3).

## Known gaps

- `EVENTS.md` currently lists the booking table twice, and the first copy shows
  `(booking, cancelled)` as `(booking_id, passenger_refund, airline_amount)`. The
  contract publishes `(caller, timestamp, booking_id, passenger_refund,
  airline_amount)`, which is what the second copy and the source say. Treat the
  five-field form as authoritative and remove the stale copy in a follow-up.
- Because there is no version field, a consumer cannot tell a v1 event from a
  later one that only appended fields. Adding an explicit version to the data is
  a breaking change and falls under rule 3.
