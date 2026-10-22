#!/usr/bin/env bash
set -euo pipefail

# Gas snapshot per release (issue #602).
#
# Captures the compiled byte-size footprint of every contract in a WASM
# directory into a committed snapshot, and (optionally) compares that snapshot
# against a previous release's baseline, failing if any contract grew beyond a
# threshold percentage. Soroban charges CPU/instruction budget in proportion to
# the executed WASM, so byte size is a stable per-release gas proxy.
#
# This is a thin wrapper around the `gas-snapshot` Rust crate
# (contracts/packages/gas_snapshot), which owns the capture/compare logic and
# its regression tests.
#
# Usage:
#   ./scripts/gas-snapshot.sh capture <wasm-dir> <out.json> --release <tag>
#   ./scripts/gas-snapshot.sh compare <current.json> <baseline.json> [--threshold <pct>]
#
# Examples:
#   # Capture the current release snapshot
#   ./scripts/gas-snapshot.sh capture \
#       contracts/target/wasm32-unknown-unknown/release \
#       contracts/gas-snapshots/v0.1.0.json --release v0.1.0
#
#   # Gate a release against the previous snapshot (5% growth allowed)
#   ./scripts/gas-snapshot.sh compare \
#       contracts/gas-snapshots/v0.2.0.json \
#       contracts/gas-snapshots/v0.1.0.json --threshold 5

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v cargo &> /dev/null; then
    echo "Error: cargo is required to run the gas snapshot tool" >&2
    exit 1
fi

# Build once and run the tool with its arguments forwarded verbatim.
exec cargo run --quiet --manifest-path "$REPO_ROOT/contracts/Cargo.toml" \
    -p gas-snapshot -- "$@"
