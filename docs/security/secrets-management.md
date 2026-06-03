# Secrets Management and Security Procedures

## Overview
Traqora uses a multi-layered approach to configuration and secrets management to ensure production security, auditability, and reliability.

## Secrets Management System
Production secrets are managed via the `SecretManager` service, which supports:
- **Local Environment Variables**: For development and non-sensitive staging configs.
- **AWS Secrets Manager**: Integrated for production secrets (DB credentials, API keys, JWT secrets).
- **Google Cloud Secret Manager (GSM)**: Recommended for GCP/multi-cloud deployments. Integrated via the `@google-cloud/secret-manager` client library to load variables dynamically at startup.
- **HashiCorp Vault**: Recommended for platform-agnostic, hybrid, or on-premise secrets orchestration. Integrated via transit engine or direct KV secrets engine fetches using the node-vault API client.
- **Zod Schema Validation**: All configurations are validated at startup. The application will fail to start if required production variables are missing or malformed.

## Key Rotation Policy
To minimize the impact of potential leaks, the following rotation policy is enforced:

| Secret | Rotation Frequency | Method | Recommended Secrets Manager |
| --- | --- | --- | --- |
| **JWT Secrets** | 90 Days | Automatic / Rolling Update | GSM / Vault / AWS Secrets Manager |
| **Database Credentials** | 90 Days | Automatic Rotation | AWS Secrets Manager / GCP Cloud SQL IAM / Vault Dynamic Engine |
| **Admin API Keys** | 180 Days | Manual / API-Driven Rotation | GSM / Vault |
| **Stellar Secret Keys** | As needed | Manual (Requires contract re-auth) | Vault Transit / AWS KMS |

### Rotating JWT Secrets
1. Generate new cryptographically secure 64-character secrets for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
2. Update the values in Google Secret Manager (GSM), HashiCorp Vault, or AWS Secrets Manager.
   - *Example (GSM)*: Create a new version of the secret containing the updated token.
   - *Example (Vault)*: Update the KV engine path `/secret/data/traqora/jwt` with new keys.
3. Perform a rolling restart of the backend services to load the updated secrets without downtime.
   - *Note: Active sessions will remain valid until expiry if the system supports multi-key validation (planned).*

## Infrastructure Health Checks
The application performs mandatory connectivity checks at startup for:
1. **PostgreSQL**: Verifies connection and basic query execution.
2. **Redis**: Verifies connectivity and PING/PONG.
3. **Stellar Horizon**: Verifies network availability.

In **production**, any failure in these checks will prevent the service from starting to avoid inconsistent states.

## Encryption
- **Transit**: All connections to DB, Redis, and Stellar must use TLS in production.
- **Rest**: Sensitive database fields (e.g., specific user PII or operational metadata) are encrypted using `DATABASE_ENCRYPTION_KEY` (AES-256-GCM).

## Audit Logging
When `AUDIT_LOG_ENABLED=true`, all configuration access and security-sensitive actions (like failed logins or rotation checks) are logged to the audit stream with timestamp and source metadata.
