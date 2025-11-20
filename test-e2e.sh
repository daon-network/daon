#!/bin/bash
#
# DAON End-to-End Regression Test
# Tests the complete flow from API to blockchain verification
#

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  DAON E2E Regression Test Suite      ║${NC}"
echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo ""

# Test 1: Check all containers are healthy
echo -e "${YELLOW}[1/8]${NC} Checking container health..."
UNHEALTHY=$(docker ps --format "{{.Names}}\t{{.Status}}" | grep daon | grep -v "healthy" || true)
if [ -n "$UNHEALTHY" ]; then
    echo -e "${RED}✗ FAILED: Some containers are not healthy${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}" | grep daon
    exit 1
fi
echo -e "${GREEN}✓ PASSED: All containers healthy${NC}"
echo ""

# Test 2: Verify blockchain has daon prefix
echo -e "${YELLOW}[2/8]${NC} Verifying blockchain configuration..."
CHAIN_ID=$(curl -s http://localhost:1317/cosmos/base/tendermint/v1beta1/node_info | jq -r '.default_node_info.network')
if [ "$CHAIN_ID" != "daon-mainnet-1" ]; then
    echo -e "${RED}✗ FAILED: Chain ID is $CHAIN_ID, expected daon-mainnet-1${NC}"
    exit 1
fi
echo -e "${GREEN}✓ PASSED: Chain ID correct (daon-mainnet-1)${NC}"
echo ""

# Test 3: Verify API wallet has daon prefix
echo -e "${YELLOW}[3/8]${NC} Verifying API wallet address..."
WALLET=$(docker exec daon-blockchain daond keys show api-wallet -a --keyring-backend test --home /daon/.daon 2>/dev/null)
if [[ ! "$WALLET" =~ ^daon1 ]]; then
    echo -e "${RED}✗ FAILED: Wallet address doesn't start with daon1: $WALLET${NC}"
    exit 1
fi
echo -e "${GREEN}✓ PASSED: Wallet has daon prefix ($WALLET)${NC}"
echo ""

# Test 4: Verify wallet has funds
echo -e "${YELLOW}[4/8]${NC} Verifying wallet balance..."
BALANCE=$(docker exec daon-blockchain daond query bank balances $WALLET --home /daon/.daon 2>/dev/null | grep "amount:" | awk '{print $2}' | tr -d '"')
if [ "$BALANCE" -lt "1000000000" ]; then
    echo -e "${RED}✗ FAILED: Insufficient balance: $BALANCE${NC}"
    exit 1
fi
echo -e "${GREEN}✓ PASSED: Wallet balance sufficient ($BALANCE stake)${NC}"
echo ""

# Test 5: Protect content via API (instance 1)
echo -e "${YELLOW}[5/8]${NC} Testing content protection (API-1)..."
TIMESTAMP=$(date +%s)
RESPONSE=$(curl -s -X POST http://localhost:3001/api/v1/protect \
    -H "Content-Type: application/json" \
    -d "{
        \"content\": \"E2E Test Content - Timestamp: $TIMESTAMP\",
        \"metadata\": {
            \"title\": \"E2E Test\",
            \"type\": \"test\"
        }
    }")

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
    echo -e "${RED}✗ FAILED: API returned success=false${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

HASH=$(echo "$RESPONSE" | jq -r '.contentHash')
echo -e "${GREEN}✓ PASSED: Content protected via API-1${NC}"
echo "  Hash: $HASH"
echo ""

# Test 6: Verify content on blockchain
echo -e "${YELLOW}[6/8]${NC} Verifying content on blockchain..."
sleep 3  # Give time for transaction to be mined

VERIFY_RESULT=$(docker exec daon-blockchain daond query contentregistry verify-content sha256:$HASH --home /daon/.daon 2>/dev/null)
VERIFIED=$(echo "$VERIFY_RESULT" | grep "verified:" | awk '{print $2}')

if [ "$VERIFIED" != "true" ]; then
    echo -e "${RED}✗ FAILED: Content not verified on blockchain${NC}"
    echo "$VERIFY_RESULT"
    exit 1
fi

CREATOR=$(echo "$VERIFY_RESULT" | grep "creator:" | awk '{print $2}')
if [[ ! "$CREATOR" =~ ^daon1 ]]; then
    echo -e "${RED}✗ FAILED: Creator address doesn't have daon prefix: $CREATOR${NC}"
    exit 1
fi

echo -e "${GREEN}✓ PASSED: Content verified on blockchain${NC}"
echo "  Creator: $CREATOR"
echo "  License: $(echo "$VERIFY_RESULT" | grep "license:" | awk '{print $2}')"
echo ""

# Test 7: Test API instance 2
echo -e "${YELLOW}[7/8]${NC} Testing API instance 2..."
RESPONSE2=$(curl -s -X POST http://localhost:3002/api/v1/protect \
    -H "Content-Type: application/json" \
    -d "{
        \"content\": \"E2E Test API-2 - Timestamp: $TIMESTAMP\",
        \"metadata\": {
            \"title\": \"API-2 Test\",
            \"type\": \"test\"
        }
    }")

SUCCESS2=$(echo "$RESPONSE2" | jq -r '.success')
HASH2=$(echo "$RESPONSE2" | jq -r '.contentHash')

if [ "$SUCCESS2" != "true" ]; then
    echo -e "${RED}✗ FAILED: API-2 returned success=false${NC}"
    exit 1
fi

sleep 3
VERIFY2=$(docker exec daon-blockchain daond query contentregistry verify-content sha256:$HASH2 --home /daon/.daon 2>/dev/null | grep "verified:" | awk '{print $2}')

if [ "$VERIFY2" != "true" ]; then
    echo -e "${RED}✗ FAILED: API-2 content not verified${NC}"
    exit 1
fi

echo -e "${GREEN}✓ PASSED: API instance 2 working${NC}"
echo ""

# Test 8: Test API instance 3
echo -e "${YELLOW}[8/8]${NC} Testing API instance 3..."
RESPONSE3=$(curl -s -X POST http://localhost:3003/api/v1/protect \
    -H "Content-Type: application/json" \
    -d "{
        \"content\": \"E2E Test API-3 - Timestamp: $TIMESTAMP\",
        \"metadata\": {
            \"title\": \"API-3 Test\",
            \"type\": \"test\"
        }
    }")

SUCCESS3=$(echo "$RESPONSE3" | jq -r '.success')
HASH3=$(echo "$RESPONSE3" | jq -r '.contentHash')

if [ "$SUCCESS3" != "true" ]; then
    echo -e "${RED}✗ FAILED: API-3 returned success=false${NC}"
    exit 1
fi

sleep 3
VERIFY3=$(docker exec daon-blockchain daond query contentregistry verify-content sha256:$HASH3 --home /daon/.daon 2>/dev/null | grep "verified:" | awk '{print $2}')

if [ "$VERIFY3" != "true" ]; then
    echo -e "${RED}✗ FAILED: API-3 content not verified${NC}"
    exit 1
fi

echo -e "${GREEN}✓ PASSED: API instance 3 working${NC}"
echo ""

# Summary
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ALL TESTS PASSED ✓                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "Test Summary:"
echo "  - All containers healthy"
echo "  - Blockchain configured with daon prefix"
echo "  - API wallet funded and working"
echo "  - Content protection working on all 3 API instances"
echo "  - Blockchain verification working"
echo "  - Total transactions tested: 3"
echo ""
