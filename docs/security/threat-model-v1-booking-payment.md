# Threat model: v1 traveler booking and payment

This document provides a lightweight threat model for Traqora's v1 traveler journey: search/selection, booking creation, passenger details, payment intent and confirmation, on-chain submission/confirmation, and refund requests/status. It is intended to guide implementation, review, and operational response within current v1 scope.

## Assets

- **Traveler identity and account linkage:** authenticated wallet address, session tokens, and any account identifiers.
- **Booking records:** booking IDs/status, flight/passenger associations, idempotency keys, transaction hashes/references, and itinerary artifacts.
- **Passenger personal data:** names, contact details, dates of birth/nationality/document-related inputs where collected, and special assistance information.
- **Payment and financial data:** Stripe payment intent identifiers/client secrets (where applicable), amounts, refund requests/status, and provider reconciliation signals.
- **On-chain transaction data:** unsigned/signed XDR, transaction hashes, submission/confirmation state, and booking-contract linkage.
- **Operational/admin controls:** admin credentials/API keys, review/override actions, audit logs, and provider secrets.

## Trust boundaries

1. **Public client ↔ backend API:** untrusted browser/mobile clients call authenticated and public API routes over HTTPS.
2. **Backend ↔ persistence:** backend services read/write bookings, passengers, refunds, notifications, and audit records in PostgreSQL.
3. **Backend ↔ external payment provider (Stripe):** payment intent creation and webhook callbacks cross organizational boundaries; webhook authenticity must be verified.
4. **Backend ↔ Stellar/Soroban network/services:** transaction submission and confirmation depend on external chain/network behavior and explorer/indexing visibility.
5. **User ↔ admin/operator boundary:** privileged refund review, reconciliation, and operational actions must be restricted to authorized operators with auditability.
6. **Notification/delivery boundary:** email/SMS/provider integrations receive derived user data needed for delivery.

## Abuse cases

| Area | Abuse case | Potential impact |
| --- | --- | --- |
| Authentication/access control | Access or mutate another traveler's booking/passenger/refund by guessing or reusing IDs | Data exposure, unauthorized changes, fraud |
| Input validation | Submit malformed, oversized, or unexpected fields to bypass assumptions or degrade service | Logic errors, injection risk, denial of service, inconsistent records |
| Idempotency/replay | Reuse idempotency keys or replay payment/webhook/submission requests to duplicate side effects | Duplicate bookings/charges/refunds, state corruption |
| Payment/webhook integrity | Forge or replay Stripe webhook events, or tamper with client-reported payment state | False "paid" state, unpaid fulfillment, reconciliation drift |
| On-chain submission | Submit invalid/signed transactions for bookings not owned/ready, or exploit retry/confirmation gaps | Unauthorized state transitions, stuck bookings, financial loss |
| Refund workflow | Request/approve/cancel/dispute refunds outside policy or ownership; abuse admin overrides | Unauthorized refunds, policy bypass, audit gaps |
| Sensitive data exposure | Leak passenger/payment details via logs, errors, over-broad responses, or exported artifacts | Privacy breach, compliance risk |
| Admin/operations | Compromised operator credentials or excessive privileges used for unauthorized actions | Broad data/financial compromise |

## Current/planned mitigations (v1)

- **Authentication and authorization:** require authenticated user context on in-scope booking/passenger/payment-adjacent routes; enforce ownership checks before reads/mutations; restrict admin/refund-operations endpoints to explicit admin authorization.
- **Explicit request validation:** per-route/method schemas for in-scope v1 surfaces; reject malformed, unexpected, and oversized fields before handlers/business logic; apply bounded limits on query/list operations.
- **Payment integrity:** verify Stripe webhook signatures server-side; treat provider-confirmed events and backend state transitions as authoritative; keep booking/payment state transitions constrained.
- **Idempotency and safe retries:** require/validate idempotency for booking creation flows and use deterministic identities for retryable notification/refund reconciliation operations where applicable.
- **On-chain safety:** validate booking readiness/state before submission, record submission attempts and errors, and use idempotent confirmation handling to avoid duplicate side effects.
- **Auditability:** log sensitive admin/refund actions and reconciliation findings/actions with accountable actors for operator review.
- **Data minimization and safe errors:** return access-denied/not-found responses without leaking cross-account ownership details; avoid exposing secrets in client responses.

## Residual risks and follow-ups

- **Identity model gaps:** some resources (e.g. group booking organizer/member ownership) may require stronger explicit ownership modeling and enforcement beyond authenticated access.
- **Provider and chain dependencies:** Stripe/Soroban availability, eventual consistency, and webhook/reorg-like edge cases can still cause temporary drift; reconciliation and alerting must remain operationally monitored.
- **Rate limiting and abuse detection:** endpoint-specific throttling and anomaly detection for authenticated abuse/payment probing should be continuously tuned.
- **Sensitive data lifecycle:** retention, encryption-at-rest/field-level protections, and log redaction require ongoing verification as data flows evolve.
- **Admin controls:** break-glass and privileged workflows depend on disciplined access review and complete audit coverage across all operator systems.

## Review

- Revisit this threat model for any change to booking/payment/refund flows, authz rules, provider integrations, or passenger data collection.
- Pair with [production access review](../operations/production-access-review.md) for operator-risk controls.
