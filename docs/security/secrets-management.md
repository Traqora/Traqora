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

### Transport security

Production and staging configuration is checked at startup by
`packages/backend/src/config/transportSecurity.ts`. The service refuses to start
when any of the following is not explicitly TLS enabled:

| Setting | Accepted production form |
| --- | --- |
| `CORS_ORIGIN`, `FRONTEND_URL` | `https://` |
| `HORIZON_URL`, `SOROBAN_RPC_URL`, `AMADEUS_BASE_URL` | `https://` |
| `DATABASE_URL` | `postgres://` or `postgresql://` with `sslmode=require`, `verify-ca`, or `verify-full` |
| `REDIS_URL` | `rediss://`, or `ssl=true` / `tls=true` |
| `MONGO_URI` | `mongodb+srv://`, or `tls=true` / `ssl=true` |
| `OTLP_TRACE_URL` | `https://`, checked only when tracing is enabled |

Development and test environments are not constrained so local SQLite and
single-node Redis continue to work.

The automated check verifies configuration strings only. It does not confirm
that a remote endpoint presents a valid certificate, that a managed database
enforces TLS, or that storage encryption is enabled. Those checks require
deployment-time verification.

### Managed storage encryption at rest

Complete this checklist for every production environment. Record the evidence
in the deployment ticket.

- [ ] The managed PostgreSQL instance has storage encryption enabled with a provider-managed or customer-managed key.
- [ ] Database backups and snapshots inherit encryption at rest.
- [ ] Redis persistence, when enabled, is encrypted at rest by the managed provider.
- [ ] Object storage buckets holding exports or audit artifacts use server-side encryption.
- [ ] Encryption keys are held in the cloud KMS or secrets manager, never in the repository or application image.
- [ ] Key rotation follows the policy in this document and the rotation is recorded.
- [ ] Logs, metrics, and traces contain no plaintext PII or payment credentials.

Sensitive database fields (for example user PII and operational metadata) are
also encrypted in the application layer with `ENCRYPTION_KEY` using AES-256-GCM.
That is separate from, and does not replace, managed storage encryption at rest.

### Automated coverage

`packages/backend/tests/config/transport-security.test.ts` covers the secure
baseline, equivalent TLS flag forms, all insecure settings in one error,
disabled optional transports, development exemptions, and staging parity.
Run it with:

```bash
cd packages/backend
npx jest --config jest.config.cjs tests/config/transport-security.test.ts --runInBand
```

## Audit Logging
When `AUDIT_LOG_ENABLED=true`, all configuration access and security-sensitive actions (like failed logins or rotation checks) are logged to the audit stream with timestamp and source metadata.

## Secret Scanning (Gitleaks)

CI runs [gitleaks](https://github.com/gitleaks/gitleaks) on every PR and push to `main`, plus a weekly full-history scan (see `.github/workflows/gitleaks.yml` and the `security-gitleaks` job in `.github/workflows/ci-pipeline.yml`). The scan always uses the versioned `.gitleaks.toml` at the repository root so allowlists are reviewed like code, and output is always redacted.

### Updating the baseline when a false positive appears

If gitleaks flags something that is **not** a real secret (e.g. a documentation placeholder like `<YOUR_JWT_TOKEN>`, or a test fixture value):

1. **Confirm it is a false positive.** Verify the value is not (and never was) a real credential. If there is any doubt, treat it as a leak: rotate the credential first — see the rotation policy above — then proceed.
2. **Reproduce locally:**
   ```bash
   gitleaks detect --source . --config .gitleaks.toml --verbose --redact
   ```
3. **Add an allowlist entry to `.gitleaks.toml`.** Prefer the narrowest option that fixes the match:
   - **Single historical commit** — add the fingerprint shown in the gitleaks finding to the `commits` array in `[allowlist]`. The fingerprint format is `<commit>:<file>:<rule>:<line>`. Include a comment explaining *why* it is a false positive and reference the finding/issue.
   - **A known placeholder path** — add a `regexes` entry targeting only that file/path pattern.
   - **A rule misfiring broadly** — adjust the rule's own allowlist rather than disabling the rule globally; do **not** delete rules from the default ruleset.
4. **Never** use broad allows such as an empty regex or a blanket path like `docs/**`; keep entries surgical so new leaks in those areas still surface.
5. **Run the local scan again** and confirm zero findings, then open a PR containing both the allowlist change and the justification in the description.
6. **Keep baselines current**: when CI's weekly full-history scan reports new findings after a gitleaks version bump, triage them the same way — rotate if real, allowlist if false positive.

Threat model context for this control lives in [SECURITY.md](../../SECURITY.md); handling of personal data referenced by scanned artifacts is covered by [GDPR_COMPLIANCE.md](../../GDPR_COMPLIANCE.md).
