# Contracts fmt / clippy gate

The quality gate for the Soroban contracts workspace. Implements **issue #743**.

## Why

`make fmt` and `make clippy` did not check what CI checks, and CI itself was
inconsistent between workflows:

| surface | before | problem |
| --- | --- | --- |
| `make fmt` | `cargo fmt --check` | no `--all`, so a newly added workspace member is not covered |
| `make clippy` | `cargo clippy -- -D warnings` | no `--locked`, no `--workspace`, no wasm target, and it pulled in `integration-tests`, which cannot compile for wasm |
| `ci.yml` | `cargo fmt -- --check` + `cargo clippy --locked --target wasm32-unknown-unknown -- -D warnings` | missing `--workspace --exclude integration-tests` |
| `ci-pipeline.yml` | the same, plus `--workspace --exclude integration-tests` | correct, but a different command from `ci.yml` |

A developer running `make clippy` was therefore linting a different crate set
than the pipeline, and neither was formatting every workspace member. There was
also no `rustfmt.toml`, so `cargo fmt` results depended on the installed
rustfmt's defaults.

## The gate

```bash
./scripts/fmt-clippy-check.sh              # everything (this is what CI runs)
./scripts/fmt-clippy-check.sh --only fmt   # formatting only        (make fmt)
./scripts/fmt-clippy-check.sh --only clippy # lints only            (make clippy)
./scripts/fmt-clippy-check.sh --fix        # reformat, then stop
./scripts/fmt-clippy-check.sh --all-targets  # stricter; see below
```

| flag | effect |
| ---- | ------ |
| `--only <stage>` | `fmt`, `clippy` or `all` (default `all`) |
| `--fix` | run `cargo fmt --all` and rewrite the sources; implies `--only fmt` |
| `--all-targets` | also lint for the host target (env: `CONTRACTS_CLIPPY_ALL_TARGETS=1`) |
| `-h`, `--help` | usage, taken from the script's own header comment |

Exit codes: `0` clean, `1` violations, `2` usage error or an unusable
toolchain.

The exact commands it runs:

```bash
cargo fmt --all -- --check
cargo clippy --locked --target wasm32-unknown-unknown \
      --workspace --exclude integration-tests -- -D warnings
# only with --all-targets:
cargo clippy --locked --workspace --all-targets -- -D warnings
```

`integration-tests` is excluded from the wasm pass because it enables
`soroban-sdk`'s `testutils` feature, which does not compile for
`wasm32-unknown-unknown`. It is a native test harness and is never deployed.

## Make targets

```bash
make lint       # the whole gate
make fmt        # formatting only
make clippy     # lints only
make lint-fix   # reformat the sources
```

All four delegate to the script, so there is exactly one definition of the
gate.

## CI

Both `ci.yml` and `ci-pipeline.yml` run a single step:

```yaml
- name: Contracts fmt/clippy gate
  run: bash scripts/fmt-clippy-check.sh
```

## Configuration

`contracts/rustfmt.toml` pins the edition (`2021`, matching
`[workspace.package]`), `max_width = 100` and `newline_style = "Unix"`. Without
an explicit edition rustfmt silently falls back to its 2015 defaults, which is
how a formatting diff can appear on one machine and not another.

## Known pre-existing violations

Making the gate real meant fixing what it found. Two small ones, both folded
into this change:

- **`contracts/packages/flight_registry/src/lib.rs`** was missing
  `#![allow(clippy::too_many_arguments)]`, which the other five contract crates
  (`admin`, `airline`, `booking`, `booking_receipt`, `dispute`) already carry.
  Without it the wasm clippy pass failed: the generated `#[contractimpl]` client
  re-declares the entrypoint signatures, and `add_flight_with_details` has nine
  parameters.
- **Formatting** in `admin_multisig_test.rs`, `flight_booking_test.rs` and
  `proxy_delegate_upgrade_test.rs` did not match rustfmt.

### Not covered by default

`--all-targets` currently fails. The host pass reaches the `integration-tests`
crate and every `#[cfg(test)]` module, which CI has never linted, and there is
accumulated debt there — unused imports, a missing `use access::Role;` in
`packages/upgrade/src/lib.rs`'s test module, and a deprecated
`Env::register_contract` call. That is a separate piece of work, so the flag is
opt-in rather than being switched on here.
