#!/bin/bash
#
# DAON Pre-Bless Script
# Gates the branch for users by running remote E2E tests and load tests.
#
# Usage:
#   ./scripts/pre-bless.sh
#   ./scripts/pre-bless.sh --skip-load
#   ./scripts/pre-bless.sh --server myalias
#   ./scripts/pre-bless.sh --skip-load --server myalias
#

SKIP_LOAD=false
DAON_SERVER="${DAON_SERVER:-daon}"

# Parse flags
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-load)
            SKIP_LOAD=true
            shift
            ;;
        --server)
            DAON_SERVER="$2"
            shift 2
            ;;
        *)
            echo "Unknown flag: $1"
            echo "Usage: $0 [--skip-load] [--server <alias>]"
            exit 1
            ;;
    esac
done

export DAON_SERVER

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${YELLOW}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          DAON Pre-Bless Verification             ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════╝${NC}"
echo -e "  Branch:  $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
echo -e "  Commit:  $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo -e "  Server:  ${DAON_SERVER}"
if $SKIP_LOAD; then
    echo -e "  Mode:    ${YELLOW}skip-load${NC} (load test will be skipped)"
fi
echo ""

STEP=0
BLESSED=true

# ─── Step 1: Remote E2E regression tests ───────────────────────────────────
STEP=$((STEP+1))
echo -e "${BLUE}══ Step ${STEP}: Remote E2E Regression Tests ══${NC}"
echo ""

if "${SCRIPT_DIR}/test-remote-e2e.sh"; then
    echo -e "${GREEN}✓ Step ${STEP} passed${NC}"
else
    echo -e "${RED}✗ Step ${STEP} FAILED — remote E2E tests did not pass${NC}"
    echo -e "${RED}  Stopping pre-bless. Fix the failures above before blessing.${NC}"
    exit 1
fi
echo ""

# ─── Step 2: Load test (informational, can be skipped) ─────────────────────
STEP=$((STEP+1))
echo -e "${BLUE}══ Step ${STEP}: Load Test ══${NC}"
echo ""

if $SKIP_LOAD; then
    echo -e "${YELLOW}⚠  Skipped (--skip-load)${NC}"
    echo ""
else
    echo -e "${YELLOW}This takes ~25 minutes. Press Ctrl-C to abort.${NC}"
    echo ""

    if "${SCRIPT_DIR}/run-load-tests.sh"; then
        echo -e "${GREEN}✓ Step ${STEP} passed — all k6 thresholds met${NC}"
    else
        echo -e "${YELLOW}⚠  Load test thresholds not fully met${NC}"
        BLESSED=false
        echo ""
        read -p "Load test had failures. Continue blessing anyway? [y/N] " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}Pre-bless aborted by user.${NC}"
            exit 1
        fi
        echo -e "${YELLOW}Proceeding despite load test failures (user confirmed).${NC}"
    fi
    echo ""
fi

# ─── Summary ───────────────────────────────────────────────────────────────
echo -e "${YELLOW}══════════════════════════════════════════════════${NC}"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M UTC')

if $BLESSED; then
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ BLESSED — ready for users                    ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Branch:    ${BRANCH}"
    echo -e "  Commit:    ${COMMIT}"
    echo -e "  Blessed:   ${TIMESTAMP}"
    echo -e "  By:        $(git config user.name 2>/dev/null || whoami)"
    if $SKIP_LOAD; then
        echo -e "  ${YELLOW}Note: load test was skipped${NC}"
    fi
else
    echo ""
    echo -e "${YELLOW}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  ⚠  CONDITIONALLY BLESSED (load test had issues) ║${NC}"
    echo -e "${YELLOW}╚══════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Branch:    ${BRANCH}"
    echo -e "  Commit:    ${COMMIT}"
    echo -e "  Blessed:   ${TIMESTAMP}"
    echo -e "  ${YELLOW}Review load test results before full traffic ramp.${NC}"
fi
echo ""
