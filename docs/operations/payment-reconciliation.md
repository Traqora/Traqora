# Payment Reconciliation Procedures

This standard operating procedure (SOP) defines the operational guidelines for reconciling payment and booking records across four distinct system domains:
1. **Wallet / On-Chain**: Stellar accounts, Horizon/Soroban RPC transaction status, escrow balances, and transaction hashes/memos.
2. **Backend Services**: PostgreSQL `bookings`, `contract_event_logs`, `contract_reconciliation_attempts`, and `admin_audit_logs`.
3. **Supplier Systems**: Airline inventory/GDS (Amadeus, airline partner APIs), PNR reservation states, and ticketing confirmations.
4. **Booking Lifecycle Records**: High-level booking states (`created`, `awaiting_payment`, `payment_processing`, `paid`, `onchain_pending`, `onchain_submitted`, `confirmed`, `failed`, `refunded`).

---

## 1. Safety and Security Rules

Operators must observe strict safeguards during any reconciliation investigation:
- **Least Privilege Access**: Performing status overrides or recovery actions requires the `booking:reconcile` permission. Read-only operators (such as Support) may view states but cannot mutate records.
- **Data Privacy & PII**: Never export, display, or paste unencrypted passenger Personally Identifiable Information (PII) such as passenger names, email addresses, phone numbers, or passport numbers into ticket logs or chat channels. Reconcile records strictly by `bookingId`, Stellar transaction hash (`txHash`), and deterministic booking memo references.
- **Credential Protection**: Never request or handle traveler private keys or seed phrases. Stellar transactions are strictly non-custodial and signed by traveler wallets.
- **Mandatory Idempotency**: All mutation calls must include a unique `Idempotency-Key` header and a non-empty `reason` field documenting the operational justification.

---

## 2. System Boundaries and Authoritative Sources

| Domain | Authoritative Store | Reconciliation Signal |
| --- | --- | --- |
| **Wallet / Chain** | Stellar Ledger & Soroban State | Contract escrow balance, transaction confirmation (`success`/`failed`), `(booking, paid)` and `(booking, released)` events. |
| **Backend** | PostgreSQL Database | `bookings.status`, `contract_event_logs`, and recorded `contract_reconciliation_attempts`. |
| **Supplier** | Airline GDS / Amadeus | Supplier PNR, ticket status (`ISSUED`, `CONFIRMED`, `CANCELLED`), and seat assignment confirmation. |
| **Booking** | Traqora Booking Orchestrator | Composite customer status displayed to travelers and operators in the Booking Operations View. |

---

## 3. Automated Reconciliation Pipeline

Traqora runs background reconciliation to catch transient network drift without manual intervention:
1. **Event Ingestion**: `contract_event_logs` indexes verified ledger events (`created`, `paid`, `released`, `refunded`).
2. **Reconciliation Job**: `contractBookingReconciliationJob` evaluates un-reconciled bookings against the event archive:
   - Event `paid` -> transitions booking to `paid`.
   - Event `released` -> transitions booking to `confirmed`.
   - Event `refunded` -> transitions booking to `refunded`.
3. **Audit Trail**: Every automated repair records a row in `contract_reconciliation_attempts` (`repaired`, `detected`, or `failed`).

Operators should check `/api/v1/admin/operations` (see [BOOKING_OPERATIONS_VIEW.md](BOOKING_OPERATIONS_VIEW.md)) before taking manual actions.

---

## 4. Manual Operator Reconciliation Workflows

When automated reconciliation flags a mismatch (`reconciliationStatus = needs_review` or prolonged `onchain_pending`), operators follow this decision procedure:

### Scenario A: On-Chain Payment Confirmed, Backend Still Pending (`onchain_pending` / `onchain_submitted`)
- **Symptoms**: Traveler wallet shows funds deducted; StellarExpert confirms successful contract invocation with `paid` event; Traqora backend remains in `onchain_pending`.
- **Diagnosis**: Event indexer lag or temporary database connection dropped during webhook callback.
- **Procedure**:
  1. Verify the transaction hash on StellarExpert or Stellar RPC.
  2. Confirm the destination contract address and escrowed amount match the booking total.
  3. If supplier PNR has not been issued yet, invoke recovery action to prompt re-confirmation:
     ```bash
     POST /api/v1/admin/bookings/:id/recovery
     Header: Idempotency-Key: recon-<booking-id>-<timestamp>
     Body: { "action": "retry_confirmation", "reason": "Verified on-chain payment tx <txHash>; retrying supplier confirmation" }
     ```
  4. If supplier PNR is already issued, update booking status to `confirmed`:
     ```bash
     PATCH /api/v1/admin/bookings/:id/status
     Body: { "status": "confirmed", "reason": "Reconciled with confirmed Stellar tx <txHash> and supplier PNR" }
     ```

### Scenario B: Backend Marked Paid, Supplier Ticket Issuance Failed
- **Symptoms**: Contract holds escrow; backend status is `paid`; supplier API returned error or timeout without issuing PNR.
- **Diagnosis**: Airline inventory became unavailable, fare expired before lock, or supplier endpoint timed out.
- **Procedure**:
  1. Check supplier console for booking reference / request reference.
  2. If the seat is not reserved and cannot be secured, do **NOT** mark as `confirmed`.
  3. Mark the booking as failed to prevent stuck state:
     ```bash
     POST /api/v1/admin/bookings/:id/recovery
     Header: Idempotency-Key: recon-<booking-id>-<timestamp>
     Body: { "action": "mark_failed", "reason": "Supplier seat unavailable after payment; initiated escrow release" }
     ```
  4. Escalate to refund workflow (see [refund-reconciliation.md](refund-reconciliation.md)) to trigger `refund_passenger` on the Soroban contract.

### Scenario C: Wallet Transaction Failed or Dropped from Mempool
- **Symptoms**: Booking stuck in `onchain_submitted`; no transaction hash found on Stellar or transaction marked failed.
- **Diagnosis**: Insufficient fee (gas), sequence number mismatch, or user cancelled signature.
- **Procedure**:
  1. Confirm with Stellar RPC that no transaction hash exists or that status is failed.
  2. Confirm zero tokens were transferred into contract escrow.
  3. Mark booking failed via `POST /api/v1/admin/bookings/:id/recovery` (`action: "mark_failed"`).
  4. Notify traveler that payment did not go through and advise retrying checkout.

---

## 5. Escalation Matrix

| Level | Role | Responsibilities |
| --- | --- | --- |
| **L1 Support** | Support Agent | Read-only inspection via Booking Operations View. Gather traveler Stellar address, booking reference, and transaction hash. Verify status without making mutations. |
| **L2 Operations** | Operations Admin (`booking:reconcile`) | Run on-demand reconciliation check, trigger safe recovery actions (`retry_confirmation`, `mark_failed`), update statuses with audit trail. |
| **L3 Engineering** | Contract / Backend Core On-Call | Escrow contract intervention, oracle resynchronization, or unresolved supplier API settlement failures. |
