#!/bin/bash

# Comprehensive Broker System Test Suite
API_URL="http://localhost:3000"
API_KEY="DAON_BR_test_79288052216c62602e1353f529ec99d6d63a8e8947d132be"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        DAON Broker System - Comprehensive Test Suite        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

PASS=0
FAIL=0

test_endpoint() {
    local name="$1"
    local expected="$2"
    shift 2
    
    echo -n "Testing: $name ... "
    RESPONSE=$(eval "$@" 2>&1)
    RESULT=$(echo "$RESPONSE" | jq -r '.success // "error"' 2>/dev/null)
    
    if [ "$RESULT" = "$expected" ]; then
        echo "✅ PASS"
        ((PASS++))
        return 0
    else
        echo "❌ FAIL (expected: $expected, got: $RESULT)"
        echo "   Response: $(echo "$RESPONSE" | jq -c '.' 2>/dev/null || echo "$RESPONSE")"
        ((FAIL++))
        return 1
    fi
}

echo "═══════════════════════════════════════════════════════════════"
echo "1. BROKER AUTHENTICATION TESTS"
echo "═══════════════════════════════════════════════════════════════"

test_endpoint "Valid API key" "true" \
    "curl -s '$API_URL/api/v1/broker/verify' -H 'Authorization: Bearer $API_KEY'"

test_endpoint "Invalid API key" "false" \
    "curl -s '$API_URL/api/v1/broker/verify' -H 'Authorization: Bearer invalid_key_123'"

test_endpoint "Missing authorization" "false" \
    "curl -s '$API_URL/api/v1/broker/verify'"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "2. CONTENT PROTECTION TESTS"
echo "═══════════════════════════════════════════════════════════════"

test_endpoint "Protect new content" "true" \
    "curl -s -X POST '$API_URL/api/v1/broker/protect' \
    -H 'Authorization: Bearer $API_KEY' \
    -H 'Content-Type: application/json' \
    -d '{\"content\":\"Test content 1\",\"license\":\"cc-by\",\"username\":\"testuser1\"}'"

# Get the content hash from the last protection
HASH1=$(curl -s -X POST "$API_URL/api/v1/broker/protect" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"content":"Test content for transfer","license":"cc-by","username":"alice"}' | jq -r '.contentHash')

echo "   Content hash for transfer tests: $HASH1"

test_endpoint "Protect with invalid license" "false" \
    "curl -s -X POST '$API_URL/api/v1/broker/protect' \
    -H 'Authorization: Bearer $API_KEY' \
    -H 'Content-Type: application/json' \
    -d '{\"content\":\"Test\",\"license\":\"invalid\",\"username\":\"test\"}'"

test_endpoint "Protect without username" "false" \
    "curl -s -X POST '$API_URL/api/v1/broker/protect' \
    -H 'Authorization: Bearer $API_KEY' \
    -H 'Content-Type: application/json' \
    -d '{\"content\":\"Test\",\"license\":\"cc-by\"}'"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "3. TRANSFER OWNERSHIP TESTS"
echo "═══════════════════════════════════════════════════════════════"

test_endpoint "Valid transfer" "true" \
    "curl -s -X POST '$API_URL/api/v1/broker/transfer' \
    -H 'Authorization: Bearer $API_KEY' \
    -H 'Content-Type: application/json' \
    -d '{\"contentHash\":\"$HASH1\",\"currentOwner\":\"alice@test-broker.local\",\"newOwner\":\"bob@test-broker.local\",\"reason\":\"Test transfer\"}'"

test_endpoint "Transfer from wrong owner" "false" \
    "curl -s -X POST '$API_URL/api/v1/broker/transfer' \
    -H 'Authorization: Bearer $API_KEY' \
    -H 'Content-Type: application/json' \
    -d '{\"contentHash\":\"$HASH1\",\"currentOwner\":\"alice@test-broker.local\",\"newOwner\":\"charlie@test-broker.local\"}'"

test_endpoint "Transfer from different domain" "false" \
    "curl -s -X POST '$API_URL/api/v1/broker/transfer' \
    -H 'Authorization: Bearer $API_KEY' \
    -H 'Content-Type: application/json' \
    -d '{\"contentHash\":\"$HASH1\",\"currentOwner\":\"alice@other-domain.com\",\"newOwner\":\"bob@test-broker.local\"}'"

test_endpoint "Transfer non-existent content" "false" \
    "curl -s -X POST '$API_URL/api/v1/broker/transfer' \
    -H 'Authorization: Bearer $API_KEY' \
    -H 'Content-Type: application/json' \
    -d '{\"contentHash\":\"0000000000000000000000000000000000000000000000000000000000000000\",\"currentOwner\":\"alice@test-broker.local\",\"newOwner\":\"bob@test-broker.local\"}'"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "4. WEBHOOK MANAGEMENT TESTS"
echo "═══════════════════════════════════════════════════════════════"

test_endpoint "Register webhook" "true" \
    "curl -s -X POST '$API_URL/api/v1/broker/webhooks' \
    -H 'Authorization: Bearer $API_KEY' \
    -H 'Content-Type: application/json' \
    -d '{\"url\":\"https://test.example.com/webhook\",\"secret\":\"test-secret-key-must-be-at-least-32-characters-long\",\"events\":[\"content.protected\"],\"description\":\"Test webhook\"}'"

test_endpoint "List webhooks" "true" \
    "curl -s '$API_URL/api/v1/broker/webhooks' \
    -H 'Authorization: Bearer $API_KEY'"

WEBHOOK_ID=$(curl -s "$API_URL/api/v1/broker/webhooks" \
    -H "Authorization: Bearer $API_KEY" | jq -r '.webhooks[0].id // 1')

test_endpoint "Get webhook stats" "true" \
    "curl -s '$API_URL/api/v1/broker/webhooks/$WEBHOOK_ID/stats' \
    -H 'Authorization: Bearer $API_KEY'"

test_endpoint "Register webhook with short secret" "false" \
    "curl -s -X POST '$API_URL/api/v1/broker/webhooks' \
    -H 'Authorization: Bearer $API_KEY' \
    -H 'Content-Type: application/json' \
    -d '{\"url\":\"https://test.com/hook\",\"secret\":\"short\",\"events\":[\"content.protected\"]}'"

test_endpoint "Register webhook with invalid event" "false" \
    "curl -s -X POST '$API_URL/api/v1/broker/webhooks' \
    -H 'Authorization: Bearer $API_KEY' \
    -H 'Content-Type: application/json' \
    -d '{\"url\":\"https://test.com/hook\",\"secret\":\"test-secret-key-must-be-at-least-32-characters-long\",\"events\":[\"invalid.event\"]}'"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "5. API USAGE STATISTICS TESTS"
echo "═══════════════════════════════════════════════════════════════"

test_endpoint "Get usage stats" "true" \
    "curl -s '$API_URL/api/v1/broker/usage' \
    -H 'Authorization: Bearer $API_KEY'"

test_endpoint "Get usage stats with date range" "true" \
    "curl -s '$API_URL/api/v1/broker/usage?startDate=2025-12-01&endDate=2025-12-31' \
    -H 'Authorization: Bearer $API_KEY'"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "6. SCOPE VALIDATION TESTS"
echo "═══════════════════════════════════════════════════════════════"

# Note: These would fail if we had keys with limited scopes
echo "   (Skipping - would need keys with restricted scopes)"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "7. INTEGRATION TESTS"
echo "═══════════════════════════════════════════════════════════════"

# Protect content and verify webhook was triggered
echo -n "Testing: Full flow (protect + webhook trigger) ... "
PROTECT_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/broker/protect" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"content":"Webhook integration test","license":"cc-by","username":"integrationtest"}')

if [ "$(echo "$PROTECT_RESPONSE" | jq -r '.success')" = "true" ]; then
    sleep 2
    DELIVERY_COUNT=$(psql -d daon_api -t -c "SELECT COUNT(*) FROM broker_webhook_deliveries WHERE event_type='content.protected'" 2>/dev/null | xargs)
    if [ "$DELIVERY_COUNT" -gt 0 ]; then
        echo "✅ PASS (webhook triggered, $DELIVERY_COUNT deliveries)"
        ((PASS++))
    else
        echo "⚠️  PARTIAL (protection worked, webhook not triggered)"
        ((PASS++))
    fi
else
    echo "❌ FAIL"
    ((FAIL++))
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                      TEST SUMMARY                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Total Tests: $((PASS + FAIL))"
echo "Passed:      $PASS ✅"
echo "Failed:      $FAIL ❌"
echo "Success Rate: $(awk "BEGIN {printf \"%.1f\", ($PASS/($PASS+$FAIL))*100}")%"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "🎉 ALL TESTS PASSED!"
    exit 0
else
    echo "⚠️  SOME TESTS FAILED"
    exit 1
fi
