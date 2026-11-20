# Booking Failure Incident Runbooks

## Purpose

First-response actions for the four v1 booking failure classes: supplier outage, payment delay, contract outage and refund backlog. These runbooks use only v1 operator tools and do not add new customer channels or new state transitions.

## Before you start

- Record the booking reference and the ticket identifier in the support audit entry before you act.
- Use the booking operations view for booking, supplier, payment and reconciliation state.
- Use the operations health view for supplier, payment circuit and contract health.
- Follow `docs/operations/INCIDENT_RESPONSE.md` for severity and escalation.
- Never copy private keys, signing material or full card numbers into an audit reason, ticket or chat message.

## Supplier outage

**Signals:** supplier health degraded or unhealthy, repeated provider failures in failover logs, ticket numbers not returned, travelers reporting provider errors.

1. Open the operations health view and record supplier current health, last successful request and recent failure count.
2. Confirm the supplier state shown on affected bookings. A value of `unavailable` means no recorded telemetry, not a confirmed provider fault.
3. Follow `docs/operations/FLIGHT_PROVIDER_FAILOVER_RUNBOOK.md` and check whether a fallback provider is serving traffic.
4. Do not retry a booking while reconciliation is pending. Follow the timeout guidance in `docs/operations/README.md` to avoid duplicate bookings.
5. Tell affected travelers that the provider is being investigated. Do not promise a ticket or a refund until the booking state is confirmed.
6. Escalate to L2 when the provider is degraded beyond one polling window, and to L3 when the ledger or contract state disagrees.
7. Record each support access and change with actor, reason, booking reference and timestamp.

## Payment delay

**Signals:** bookings stuck in `awaiting_payment` or `onchain_pending`, payment circuit open or half open, travelers reporting a charge without a confirmed booking.

1. Read the payment health section. An open circuit means the payment provider is temporarily unavailable. A half open circuit means recovery is being tested.
2. Check the booking payment reference in the operations view. If there is no reference, do not ask the traveler to pay again.
3. Follow `docs/api/payment-retry.md` before advising any retry.
4. If a charge exists without a booking, record both references and escalate to L2 the same business day.
5. If the on-chain leg is pending, check contract health and wait for the normal confirmation window before escalating to L3.
6. Refund decisions follow the refund backlog path below. Support staff do not issue refunds directly.

## Contract outage

**Signals:** contract health unavailable or degraded, reconciliation events needing review, bookings whose application state does not match indexed events.

1. Read the contract and reconciliation health section. Record the last reconciliation timestamp and the number of events needing review.
2. Check `docs/operations/CONTRACT_DEPLOYMENT_RUNBOOK.md` for a recent deploy or upgrade that could explain the change.
3. Follow `docs/operations/INCIDENT_RESPONSE.md` severity rules. A ledger mismatch with customer impact is at least SEV2.
4. Do not manually change a booking status while reconciliation is running. Audited support changes are reserved for confirmed mismatches approved by an admin.
5. Escalate to L3 with the booking references and the affected event identifiers.
6. After recovery, confirm that the needs review count returns to zero before closing the incident.

## Refund backlog

**Signals:** approved refunds without a payment reference, repeated refund status enquiries, refund amounts that differ from the earlier quote.

1. Read the refund status for each booking. Do not create a second refund while one is already recorded.
2. Compare the approved amount with the cancellation quote. Quote expiry or a policy tier change explains most differences. L2 confirms which applied.
3. If the refund is approved but has no payment reference, escalate to L2 with the refund identifier and booking reference.
4. If the refund is blocked by a payment circuit outage, follow the payment delay path and wait for the circuit to close.
5. If the on-chain leg disagrees with the recorded status, escalate to L3 and follow the contract outage path.
6. Keep travelers informed with the recorded status rather than an estimated completion date you cannot verify.

## Closing an incident

- Confirm the relevant health indicator has recovered and the affected bookings show consistent booking, supplier and payment state.
- Confirm the reconciliation needs review count is back to its normal level for contract incidents.
- Complete the post-incident review template in `docs/operations/INCIDENT_RESPONSE.md` for SEV1 and SEV2 incidents.
- Keep the support audit entries as the source of truth for who accessed or changed which booking and why.

## Related documents

- `docs/operations/OPERATIONS_HEALTH_AND_AUDIT.md`
- `docs/operations/INCIDENT_RESPONSE.md`
