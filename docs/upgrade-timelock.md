# Upgrade timelock enforcement

Soroban upgrades stay behind a **48-hour** (172800 second) timelock.

## Inputs

- `schedule_upgrade(admin, wasm_hash)` records the current ledger timestamp
- `execute_upgrade(admin)` succeeds only after 172800 seconds
- `set_timelock_duration(owner, duration)` may raise the delay, never shorten it below 48 hours

## Outputs

- Pending upgrades expose remaining seconds via `get_upgrade_timelock_remaining`
- Executing before the delay panics with `Timelock period not yet elapsed`

## Error cases

- Immediate execute after schedule → panic
- Duration `0` or `< 172800` → panic
- Non-admin schedule / non-owner cancel → panic

Regression tests live in `contracts/packages/upgrade/src/lib.rs`.
