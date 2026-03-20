#!/bin/bash
#
# DAON Load Test Runner
# Orchestrates k6 load tests against the remote server with automated
# rate limit toggling.
#
# Usage:
#   ./scripts/run-load-tests.sh
#   DAON_SERVER=myalias ./scripts/run-load-tests.sh
#

DAON_SERVER="${DAON_SERVER:-daon}"
API_URL="https://api.daon.network"
RESULTS_FILE="load-results-$(date +%Y%m%d-%H%M).json"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  DAON Load Test Runner                 ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"
echo -e "  Server: ${DAON_SERVER}  API: ${API_URL}"
echo ""

# Ensure k6 is installed
if ! command -v k6 &>/dev/null; then
    echo -e "${RED}✗ k6 not found. Install with: brew install k6${NC}"
    exit 1
fi

# Cleanup: disable LOAD_TEST_MODE and restart API on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Restoring normal rate limits...${NC}"
    ssh "${DAON_SERVER}" "cd /opt/daon && \
        sed -i 's/^LOAD_TEST_MODE=.*/LOAD_TEST_MODE=false/' .env 2>/dev/null || true && \
        docker-compose restart daon-api 2>/dev/null || \
        docker compose restart daon-api 2>/dev/null || true" 2>/dev/null || \
        echo -e "${YELLOW}⚠  Could not auto-restore rate limits — check server manually${NC}"
    echo -e "${GREEN}Rate limits restored.${NC}"
}
trap cleanup EXIT

# Step 1: Pre-check server health
echo -e "${BLUE}[1/4]${NC} Pre-flight: verifying server health..."
HEALTH=$(curl -sf "${API_URL}/health" 2>/dev/null) || {
    echo -e "${RED}✗ Cannot reach ${API_URL}/health — aborting${NC}"
    exit 1
}
STATUS=$(echo "$HEALTH" | jq -r '.status // empty' 2>/dev/null)
echo -e "${GREEN}✓ Server healthy (status=${STATUS})${NC}"
echo ""

# Step 2: Enable LOAD_TEST_MODE on server
echo -e "${BLUE}[2/4]${NC} Enabling LOAD_TEST_MODE on server..."
ssh "${DAON_SERVER}" "cd /opt/daon && \
    if grep -q '^LOAD_TEST_MODE=' .env 2>/dev/null; then \
        sed -i 's/^LOAD_TEST_MODE=.*/LOAD_TEST_MODE=true/' .env; \
    else \
        echo 'LOAD_TEST_MODE=true' >> .env; \
    fi && \
    docker-compose restart daon-api 2>/dev/null || \
    docker compose restart daon-api 2>/dev/null" || {
    echo -e "${YELLOW}⚠  Could not enable LOAD_TEST_MODE — rate limits may throttle results${NC}"
    echo -e "${YELLOW}   Proceeding anyway...${NC}"
}
echo ""

# Step 3: Wait for containers to stabilize
echo -e "${BLUE}[3/4]${NC} Waiting 5s for containers to stabilize..."
sleep 5

# Verify still healthy after restart
HEALTH2=$(curl -sf "${API_URL}/health" 2>/dev/null) || {
    echo -e "${RED}✗ Server not healthy after LOAD_TEST_MODE restart — aborting${NC}"
    exit 1
}
echo -e "${GREEN}✓ Server still healthy after restart${NC}"
echo ""

# Step 4: Run k6 load test
echo -e "${BLUE}[4/4]${NC} Running k6 load test..."
echo -e "  Results: ${RESULTS_FILE}"
echo ""

k6 run \
    --env API_URL="${API_URL}" \
    --out "json=${RESULTS_FILE}" \
    load-tests/load-test.js
K6_EXIT=$?

echo ""

# Print threshold summary
if [ -f "$RESULTS_FILE" ]; then
    echo -e "${YELLOW}════════════════ Load Test Summary ════════════════${NC}"
    # Extract key metrics from JSON results
    P95=$(jq -r '
        select(.type == "Point" and .metric == "http_req_duration") |
        .data.tags.percentile? // empty
    ' "$RESULTS_FILE" 2>/dev/null | tail -1)

    echo -e "  Results saved to: ${RESULTS_FILE}"
    echo -e "  To view metrics: cat ${RESULTS_FILE} | jq '.metrics.http_req_duration'"
    echo ""
fi

if [ $K6_EXIT -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  LOAD TEST PASSED — all thresholds met ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
else
    echo -e "${RED}╔════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  LOAD TEST FAILED — thresholds not met ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════╝${NC}"
fi

exit $K6_EXIT
