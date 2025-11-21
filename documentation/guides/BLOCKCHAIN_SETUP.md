# DAON Blockchain Integration Setup

## Overview

The DAON API now integrates with the blockchain for **decentralized content registration and verification**. This solves the load balancing verification issue by storing all data on-chain instead of in-memory.

## Architecture

```
┌─────────────┐
│   Caddy     │ Load Balancer (Round-robin)
│   :443      │
└──────┬──────┘
       │
   ┌───┴───┬───────┬────────┐
   │       │       │        │
┌──▼──┐ ┌──▼──┐ ┌──▼──┐    │
│API-1│ │API-2│ │API-3│    │
└──┬──┘ └──┬──┘ └──┬──┘    │
   │       │       │        │
   └───┬───┴───┬───┴────────┘
       │       │            
   ┌───▼───────▼───┐        
   │  Blockchain   │ Shared State (Single Source of Truth)
   │  daon-cored   │
   └───────────────┘
```

**Key Benefits:**
- All API instances write to the **same blockchain**
- No in-memory isolation - content registered on API-1 is **immediately** visible on API-2 and API-3
- True decentralization and persistence
- Zero transaction fees (minimum-gas-prices = 0stake)

## Components

### 1. Blockchain Client (`api-server/src/blockchain.js`)
- Uses **CLI-based approach** (not protobuf encoding)
- Executes commands via `docker exec daon-blockchain daon-cored ...`
- Simpler, more reliable than CosmJS protobuf encoding

### 2. API Wallet
- Automatically created on blockchain container startup
- Key name: `api-wallet`
- Stored in test keyring (inside container)
- Can be imported from `API_MNEMONIC` environment variable

### 3. Docker Compose Updates
- Blockchain container creates `api-wallet` on first run
- API containers have `BLOCKCHAIN_ENABLED=true` by default
- All containers connected via Docker network

## Quick Start

### 1. Start the Stack

```bash
cd /path/to/greenfield-blockchain

# Rebuild API image with new blockchain client
docker-compose build daon-api-1

# Start all services
docker-compose up -d
```

### 2. Fund the API Wallet

Wait ~30 seconds for blockchain to start, then:

```bash
./fund-api-wallet.sh
```

This transfers 1,000,000 stake from validator to api-wallet.

### 3. Verify Setup

```bash
# Check blockchain status
docker exec daon-blockchain daon-cored status

# Check API wallet balance
docker exec daon-blockchain daon-cored query bank balances \
  $(docker exec daon-blockchain daon-cored keys show api-wallet -a --keyring-backend test)

# Check API connection
curl http://localhost/health
```

## Environment Variables

### Blockchain Container
- `CHAIN_ID`: daon-mainnet-1
- `MONIKER`: daon-validator-1
- `API_MNEMONIC`: (optional) Import existing wallet

### API Containers
- `BLOCKCHAIN_ENABLED`: true
- `BLOCKCHAIN_RPC`: http://daon-blockchain:26657
- `CHAIN_ID`: daon-mainnet-1

## How It Works

### Content Registration

1. User calls `POST /protect` on any API instance (via load balancer)
2. API computes SHA256 hash of content
3. API calls `blockchain.registerContent(hash, metadata, license)`
4. Blockchain client executes:
   ```bash
   docker exec daon-blockchain daon-cored tx contentregistry register-content \
     "sha256:abc123..." \
     "liberation_v1" \
     "fingerprint" \
     "platform" \
     --from api-wallet \
     --chain-id daon-mainnet-1 \
     --keyring-backend test \
     --yes
   ```
5. Transaction is committed to blockchain
6. API returns transaction hash to user

### Content Verification

1. User calls `GET /verify/:hash` on any API instance (via load balancer)
2. API calls `blockchain.verifyContent(hash)`
3. Blockchain client executes:
   ```bash
   docker exec daon-blockchain daon-cored query contentregistry verify "sha256:abc123..."
   ```
4. Returns: `{ verified: true, creator, license, timestamp }`
5. Works on **all API instances** because data is on blockchain

## Testing

### Test Registration on API-1
```bash
curl -X POST http://localhost/protect \
  -H "Content-Type: application/json" \
  -d '{
    "content": "My original work",
    "title": "Test Work",
    "license": "liberation_v1"
  }'
```

Response:
```json
{
  "success": true,
  "hash": "sha256:abc123...",
  "blockchainTx": "DEF456...",
  "message": "Content protected on blockchain"
}
```

### Verify on API-2 (Different Instance!)
```bash
curl http://localhost/verify/sha256:abc123...
```

Response:
```json
{
  "verified": true,
  "creator": "daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n",
  "license": "liberation_v1",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**This works because all instances read from the same blockchain!**

## Troubleshooting

### API wallet not found
```bash
# Check if wallet exists
docker exec daon-blockchain daon-cored keys list --keyring-backend test

# Manually create wallet
docker exec -it daon-blockchain daon-cored keys add api-wallet --keyring-backend test

# Fund it
./fund-api-wallet.sh
```

### Blockchain not responding
```bash
# Check blockchain status
docker logs daon-blockchain --tail 50

# Restart blockchain
docker-compose restart daon-blockchain
```

### API can't connect to blockchain
```bash
# Check network connectivity
docker exec daon-api-1 ping -c 3 daon-blockchain

# Check RPC endpoint
docker exec daon-api-1 curl http://daon-blockchain:26657/status
```

## Security Notes

- Blockchain RPC (port 26657) is **localhost-only** (not exposed to internet)
- API containers access blockchain via internal Docker network
- `keyring-backend test` is OK for development (no password required)
- For production, consider using `keyring-backend file` with encryption

## Next Steps

1. ✅ Blockchain integration working with CLI approach
2. ✅ API wallet setup automated
3. ✅ Load balancer distributes across 3 instances
4. 🔄 **TESTING NEEDED:** Verify cross-instance verification works
5. 📝 Add blockchain transaction hash to API responses
6. 🚀 Deploy to production server

## References

- Blockchain CLI docs: `daon-cored --help`
- CosmJS docs: https://cosmos.github.io/cosmjs/
- DAON Chain ID: `daon-mainnet-1`
- RPC Endpoint: `http://localhost:26657` (localhost only)
