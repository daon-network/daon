# DAON Production Setup Guide

## Prerequisites

- Docker Desktop installed and running
- Ports available: 3001-3003, 5432, 6379, 26656-26657, 1317
- At least 4GB RAM available for Docker
- jq installed (for testing): `brew install jq`

## Environment Variables

Create a `.env` file in the project root:

```bash
# Database
POSTGRES_PASSWORD=daon_secure_password_2024

# API Configuration
API_MNEMONIC=blur cause boost pass stick allow hundred odor level erosion umbrella urban need indicate inject funny anchor kiss rain equal among unhappy sad dutch
API_KEY_SECRET=daon_production_secret_key_2024_change_this_in_production

# Blockchain Configuration
CHAIN_ID=daon-mainnet-1
MONIKER=daon-validator-1

# Feature Flags
BLOCKCHAIN_ENABLED=true
LOG_LEVEL=info
```

⚠️ **IMPORTANT**: Change `POSTGRES_PASSWORD` and `API_KEY_SECRET` in production!

## Initial Setup

### 1. Stop Conflicting Services

```bash
# Stop any local Redis/PostgreSQL that might conflict
brew services stop redis
brew services stop postgresql@14
brew services stop postgresql@16

# Stop other Docker containers using these ports
docker ps | grep -E "3001|3002|3003|5432|6379|26656|26657" | awk '{print $1}' | xargs docker stop
```

### 2. Clean Start (if needed)

```bash
# Stop and remove existing containers
docker compose down -v

# Remove old volumes (CAUTION: This deletes all blockchain data!)
docker volume prune -f
```

### 3. Build Images

```bash
# Build blockchain image
docker build -t daon-blockchain:latest ./daon-core

# Build API image
docker build -t daon-api:latest ./api-server
```

### 4. Start Services

```bash
docker compose up -d
```

### 5. Wait for Initialization

```bash
# Watch blockchain initialization
docker logs -f daon-blockchain

# Wait for this message:
# ✅ Blockchain initialized with daon prefix!
# Press Ctrl+C once you see it

# Check all containers are healthy
docker ps
```

All containers should show `(healthy)` status.

## Verification

### Check Blockchain

```bash
# Verify chain ID
curl -s http://localhost:1317/cosmos/base/tendermint/v1beta1/node_info | jq '.default_node_info.network'
# Expected: "daon-mainnet-1"

# Check API wallet
docker exec daon-blockchain daond keys show api-wallet -a --keyring-backend test --home /daon/.daon
# Expected: daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n

# Check wallet balance
docker exec daon-blockchain daond query bank balances daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n --home /daon/.daon
# Expected: 5000000000 stake
```

### Test API

```bash
# Test content protection
curl -X POST http://localhost:3001/api/v1/protect \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test content",
    "metadata": {"title": "Test"}
  }'

# Expected response includes:
# - "success": true
# - "contentHash": "<sha256 hash>"
```

### Run Full Test Suite

```bash
./test-e2e.sh
```

All 8 tests should pass.

## Important Configuration Details

### Blockchain Address Prefix

The blockchain is configured with `daon` prefix (not `cosmos`):
- **File**: `daon-core/app/app.go` line 78
- **Value**: `AccountAddressPrefix: "daon"`
- All addresses start with `daon1`

### API Endpoints

- **API Instance 1**: http://localhost:3001
- **API Instance 2**: http://localhost:3002  
- **API Instance 3**: http://localhost:3003
- **Blockchain RPC**: http://localhost:26657
- **Blockchain REST**: http://localhost:1317

### Blockchain Initialization

On first startup, the blockchain automatically:
1. Creates validator key
2. Imports API wallet from mnemonic
3. Funds both accounts in genesis (validator: 10B, API: 5B)
4. Creates genesis transaction
5. Enables REST API on 0.0.0.0:1317
6. Enables RPC on 0.0.0.0:26657

### API Client Configuration

The API uses CosmJS with:
- Custom registry for `MsgRegisterContent`
- Account parser that decodes protobuf BaseAccount
- GasPrice configured as `GasPrice.fromString('0stake')`
- `daon` address prefix

## Known Issues & Workarounds

### Response Parsing Error

The API successfully writes to blockchain but returns:
```
"blockchainTx": null
"message": "Content protected (blockchain pending)"
```

**Workaround**: Content IS on blockchain despite the message. Verify with:
```bash
docker exec daon-blockchain daond query contentregistry verify-content sha256:<hash> --home /daon/.daon
```

This is a base64 decoding issue in response parsing, not a transaction failure.

### Docker Volume Permissions

If you see permission errors, the blockchain runs as root (user constraint removed from docker-compose.yml line 12).

### Port Conflicts

If containers fail to start due to port conflicts:
```bash
# Find what's using the port
lsof -i :3001  # Replace with conflicting port

# Stop the conflicting process
docker stop <container_id>
# OR
kill <process_id>
```

## Troubleshooting

### Blockchain Not Starting

```bash
# Check logs
docker logs daon-blockchain

# Common issues:
# - Permission denied: Volume needs to be writable
# - Address already in use: Stop conflicting services
# - Empty validator set: Genesis transaction failed
```

### API Can't Connect to Blockchain

```bash
# Verify blockchain is healthy
docker ps | grep daon-blockchain

# Check REST API is responding
curl http://localhost:1317/cosmos/base/tendermint/v1beta1/node_info

# Restart API containers
docker restart daon-api-1 daon-api-2 daon-api-3
```

### Transactions Failing

```bash
# Check wallet balance
docker exec daon-blockchain daond query bank balances daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n --home /daon/.daon

# Check API logs for specific errors
docker logs daon-api-1 --tail 50

# Common issues:
# - Sequence mismatch: accountParser not decoding properly
# - Type URL error: Registry not configured correctly  
# - Gas errors: GasPrice format incorrect
```

## Maintenance

### View Logs

```bash
# All containers
docker compose logs -f

# Specific service
docker logs -f daon-blockchain
docker logs -f daon-api-1

# Last N lines
docker logs --tail 100 daon-blockchain
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker restart daon-api-1

# Rebuild and restart
docker compose down
docker compose build
docker compose up -d
```

### Database Backup

```bash
# Backup blockchain state
docker exec daon-blockchain tar -czf - /daon/.daon > blockchain-backup-$(date +%Y%m%d).tar.gz

# Backup PostgreSQL
docker exec daon-postgres pg_dump -U daon_api daon_production > postgres-backup-$(date +%Y%m%d).sql
```

## Production Deployment Checklist

- [ ] Change `POSTGRES_PASSWORD` in `.env`
- [ ] Change `API_KEY_SECRET` in `.env`
- [ ] Generate new `API_MNEMONIC` (save securely!)
- [ ] Configure firewall rules (only expose necessary ports)
- [ ] Set up SSL/TLS termination
- [ ] Configure log rotation
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure automated backups
- [ ] Test disaster recovery procedure
- [ ] Document runbook for common issues
- [ ] Set up alerting for container health
- [ ] Review and adjust resource limits in docker-compose.yml

## Testing

Run the E2E test suite before deploying:

```bash
./test-e2e.sh
```

All 8 tests should pass:
1. ✓ Container health
2. ✓ Blockchain configuration
3. ✓ API wallet address
4. ✓ Wallet balance
5. ✓ Content protection (API-1)
6. ✓ Blockchain verification
7. ✓ API instance 2
8. ✓ API instance 3

## Support

For issues or questions:
- Check logs: `docker logs <container>`
- Run test suite: `./test-e2e.sh`
- Review this guide's troubleshooting section
- Check blockchain status: `curl http://localhost:1317/cosmos/base/tendermint/v1beta1/node_info`
