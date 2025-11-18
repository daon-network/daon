#!/bin/bash
# DAON Blockchain Initialization Script
# Run this once on each new validator/server before starting the blockchain

set -e

# Configuration
CHAIN_ID=${CHAIN_ID:-"daon-mainnet-1"}
MONIKER=${MONIKER:-"daon-validator-1"}
DAON_HOME=${DAON_HOME:-"/daon/.daon"}

echo "🔧 Initializing DAON Blockchain Node"
echo "Chain ID: $CHAIN_ID"
echo "Moniker: $MONIKER"
echo "Home: $DAON_HOME"
echo ""

# Check if already initialized
if [ -f "$DAON_HOME/config/genesis.json" ]; then
    echo "✅ Blockchain already initialized at $DAON_HOME"
    echo "To re-initialize, remove $DAON_HOME and run this script again"
    exit 0
fi

echo "📦 Running daond init..."
daond init "$MONIKER" --chain-id "$CHAIN_ID" --home "$DAON_HOME"

echo ""
echo "🔑 Generating validator key..."
daond keys add validator --keyring-backend test --home "$DAON_HOME" 2>&1 | tee /tmp/validator_key.txt

echo ""
echo "💰 Adding genesis account..."
VALIDATOR_ADDR=$(daond keys show validator -a --keyring-backend test --home "$DAON_HOME")
daond genesis add-genesis-account "$VALIDATOR_ADDR" 10000000000stake --home "$DAON_HOME"

echo ""
echo "🏛️ Creating genesis transaction..."
daond genesis gentx validator 1000000000stake \
    --chain-id "$CHAIN_ID" \
    --keyring-backend test \
    --home "$DAON_HOME"

echo ""
echo "📝 Collecting genesis transactions..."
daond genesis collect-gentxs --home "$DAON_HOME"

echo ""
echo "✅ Blockchain initialized successfully!"
echo ""
echo "⚠️  IMPORTANT: Save these files securely:"
echo "  - $DAON_HOME/config/priv_validator_key.json (CRITICAL - validator identity)"
echo "  - $DAON_HOME/config/node_key.json (node P2P identity)"
echo "  - /tmp/validator_key.txt (validator account mnemonic)"
echo ""
echo "📋 Validator address: $VALIDATOR_ADDR"
echo ""
echo "🚀 You can now start the blockchain with:"
echo "   daond start --home $DAON_HOME"
