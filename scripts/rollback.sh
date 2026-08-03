#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOY_ARTIFACTS_DIR="$PROJECT_DIR/.deployments"

NETWORK="${1:-testnet}"
TARGET_TAG="${2:-}"

if [ -z "$TARGET_TAG" ]; then
    echo "Available deployments for $NETWORK:"
    ls -1 "$DEPLOY_ARTIFACTS_DIR/$NETWORK/" 2>/dev/null | grep -v latest || echo "  (none)"
    echo ""
    read -r -p "Enter deployment tag to rollback to: " TARGET_TAG
fi

ROLLBACK_DIR="$DEPLOY_ARTIFACTS_DIR/$NETWORK/$TARGET_TAG"

if [ ! -d "$ROLLBACK_DIR" ]; then
    echo "Error: Deployment '$TARGET_TAG' not found for $NETWORK"
    exit 1
fi

echo "=== Rolling Back Contracts ($NETWORK) to $TARGET_TAG ==="
echo ""

CURRENT_LATEST=$(readlink "$DEPLOY_ARTIFACTS_DIR/$NETWORK/latest" 2>/dev/null || echo "unknown")
echo "Current deployment: $CURRENT_LATEST"
echo "Target deployment:  $TARGET_TAG"
echo ""

if [ "$CURRENT_LATEST" = "$TARGET_TAG" ]; then
    echo "Already at target tag. Nothing to do."
    exit 0
fi

STELLAR_SECRET_KEY="${STELLAR_SECRET_KEY:-}"
if [ -z "$STELLAR_SECRET_KEY" ]; then
    echo "Error: STELLAR_SECRET_KEY environment variable is required."
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

stellar network add \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    "$NETWORK" 2>/dev/null || true

printf '%s' "$STELLAR_SECRET_KEY" | stellar keys generate deployer --secret-key 2>/dev/null || true

CONTRACTS_JSON="$ROLLBACK_DIR/contracts.json"
if [ ! -f "$CONTRACTS_JSON" ]; then
    echo "Error: No contracts.json found in $ROLLBACK_DIR"
    exit 1
fi

echo "Contracts to rollback:"
for name in $(jq -r 'keys[]' "$CONTRACTS_JSON"); do
    contract_id=$(jq -r ".[\"$name\"]" "$CONTRACTS_JSON")
    echo "  $name -> $contract_id"
done

echo ""
echo -n "Proceed with rollback? (y/N): "
read -r confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Rollback cancelled."
    exit 0
fi

ROLLBACK_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ROLLBACK_LOG="$DEPLOY_ARTIFACTS_DIR/$NETWORK/rollback-$ROLLBACK_TIMESTAMP.log"

{
    echo "Rollback initiated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo "From: $CURRENT_LATEST"
    echo "To: $TARGET_TAG"
    echo "Network: $NETWORK"
    echo ""
    echo "Contracts:"
    for name in $(jq -r 'keys[]' "$CONTRACTS_JSON"); do
        contract_id=$(jq -r ".[\"$name\"]" "$CONTRACTS_JSON")
        echo "  $name: $contract_id"
    done
} | tee "$ROLLBACK_LOG"

CURRENT_LINK="$DEPLOY_ARTIFACTS_DIR/$NETWORK/latest"
rm -f "$CURRENT_LINK"
ln -s "$TARGET_TAG" "$CURRENT_LINK"

echo ""
echo "=== Rollback Complete ==="
echo "Deployment pointer updated to: $TARGET_TAG"
echo "Rollback log saved to: $ROLLBACK_LOG"
