#!/usr/bin/env bash
set -euo pipefail

# Formatting and lint gate for the Soroban contracts workspace (issue #743).
#
# Single source of truth for the contracts quality gate. `make fmt`, `make
# clippy`, `make lint` and both CI workflows all call this script, so a local run
# and a CI run cannot disagree about what "clean" means.
#
# Two clippy scopes, because the workspace has two kinds of crate:
#
#   1. deployable contracts — linted for wasm32-unknown-unknown, which is the
#      artifact that actually ships. This is the default and matches CI.
#   2. integration-tests   — excluded from the wasm pass because it enables
#      `soroban-sdk`'s `testutils` feature, which cannot compile for wasm. It is
#      a native test harness, reachable only with `--all-targets`.
#
# Usage:
#   ./scripts/fmt-clippy-check.sh [--only <stage>] [--fix] [--all-targets]
#
# Options:
#   --only <stage>   run a subset of the gate (default: all)
#                      fmt     formatting only
#                      clippy  lints only (both clippy passes)
#                      all     everything
#   --fix            rewrite the sources with `cargo fmt` instead of only
#                    reporting formatting differences (clippy is never
#                    auto-fixed); implies --only fmt
#   --all-targets    also lint for the host target, which reaches the
#                    integration-tests crate and every `#[cfg(test)]` module.
#                    Stricter than CI; see the note in the script body.
#   -h|--help        show this help
#
# Environment:
#   CONTRACTS_DIR   override the workspace path (default: <repo>/contracts)
#   CARGO           cargo binary to use (default: cargo)
#
# Exit codes:
#   0  formatting and lints are clean
#   1  formatting or lint violations
#   2  usage error, or the toolchain cannot run the gate

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONTRACTS_DIR="${CONTRACTS_DIR:-$PROJECT_DIR/contracts}"
CARGO="${CARGO:-cargo}"
STAGES="all"
ALL_TARGETS="${CONTRACTS_CLIPPY_ALL_TARGETS:-0}"
FIX=0

usage() {
    # Same idiom as rollback-backend.sh, minus the shebang line.
    grep '^#' "$0" | grep -v '^#!/' | sed 's/^#//; s/^ //'
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --only)
            STAGES="${2:-}"
            shift 2
            ;;
        --fix)
            STAGES="fmt"
            FIX=1
            shift
            ;;
        --all-targets)
            ALL_TARGETS=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Error: unknown option '$1'" >&2
            usage >&2
            exit 2
            ;;
    esac
done

case "$STAGES" in
    fmt|clippy|all) ;;
    *)
        echo "Error: --only must be one of fmt, clippy, all (got '${STAGES}')" >&2
        exit 2
        ;;
esac

FIX="${FIX:-0}"

case "$ALL_TARGETS" in
    0|1) ;;
    *)
        echo "Error: CONTRACTS_CLIPPY_ALL_TARGETS must be 0 or 1 (got '$ALL_TARGETS')" >&2
        exit 2
        ;;
esac

if [ ! -d "$CONTRACTS_DIR" ]; then
    echo "Error: contracts workspace not found at $CONTRACTS_DIR" >&2
    exit 2
fi

if ! command -v "$CARGO" &> /dev/null; then
    echo "Error: cargo is required but was not found on PATH." >&2
    echo "Install Rust from https://rustup.rs (the pinned toolchain is in rust-toolchain.toml)." >&2
    exit 2
fi

# Fail with an actionable message rather than a wall of rustup output when the
# toolchain is missing a component the gate needs.
if ! "$CARGO" fmt --version &> /dev/null; then
    echo "Error: the 'rustfmt' component is not available for the active toolchain." >&2
    echo "Install it with: rustup component add rustfmt" >&2
    exit 2
fi
if ! "$CARGO" clippy --version &> /dev/null; then
    echo "Error: the 'clippy' component is not available for the active toolchain." >&2
    echo "Install it with: rustup component add clippy" >&2
    exit 2
fi

cd "$CONTRACTS_DIR"

STATUS=0

echo "=== Contracts fmt/clippy gate ==="
echo "Workspace: $CONTRACTS_DIR"
echo "Toolchain: $("$CARGO" --version)"
echo ""

# --- 1. Formatting -----------------------------------------------------------
# `--all` so that a crate added to the workspace is covered without editing this
# script. Without it, `cargo fmt` only sees the default package.
if [ "$STAGES" = "fmt" ] || [ "$STAGES" = "all" ]; then
    if [ "$FIX" -eq 1 ]; then
        echo "--- Formatting (--fix) ---"
        if "$CARGO" fmt --all; then
            echo "  ✓ sources reformatted"
            echo ""
            echo "Note: --fix rewrote files. Review and commit the result."
        else
            echo "  ✗ cargo fmt failed" >&2
            STATUS=1
        fi
    else
        echo "--- Formatting ---"
        FMT_OUTPUT="$("$CARGO" fmt --all -- --check 2>&1)" && FMT_OK=1 || FMT_OK=0
        if [ "$FMT_OK" -eq 1 ]; then
            echo "  ✓ cargo fmt --check is clean"
        else
            echo "  ✗ formatting differs from rustfmt"
            echo "$FMT_OUTPUT" | grep -E '^Diff in ' | sed 's/^Diff in /    /' | sort -u | head -20
            COUNT=$(echo "$FMT_OUTPUT" | grep -cE '^Diff in ' || true)
            echo "    ($COUNT formatting difference(s); run './scripts/fmt-clippy-check.sh --fix')"
            STATUS=1
        fi
    fi
    echo ""
fi

# --- 2. Clippy, deployable contracts (wasm target) --------------------------
if [ "$STAGES" = "clippy" ] || [ "$STAGES" = "all" ]; then
    echo "--- Clippy (wasm32-unknown-unknown, deployable contracts) ---"
    if "$CARGO" clippy --locked --target wasm32-unknown-unknown --workspace --exclude integration-tests -- -D warnings 2>&1; then
        echo "  ✓ no warnings"
    else
        echo "  ✗ clippy reported violations (warnings are errors here)" >&2
        STATUS=1
    fi
    echo ""

    # --- 3. Clippy, native test harness (opt-in) ----------------------------
    # Not part of the default gate: the wasm pass above is what CI enforces, and
    # turning on the host pass today means fixing the accumulated lint debt in
    # the integration-tests crate, which is a separate piece of work. Enable it
    # with --all-targets to work that down.
    if [ "$ALL_TARGETS" -eq 1 ]; then
        # integration-tests cannot build for wasm (soroban-sdk "testutils"), so
        # its lints — and the lints on every crate's `#[cfg(test)]` code — are
        # only reachable from the host target.
        echo "--- Clippy (host target, all targets: includes integration-tests) ---"
        if "$CARGO" clippy --locked --workspace --all-targets -- -D warnings 2>&1; then
            echo "  ✓ no warnings"
        else
            echo "  ✗ clippy reported violations (warnings are errors here)" >&2
            STATUS=1
        fi
        echo ""
    fi
fi

if [ "$STATUS" -eq 0 ]; then
    echo "=== Contracts fmt/clippy gate PASSED ==="
    exit 0
fi

echo "=== Contracts fmt/clippy gate FAILED ===" >&2
exit 1
