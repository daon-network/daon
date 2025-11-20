# DAON Production Server Deployment Guide

## Pre-Deployment Checklist ✅

- [ ] All code committed and pushed to GitHub
- [ ] Server SSH access verified
- [ ] Environment variables prepared
- [ ] Blockchain mnemonic secured
- [ ] Domain DNS configured (pointing to server IP)

---

## Step 1: Push Latest Code to GitHub

**On your local machine:**

```bash
cd /path/to/greenfield-blockchain

# Push all commits
git push origin main

# Verify push succeeded
git log --oneline -5
```

**Expected:** 4 new commits pushed:
- `b51ebaf` - Blockchain integration completion summary
- `e67f7b2` - Blockchain setup guide
- `e505462` - API wallet scripts
- `9070a04` - CLI-based blockchain client

---

## Step 2: Connect to Production Server

```bash
# SSH to your server
ssh root@YOUR_SERVER_IP
# OR
ssh root@daon.network
```

**Replace** `YOUR_SERVER_IP` with your actual server IP address.

---

## Step 3: Pull Latest Code

**On the server:**

```bash
# Navigate to project directory
cd /root/greenfield-blockchain

# Pull latest changes
git pull origin main

# Verify you got the updates
git log --oneline -5
```

**You should see the 4 new commits.**

---

## Step 4: Set Environment Variables

**On the server, create/update `.env` file:**

```bash
# Edit .env file
nano .env
```

**Add these variables:**

```bash
# Database
POSTGRES_PASSWORD=a477c48f27b54e9fb8d8c5e3a1b6d2f9c8e7a5b4d3c2e1f0a9b8c7d6e5f4a3b2

# API Security
API_KEY_SECRET=your-secret-key-here-change-this-in-production

# Blockchain
BLOCKCHAIN_ENABLED=true
CHAIN_ID=daon-mainnet-1
API_MNEMONIC=blur cause boost pass stick allow hundred odor level erosion umbrella urban need indicate inject funny anchor kiss rain equal among unhappy sad dutch

# Optional
LOG_LEVEL=info
MONIKER=daon-validator-1
```

**Save and exit:** `Ctrl+X`, then `Y`, then `Enter`

**Verify environment file:**

```bash
cat .env | grep -v PASSWORD | grep -v SECRET | grep -v MNEMONIC
```

---

## Step 5: Stop Existing Services

**On the server:**

```bash
# Stop all running containers
docker-compose down

# Optional: Clean up old images to free space
docker system prune -f
```

---

## Step 6: Build Updated Images

**On the server:**

```bash
# Build API image with new blockchain client
docker-compose build daon-api-1

# This will also be used for api-2 and api-3 (same image)
```

**Expected:** Build completes successfully in ~2-5 minutes

---

## Step 7: Start All Services

**On the server:**

```bash
# Start everything in background
docker-compose up -d

# Check that containers are starting
docker-compose ps
```

**Expected output:**
```
NAME                STATUS
daon-blockchain     Up (health: starting)
daon-postgres       Up (health: healthy)
daon-redis          Up (health: healthy)
daon-api-1          Up (health: starting)
daon-api-2          Up (health: starting)
daon-api-3          Up (health: starting)
```

---

## Step 8: Monitor Blockchain Startup

**Watch blockchain logs:**

```bash
docker logs -f daon-blockchain
```

**Look for:**
```
🔧 First run detected - initializing blockchain...
✅ Blockchain initialized!
🔑 Creating API wallet...
✅ API wallet exists: daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n
🚀 Starting blockchain...
```

**Wait until you see:** Blockchain is producing blocks (new block height every ~5 seconds)

**Exit logs:** `Ctrl+C` (container keeps running)

---

## Step 9: Fund the API Wallet

**On the server:**

```bash
# Wait 30 seconds for blockchain to be fully ready
sleep 30

# Run funding script
./fund-api-wallet.sh
```

**Expected output:**
```
💰 Funding API Wallet
✅ Blockchain is ready
📋 API Wallet: daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n
💸 Transferring 1,000,000 stake from validator...
✅ API wallet funded successfully!
```

**Verify wallet balance:**

```bash
docker exec daon-blockchain daon-cored query bank balances \
  daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n
```

**Expected:**
```yaml
balances:
- amount: "1000000"
  denom: stake
```

---

## Step 10: Verify Services Health

**Check all containers are healthy:**

```bash
docker-compose ps
```

**All should show:** `Up (healthy)`

**Check individual service health:**

```bash
# Blockchain
curl http://localhost:26657/status

# API instances
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

---

## Step 11: Test Through Load Balancer

**Assuming Caddy is already configured (from previous deployment):**

```bash
# Test health endpoint
curl https://daon.network/health

# Should rotate through instances
curl https://daon.network/health | jq .instanceId
curl https://daon.network/health | jq .instanceId
curl https://daon.network/health | jq .instanceId
```

**Expected:** See `api-1`, `api-2`, `api-3` rotating

---

## Step 12: Test Blockchain Integration

### Test 1: Register Content

```bash
curl -X POST https://daon.network/protect \
  -H "Content-Type: application/json" \
  -d '{
    "content": "My original fanfic work - deployment test",
    "title": "Production Test",
    "author": "DAON Team",
    "license": "liberation_v1"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "hash": "sha256:abc123...",
  "blockchainTx": "DEF456...",
  "message": "Content protected on blockchain"
}
```

**SAVE THE HASH** for next test!

### Test 2: Verify Content (Cross-Instance)

```bash
# Replace with your hash from Test 1
curl https://daon.network/verify/sha256:YOUR_HASH_HERE
```

**Expected response:**
```json
{
  "verified": true,
  "creator": "daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n",
  "license": "liberation_v1",
  "timestamp": "2024-..."
}
```

**Call it multiple times - should work regardless of which API instance handles it!**

### Test 3: Query Blockchain Directly

```bash
# On the server
docker exec daon-blockchain daon-cored query contentregistry verify "sha256:YOUR_HASH_HERE"
```

**Expected:**
```yaml
creator: daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n
license: liberation_v1
timestamp: "2024-..."
verified: true
```

---

## Step 13: Monitor Logs

**API logs:**

```bash
# Watch all API instances
docker logs -f daon-api-1

# Look for:
# ✅ Connected to blockchain at http://daon-blockchain:26657
```

**Blockchain logs:**

```bash
docker logs -f daon-blockchain

# Should see new blocks every ~5 seconds
# Look for transaction confirmations when you register content
```

**Check for errors:**

```bash
# Recent errors in any container
docker-compose logs --tail 100 | grep -i error
```

---

## Step 14: Production Smoke Tests

**Run these commands to verify everything:**

```bash
# 1. All containers running
docker-compose ps | grep -c "Up (healthy)"
# Expected: 6 (blockchain, postgres, redis, api-1, api-2, api-3)

# 2. Blockchain height increasing
docker exec daon-blockchain daon-cored status | jq .SyncInfo.latest_block_height
sleep 10
docker exec daon-blockchain daon-cored status | jq .SyncInfo.latest_block_height
# Expected: Second number should be ~2 higher

# 3. API instances responding
for i in {1..3}; do
  curl -s http://localhost:300${i}/health | jq -r .status
done
# Expected: "ok" three times

# 4. Load balancer distributing
for i in {1..9}; do
  curl -s https://daon.network/health | jq -r .instanceId
done
# Expected: api-1, api-2, api-3 pattern repeating
```

---

## Step 15: Enable Monitoring (Optional)

**Check metrics endpoint:**

```bash
curl https://daon.network/metrics
```

**Set up monitoring alerts for:**
- Container health checks failing
- Blockchain not producing blocks
- API response time > 1 second
- Database connection errors

---

## Troubleshooting

### Blockchain won't start

```bash
# Check logs
docker logs daon-blockchain --tail 100

# Common issues:
# - Port 26657 already in use
# - Permissions on /opt/daon-database/blockchain
# - Insufficient memory

# Fix permissions
sudo chown -R 1000:1000 /opt/daon-database/blockchain

# Restart
docker-compose restart daon-blockchain
```

### API can't connect to blockchain

```bash
# Test network connectivity
docker exec daon-api-1 ping -c 3 daon-blockchain

# Test RPC endpoint
docker exec daon-api-1 curl http://daon-blockchain:26657/status

# Check environment variables
docker exec daon-api-1 env | grep BLOCKCHAIN
```

### API wallet not found

```bash
# Check if wallet exists
docker exec daon-blockchain daon-cored keys list --keyring-backend test

# Recreate wallet
docker exec daon-blockchain daon-cored keys add api-wallet \
  --keyring-backend test --recover
# Paste mnemonic when prompted

# Fund it
./fund-api-wallet.sh
```

### Load balancer not distributing

```bash
# Check Caddy status
systemctl status caddy

# Reload Caddy config
systemctl reload caddy

# Check Caddy logs
journalctl -u caddy -n 50
```

---

## Rollback Procedure (If Needed)

**If deployment fails:**

```bash
# Stop new services
docker-compose down

# Checkout previous version
git checkout HEAD~4

# Rebuild
docker-compose build daon-api-1

# Start
docker-compose up -d
```

---

## Post-Deployment Checklist

- [ ] All 6 containers healthy
- [ ] Blockchain producing blocks
- [ ] API wallet funded
- [ ] Registration test successful
- [ ] Verification test successful
- [ ] Cross-instance verification working
- [ ] Load balancer distributing requests
- [ ] HTTPS working
- [ ] Logs showing no errors
- [ ] Monitoring enabled

---

## Success Criteria ✅

**Your deployment is successful when:**

1. ✅ You can register content via HTTPS
2. ✅ You get a blockchain transaction hash back
3. ✅ You can verify the content on subsequent requests
4. ✅ Verification works even when hitting different API instances
5. ✅ Load balancer shows api-1, api-2, api-3 rotation
6. ✅ Blockchain height is increasing every ~5 seconds

**When all tests pass, your blockchain-integrated DAON is LIVE! 🚀**

---

## Next Steps After Deployment

1. **Test with real creator content**
2. **Monitor blockchain transaction volume**
3. **Set up automated backups** of blockchain data
4. **Configure log rotation**
5. **Set up uptime monitoring**
6. **Document API wallet mnemonic** in secure vault

---

## Emergency Contacts

- **Blockchain not syncing:** Check disk space and restart
- **API errors:** Check environment variables and database connection
- **Load balancer issues:** Check Caddy config and reload
- **Out of memory:** Increase swap or add more RAM

**For support:** Check logs first, then GitHub issues

---

**Deployment Guide Version:** 1.0  
**Last Updated:** November 2024  
**Blockchain Integration:** CLI-based (v2)
