# Quick Deployment Commands - Copy & Paste

## 🚀 Deploy to Production Server Now

### Step 1: SSH to Server

```bash
ssh root@YOUR_SERVER_IP
```

### Step 2: Pull Latest Code

```bash
cd /root/greenfield-blockchain
git pull origin main
```

### Step 3: Check Environment Variables

```bash
# Verify .env exists and has required variables
cat .env
```

**Required variables:**
- `POSTGRES_PASSWORD`
- `API_KEY_SECRET`
- `BLOCKCHAIN_ENABLED=true`
- `CHAIN_ID=daon-mainnet-1`
- `API_MNEMONIC` (your 12-word mnemonic)

**If .env is missing, create it:**

```bash
nano .env
```

**Paste this (UPDATE the passwords and secrets!):**

```bash
POSTGRES_PASSWORD=a477c48f27b54e9fb8d8c5e3a1b6d2f9c8e7a5b4d3c2e1f0a9b8c7d6e5f4a3b2
API_KEY_SECRET=change-this-to-something-secure
BLOCKCHAIN_ENABLED=true
CHAIN_ID=daon-mainnet-1
API_MNEMONIC=blur cause boost pass stick allow hundred odor level erosion umbrella urban need indicate inject funny anchor kiss rain equal among unhappy sad dutch
LOG_LEVEL=info
```

**Save:** `Ctrl+X`, `Y`, `Enter`

### Step 4: Stop & Rebuild

```bash
# Stop existing containers
docker-compose down

# Build new API image
docker-compose build daon-api-1

# Start everything
docker-compose up -d
```

### Step 5: Monitor Startup (Wait ~60 seconds)

```bash
# Watch blockchain start
docker logs -f daon-blockchain
```

**Look for:** `✅ Blockchain initialized!` and `🚀 Starting blockchain...`

**Exit:** `Ctrl+C` when you see blocks being produced

### Step 6: Fund API Wallet

```bash
# Wait for blockchain to be ready
sleep 30

# Run funding script
./fund-api-wallet.sh
```

**Expected:** `✅ API wallet funded successfully!`

### Step 7: Check Health

```bash
# All containers should be healthy
docker-compose ps

# Test API endpoints
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

### Step 8: Test Blockchain Integration

**Register content:**

```bash
curl -X POST http://localhost:3001/protect \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Production deployment test",
    "title": "Test Content",
    "license": "liberation_v1"
  }'
```

**Save the hash from the response!**

**Verify content (use hash from above):**

```bash
curl http://localhost:3002/verify/sha256:YOUR_HASH_HERE
```

**Expected:** `"verified": true` with creator info

### Step 9: Test Through Load Balancer (HTTPS)

```bash
# From your local machine or the server
curl https://daon.network/health
curl https://daon.network/health
curl https://daon.network/health
```

**Expected:** Should see `api-1`, `api-2`, `api-3` rotating

---

## ✅ Success Checklist

- [ ] `docker-compose ps` shows all 6 containers healthy
- [ ] `./fund-api-wallet.sh` succeeded
- [ ] Registration returns blockchain transaction hash
- [ ] Verification returns `verified: true`
- [ ] Load balancer rotates through instances
- [ ] HTTPS endpoint responds correctly

---

## 🔥 If Something Breaks

### Blockchain won't start

```bash
docker logs daon-blockchain --tail 50
docker-compose restart daon-blockchain
```

### API can't connect to blockchain

```bash
docker exec daon-api-1 curl http://daon-blockchain:26657/status
docker-compose restart daon-api-1 daon-api-2 daon-api-3
```

### API wallet not found

```bash
docker exec daon-blockchain daon-cored keys list --keyring-backend test
./fund-api-wallet.sh
```

### Start fresh (nuclear option)

```bash
docker-compose down
docker system prune -f
docker-compose build --no-cache daon-api-1
docker-compose up -d
sleep 30
./fund-api-wallet.sh
```

---

## 📊 Monitoring Commands

```bash
# Watch all logs
docker-compose logs -f

# Check blockchain height (should increase every ~5 seconds)
docker exec daon-blockchain daon-cored status | jq .SyncInfo.latest_block_height

# Check API wallet balance
docker exec daon-blockchain daon-cored query bank balances \
  daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n

# Recent errors
docker-compose logs --tail 100 | grep -i error
```

---

## 🎯 Production Tests

**After deployment, run these tests:**

```bash
# 1. Register content via HTTPS
curl -X POST https://daon.network/protect \
  -H "Content-Type: application/json" \
  -d '{"content":"Real test","title":"Production","license":"liberation_v1"}'

# 2. Verify it works (use hash from response)
curl https://daon.network/verify/sha256:HASH_HERE

# 3. Check load balancing
for i in {1..9}; do curl -s https://daon.network/health | jq -r .instanceId; done

# 4. Query blockchain directly
docker exec daon-blockchain daon-cored query contentregistry verify "sha256:HASH_HERE"
```

**All 4 should succeed! 🎉**

---

## 📝 What Changed in This Deployment

1. **Blockchain client now uses CLI** (simpler, more reliable)
2. **API wallet auto-created** on blockchain startup
3. **All API instances use blockchain** (shared state)
4. **Cross-instance verification works** (no more 404s!)

---

## 🚀 Your Deployment is Complete When:

✅ You can register content via HTTPS  
✅ You get a blockchain transaction hash  
✅ You can verify the content  
✅ Verification works from different API instances  
✅ Load balancer distributes across all 3 instances  

**Time to deploy: ~5-10 minutes**

**Questions? Check: `PRODUCTION_DEPLOYMENT.md` for full details**
