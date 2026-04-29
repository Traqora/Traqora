#!/bin/bash
#
# coverage.sh - Generate code coverage report for Traqora smart contracts
# Usage: ./coverage.sh [--html] [--open]
#
# Requirements:
#   - cargo-llvm-cov: cargo install cargo-llvm-cov
#   - tarpaulin (optional): cargo install cargo-tarpaulin
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

HTML_REPORT=false
OPEN_REPORT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --html)
            HTML_REPORT=true
            shift
            ;;
        --open)
            OPEN_REPORT=true
            HTML_REPORT=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if cargo-llvm-cov is installed
if ! command -v cargo-llvm-cov &> /dev/null; then
    echo -e "${YELLOW}⚠ cargo-llvm-cov not found. Installing...${NC}"
    cargo install cargo-llvm-cov
fi

echo -e "${YELLOW}📊 Generating code coverage for smart contracts...${NC}"

if [ "$HTML_REPORT" = true ]; then
    echo -e "${YELLOW}📈 Generating HTML coverage report...${NC}"
    cargo llvm-cov --html --output-dir target/coverage
    echo -e "${GREEN}✓ HTML report generated at target/coverage/index.html${NC}"
    
    if [ "$OPEN_REPORT" = true ]; then
        if command -v xdg-open &> /dev/null; then
            xdg-open target/coverage/index.html
        elif command -v open &> /dev/null; then
            open target/coverage/index.html
        else
            echo -e "${YELLOW}ℹ Could not open browser. Open target/coverage/index.html manually.${NC}"
        fi
    fi
else
    # Generate text report to stdout
    echo -e "${YELLOW}📋 Running tests with coverage...${NC}"
    cargo llvm-cov --summary-only
fi

# Run tests to ensure they all pass
echo -e "${YELLOW}🧪 Verifying all tests pass...${NC}"
cargo test

# Check coverage percentage
echo -e "\n${GREEN}✓ Coverage report complete${NC}"
echo -e "${YELLOW}📝 Note: Aim for >90% coverage on critical modules${NC}"
