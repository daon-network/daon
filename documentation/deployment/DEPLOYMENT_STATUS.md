# DAON Deployment Status & Next Steps

**Last Updated**: November 18, 2025  
**Status**: ⚠️ Critical fixes committed locally, pending push to GitHub

---

## Current Situation

### Production Deployment Status
- **Last Deployment**: Failed (39 minutes ago)
- **Failure Reason**: Blockchain container restart loop (exit code 1)
- **Impact**: API containers cannot start (depend on blockchain health)
- **Services Up**: PostgreSQL ✅, Redis ✅
- **Services Down**: Blockchain ❌, API ❌

### Root Cause Analysis
The blockchain container was failing due to:
1. **Shell variable escaping issues** - Used `$$VAR` instead of `"$VAR"`
2. **Insufficient healthcheck grace period** - 120s not enough for initialization
3. **Too few healthcheck retries** - Only 5 retries before marking unhealthy
4. **No error handling** - Missing `set -e` in init script

---

## Fixes Applied (Committed Locally)

### Commit: `18cae21`
**Message**: fix: resolve blockchain container startup and healthcheck issues

#### Changes Made:

**1. docker-compose.yml - Blockchain Service**
```diff
- daond init $${MONIKER} --chain-id $${CHAIN_ID}
+ daond init "${MONIKER}" --chain-id "${CHAIN_ID}"

- VALIDATOR_ADDR=$$(daond keys show...)
+ VALIDATOR_ADDR=$(daond keys show...)

+ set -e  # Exit on error

- retries: 5
+ retries: 10

- start_period: 120s
+ start_period: 180s

+ Added: echo "✅ Blockchain already initialized"
+ Added: --log_level info to start command
```

**2. New Diagnostic Tools Created**

**troubleshoot-blockchain.sh**:
- Container status & restart count
- Recent logs (last 50 lines)
- Data directory permissions
- Genesis file verification
- RPC connectivity tests
- Common fix suggestions

**verify-production.sh**:
- Full service health check
- API endpoint testing
- Blockchain status
- Disk space monitoring
- Error log scanning

---

## How to Deploy (When GitHub Access Restored)

### Option 1: Normal Flow (Recommended)

```bash
# 1. Push changes to GitHub
git push origin main

# 2. Trigger manual deployment
# Go to: https://github.com/daon-network/daon/actions/workflows/deploy.yml
# Click "Run workflow" → Select "production" → Click "Run workflow"

# 3. Monitor deployment
gh run watch

# 4. Verify after deployment
./verify-production.sh USER@YOUR_SERVER_IP
```

### Option 2: Direct Server Deployment (If GitHub Unavailable)

If you have SSH access to your server, you can deploy directly:

```bash
# 1. Copy files to server
rsync -avz --exclude '.git' --exclude 'node_modules' \
  . USER@SERVER:/opt/daon-source/

# 2. SSH into server
ssh USER@SERVER

# 3. Navigate to source directory
cd /opt/daon-source

# 4. Fix blockchain volume permissions
sudo mkdir -p /opt/daon-database/blockchain
sudo chown -R 1000:1000 /opt/daon-database/blockchain

# 5. Build images locally
docker build -t daon-api:latest ./api-server
docker build -t daon-blockchain:latest ./daon-core

# 6. Deploy stack
docker compose up -d --remove-orphans

# 7. Wait for services to start
sleep 30

# 8. Check status
docker compose ps

# 9. View logs if needed
docker logs daon-blockchain --tail=50
docker logs daon-api-1 --tail=50

# 10. Test API
curl http://localhost:3001/health
```

### Option 3: Emergency Rollback (If Issues Persist)

If the new changes cause issues:

```bash
# SSH to server
ssh USER@SERVER

# Stop all services
cd /opt/daon-source
docker compose down

# Remove blockchain data (fresh start)
sudo rm -rf /opt/daon-database/blockchain/*

# Start services
docker compose up -d

# Monitor logs
docker compose logs -f
```

---

## Verification Steps

### After Deployment

**1. Check Container Status**:
```bash
ssh USER@SERVER 'cd /opt/daon-source && docker compose ps'
```

Expected output:
```
NAME              STATUS                    PORTS
daon-api-1        Up (healthy)             127.0.0.1:3001->3000/tcp
daon-api-2        Up (healthy)             127.0.0.1:3002->3000/tcp
daon-api-3        Up (healthy)             127.0.0.1:3003->3000/tcp
daon-blockchain   Up (healthy)             127.0.0.1:26656-26657->26656-26657/tcp
daon-postgres     Up (healthy)             127.0.0.1:5432->5432/tcp
daon-redis        Up (healthy)             127.0.0.1:6379->6379/tcp
```

**2. Test API Health**:
```bash
curl https://api.daon.network/health
# or
curl http://YOUR_SERVER_IP:3001/health
```

Expected: `{"status":"ok",...}`

**3. Test Blockchain RPC**:
```bash
ssh USER@SERVER 'docker exec daon-blockchain daon-cored status'
```

Expected: JSON with blockchain status

**4. Run Full Health Check**:
```bash
./verify-production.sh USER@SERVER_IP
```

---

## Troubleshooting Guide

### Blockchain Container Keeps Restarting

**Check logs**:
```bash
ssh USER@SERVER 'docker logs daon-blockchain --tail=100'
```

**Common issues**:

1. **Permission denied**:
   ```bash
   ssh USER@SERVER 'sudo chown -R 1000:1000 /opt/daon-database/blockchain'
   ```

2. **Binary not found**:
   ```bash
   ssh USER@SERVER 'cd /opt/daon-source && docker build -t daon-blockchain:latest ./daon-core'
   ```

3. **Genesis validation failed**:
   ```bash
   ssh USER@SERVER 'sudo rm -rf /opt/daon-database/blockchain/*'
   # Then restart: docker compose up -d daon-blockchain
   ```

### API Container Won't Start

**Check dependencies**:
```bash
ssh USER@SERVER 'docker compose ps postgres redis daon-blockchain'
```

All must show `Up (healthy)` before API can start.

**Check logs**:
```bash
ssh USER@SERVER 'docker logs daon-api-1 --tail=50'
```

### Health Check Failing

**Wait longer** - Blockchain needs time:
- Genesis creation: ~30s
- Blockchain start: ~60-90s
- First health check: after 180s

**Manual health check**:
```bash
ssh USER@SERVER 'curl http://localhost:26657/health'
```

---

## Environment File Required

Make sure `.env` exists on server at `/opt/daon-source/.env`:

```bash
POSTGRES_PASSWORD=your_secure_password
API_KEY_SECRET=your_api_secret_key
LOG_LEVEL=info
```

Create it if missing:
```bash
ssh USER@SERVER 'cat > /opt/daon-source/.env << EOF
POSTGRES_PASSWORD=your_password_here
API_KEY_SECRET=your_secret_here
LOG_LEVEL=info
EOF'
```

---

## Files Modified in This Session

### Changed Files:
- `docker-compose.yml` - Blockchain fixes

### New Files:
- `troubleshoot-blockchain.sh` - Diagnostic tool
- `verify-production.sh` - Health check tool
- `DEPLOYMENT_STATUS.md` - This document

### Committed:
- ✅ All changes committed locally (commit `18cae21`)
- ⏳ Pending push to GitHub (auth issue)

---

## What to Do Next

### When GitHub Access is Restored:

1. **Push changes**:
   ```bash
   git push origin main
   ```

2. **Trigger deployment** via GitHub Actions UI

3. **Monitor** with `gh run watch`

4. **Verify** with `./verify-production.sh`

### If You Can't Wait for GitHub Access:

1. Use **Option 2: Direct Server Deployment** (see above)

2. Manually copy files to server with `rsync` or `scp`

3. Build images and restart services on server

---

## Support Commands

### Quick Status Check:
```bash
ssh USER@SERVER 'cd /opt/daon-source && docker compose ps && docker compose logs --tail=20'
```

### Restart All Services:
```bash
ssh USER@SERVER 'cd /opt/daon-source && docker compose restart'
```

### Force Rebuild & Restart:
```bash
ssh USER@SERVER 'cd /opt/daon-source && docker compose down && docker compose up -d --build'
```

### View Real-time Logs:
```bash
ssh USER@SERVER 'cd /opt/daon-source && docker compose logs -f'
```

---

## Success Criteria

Deployment is successful when:
- ✅ All 6 containers show `Up (healthy)` status
- ✅ API health endpoint returns 200 OK
- ✅ Blockchain RPC responds to status queries
- ✅ No containers restarting
- ✅ No errors in logs

---

## Contact Information

If issues persist after deployment:
1. Check logs with troubleshooting script
2. Review error messages
3. Consider fresh blockchain initialization
4. Verify environment variables are set

**Good luck with deployment!** 🚀
