#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONTRACTS_DIR="$PROJECT_DIR/contracts"
DEPLOY_ARTIFACTS_DIR="$PROJECT_DIR/.deployments"

NETWORK="${1:-testnet}"
DEPLOY_TAG="${2:-$(date +%Y%m%d-%H%M%S)}"
VERIFY="${3:-false}"

RPC_URL=""
NETWORK_PASSPHRASE=""
STELLAR_SECRET_KEY="${STELLAR_SECRET_KEY:-}"

case "$NETWORK" in
    testnet)
        RPC_URL="${RPC_URL:-https://soroban-testnet.stellar.org:443}"
        NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE:-Test SDF Network ; September 2015}"
        ;;
    mainnet)
        RPC_URL="${RPC_URL:-https://soroban-rpc.stellar.org:443}"
        NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE:-Public Global Stellar Network ; September 2015}"
        ;;
    *)
        echo "Error: Unknown network '$NETWORK'. Use 'testnet' or 'mainnet'."
        exit 1
        ;;
esac

if [ -z "$STELLAR_SECRET_KEY" ]; then
    echo "Error: STELLAR_SECRET_KEY environment variable is required."
    exit 1
fi

echo "=== Deploying Contracts to $NETWORK ==="
echo "Tag: $DEPLOY_TAG"
echo "RPC: $RPC_URL"
echo ""

mkdir -p "$DEPLOY_ARTIFACTS_DIR/$NETWORK/$DEPLOY_TAG"

if ! command -v stellar &> /dev/null; then
    echo "Installing Stellar CLI..."
    cargo install --locked stellar-cli
fi

echo "Configuring network $NETWORK..."
stellar network add \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    "$NETWORK" 2>/dev/null || true

echo "Configuring deployer identity..."
printf '%s' "$STELLAR_SECRET_KEY" | stellar keys generate deployer --secret-key 2>/dev/null || true

echo ""
echo "Building contracts..."
cd "$CONTRACTS_DIR"
cargo build --locked --target wasm32-unknown-unknown --release

if command -v wasm-opt &> /dev/null; then
    echo "Optimizing WASM binaries..."
    for wasm in target/wasm32-unknown-unknown/release/*.wasm; do
        wasm-opt -O4 "$wasm" -o "$wasm"
    done
fi

echo ""
echo "Deploying contracts..."

DEPLOY_SUMMARY="# Contract Deployment Summary ($NETWORK)\n"
DEPLOY_SUMMARY+="**Tag:** $DEPLOY_TAG  \n"
DEPLOY_SUMMARY+="**Date:** $(date -u '+%Y-%m-%d %H:%M:%S UTC')  \n\n"
DEPLOY_SUMMARY+="| Contract | Contract ID | WASM Hash |\n|---|---|---|\n"

DEPLOY_ARTIFACTS="$DEPLOY_ARTIFACTS_DIR/$NETWORK/$DEPLOY_TAG/contracts.json"

declare -A CONTRACT_IDS

for wasm in target/wasm32-unknown-unknown/release/*.wasm; do
    name=$(basename "$wasm" .wasm)
    wasm_hash=$(sha256sum "$wasm" | cut -d' ' -f1)

    echo "  Deploying $name..."
    contract_id=$(stellar contract deploy \
        --wasm "$wasm" \
        --source deployer \
        --network "$NETWORK" 2>&1 | tail -1)

    CONTRACT_IDS["$name"]="$contract_id"
    echo "    Contract ID: $contract_id"
    echo "    WASM Hash: $wasm_hash"

    DEPLOY_SUMMARY+="| $name | \`$contract_id\` | \`$wasm_hash\` |\n"

    mkdir -p "$DEPLOY_ARTIFACTS_DIR/$NETWORK/$DEPLOY_TAG/$name"
    cp "$wasm" "$DEPLOY_ARTIFACTS_DIR/$NETWORK/$DEPLOY_TAG/$name/"
done

echo "{}" > "$DEPLOY_ARTIFACTS"
for name in "${!CONTRACT_IDS[@]}"; do
    json_content=$(cat "$DEPLOY_ARTIFACTS")
    echo "$json_content" | jq --arg name "$name" --arg id "${CONTRACT_IDS[$name]}" \
        '. + {($name): $id}' > "$DEPLOY_ARTIFACTS"
done

echo ""
echo "Computing WASM checksums..."
"$SCRIPT_DIR/compute-wasm-hashes.sh" \
    "$CONTRACTS_DIR/target/wasm32-unknown-unknown/release" \
    "$DEPLOY_ARTIFACTS_DIR/$NETWORK/$DEPLOY_TAG"

echo ""
echo "Saving deployment artifacts to $DEPLOY_ARTIFACTS_DIR/$NETWORK/$DEPLOY_TAG/"

LATEST_LINK="$DEPLOY_ARTIFACTS_DIR/$NETWORK/latest"
rm -f "$LATEST_LINK"
ln -s "$DEPLOY_TAG" "$LATEST_LINK"

echo ""
echo -e "$DEPLOY_SUMMARY"

if [ "$VERIFY" = "true" ]; then
    echo ""
    echo "=== Verifying Deployments ==="
    "$SCRIPT_DIR/verify-contracts.sh" "$NETWORK"
fi

echo ""
echo "=== Deployment Complete ==="
