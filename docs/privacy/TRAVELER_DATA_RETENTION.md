# Traveler data retention and deletion, v1

This document maps traveler personal data in the v1 booking journey to its purpose, lawful basis, retention period, deletion behavior, and legal exceptions. It is the human-readable counterpart of `packages/backend/src/services/governance/travelerDataRetention.ts`. That registry is the single source of truth and is exposed through `DataRetentionService.getTravelerDataPolicies()`.

The scope is the documented v1 journey: flight search, offer selection, passenger entry, payment confirmation, on-chain submission, booking retrieval, cancellation, and refunds. This document does not add collection of new data types.

## Data map

| Category | Stored fields | Purpose and lawful basis | Retention | Deletion behavior | Legal exceptions |
| --- | --- | --- | --- | --- | --- |
| Account | `walletAddress`, `walletType`, `createdAt`, `lastLoginAt` | Authenticate the traveler. Contract. | Account lifetime. Erased after a verified deletion request is executed. | Included in the data export. Erasure follows the verified deletion request workflow. | Security audit records, fraud investigation, legal claims. |
| Profile | `displayName`, `bio`, `avatarUrl`, `travelPreferences`, notification channel flags | Personalize travel and control notifications. Consent. | Until updated or erased with the account. | Removed with the account. Notification preferences stop future messages. | Consent evidence records, legal claims. |
| Passenger | Encrypted `email`, `firstName`, `lastName`, `phone`, `sorobanAddress` | Issue tickets and contact the traveler. Contract. | Booking lifecycle and related refund or dispute window. | Not in the wallet data export in v1 because passenger rows have no wallet foreign key. Erasure is matched by `passenger.sorobanAddress` during the verified deletion workflow. | Active or recent bookings, refunds and chargebacks, fraud investigation, legal claims. |
| Travel documents | Encrypted document number, full name, issuing country, nationality, date of birth, verification status | Verify identity and meet travel-document requirements. Legal obligation. | Until the traveler deletes the document or the account is erased. | `deleteDocument()` sets `isDeleted` and `deletedAt` immediately and hidden reads exclude the record. Encrypted field scrubbing is an operational follow-up in v1. | Identity verification disputes, regulatory KYC checks, legal claims. |
| Search history | Airport codes, date, passenger count, cabin class, creation time | Revisit and clear recent or saved searches. Legitimate interests. | Until the traveler removes an entry or clears the stored searches. | Wallet-scoped delete and clear helpers remove rows immediately. | Security investigation records derived from the search. |
| Booking | `id`, `status`, `amountCents`, `idempotencyKey`, Stripe and chain references | Fulfill the flight booking and payment. Contract. | Active lifecycle. Audit copies archive after 2 years and delete after 7 years. | Retained while active or under financial hold. Personal fields are erased through the verified workflow where lawful. Public chain hashes cannot be erased. | Payment and tax records, refunds and chargebacks, fraud investigation, on-chain immutability. |
| Refund | `id`, `bookingId`, `status`, `reason`, `reasonDetails`, amounts, Stripe and chain references | Process refund requests and disputes. Contract. | While open. Audit copies archive after 2 years and delete after 7 years. | Free-text personal details are minimized during erasure where lawful. Financial identifiers are retained under audit exceptions. | Payment and tax records, chargebacks, fraud investigation, legal claims. |
| Notification | Recipient, channel, template, delivery status | Deliver booking, payment, refund, and security messages. Contract. | Until delivery is recorded. Audit copies follow the 2 year archive and 7 year delete policy. | Preferences stop future messages. Historical logs follow audit retention. | Security notifications, fraud investigation, legal claims. |
| Consent | `consentType`, `status`, `consentDetails`, IP address, user agent, timestamps | Prove consent grants and withdrawals. Legal obligation. | Lifetime of the consent, with audit copies for 7 years after withdrawal. | Withdrawal updates the status instead of deleting the record. | Proof of consent, legal claims. |
| Deletion request | `userId`, `status`, `reason`, `requestedAt` | Administer and evidence erasure requests. Legal obligation. | 30 day verification window plus 90 day audit window, at most 120 days total. | `processDeletionRequests()` completes verified requests after 30 days and removes the request row after 120 days. | Open legal dispute, regulatory hold. |
| Audit | Actor, action, resource, resource id, creation time | Detect abuse and record privileged actions. Legitimate interests. | 2 years active, archive after 2 years, delete after 7 years. | `DataRetentionService` archives then removes expired security, admin, and approval logs. Logged PII is minimized by redaction. | Security investigations, regulatory audits, legal claims. |

## Enforcement points

- `DELETION_VERIFICATION_WINDOW_DAYS` and `DELETION_REQUEST_RETENTION_DAYS` in `DataRetentionService` enforce the deletion request windows.
- The `security`, `admin`, and `approvals` retention policies in `DataRetentionService` enforce the 2 year archive and 7 year deletion windows.
- Passenger names, email, phone, and travel document fields are encrypted at rest through the shared encryption transformer.
- The v1 data export covers account and preference records only. The API response explicitly reports the omitted bookings and passengers so omissions are visible instead of silent.
- Search history, saved searches, travel documents, consent withdrawal, and deletion requests have wallet-scoped user actions. Booking and passenger erasure relies on the verified deletion workflow and operational matching.

## Known v1 gaps

- The encrypted field purge after travel document soft deletion is documented but not implemented as a scheduled job in this change set.
- There is no automated hard-delete job for booking and passenger PII. The verified deletion request workflow records the lawful request and downstream erasure remains an operational process.
- Legal holds must be checked before executing erasure for active bookings, refunds, or disputes.

## Verification

`tests/governance/travelerDataRetention.test.ts` checks that the registry covers every category, that each entry has a purpose, retention window, deletion behavior, and exceptions, and that the enforced audit and deletion-request constants match this document.
