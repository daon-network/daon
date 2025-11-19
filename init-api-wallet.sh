#!/bin/bash
# DAON API Wallet Setup Script
# Creates a wallet for API servers to use for blockchain transactions

set -e

DAON_HOME=${DAON_HOME:-"/daon/.daon"}
API_MNEMONIC=${API_MNEMONIC:-""}

echo "🔑 Setting up DAON API Wallet"
echo "Home: $DAON_HOME"
echo ""

# Check if wallet already exists
if daond keys show api-wallet --keyring-backend test --home "$DAON_HOME" >/dev/null 2>&1; then
    echo "✅ API wallet already exists"
    daond keys show api-wallet -a --keyring-backend test --home "$DAON_HOME"
    exit 0
fi

# If mnemonic provided, import it
if [ -n "$API_MNEMONIC" ]; then
    echo "📥 Importing API wallet from mnemonic..."
    echo "$API_MNEMONIC" | daond keys add api-wallet \
        --keyring-backend test \
        --home "$DAON_HOME" \
        --recover
else
    echo "🔐 Generating new API wallet..."
    daond keys add api-wallet \
        --keyring-backend test \
        --home "$DAON_HOME" \
        2>&1 | tee /tmp/api_wallet.txt
    
    echo ""
    echo "⚠️  IMPORTANT: Save the mnemonic from above!"
    echo "   Set it as API_MNEMONIC environment variable"
fi

echo ""
echo "✅ API wallet setup complete!"
API_ADDRESS=$(daond keys show api-wallet -a --keyring-backend test --home "$DAON_HOME")
echo "📋 API Address: $API_ADDRESS"
echo ""
echo "💡 To fund this wallet, transfer tokens from the validator:"
echo "   daond tx bank send validator $API_ADDRESS 1000000stake --chain-id daon-mainnet-1 --keyring-backend test --yes"
echo ""
