#!/usr/bin/env bash
# Regression tests for scripts/lib/network-guard.sh (issue #761).
# Run: bash scripts/tests/network-guard.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/network-guard.sh
source "$SCRIPT_DIR/../lib/network-guard.sh"

PASS=0
FAIL=0

# run_guard <network> [VAR=value ...]
# Runs resolve_network_config in a subshell with only the given overrides set.
# Prints "<exit code>|<GUARD_NETWORK>|<GUARD_RPC_URL>|<GUARD_NETWORK_PASSPHRASE>|<stderr>".
run_guard() {
    local network="$1"
    shift
    (
        unset RPC_URL NETWORK_PASSPHRASE CONFIRM_MAINNET
        for assignment in "$@"; do export "${assignment?}"; done
        errfile="$(mktemp)"
        resolve_network_config "$network" 2>"$errfile"
        code=$?
        err="$(cat "$errfile")"
        rm -f "$errfile"
        printf '%s|%s|%s|%s|%s' "$code" "${GUARD_NETWORK:-}" "${GUARD_RPC_URL:-}" "${GUARD_NETWORK_PASSPHRASE:-}" "$err"
    )
}

expect() {
    local name="$1" actual="$2" expected="$3"
    if [ "$actual" = "$expected" ]; then
        PASS=$((PASS + 1))
        echo "ok   - $name"
    else
        FAIL=$((FAIL + 1))
        echo "FAIL - $name"
        echo "       expected: $expected"
        echo "       actual:   $actual"
    fi
}

field() { printf '%s' "$1" | cut -d'|' -f"$2"; }

# --- Happy paths -------------------------------------------------------------

out="$(run_guard testnet)"
expect "testnet defaults" "$out" \
    "0|testnet|https://soroban-testnet.stellar.org:443|Test SDF Network ; September 2015|"

out="$(run_guard mainnet CONFIRM_MAINNET=mainnet)"
expect "mainnet defaults with confirmation" "$out" \
    "0|mainnet|https://soroban-rpc.stellar.org:443|Public Global Stellar Network ; September 2015|"

out="$(run_guard testnet RPC_URL=https://rpc.example-testnet.io)"
expect "testnet honours RPC_URL override" "$(field "$out" 1)|$(field "$out" 3)" \
    "0|https://rpc.example-testnet.io"

out="$(run_guard mainnet CONFIRM_MAINNET=mainnet RPC_URL=https://rpc.example.io "NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015")"
expect "mainnet honours matching overrides" "$(field "$out" 1)|$(field "$out" 3)" \
    "0|https://rpc.example.io"

# --- Failure modes -----------------------------------------------------------

out="$(run_guard futurenet)"
expect "unknown network rejected (2)" "$(field "$out" 1)|$(field "$out" 2)" "2|"
expect "unknown network message" "$(field "$out" 5)" \
    "Network guard: unknown network 'futurenet'. Use 'testnet' or 'mainnet'."

out="$(run_guard "")"
expect "empty network rejected (2)" "$(field "$out" 1)" "2"

out="$(run_guard mainnet)"
expect "mainnet without confirmation rejected (5)" "$(field "$out" 1)|$(field "$out" 2)" "5|"
expect "mainnet confirmation message" "$(field "$out" 5)" \
    "Network guard: refusing to target mainnet without CONFIRM_MAINNET=mainnet."

out="$(run_guard mainnet CONFIRM_MAINNET=yes)"
expect "mainnet with wrong confirmation value rejected (5)" "$(field "$out" 1)" "5"

out="$(run_guard mainnet CONFIRM_MAINNET=mainnet "NETWORK_PASSPHRASE=Test SDF Network ; September 2015")"
expect "mainnet with testnet passphrase rejected (3)" "$(field "$out" 1)|$(field "$out" 2)" "3|"

out="$(run_guard testnet "NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015")"
expect "testnet with mainnet passphrase rejected (3)" "$(field "$out" 1)" "3"

out="$(run_guard mainnet CONFIRM_MAINNET=mainnet "NETWORK_PASSPHRASE=Public Global Stellar Network ; October 2015")"
expect "mainnet with misspelled passphrase rejected (3)" "$(field "$out" 1)" "3"

out="$(run_guard mainnet CONFIRM_MAINNET=mainnet RPC_URL=https://soroban-testnet.stellar.org:443)"
expect "mainnet with testnet RPC rejected (4)" "$(field "$out" 1)|$(field "$out" 3)" "4|"

out="$(run_guard mainnet CONFIRM_MAINNET=mainnet RPC_URL=https://localhost:8000)"
expect "mainnet with local RPC rejected (4)" "$(field "$out" 1)" "4"

out="$(run_guard testnet RPC_URL=https://soroban-rpc.stellar.org:443)"
expect "testnet with mainnet default RPC rejected (4)" "$(field "$out" 1)" "4"

out="$(run_guard testnet RPC_URL=https://soroban-rpc.mainnet.stellar.org:443)"
expect "testnet with mainnet-named RPC rejected (4)" "$(field "$out" 1)" "4"

out="$(run_guard testnet RPC_URL=http://soroban-testnet.stellar.org)"
expect "plain http RPC rejected (4)" "$(field "$out" 1)" "4"

# Checks run before confirmation: a misconfigured mainnet target fails on the
# config error even when confirmation is missing.
out="$(run_guard mainnet RPC_URL=https://soroban-testnet.stellar.org)"
expect "mainnet RPC mismatch reported before confirmation" "$(field "$out" 1)" "4"

# --- deploy-contracts.sh integration -----------------------------------------
# The guard must stop the deploy script before it builds, deploys or writes artifacts.

DEPLOY_SCRIPT="$SCRIPT_DIR/../deploy-contracts.sh"
ARTIFACTS_DIR="$SCRIPT_DIR/../../.deployments"
guard_tag="network-guard-test-$$"

deploy_out="$(env -u CONFIRM_MAINNET -u RPC_URL -u NETWORK_PASSPHRASE STELLAR_SECRET_KEY=SDUMMY \
    bash "$DEPLOY_SCRIPT" mainnet "$guard_tag" 2>&1)"
deploy_code=$?
expect "deploy-contracts.sh mainnet without confirmation exits 5" "$deploy_code" "5"
expect "deploy-contracts.sh stops before deploying" \
    "$(printf '%s' "$deploy_out" | grep -c 'Deploying Contracts')" "0"
expect "deploy-contracts.sh writes no artifacts" \
    "$([ -e "$ARTIFACTS_DIR/mainnet/$guard_tag" ] && echo present || echo absent)" "absent"

deploy_out="$(env -u CONFIRM_MAINNET -u RPC_URL NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015" \
    STELLAR_SECRET_KEY=SDUMMY bash "$DEPLOY_SCRIPT" testnet "$guard_tag" 2>&1)"
expect "deploy-contracts.sh testnet with mainnet passphrase exits 3" "$?" "3"

echo ""
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
