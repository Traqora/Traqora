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
        echo "Error: No latest deployment found for $NETWORK"
        exit 1
    fi
    DEPLOY_TAG=$(basename "$DEPLOY_TAG_PATH")
fi

ARTIFACTS_DIR="$DEPLOY_ARTIFACTS_DIR/$NETWORK/$DEPLOY_TAG"
CONTRACTS_JSON="$ARTIFACTS_DIR/contracts.json"

if [ ! -f "$CONTRACTS_JSON" ]; then
    echo "Error: Deployment artifacts not found at $CONTRACTS_JSON"
    exit 1
fi

echo "=== Verifying Contract Deployments ($NETWORK / $DEPLOY_TAG) ==="
echo ""

cd "$CONTRACTS_DIR"

cargo build --locked --target wasm32-unknown-unknown --release 2>/dev/null

VERIFICATION_STATUS="PASS"
VERIFICATION_REPORT="| Contract | Status | Deployed Hash | Local Hash | Match |\n|---|---|---|---|---|\n"

# Recorded checksums published at deploy time (issue #592). When present they
# are authoritative: a mismatch against the deployed binary means the
# deployment artifacts were tampered with or the record drifted.
RECORDED_HASHES="$ARTIFACTS_DIR/wasm-hashes.json"

for wasm in target/wasm32-unknown-unknown/release/*.wasm; do
    name=$(basename "$wasm" .wasm)
    deployed_wasm="$ARTIFACTS_DIR/$name/$(basename "$wasm")"

    if [ ! -f "$deployed_wasm" ]; then
        echo "  WARNING: No deployed WASM found for $name at $deployed_wasm"
        VERIFICATION_REPORT+="| $name | ⚠️ SKIPPED | N/A | N/A | N/A |\n"
        continue
    fi

    local_hash=$(sha256sum "$wasm" | cut -d' ' -f1)
    deployed_hash=$(sha256sum "$deployed_wasm" | cut -d' ' -f1)
    recorded_hash=$(jq -r ".[\"$name\"] // empty" "$RECORDED_HASHES" 2>/dev/null || echo "")

    if [ -n "$recorded_hash" ] && [ "$deployed_hash" != "$recorded_hash" ]; then
        echo "  ✗ $name: RECORDED CHECKSUM MISMATCH (deployment artifacts drifted)"
        echo "    Deployed:  $deployed_hash"
        echo "    Recorded:  $recorded_hash"
        VERIFICATION_STATUS="FAIL"
        VERIFICATION_REPORT+="| $name | ❌ FAIL | \`$deployed_hash\` | \`$local_hash\` | ❌ |\n"
    elif [ "$local_hash" = "$deployed_hash" ]; then
        echo "  ✓ $name: HASHES MATCH"
        VERIFICATION_REPORT+="| $name | ✅ PASS | \`$deployed_hash\` | \`$local_hash\` | ✅ |\n"
    else
        echo "  ✗ $name: HASH MISMATCH"
        echo "    Deployed: $deployed_hash"
        echo "    Local:    $local_hash"
        VERIFICATION_STATUS="FAIL"
        VERIFICATION_REPORT+="| $name | ❌ FAIL | \`$deployed_hash\` | \`$local_hash\` | ❌ |\n"
    fi
done

echo ""
if [ "$VERIFICATION_STATUS" = "PASS" ]; then
    echo "=== Verification PASSED ==="
else
    echo "=== Verification FAILED ==="
    exit 1
fi

echo ""
echo -e "$VERIFICATION_REPORT"
