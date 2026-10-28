# Gas Snapshots

Per-release gas/byte-size snapshots of every compiled Traqora contract
(issue #602).

## What this is

Soroban charges CPU/instruction budget in proportion to the executed WASM, so
the compiled contract byte size is a stable, environment-independent proxy for
on-chain gas cost. Each release tag records a snapshot here so reviewers and
operators can diff one release against the next and catch per-contract cost
regressions.

## File format

One file per release tag, named `<tag>.json`, e.g. `v0.1.0.json`:

```json
{
  "release": "v0.1.0",
  "generated_at": "2026-01-01T00:00:00Z",
  "contracts": {
    "refund.wasm": 12345,
    "refund_automation.wasm": 23456
  }
}
```

Contract keys are sorted so snapshots diff cleanly.

## Capturing a snapshot

After building the release WASM:

```bash
./scripts/gas-snapshot.sh capture \
  contracts/target/wasm32-unknown-unknown/release \
  contracts/gas-snapshots/v0.1.0.json \
  --release v0.1.0
```

## Comparing against a previous release

```bash
./scripts/gas-snapshot.sh compare \
  contracts/gas-snapshots/v0.2.0.json \
  contracts/gas-snapshots/v0.1.0.json \
  --threshold 5
```

The compare command exits non-zero when any contract grows by more than
`--threshold` percent (default `5`), or when a contract present in the baseline
is missing from the current snapshot. New contracts and size reductions are
never treated as regressions.

## CI

The `gas-snapshot` job in `.github/workflows/cd.yml` runs on `v*` tags. It
captures the snapshot for the tag and compares it against the most recent
previously committed snapshot, failing the release on a regression beyond 5%.

## Tests

The capture/compare logic lives in the `gas-snapshot` crate
(`contracts/packages/gas_snapshot`) and is covered by regression tests:

```bash
cd contracts && cargo test -p gas-snapshot
```
