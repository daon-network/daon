#!/bin/bash

# Test Transfer Endpoint
# Tests broker-initiated ownership transfer

API_URL="http://localhost:3000"
API_KEY="DAON_BR_test_79288052216c62602e1353f529ec99d6d63a8e8947d132be"

echo "=== Testing Broker Transfer Endpoint ==="
echo ""

# Step 1: Protect content as user1
echo "1. Protecting content as testuser1@test-broker.local..."
PROTECT_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/broker/protect" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test content for transfer demo",
    "license": "cc-by",
    "username": "testuser1"
  }')

echo "$PROTECT_RESPONSE" | jq '.'
CONTENT_HASH=$(echo "$PROTECT_RESPONSE" | jq -r '.contentHash')
echo ""
echo "Content Hash: $CONTENT_HASH"
echo ""

# Step 2: Transfer ownership to user2
echo "2. Transferring ownership from testuser1 to testuser2..."
TRANSFER_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/broker/transfer" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"contentHash\": \"$CONTENT_HASH\",
    \"currentOwner\": \"testuser1@test-broker.local\",
    \"newOwner\": \"testuser2@test-broker.local\",
    \"reason\": \"Creator moved to different account\"
  }")

echo "$TRANSFER_RESPONSE" | jq '.'
echo ""

# Step 3: Verify new ownership
echo "3. Verifying content now owned by testuser2..."
VERIFY_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/verify" \
  -H "Content-Type: application/json" \
  -d "{
    \"contentHash\": \"$CONTENT_HASH\"
  }")

echo "$VERIFY_RESPONSE" | jq '.'
echo ""

# Step 4: Test transfer from wrong owner (should fail)
echo "4. Attempting transfer from wrong owner (should fail)..."
FAIL_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/broker/transfer" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"contentHash\": \"$CONTENT_HASH\",
    \"currentOwner\": \"testuser1@test-broker.local\",
    \"newOwner\": \"testuser3@test-broker.local\",
    \"reason\": \"This should fail\"
  }")

echo "$FAIL_RESPONSE" | jq '.'
echo ""

# Step 5: Test transfer from wrong domain (should fail)
echo "5. Attempting transfer from different domain (should fail)..."
DOMAIN_FAIL=$(curl -s -X POST "$API_URL/api/v1/broker/transfer" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"contentHash\": \"$CONTENT_HASH\",
    \"currentOwner\": \"testuser2@different-domain.com\",
    \"newOwner\": \"testuser3@test-broker.local\",
    \"reason\": \"This should fail - wrong domain\"
  }")

echo "$DOMAIN_FAIL" | jq '.'
echo ""

echo "=== Test Complete ==="
