# Soroban contract configuration validation (#935)

Startup validates every configured Soroban contract ID and the network metadata
that makes those IDs meaningful. Validation is pure and lives in
`src/config/stellarNetwork.ts`; `src/config/index.ts` runs it from
`loadConfig()`.

## Rules

| Check | Result |
| --- | --- |
| Explicit `STELLAR_NETWORK_PASSPHRASE` differs from `STELLAR_NETWORK` | `PASSPHRASE_MISMATCH` |
| Horizon or Soroban RPC host belongs to another network | `HORIZON_NETWORK_MISMATCH` / `SOROBAN_RPC_NETWORK_MISMATCH` |
| `CONTRACTS_NETWORK` differs from `STELLAR_NETWORK` | `CONTRACTS_NETWORK_MISMATCH` |
| Contracts are configured in production/staging without `CONTRACTS_NETWORK` | `CONTRACTS_NETWORK_MISSING` |
| A configured value is not a 56-character `C...` StrKey | `CONTRACT_ID_INVALID` |
| A required contract ID is absent or still `DEFAULT_ID` in production/staging | `CONTRACT_ID_MISSING` |

`CONTRACT_ID_MISSING` and `CONTRACT_ID_INVALID` name the exact environment
entry (for example `REFUND_CONTRACT_ID`) so operators know what to fix. Values
are never echoed in the error, so malformed values cannot leak credentials into
logs. Local development may still run without deployed contracts; once a
non-placeholder value is configured it must be valid in every environment.

## Failure behaviour

In production/staging any issue logs the structured `StellarConfigurationError`
and exits with status 1. In development/test the error is thrown so the caller
can fail fast without silently starting with an unusable contract client.

See also: `docs/operations/CONTRACT_DEPLOYMENT_RUNBOOK.md` and
`docs/ENV_REFERENCE.md`.
