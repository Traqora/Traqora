# GDPR Compliance Assessment

Traqora is designed with privacy-by-design principles to ensure compliance with the General Data Protection Regulation (GDPR).

## 1. Data Controller and Processor
- **Data Controller**: Traqora Team
- **Data Processor**: AWS/Google Cloud (Hosting), Stripe (Payments), Redis (Rate limiting)

## 2. Lawful Basis for Processing
We process personal data under the following lawful bases:
- **Contractual Necessity**: Processing is necessary to fulfill flight bookings.
- **Legitimate Interests**: Security monitoring, rate limiting, and service improvement.
- **Consent**: For optional communication (if applicable).

## 3. Data Subject Rights
Traqora supports the following GDPR rights:
- **Right to be Informed**: Provided via `PRIVACY.md`.
- **Right of Access**: Users can request a copy of their stored data.
- **Right to Erasure (Right to be Forgotten)**: Users can request deletion of their account and PII.
- **Right to Data Portability**: Users can request their data in a machine-readable format.

## 4. Security Measures (Art. 32 GDPR)
- **Encryption at Rest**: All PII (Name, Email, Phone) is encrypted using AES-256-GCM.
- **Encryption in Transit**: All API communication is forced over TLS (HTTPS).
- **Rate Limiting**: Protection against brute-force and DDoS attacks.
- **Access Control**: Role-based access control (RBAC) for admin functions.

## 5. Data Protection Impact Assessment (DPIA)
Given that Traqora processes payment info (via Stripe) and identity info for travel, a DPIA is maintained to identify and mitigate risks.

## 6. Data Breach Notification
In accordance with Art. 33, any significant data breach will be reported to the relevant supervisory authority within 72 hours of becoming aware of it.

## 7. International Data Transfers
Data stored on the Stellar blockchain is distributed globally. Users are informed of the public nature of blockchain transactions.

## 8. Data Retention Schedule (Art. 5(1)(e) — Storage Limitation)

Personal and operational data is retained no longer than necessary. The authoritative windows are implemented in `packages/backend/src/services/DataRetentionService.ts` and `packages/backend/src/services/analytics/dataRetentionService.ts`.

### Audit and compliance records

| Data category | Archived (cold storage) | Deleted | Implementation |
| --- | --- | --- | --- |
| Security audit logs | After 2 years | After 7 years | `DataRetentionService` (`security` policy) |
| Admin audit logs | After 2 years | After 7 years | `DataRetentionService` (`admin` policy) |
| Sensitive operation approvals | After 2 years | After 7 years | `DataRetentionService` (`approvals` policy) |

The 7-year maximum reflects fiscal/legal record-keeping obligations; records move to cold archival storage after 2 years so active systems hold as little PII as possible.

### Right-to-erasure (Right to be Forgotten) workflow

| Stage | Window | Behaviour |
| --- | --- | --- |
| Request received | Day 0 | `POST /users/me/deletion-request` creates an auditable `pending` request |
| Identity verification window | 30 days | Request stays `pending`; user may cancel or confirm |
| Erasure executed | After 30 days | `DataRetentionService.processDeletionRequests()` marks the request `completed` and downstream erasure of the account's PII proceeds |
| Request audit record retained | Up to 90 further days | The request row is kept to evidence lawful processing |
| Permanent deletion | Max 120 days after request | The request record itself is irreversibly deleted |

### Analytics and session data

Configurable via environment variables (defaults shown):

| Data category | Archived | Deleted | Env vars |
| --- | --- | --- | --- |
| Analytics events | 90 days | 365 days | `RETENTION_ARCHIVE_DAYS`, `RETENTION_PURGE_DAYS` |
| Auth sessions | 30 days | 365 days | `RETENTION_SESSION_ARCHIVE_DAYS`, `RETENTION_SESSION_PURGE_DAYS` |
| Analytics audit logs | 180 days | 7 years | `RETENTION_AUDIT_ARCHIVE_DAYS`, `RETENTION_AUDIT_PURGE_DAYS` |

Retention jobs should run at least daily (see `schedulePeriodicArchival()` integration point).
