#!/bin/bash
#
# DAON Remote End-to-End Regression Test
# Tests the complete flow against the live production server
#
# Usage:
#   ./scripts/test-remote-e2e.sh
#   DAON_SERVER=myalias ./scripts/test-remote-e2e.sh
#

set -e

# SSH alias for production server (override with DAON_SERVER env var)
DAON_SERVER="${DAON_SERVER:-daon}"
API_URL="https://api.daon.network"
FRONTEND_URL="https://daon.network"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  DAON Remote E2E Regression Test Suite ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"
echo -e "  Server: ${DAON_SERVER}  API: ${API_URL}"
echo ""

PASS=0
FAIL=0

pass() { echo -e "${GREEN}✓ PASSED: $1${NC}"; PASS=$((PASS+1)); echo ""; }
fail() { echo -e "${RED}✗ FAILED: $1${NC}"; FAIL=$((FAIL+1)); echo ""; }
die()  { echo -e "${RED}✗ FATAL: $1${NC}"; echo ""; exit 1; }

# Test 1: HTTPS API health check
echo -e "${YELLOW}[1/8]${NC} HTTPS API health check..."
HEALTH=$(curl -sf "${API_URL}/health" 2>/dev/null) || die "Could not reach ${API_URL}/health — is the server up?"
STATUS=$(echo "$HEALTH" | jq -r '.status // empty' 2>/dev/null)
if [ "$STATUS" = "ok" ] || [ "$STATUS" = "healthy" ]; then
    pass "API health check (status=${STATUS})"
else
    echo "Response: $HEALTH"
    fail "API health returned unexpected status: '${STATUS}'"
fi

# Test 2: Blockchain chain ID via SSH docker exec
echo -e "${YELLOW}[2/8]${NC} Verifying blockchain chain ID via SSH..."
CHAIN_ID=$(ssh "${DAON_SERVER}" "docker exec daon-blockchain daond status 2>/dev/null | jq -r '.NodeInfo.network // .node_info.network // .default_node_info.network'" 2>/dev/null) || \
    CHAIN_ID=$(ssh "${DAON_SERVER}" "docker exec daon-blockchain daond query tendermint-validator-set 2>/dev/null | head -1" 2>/dev/null) || true

# Fallback: query via cosmos REST through nginx is unreliable; try direct docker exec
if [ -z "$CHAIN_ID" ] || [ "$CHAIN_ID" = "null" ]; then
    CHAIN_ID=$(ssh "${DAON_SERVER}" "docker exec daon-blockchain daond status 2>/dev/null" 2>/dev/null | jq -r '.NodeInfo.network // .node_info.network' 2>/dev/null) || true
fi

if [ "$CHAIN_ID" = "daon-mainnet-1" ]; then
    pass "Chain ID correct (daon-mainnet-1)"
else
    fail "Chain ID is '${CHAIN_ID}', expected 'daon-mainnet-1'"
fi

# Test 3: API wallet has daon1 prefix via SSH docker exec
echo -e "${YELLOW}[3/8]${NC} Verifying API wallet address via SSH..."
WALLET=$(ssh "${DAON_SERVER}" "docker exec daon-blockchain daond keys show api-wallet -a --keyring-backend test --home /daon/.daon 2>/dev/null") || true
if [[ "$WALLET" =~ ^daon1 ]]; then
    pass "Wallet has daon1 prefix (${WALLET})"
else
    fail "Wallet address doesn't start with daon1: '${WALLET}'"
fi

# Test 4: Wallet balance sufficient via SSH docker exec
echo -e "${YELLOW}[4/8]${NC} Verifying wallet balance via SSH..."
BALANCE=$(ssh "${DAON_SERVER}" "docker exec daon-blockchain daond query bank balances ${WALLET} --home /daon/.daon 2>/dev/null | grep 'amount:' | awk '{print \$2}' | tr -d '\"'") || true
if [ -n "$BALANCE" ] && [ "$BALANCE" -ge "1000000000" ] 2>/dev/null; then
    pass "Wallet balance sufficient (${BALANCE} stake)"
else
    fail "Insufficient or unreadable balance: '${BALANCE}'"
fi

# Test 5: Content protection via HTTPS
echo -e "${YELLOW}[5/8]${NC} Testing content protection via HTTPS..."
TIMESTAMP=$(date +%s)
RESPONSE=$(curl -sf -X POST "${API_URL}/api/v1/protect" \
    -H "Content-Type: application/json" \
    -d "{
        \"content\": \"Remote E2E Test Content - Timestamp: ${TIMESTAMP}\",
        \"metadata\": {
            \"title\": \"Remote E2E Test\",
            \"type\": \"test\"
        }
    }") || { fail "POST /api/v1/protect request failed"; HASH=""; }

if [ -n "$RESPONSE" ]; then
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
    HASH=$(echo "$RESPONSE" | jq -r '.contentHash' 2>/dev/null)
    if [ "$SUCCESS" = "true" ] && [ -n "$HASH" ] && [ "$HASH" != "null" ]; then
        pass "Content protected via HTTPS (hash=${HASH:0:16}...)"
    else
        echo "Response: $RESPONSE"
        fail "API returned success=${SUCCESS}"
        HASH=""
    fi
fi

# Test 6: Blockchain verification via SSH docker exec
echo -e "${YELLOW}[6/8]${NC} Verifying content on blockchain via SSH (waiting 3s for mining)..."
sleep 3

if [ -n "$HASH" ]; then
    VERIFY_RESULT=$(ssh "${DAON_SERVER}" "docker exec daon-blockchain daond query contentregistry verify-content sha256:${HASH} --home /daon/.daon 2>/dev/null") || true
    VERIFIED=$(echo "$VERIFY_RESULT" | grep "verified:" | awk '{print $2}')
    CREATOR=$(echo "$VERIFY_RESULT" | grep "creator:" | awk '{print $2}')

    if [ "$VERIFIED" = "true" ] && [[ "$CREATOR" =~ ^daon1 ]]; then
        pass "Content verified on blockchain (creator=${CREATOR})"
    else
        echo "$VERIFY_RESULT"
        fail "Blockchain verification failed (verified=${VERIFIED}, creator=${CREATOR})"
    fi
else
    fail "Skipped blockchain verification (no hash from step 5)"
fi

# Test 7: Verify-by-hash via HTTPS
echo -e "${YELLOW}[7/8]${NC} Testing verify-by-hash via HTTPS..."
if [ -n "$HASH" ]; then
    VERIFY_RESP=$(curl -sf "${API_URL}/api/v1/verify/${HASH}") || { fail "GET /api/v1/verify/${HASH} request failed"; }
    if [ -n "$VERIFY_RESP" ]; then
        IS_VALID=$(echo "$VERIFY_RESP" | jq -r '.isValid' 2>/dev/null)
        if [ "$IS_VALID" = "true" ]; then
            pass "Verify-by-hash via HTTPS (isValid=true)"
        else
            echo "Response: $VERIFY_RESP"
            fail "Verify-by-hash returned isValid=${IS_VALID}"
        fi
    fi
else
    fail "Skipped verify-by-hash (no hash from step 5)"
fi

# Test 8: Frontend health check
echo -e "${YELLOW}[8/8]${NC} Frontend health check (${FRONTEND_URL})..."
HTTP_CODE=$(curl -so /dev/null -w "%{http_code}" "${FRONTEND_URL}/" 2>/dev/null) || true
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    pass "Frontend reachable (HTTP ${HTTP_CODE})"
else
    fail "Frontend returned HTTP ${HTTP_CODE} (expected 200/301/302)"
fi

# Summary
echo -e "${YELLOW}════════════════════════════════════════${NC}"
echo "Results: ${GREEN}${PASS} passed${NC}  ${RED}${FAIL} failed${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ALL REMOTE E2E TESTS PASSED ✓         ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  REMOTE E2E TESTS FAILED               ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════╝${NC}"
    exit 1
fi
