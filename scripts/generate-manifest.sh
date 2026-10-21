#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONTRACTS_DIR="$PROJECT_DIR/contracts"
DEPLOY_ARTIFACTS_DIR="$PROJECT_DIR/.deployments"

NETWORK="${1:-testnet}"
DEPLOY_TAG="${2:-latest}"

if [ "$DEPLOY_TAG" = "latest" ]; then
    DEPLOY_TAG_PATH=$(readlink "$DEPLOY_ARTIFACTS_DIR/$NETWORK/latest" 2>/dev/null || echo "")
    if [ -z "$DEPLOY_TAG_PATH" ]; then
        echo "Error: No latest deployment found for $NETWORK" >&2
        exit 1
    fi
    DEPLOY_TAG=$(basename "$DEPLOY_TAG_PATH")
fi

ARTIFACTS_DIR="$DEPLOY_ARTIFACTS_DIR/$NETWORK/$DEPLOY_TAG"
CONTRACTS_JSON="$ARTIFACTS_DIR/contracts.json"
HASHES_JSON="$ARTIFACTS_DIR/wasm-hashes.json"
CHECKSUMS_SHA256="$ARTIFACTS_DIR/wasm-checksums.sha256"

if [ ! -f "$CONTRACTS_JSON" ]; then
    echo "Error: Contracts JSON not found at $CONTRACTS_JSON" >&2
    exit 1
fi

echo "=== Soroban Deployment Manifest ($NETWORK / $DEPLOY_TAG) ==="
echo ""

echo "network: $NETWORK"
echo "deploy_tag: $DEPLOY_TAG"
echo "deploy_ledger: $(cat "$ARTIFACTS_DIR/ledger.txt" 2>/dev/null || echo 'unknown')"
echo ""

echo "contracts:"
while IFS= read -r line; do
    contract_name=$(echo "$line" | jq -r '.key')
    contract_id=$(echo "$line" | jq -r '.value')
    wasm_hash=""

    if [ -f "$HASHES_JSON" ]; then
        wasm_hash=$(jq -r ".\"$contract_name\" // empty" "$HASHES_JSON" 2>/dev/null || echo "unknown")
    fi

    echo "  - name: $contract_name"
    echo "    contract_id: $contract_id"
    echo "    wasm_hash: $wasm_hash"
    echo ""
done < <(jq -c 'to_entries|map({key: .key, value: .value})' "$CONTRACTS_JSON")

echo "checksums:"
if [ -f "$CHECKSUMS_SHA256" ]; then
    while IFS= read -r line; do
        hash=$(echo "$line" | awk '{print $1}')
        name=$(echo "$line" | awk '{print $2}')
        echo "  - name: $name"
        echo "    hash: $hash"
        echo ""
    done < "$CHECKSUMS_SHA256"
else
    echo "  (no checksums file found)"
    echo ""
fi

echo "manifest_hash: $(jq -n --arg net "$NETWORK" --arg tag "$DEPLOY_TAG" --argjson contracts 'null' '{network: $net, tag: $tag, contracts: $contracts}' | sha256sum | cut -d' ' -f1)"
echo ""

echo "=== Manifest Complete ==="