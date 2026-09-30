#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOY_ARTIFACTS_DIR="$PROJECT_DIR/.deployments"

# Usage:
#   health-check.sh [network] [tag] [--api-url <url>] [--skip-contracts]
#
# --api-url <url>   additionally runs HTTP health + smoke checks against a
#                   deployed application instance (used by the canary stage,
#                   issue #591).
# --skip-contracts  skip on-chain contract checks (use with --api-url when
#                   deployment artifacts are not available, e.g. the canary
#                   stage of cd-testnet.yml / cd-mainnet.yml).

API_URL="${API_URL:-}"
SKIP_CONTRACTS=0

POSITIONAL=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --api-url)
            API_URL="${2:-}"
            shift 2
            ;;
        --skip-contracts)
            SKIP_CONTRACTS=1
            shift
            ;;
        *)
            POSITIONAL+=("$1")
            shift
            ;;
    esac
done

NETWORK="${POSITIONAL[0]:-testnet}"
DEPLOY_TAG="${POSITIONAL[1]:-latest}"

if [ "$DEPLOY_TAG" = "latest" ]; then
    DEPLOY_TAG_PATH=$(readlink "$DEPLOY_ARTIFACTS_DIR/$NETWORK/latest" 2>/dev/null || echo "")
    if [ -z "$DEPLOY_TAG_PATH" ]; then
        if [ "$SKIP_CONTRACTS" -eq 1 ]; then
            DEPLOY_TAG="latest"
        else
            echo "Error: No latest deployment found for $NETWORK"
            exit 1
        fi
    else
        DEPLOY_TAG=$(basename "$DEPLOY_TAG_PATH")
    fi
fi

CONTRACTS_JSON="$DEPLOY_ARTIFACTS_DIR/$NETWORK/$DEPLOY_TAG/contracts.json"

if [ "$SKIP_CONTRACTS" -eq 0 ] && [ ! -f "$CONTRACTS_JSON" ]; then
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
        NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE:-Public Global Stellar Network ; October 2015}"
        ;;
    *)
        if [ "$SKIP_CONTRACTS" -eq 0 ]; then
            echo "Error: Unknown network '$NETWORK'. Use 'testnet' or 'mainnet'."
            exit 1
        fi
        ;;
esac

export STELLAR_NETWORK="$NETWORK"
export STELLAR_RPC_URL="$RPC_URL"
export STELLAR_NETWORK_PASSPHRASE="$NETWORK_PASSPHRASE"

echo "=== Health Check: $NETWORK ($DEPLOY_TAG) ==="
echo "RPC: $RPC_URL"
echo ""

HEALTH_STATUS="PASS"

# ----------------------------------------------------------------------------
# API health + smoke checks (issue #591 canary verification)
# ----------------------------------------------------------------------------

check_api_health() {
    local url="$1"
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url/health" 2>/dev/null || true)
    http_code="${http_code:-000}"
    if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
        echo "  ✓ API health check passed (HTTP $http_code)"
    else
        echo "  ✗ API health check failed (HTTP $http_code)"
        HEALTH_STATUS="FAIL"
    fi
}

run_api_checks() {
    local url="$1"
    echo "--- API checks against $url ---"

    # 1. Health endpoint — the readiness signal.
    check_api_health "$url"

    # 2. Metrics endpoint — informational (Prometheus scrape target).
    local metrics_code
    metrics_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url/metrics" 2>/dev/null || true)
    metrics_code="${metrics_code:-000}"
    echo "  Metrics endpoint: HTTP $metrics_code"

    # 3. Root endpoint — the app is actually serving.
    local root_code
    root_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url/" 2>/dev/null || true)
    root_code="${root_code:-000}"
    if [ "$root_code" = "200" ]; then
        echo "  ✓ Root endpoint responded (HTTP $root_code)"
    else
        echo "  ✗ Root endpoint failed (HTTP $root_code)"
        HEALTH_STATUS="FAIL"
    fi

    echo ""
}

if [ -n "$API_URL" ]; then
    run_api_checks "$API_URL"
fi

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

if [ "$SKIP_CONTRACTS" -eq 0 ]; then
    for name in $(jq -r 'keys[]' "$CONTRACTS_JSON"); do
        contract_id=$(jq -r ".[\"$name\"]" "$CONTRACTS_JSON")
        check_contract "$name" "$contract_id"
    done
else
    echo "On-chain contract checks skipped (--skip-contracts)"
fi

if [ "$SKIP_CONTRACTS" -eq 1 ] && [ -z "$API_URL" ]; then
    echo "Error: --skip-contracts requires --api-url (nothing to check)"
    exit 1
fi

echo ""
if [ "$HEALTH_STATUS" = "PASS" ]; then
    echo "=== Health Check PASSED ==="
else
    echo "=== Health Check FAILED ==="
    exit 1
fi
