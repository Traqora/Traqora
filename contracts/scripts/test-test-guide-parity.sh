#!/usr/bin/env bash
#
# test-test-guide-parity.sh - Regression tests for check-test-guide-parity.sh
# (issue #745).
#
# Usage: bash scripts/test-test-guide-parity.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECKER="$SCRIPT_DIR/check-test-guide-parity.sh"

PASSED=0
FAILED=0

pass() {
    PASSED=$((PASSED + 1))
    echo "ok - $1"
}

fail() {
    FAILED=$((FAILED + 1))
    echo "FAIL: $1"
    echo "  exit status: $2"
    echo "  output: $3"
}

assert() {
    local expected="$1" name="$2" status="$3" output="$4"
    if [[ "$status" == "$expected" ]]; then
        pass "$name"
    else
        fail "$name (expected exit $expected)" "$status" "$output"
    fi
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# ---------------------------------------------------------------------------
# Happy path: the guide matches the repository's tests.
# ---------------------------------------------------------------------------

output="$(bash "$CHECKER" 2>&1)"
status=$?
assert 0 "repository TEST_GUIDE is in parity" "$status" "$output"

# ---------------------------------------------------------------------------
# Happy path: a fixture guide matches its fixture tests directory.
# ---------------------------------------------------------------------------

mkdir -p "$TMP_DIR/ok/tests"
cat > "$TMP_DIR/ok/tests/alpha_test.rs" <<'EOF'
#[test]
fn alpha() {}
EOF
cat > "$TMP_DIR/ok/tests/beta_test.rs" <<'EOF'
#[test]
fn beta() {}
EOF
cat > "$TMP_DIR/ok/GUIDE.md" <<'EOF'
# Guide

## Navigating the existing tests

| File | Focus |
| --- | --- |
| `alpha_test.rs`, `beta_test.rs` | Everything. |
EOF

output="$(bash "$CHECKER" --guide "$TMP_DIR/ok/GUIDE.md" --tests-dir "$TMP_DIR/ok/tests" 2>&1)"
status=$?
assert 0 "matching fixture guide passes" "$status" "$output"

# ---------------------------------------------------------------------------
# Failure mode: a test file is missing from the guide.
# ---------------------------------------------------------------------------

cp "$TMP_DIR/ok/tests/beta_test.rs" "$TMP_DIR/ok/tests/gamma_test.rs"
output="$(bash "$CHECKER" --guide "$TMP_DIR/ok/GUIDE.md" --tests-dir "$TMP_DIR/ok/tests" 2>&1)"
status=$?
assert 1 "undocumented test file fails the check" "$status" "$output"
if [[ "$output" == *"gamma_test.rs"* ]]; then
    pass "undocumented file is reported"
else
    fail "undocumented file is reported" "$status" "$output"
fi

# ---------------------------------------------------------------------------
# Failure mode: the guide lists a file that no longer exists.
# ---------------------------------------------------------------------------

rm -f "$TMP_DIR/ok/tests/gamma_test.rs"
cat > "$TMP_DIR/ok/GUIDE.md" <<'EOF'
# Guide

## Navigating the existing tests

| File | Focus |
| --- | --- |
| `alpha_test.rs`, `beta_test.rs`, `ghost_test.rs` | Everything. |
EOF

output="$(bash "$CHECKER" --guide "$TMP_DIR/ok/GUIDE.md" --tests-dir "$TMP_DIR/ok/tests" 2>&1)"
status=$?
assert 1 "stale guide entry fails the check" "$status" "$output"
if [[ "$output" == *"ghost_test.rs"* ]]; then
    pass "stale entry is reported"
else
    fail "stale entry is reported" "$status" "$output"
fi

# ---------------------------------------------------------------------------
# Failure mode: missing inputs are a usage error.
# ---------------------------------------------------------------------------

output="$(bash "$CHECKER" --guide "$TMP_DIR/does-not-exist.md" 2>&1)"
status=$?
assert 2 "missing guide exits 2" "$status" "$output"

# ---------------------------------------------------------------------------

echo
echo "TEST_GUIDE parity regression tests: ${PASSED} passed, ${FAILED} failed"

if [[ "$FAILED" -gt 0 ]]; then
    exit 1
fi
