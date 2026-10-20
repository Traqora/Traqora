#!/usr/bin/env bash
#
# check-test-guide-parity.sh - Keep TEST_GUIDE.md in sync with the test suite.
#
# TEST_GUIDE.md documents the integration test files under
# "Navigating the existing tests" so contributors can find an example for the
# behavior they are touching. This script fails when that inventory drifts from
# packages/integration-tests/tests/, in either direction.
#
# Contract:
#   input  - the guide markdown and the integration-tests directory
#   output - exit 0 when the documented inventory matches reality, otherwise a
#            report of undocumented and stale entries plus exit 1
#   error  - exit 2 when the guide or tests directory cannot be read
#
# Usage: bash scripts/check-test-guide-parity.sh [--guide PATH] [--tests-dir PATH]

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

GUIDE="$CONTRACTS_DIR/TEST_GUIDE.md"
TESTS_DIR="$CONTRACTS_DIR/packages/integration-tests/tests"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --guide)
            GUIDE="${2:-}"
            shift 2
            ;;
        --tests-dir)
            TESTS_DIR="${2:-}"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 2
            ;;
    esac
done

if [[ ! -f "$GUIDE" ]]; then
    echo "Error: guide not found: $GUIDE" >&2
    exit 2
fi
if [[ ! -d "$TESTS_DIR" ]]; then
    echo "Error: tests directory not found: $TESTS_DIR" >&2
    exit 2
fi

DOCUMENTED="$(mktemp)"
ACTUAL="$(mktemp)"
trap 'rm -f "$DOCUMENTED" "$ACTUAL"' EXIT

# Filenames listed in the "Navigating the existing tests" section, e.g.
#   | `booking_test.rs`, `booking_errors_test.rs` | Booking creation, ... |
sed -n '/^## Navigating the existing tests/,/^## /p' "$GUIDE" \
    | grep -oE '[a-z0-9_]+\.rs' \
    | sort -u > "$DOCUMENTED"

for file in "$TESTS_DIR"/*.rs; do
    [[ -e "$file" ]] || continue
    basename "$file"
done | sort -u > "$ACTUAL"

UNDOCUMENTED="$(comm -13 "$DOCUMENTED" "$ACTUAL")"
STALE="$(comm -23 "$DOCUMENTED" "$ACTUAL")"

if [[ -z "$UNDOCUMENTED" && -z "$STALE" ]]; then
    echo "TEST_GUIDE parity OK: $(wc -l < "$ACTUAL" | tr -d ' ') test files documented."
    exit 0
fi

echo "TEST_GUIDE parity check failed." >&2
echo >&2

if [[ -n "$UNDOCUMENTED" ]]; then
    echo "Test files missing from TEST_GUIDE.md (add them to the inventory table):" >&2
    printf '  - %s\n' $UNDOCUMENTED >&2
    echo >&2
fi

if [[ -n "$STALE" ]]; then
    echo "TEST_GUIDE.md references test files that no longer exist (remove them):" >&2
    printf '  - %s\n' $STALE >&2
    echo >&2
fi

echo "Update $GUIDE so its inventory matches $TESTS_DIR." >&2
exit 1
