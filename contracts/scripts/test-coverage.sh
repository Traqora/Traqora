#!/usr/bin/env bash
#
# test-coverage.sh - Regression tests for contracts/coverage.sh (issue #746).
#
# Verifies that the wrapper enforces the same line-coverage gate as CI and that
# invalid usage fails with exit code 2 instead of running cargo. Every case runs
# in --dry-run mode or fails during argument parsing, so cargo is never invoked.
#
# Usage: bash scripts/test-coverage.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COVERAGE="$SCRIPT_DIR/../coverage.sh"

PASSED=0
FAILED=0
LAST_OUT=""
LAST_STATUS=0

run_coverage() {
    LAST_OUT="$("$COVERAGE" "$@" 2>&1)"
    LAST_STATUS=$?
}

fail() {
    FAILED=$((FAILED + 1))
    echo "FAIL: $1"
    echo "  exit status: $LAST_STATUS"
    echo "  output: $LAST_OUT"
}

pass() {
    PASSED=$((PASSED + 1))
    echo "ok - $1"
}

assert_status() {
    local expected="$1" name="$2"
    if [[ "$LAST_STATUS" == "$expected" ]]; then
        pass "$name"
    else
        fail "$name (expected exit $expected)"
    fi
}

assert_contains() {
    local needle="$1" name="$2"
    if [[ "$LAST_OUT" == *"$needle"* ]]; then
        pass "$name"
    else
        fail "$name (expected output to contain: $needle)"
    fi
}

assert_not_contains() {
    local needle="$1" name="$2"
    if [[ "$LAST_OUT" != *"$needle"* ]]; then
        pass "$name"
    else
        fail "$name (expected output NOT to contain: $needle)"
    fi
}

# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

run_coverage --help
assert_status 0 "--help exits 0"
assert_contains "Usage: ./coverage.sh" "--help prints usage"

run_coverage --dry-run
assert_status 0 "default dry-run exits 0"
assert_contains "cargo test --locked" "default dry-run runs locked tests"
assert_contains "--summary-only" "default dry-run prints a summary report"
assert_contains "--fail-under-lines 90" "default threshold mirrors the CI gate (90)"

run_coverage --dry-run --threshold 75
assert_status 0 "custom threshold dry-run exits 0"
assert_contains "--fail-under-lines 75" "custom threshold is passed to llvm-cov"

run_coverage --dry-run --no-fail
assert_status 0 "--no-fail dry-run exits 0"
assert_not_contains "--fail-under-lines" "--no-fail omits the threshold gate"

run_coverage --dry-run --html
assert_status 0 "--html dry-run exits 0"
assert_contains "--html" "--html requests an HTML report"
assert_contains "--output-dir target/coverage" "--html writes to target/coverage"
assert_not_contains "--summary-only" "--html does not also request the text summary"

run_coverage --dry-run --open
assert_status 0 "--open dry-run exits 0"
assert_contains "--output-dir target/coverage" "--open implies an HTML report"

# ---------------------------------------------------------------------------
# Failure modes
# ---------------------------------------------------------------------------

run_coverage --threshold abc
assert_status 2 "non-numeric threshold exits 2"
assert_contains "invalid --threshold" "non-numeric threshold reports the value"

run_coverage --threshold 101
assert_status 2 "out-of-range threshold exits 2"

run_coverage --threshold -5
assert_status 2 "negative threshold exits 2"

run_coverage --threshold
assert_status 2 "missing threshold value exits 2"
assert_contains "--threshold requires" "missing threshold value reports the option"

run_coverage --unknown-option
assert_status 2 "unknown option exits 2"
assert_contains "unknown option" "unknown option is reported"

# ---------------------------------------------------------------------------

echo
echo "coverage.sh regression tests: ${PASSED} passed, ${FAILED} failed"

if [[ "$FAILED" -gt 0 ]]; then
    exit 1
fi
