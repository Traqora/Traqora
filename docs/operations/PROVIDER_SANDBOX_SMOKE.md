# Provider sandbox smoke checks

Issue #916. Before deployment promotion, Traqora runs a credential-safe smoke
check against each configured airline-provider sandbox. The check authenticates
and performs a one-offer search. Secrets and access tokens are never logged.

## When it runs

- CD workflow job `provider-sandbox-smoke` in `.github/workflows/cd.yml` runs
  after environment selection and **before** Docker build / deploy.
- Local / CI unit tests mock HTTP and cover success, auth failure, and retry.

## Configuration

Uses existing Amadeus sandbox variables:

- `AMADEUS_CLIENT_ID`
- `AMADEUS_CLIENT_SECRET`
- `AMADEUS_BASE_URL` (defaults to `https://test.api.amadeus.com`)

If credentials are unset, the provider is **skipped** and the job succeeds so
forks and local CD dry-runs are not blocked.

## Failure cases

| Case | Result |
| --- | --- |
| Missing credentials | skipped, success |
| Auth non-2xx or missing `access_token` | fail |
| Search non-2xx or payload without `data` | retry once, then fail |
| Network error on search | retry once, then fail (secrets redacted) |

## Operator command

```bash
npx ts-node --project packages/backend/tsconfig.json \
  packages/backend/scripts/run-provider-sandbox-smoke.ts
```

Exit code 0 on skip-or-pass, 1 on auth/search failure.
