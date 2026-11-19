# Refund reconciliation and escalation

This document describes v1 refund reconciliation for detecting mismatches between internal refund records, Stripe refund state, and Soroban/on-chain transaction state.

## Goal

Detect refund mismatches and provide audited operator actions with clear escalation criteria.

## Implementation

- Service: `packages/backend/src/services/refundReconciliationService.ts`
- Admin endpoints (authenticated admin): `packages/backend/src/api/routes/refunds.ts`
  - `GET /api/v1/refunds/admin/reconciliation?limit=&statuses=&dryRun=`: runs bounded, on-demand reconciliation and returns findings (audits mismatches unless `dryRun=true`).
  - `POST /api/v1/refunds/:id/reconciliation-action`: records an audited operator action (`investigated`, `escalated`, `resolved`) with notes/next action.
- Audit trail: `refund_audit_log` via `RefundAuditService` (`refund_reconciliation_mismatch`, `refund_reconciliation_investigated`, `refund_reconciliation_escalated`, `refund_reconciliation_resolved`).

## Scope and bounds

- Reconciliation is on-demand and bounded (`limit`, capped) with explicit status filters to avoid unbounded scans and external-provider overload.
- Compared states (when identifiers/state are available): internal refund status/fields, Stripe refund status, Soroban transaction status.

## Mismatch detection (v1)

Examples of detected mismatches:
- Stripe refund failed/canceled while internal state is not failed/rejected, or Stripe succeeded while internal state remains pre-completion.
- Stripe refund expected but missing/unretrievable.
- Soroban transaction failed/not-found/succeeded while internal state conflicts, or Soroban hash missing when on-chain state is expected.
- Internal inconsistencies (e.g. completed without approved amount).

Each finding includes mismatch type, detail, severity, and recommended action.

## Escalation criteria

- **High (escalate):** Any mismatch that risks incorrect funds movement or incorrect customer-facing/financial state (e.g. provider failed/canceled vs internal non-failed, missing expected provider identifiers/records, completed without approved amount). Action: `escalate_ops`.
- **Medium (investigate):** State divergence requiring operator verification/correction without immediate evidence of fund loss (e.g. provider succeeded but internal not completed, tx not found while submitted). Action: `investigate`.
- **Low (retry/check):** Transient/ambiguous lookup issues suitable for recheck. Action: `retry_provider_check`.

Operators must record actions with evidence-backed notes. Resolve only after reconciliation confirms internal and provider/on-chain states agree for the intended outcome.
