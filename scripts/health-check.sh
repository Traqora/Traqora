#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOY_ARTIFACTS_DIR="$PROJECT_DIR/.deployments"

NETWORK="${1:-testnet}"
DEPLOY_TAG="${2:-latest}"

if [ "$DEPLOY_TAG" = "latest" ]; then
    DEPLOY_TAG_PATH=$(readlink "$DEPLOY_ARTIFACTS_DIR/$NETWORK/latest" 2>/dev/null || echo "")
    if [ -z "$DEPLOY_TAG_PATH" ]; then
        echo "Error: No latest deployment found for $NETWORK"
        exit 1
    fi
    DEPLOY_TAG=$(basename "$DEPLOY_TAG_PATH")
fi

CONTRACTS_JSON="$DEPLOY_ARTIFACTS_DIR/$NETWORK/$DEPLOY_TAG/contracts.json"

if [ ! -f "$CONTRACTS_JSON" ]; then
    echo "Error: No deployment artifacts found at $CONTRACTS_JSON"
    exit 1
fi

case "$NETWORK" in
    testnet)
        RPC_URL="${RPC_URL:-https://soroban-testnet.stellar.org:443}"
        NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE:-Test SDF Network ; September 2015}"
        ;;
    mainnet)
        RPC_URL="${RPC_URL:-https://soroban-rpc.stellar.org:443}"
        NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE:-Public Global Stellar Network ; September 2015}"
        ;;
esac

export STELLAR_NETWORK="$NETWORK"
export STELLAR_RPC_URL="$RPC_URL"
export STELLAR_NETWORK_PASSPHRASE="$NETWORK_PASSPHRASE"

echo "=== Health Check: $NETWORK ($DEPLOY_TAG) ==="
echo "RPC: $RPC_URL"
echo ""

HEALTH_STATUS="PASS"

check_contract() {
    local name="$1"
    local contract_id="$2"
    local method="${3:-}"
    local expected_result="${4:-}"

    echo -n "  Checking $name ($contract_id)... "

    if [ -n "$method" ]; then
        result=$(stellar contract invoke \
            --id "$contract_id" \
            --source deployer \
            --network "$NETWORK" \
            -- "$method" 2>&1 || echo "ERROR")
        if [ "$result" = "ERROR" ]; then
            echo "✗ FAILED"
            HEALTH_STATUS="FAIL"
        elif [ -n "$expected_result" ] && [ "$result" != "$expected_result" ]; then
            echo "✗ UNEXPECTED: $result (expected: $expected_result)"
            HEALTH_STATUS="FAIL"
        else
            echo "✓ OK ($result)"
        fi
    else
        echo "✓ DEPLOYED"
    fi
}

for name in $(jq -r 'keys[]' "$CONTRACTS_JSON"); do
    contract_id=$(jq -r ".[\"$name\"]" "$CONTRACTS_JSON")
    check_contract "$name" "$contract_id"
done

echo ""
if [ "$HEALTH_STATUS" = "PASS" ]; then
    echo "=== Health Check PASSED ==="
else
    echo "=== Health Check FAILED ==="
    exit 1
fi
