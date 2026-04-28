# Secrets Management and Security Procedures

## Overview
Traqora uses a multi-layered approach to configuration and secrets management to ensure production security, auditability, and reliability.

## Secrets Management System
Production secrets are managed via the `SecretManager` service, which supports:
- **Local Environment Variables**: For development and non-sensitive staging configs.
- **AWS Secrets Manager**: Recommended for production secrets (DB credentials, API keys, JWT secrets).
- **Zod Schema Validation**: All configurations are validated at startup. The application will fail to start if required production variables are missing or malformed.

## Key Rotation Policy
To minimize the impact of potential leaks, the following rotation policy is enforced:

| Secret | Rotation Frequency | Method |
| --- | --- | --- |
| **JWT Secrets** | 90 Days | Automatic (Triggered by SecretManager) |
| **Database Credentials** | 90 Days | AWS Secrets Manager Managed Rotation |
| **Admin API Keys** | 180 Days | Manual Rotation |
| **Stellar Secret Keys** | As needed | Manual (Requires contract re-authorization) |

### Rotating JWT Secrets
1. Generate new 64-character secrets for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
2. Update the values in AWS Secrets Manager.
3. Perform a rolling restart of the backend services.
   *Note: Active sessions will remain valid until expiry if the system supports multi-key validation (planned).*

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
