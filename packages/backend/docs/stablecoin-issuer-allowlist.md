# Stablecoin issuer allowlist (#919)

Validate **both** asset code and issuer against the configured allowlist before
accepting a stablecoin payment or constructing an escrow transaction.

## Expected behavior

- Allowlisted `CODE:ISSUER` pairs (default Circle USDC) are accepted.
- A known code with a different issuer is rejected (`code_issuer_mismatch`).
- Missing code or issuer is rejected (`missing_asset`) — never construct escrow.

## Failure cases

Untrusted issuers never reach `signAndSubmitCreateBooking` or the token/escrow
contracts. Override the list with `STABLECOIN_ALLOWLIST=USDC:G...,USDT:G...`.

Implementation: `packages/backend/src/services/stablecoinIssuerAllowlist.ts`.
Regression: `stablecoinIssuerAllowlist.test.ts`.

The on-chain TRQ token in `contracts/packages/token/` is governance/loyalty, not a
payment stablecoin. Classic-asset USDC (and similar) issuers are checked here
before any escrow transaction is constructed.
