#!/usr/bin/env bash
#
# coverage.sh - Generate code coverage for the Traqora smart contracts.
#
# This script mirrors the contracts coverage gate in .github/workflows/ci.yml:
#
#   cargo test --locked
#   cargo llvm-cov --summary-only --fail-under-lines 90
#
# so a local run fails for the same reason CI would.
#
# Usage: ./coverage.sh [options]
#
# Options:
#   --html             Generate an HTML report in target/coverage/.
#   --open             Open the HTML report in a browser (implies --html).
#   --threshold <N>    Minimum line coverage percent. Default: 90.
#   --no-fail          Report coverage without failing below the threshold.
#   --dry-run          Print the cargo commands without running them.
#   -h, --help         Show this help and exit.
#
# Exit codes:
#   0  coverage generated and (unless --no-fail) at or above the threshold
#   1  a cargo command failed, or coverage was below the threshold
#   2  invalid usage (unknown option, missing or out-of-range threshold)
#
# Requirements:
#   - cargo-llvm-cov: cargo install cargo-llvm-cov
#
# See contracts/TEST_GUIDE.md for how the coverage gate fits into CI.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DEFAULT_THRESHOLD=90

HTML_REPORT=false
OPEN_REPORT=false
FAIL_UNDER=true
DRY_RUN=false
THRESHOLD="$DEFAULT_THRESHOLD"

usage() {
    cat <<'EOF'
Usage: ./coverage.sh [options]

Options:
  --html             Generate an HTML report in target/coverage/.
  --open             Open the HTML report in a browser (implies --html).
  --threshold <N>    Minimum line coverage percent. Default: 90.
  --no-fail          Report coverage without failing below the threshold.
  --dry-run          Print the cargo commands without running them.
  -h, --help         Show this help and exit.
EOF
}

usage_error() {
    echo -e "${RED}Error: $1${NC}" >&2
    echo >&2
    usage >&2
    exit 2
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --html)
            HTML_REPORT=true
            shift
            ;;
        --open)
            OPEN_REPORT=true
            HTML_REPORT=true
            shift
            ;;
        --threshold)
            if [[ $# -lt 2 || -z "${2:-}" ]]; then
                usage_error "--threshold requires a numeric value"
            fi
            THRESHOLD="$2"
            shift 2
            ;;
        --no-fail)
            FAIL_UNDER=false
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            usage_error "unknown option: $1"
            ;;
    esac
done

if ! [[ "$THRESHOLD" =~ ^[0-9]+$ ]] || (( 10#$THRESHOLD > 100 )); then
    usage_error "invalid --threshold value '$THRESHOLD' (expected an integer from 0 to 100)"
fi

TEST_CMD=(cargo test --locked)

COVERAGE_ARGS=(--locked)
if [[ "$HTML_REPORT" == true ]]; then
    COVERAGE_ARGS+=(--html --output-dir target/coverage)
else
    COVERAGE_ARGS+=(--summary-only)
fi
if [[ "$FAIL_UNDER" == true ]]; then
    COVERAGE_ARGS+=(--fail-under-lines "$THRESHOLD")
fi
COVERAGE_CMD=(cargo llvm-cov "${COVERAGE_ARGS[@]}")

if [[ "$DRY_RUN" == true ]]; then
    echo "dry-run: no commands were executed"
    printf '  %s\n' "${TEST_CMD[*]}"
    printf '  %s\n' "${COVERAGE_CMD[*]}"
    exit 0
fi

# Check if cargo-llvm-cov is installed
if ! command -v cargo-llvm-cov &> /dev/null; then
    echo -e "${YELLOW}cargo-llvm-cov not found. Installing...${NC}"
    cargo install cargo-llvm-cov --locked
fi

# Run the contract tests first, exactly as CI does, so test failures are
# reported independently of the coverage threshold.
echo -e "${YELLOW}Verifying all tests pass...${NC}"
"${TEST_CMD[@]}"

if [[ "$HTML_REPORT" == true ]]; then
    echo -e "${YELLOW}Generating HTML coverage report...${NC}"
    "${COVERAGE_CMD[@]}"
    echo -e "${GREEN}HTML report generated at target/coverage/index.html${NC}"

    if [[ "$OPEN_REPORT" == true ]]; then
        if command -v xdg-open &> /dev/null; then
            xdg-open target/coverage/index.html
        elif command -v open &> /dev/null; then
            open target/coverage/index.html
        else
            echo -e "${YELLOW}Could not open browser. Open target/coverage/index.html manually.${NC}"
        fi
    fi
else
    echo -e "${YELLOW}Running tests with coverage...${NC}"
    "${COVERAGE_CMD[@]}"
fi

if [[ "$FAIL_UNDER" == true ]]; then
    echo -e "\\n${GREEN}Coverage complete: line coverage >= ${THRESHOLD}%${NC}"
else
    echo -e "\\n${GREEN}Coverage complete (threshold not enforced)${NC}"
    echo -e "${YELLOW}Note: CI enforces line coverage >= ${DEFAULT_THRESHOLD}%.${NC}"
fi
