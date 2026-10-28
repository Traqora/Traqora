#!/usr/bin/env bash
set -euo pipefail

# Event documentation drift check.
#
# Verifies that contracts/EVENTS.md stays in sync with the events the contracts
# actually emit. Off-chain indexers and monitoring depend on that table being
# accurate, so this check fails when an event is emitted but undocumented, or
# documented but no longer emitted.
#
# This is a thin wrapper around the `events-docs-check` Rust crate
# (contracts/packages/events_docs_check), which owns the extraction/diff logic
# and its regression tests.
#
# Usage:
#   ./scripts/check-events-docs.sh
#
# Exits non-zero when EVENTS.md drifts from the contract sources.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v cargo &> /dev/null; then
    echo "Error: cargo is required to run the events docs check" >&2
    exit 1
fi

# Build once and run the checker against the contract sources and the doc.
exec cargo run --quiet --manifest-path "$REPO_ROOT/contracts/Cargo.toml" \
    -p events-docs-check -- "$REPO_ROOT/contracts/packages" "$REPO_ROOT/contracts/EVENTS.md"
