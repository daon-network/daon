#!/bin/bash
# Fund API Wallet Script
# Transfers tokens from validator to API wallet

set -e

echo "💰 Funding API Wallet"
echo ""

# Wait for blockchain to be ready
echo "⏳ Waiting for blockchain..."
until docker exec daon-blockchain daond status --home /daon/.daon >/dev/null 2>&1; do
  sleep 2
done

echo "✅ Blockchain is ready"
echo ""

# Get API wallet address
API_ADDR=$(docker exec daon-blockchain daond keys show api-wallet -a --keyring-backend test --home /daon/.daon 2>/dev/null || echo "")

if [ -z "$API_ADDR" ]; then
  echo "❌ API wallet not found!"
  echo "   Run the blockchain first to create it, or run init-api-wallet.sh"
  exit 1
fi

echo "📋 API Wallet: $API_ADDR"
echo ""

# Check current balance
echo "💵 Current balance:"
docker exec daon-blockchain daond query bank balances "$API_ADDR" --home /daon/.daon || echo "  No balance yet"
echo ""

# Transfer funds from validator
echo "💸 Transferring 1,000,000 stake from validator..."
docker exec daon-blockchain daond tx bank send validator "$API_ADDR" 1000000stake \
  --chain-id daon-mainnet-1 \
  --keyring-backend test \
  --home /daon/.daon \
  --yes \
  --output json

echo ""
echo "⏳ Waiting for transaction to process (2 seconds)..."
sleep 2
echo ""

# Check new balance
echo "💰 New balance:"
docker exec daon-blockchain daond query bank balances "$API_ADDR" --home /daon/.daon

echo ""
echo "✅ API wallet funded successfully!"
echo ""
