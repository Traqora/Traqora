#!/usr/bin/env bash
set -euo pipefail

# Computes SHA-256 checksums for every WASM binary in a directory (issue #592).
#
# Writes two files into the output directory (default: the WASM directory):
#   wasm-checksums.sha256  — sha256sum format ("<hash>  <name>"), usable with
#                            `sha256sum -c` from the containing directory
#   wasm-hashes.json       — {"<name>": "<hash>", ...} for jq consumers
#
# Usage:
#   ./scripts/compute-wasm-hashes.sh <wasm-dir> [output-dir]

WASM_DIR="${1:?Usage: compute-wasm-hashes.sh <wasm-dir> [output-dir]}"
OUT_DIR="${2:-$WASM_DIR}"

if [ ! -d "$WASM_DIR" ]; then
    echo "Error: wasm directory not found: $WASM_DIR" >&2
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "Error: jq is required" >&2
    exit 1
fi

mkdir -p "$OUT_DIR"
CHECKSUMS_FILE="$OUT_DIR/wasm-checksums.sha256"
HASHES_JSON="$OUT_DIR/wasm-hashes.json"

: > "$CHECKSUMS_FILE"
echo "{}" > "$HASHES_JSON"

found=0
for wasm in "$WASM_DIR"/*.wasm; do
    [ -e "$wasm" ] || continue
    name=$(basename "$wasm")
    hash=$(sha256sum "$wasm" | cut -d' ' -f1)
    echo "$hash  $name" >> "$CHECKSUMS_FILE"
    json=$(cat "$HASHES_JSON")
    echo "$json" | jq --arg name "$name" --arg hash "$hash" \
        '. + {($name): $hash}' > "$HASHES_JSON"
    found=$((found + 1))
done

if [ "$found" -eq 0 ]; then
    echo "Error: no .wasm files found in $WASM_DIR" >&2
    exit 1
fi

echo "=== WASM Checksums ($found files) ==="
echo "Checksums file: $CHECKSUMS_FILE"
echo "Hashes JSON:    $HASHES_JSON"
echo ""
cat "$CHECKSUMS_FILE"
