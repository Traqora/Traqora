#!/usr/bin/env bash
# Mainnet / testnet guard for contract deployment scripts — issue #761.
#
# Source this file, then call:
#
#   resolve_network_config <network>
#
# Inputs
#   $1                   Target network: "testnet" or "mainnet".
#   RPC_URL              Optional override of the Soroban RPC endpoint.
#   NETWORK_PASSPHRASE   Optional override of the network passphrase.
#   CONFIRM_MAINNET      Must equal "mainnet" to allow a mainnet target.
#
# Outputs (exported on success)
#   GUARD_NETWORK, GUARD_RPC_URL, GUARD_NETWORK_PASSPHRASE
#
# Errors (message on stderr, non-zero return, nothing exported)
#   2  unknown network
#   3  passphrase does not match the network
#   4  RPC URL is not https, or points at the other network
#   5  mainnet target without CONFIRM_MAINNET=mainnet
#
# See docs/operations/CONTRACT_DEPLOYMENT_RUNBOOK.md ("Network guard").

TESTNET_PASSPHRASE="Test SDF Network ; September 2015"
MAINNET_PASSPHRASE="Public Global Stellar Network ; September 2015"
TESTNET_DEFAULT_RPC="https://soroban-testnet.stellar.org:443"
MAINNET_DEFAULT_RPC="https://soroban-rpc.stellar.org:443"

_guard_fail() {
    local code="$1"
    shift
    echo "Network guard: $*" >&2
    return "$code"
}

_guard_lower() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

resolve_network_config() {
    local network="${1:-}"
    local rpc_url passphrase expected_passphrase other_network lowered_rpc

    unset GUARD_NETWORK GUARD_RPC_URL GUARD_NETWORK_PASSPHRASE

    case "$network" in
        testnet)
            rpc_url="${RPC_URL:-$TESTNET_DEFAULT_RPC}"
            expected_passphrase="$TESTNET_PASSPHRASE"
            other_network="mainnet"
            ;;
        mainnet)
            rpc_url="${RPC_URL:-$MAINNET_DEFAULT_RPC}"
            expected_passphrase="$MAINNET_PASSPHRASE"
            other_network="testnet"
            ;;
        *)
            _guard_fail 2 "unknown network '${network}'. Use 'testnet' or 'mainnet'."
            return
            ;;
    esac

    passphrase="${NETWORK_PASSPHRASE:-$expected_passphrase}"
    if [ "$passphrase" != "$expected_passphrase" ]; then
        _guard_fail 3 "network passphrase '${passphrase}' does not match ${network} (expected '${expected_passphrase}')."
        return
    fi

    lowered_rpc="$(_guard_lower "$rpc_url")"
    case "$lowered_rpc" in
        https://*) ;;
        *)
            _guard_fail 4 "RPC URL '${rpc_url}' must use https."
            return
            ;;
    esac

    if [ "$network" = "mainnet" ]; then
        case "$lowered_rpc" in
            *testnet* | *futurenet* | *localhost* | *127.0.0.1*)
                _guard_fail 4 "RPC URL '${rpc_url}' looks like a ${other_network}/local endpoint but the target is mainnet."
                return
                ;;
        esac
        if [ "${CONFIRM_MAINNET:-}" != "mainnet" ]; then
            _guard_fail 5 "refusing to target mainnet without CONFIRM_MAINNET=mainnet."
            return
        fi
    else
        case "$lowered_rpc" in
            *mainnet* | "$(_guard_lower "$MAINNET_DEFAULT_RPC")" | https://soroban-rpc.stellar.org | https://soroban-rpc.stellar.org/*)
                _guard_fail 4 "RPC URL '${rpc_url}' looks like a ${other_network} endpoint but the target is testnet."
                return
                ;;
        esac
    fi

    export GUARD_NETWORK="$network"
    export GUARD_RPC_URL="$rpc_url"
    export GUARD_NETWORK_PASSPHRASE="$passphrase"
}
