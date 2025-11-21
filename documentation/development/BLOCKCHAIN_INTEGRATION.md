# Blockchain Integration Guide

## Overview

The DAON API now integrates directly with the DAON blockchain for **distributed, persistent content protection**. This eliminates single points of failure and enables true decentralization.

## Architecture

### Before (In-Memory Storage)
```
API Instance 1 → In-Memory Map (isolated)
API Instance 2 → In-Memory Map (isolated)  
API Instance 3 → In-Memory Map (isolated)
```
- ❌ Each instance has different data
- ❌ Data lost on restart
- ❌ Verification fails across load-balanced instances
- ❌ Single server = single point of failure

### After (Blockchain Storage)
```
API Instance 1 ┐
API Instance 2 ├─→ DAON Blockchain (shared state)
API Instance 3 ┘

Blockchain Node 1 ┐
Blockchain Node 2 ├─→ Consensus & Replication
Blockchain Node N ┘
```
- ✅ All instances share blockchain state
- ✅ Data persists across restarts
- ✅ Verification works across all instances
- ✅ No single point of failure
- ✅ Can scale to multiple regions

## Enabling Blockchain Integration

### Step 1: Set Environment Variables

Add to your API container environment or `.env` file:

```bash
# Enable blockchain integration
BLOCKCHAIN_ENABLED=true

# Blockchain RPC endpoint
BLOCKCHAIN_RPC=http://daon-blockchain:26657

# Chain ID
CHAIN_ID=daon-mainnet-1

# API wallet mnemonic for signing transactions
# IMPORTANT: Generate a secure mnemonic for production!
API_MNEMONIC="your twelve word mnemonic phrase here from daon keys"
```

### Step 2: Generate API Wallet

On the blockchain server:

```bash
# Create a new wallet for the API
docker exec -it daon-blockchain daond keys add api-service --keyring-backend test

# Get the mnemonic (SAVE THIS SECURELY!)
# The command above will output the mnemonic

# Get the address
docker exec -it daon-blockchain daond keys show api-service -a --keyring-backend test

# Fund the API wallet with tokens (for transaction fees)
docker exec -it daon-blockchain daond tx bank send validator \
  <api-service-address> 1000000stake \
  --keyring-backend test \
  --chain-id daon-mainnet-1 \
  --yes
```

### Step 3: Update Docker Compose

Edit `docker-compose.yml`:

```yaml
services:
  daon-api-1:
    environment:
      NODE_ENV: production
      PORT: 3000
      INSTANCE_ID: api-1
      DATABASE_URL: postgresql://...
      REDIS_URL: redis://redis:6379
      BLOCKCHAIN_RPC: http://daon-blockchain:26657
      BLOCKCHAIN_ENABLED: "true"              # ← Enable blockchain
      CHAIN_ID: daon-mainnet-1
      API_MNEMONIC: "${API_MNEMONIC}"         # ← From secrets
```

### Step 4: Restart API Containers

```bash
docker-compose down
docker-compose up -d
```

### Step 5: Verify Integration

```bash
# Check health endpoint
curl https://api.daon.network/health | jq '.blockchain'

# Should show:
# {
#   "enabled": true,
#   "connected": true,
#   "chainId": "daon-mainnet-1",
#   "height": 12345
# }
```

## Testing Blockchain Integration

### 1. Protect Content

```bash
curl -X POST https://api.daon.network/api/v1/protect \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test blockchain content",
    "metadata": {
      "title": "Blockchain Test",
      "author": "Test User"
    },
    "license": "liberation_v1"
  }' | jq '.'
```

Look for:
```json
{
  "success": true,
  "blockchainTx": "ABC123...",  // ← Transaction hash
  "blockchain": {
    "enabled": true,
    "tx": "ABC123..."
  },
  "message": "Content successfully protected on DAON blockchain"
}
```

### 2. Verify on Blockchain

```bash
# Get the contentHash from above response
curl https://api.daon.network/api/v1/verify/<contentHash> | jq '.'
```

Look for:
```json
{
  "success": true,
  "isValid": true,
  "blockchain": {
    "enabled": true,
    "verified": true,
    "source": "blockchain"  // ← Verified from blockchain
  }
}
```

### 3. Test Load Balancing

Now verification should work across all instances:

```bash
for i in {1..10}; do
  curl -s https://api.daon.network/api/v1/verify/<contentHash> | jq -r '.blockchain.source'
done

# Should always show "blockchain" regardless of which API instance handles the request
```

## Multi-Node Blockchain Deployment

For true decentralization, run multiple blockchain nodes:

### Node 1 (Primary Validator)
```yaml
services:
  daon-blockchain-1:
    image: daon-blockchain:latest
    environment:
      MONIKER: validator-us-east
      CHAIN_ID: daon-mainnet-1
    ports:
      - "26656:26656"  # P2P
      - "26657:26657"  # RPC
```

### Node 2 (Secondary Validator)
```yaml
services:
  daon-blockchain-2:
    image: daon-blockchain:latest
    environment:
      MONIKER: validator-eu-west
      CHAIN_ID: daon-mainnet-1
      PERSISTENT_PEERS: "<node1-id>@<node1-ip>:26656"
    ports:
      - "26656:26656"
      - "26657:26657"
```

### Node N (Additional Validators)
Add more nodes in different regions for better fault tolerance.

## Fallback Behavior

If blockchain is unavailable:

1. API logs warning: `⚠️  Falling back to in-memory storage`
2. Content is stored in memory cache
3. API continues to function (degraded mode)
4. Once blockchain reconnects, new content goes to blockchain
5. Old content remains in memory until next blockchain write

## Security Considerations

### API Mnemonic Storage

**CRITICAL**: Never commit API_MNEMONIC to git!

Use secrets management:

**Docker Swarm:**
```bash
echo "your mnemonic here" | docker secret create api_mnemonic -
```

**Kubernetes:**
```bash
kubectl create secret generic api-mnemonic \
  --from-literal=mnemonic="your mnemonic here"
```

**Environment File (Development Only):**
```bash
# .env (add to .gitignore!)
API_MNEMONIC="your twelve word mnemonic phrase here"
```

### Transaction Fees

The API wallet needs tokens for transaction fees:

- Each protection = 1 transaction
- Estimate: ~0.001 tokens per protection
- Monitor balance: `daond query bank balances <api-address>`
- Refill when low

## Monitoring

### Check Blockchain Connection

```bash
# From API container
curl http://daon-blockchain:26657/status

# From outside
curl https://rpc.daon.network/status
```

### Check Transaction Status

```bash
# Query specific transaction
docker exec daon-blockchain daond query tx <TX_HASH>

# List recent transactions from API wallet
docker exec daon-blockchain daond query txs \
  --events "message.sender='<api-address>'" \
  --limit 10
```

### Monitor Content Registry

```bash
# Query specific content
docker exec daon-blockchain daond query contentregistry verify-content sha256:<hash>

# Check module params
docker exec daon-blockchain daond query contentregistry params
```

## Troubleshooting

### "Blockchain not connected"

**Check:**
1. Is `BLOCKCHAIN_ENABLED=true`?
2. Is blockchain container running?
3. Can API reach blockchain RPC?

```bash
# Test from API container
docker exec daon-api-1 curl http://daon-blockchain:26657/status
```

### "Insufficient funds"

API wallet needs tokens:

```bash
# Check balance
docker exec daon-blockchain daond query bank balances <api-address>

# Send more tokens
docker exec daon-blockchain daond tx bank send validator <api-address> 1000000stake \
  --keyring-backend test --chain-id daon-mainnet-1 --yes
```

### "Invalid creator address"

Mnemonic doesn't match blockchain:

1. Verify mnemonic is correct
2. Ensure it's from the same blockchain
3. Check address prefix (should be `daon...`)

### Verification returns 404 but content was protected

Possible causes:
1. Different blockchain (check CHAIN_ID)
2. Content registered on different chain
3. Blockchain state not synced

Check blockchain logs:
```bash
docker logs daon-blockchain --tail 100
```

## Migration from In-Memory to Blockchain

If you have existing in-memory protected content:

**Option 1: Fresh Start**
- Enable blockchain
- Old verifications will fail (expected)
- New protections go to blockchain
- Users can re-protect their content

**Option 2: Migration Script** (TODO)
- Export in-memory Map
- Submit all content to blockchain
- Verify migration success

## Performance Considerations

### Transaction Time
- Blockchain writes: ~3-6 seconds (block time)
- Memory writes: ~1ms
- Trade-off: Durability vs Speed

### Optimization
- In-memory cache still used for reads
- First verify from cache (fast)
- Fall back to blockchain (slower but authoritative)
- Cache warming on startup (optional)

### Scaling
- More API instances = more throughput
- More blockchain nodes = better reliability
- Blockchain can handle ~1000 tx/second
- Each protection = 1 transaction

## Next Steps

1. ✅ Enable blockchain integration
2. ✅ Test with sample content
3. ✅ Verify load balancing works
4. ⬜ Set up monitoring
5. ⬜ Deploy additional blockchain nodes
6. ⬜ Configure alerts for blockchain health
7. ⬜ Document disaster recovery procedures

## References

- [DAON Core Documentation](../daon-core/readme.md)
- [CosmJS Documentation](https://cosmos.github.io/cosmjs/)
- [Cosmos SDK](https://docs.cosmos.network/)
- [Load Testing Guide](load-tests/LOAD_TESTING_GUIDE.md)
