# When GitHub Access is Restored

## Quick Deploy Commands

```bash
# 1. Push your 3 pending commits
git push origin main

# 2. Trigger deployment (choose one method)

# Method A: GitHub CLI
gh workflow run deploy.yml --ref main

# Method B: Web UI
# https://github.com/daon-network/daon/actions/workflows/deploy.yml
# Click "Run workflow" button

# 3. Watch deployment progress
gh run watch

# 4. Verify deployment (replace with your server details)
./verify-production.sh USER@SERVER_IP
```

## Commits to be Pushed (3 TOTAL)

```
7b023d3 - fix: add minimum gas prices to blockchain start command (CRITICAL)
18cae21 - fix: resolve blockchain container startup and healthcheck issues (CRITICAL)
fa1fe0c - docs: add comprehensive testing strategy
```

## What These Commits Fix

### Commit 7b023d3 (CRITICAL - NEW!):
**Error it fixes**: `set min gas price in app.toml or flag or env variable`
- Adds `--minimum-gas-prices "0stake"` to blockchain start command
- Without this, blockchain shows usage help and exits

### Commit 18cae21 (CRITICAL):
**Error it fixes**: Blockchain container restart loop
- Fixed shell variable escaping (`$$VAR` → `"$VAR"`)
- Improved healthcheck configuration
- Added diagnostic tools

### Commit fa1fe0c:
- Adds testing strategy documentation

## The Two Errors We Fixed

**Error 1 - Shell Variable Escaping**:
```bash
# WRONG (Docker Compose double-escaping)
daond init $${MONIKER}

# FIXED
daond init "${MONIKER}"
```

**Error 2 - Missing Gas Price Configuration**:
```bash
# WRONG (missing required flag)
daond start --home /daon/.daon

# FIXED
daond start --home /daon/.daon --minimum-gas-prices "0stake"
```

## If Git Push Fails

### Check GitHub Status
```bash
# Check if GitHub is still down
curl -s https://www.githubstatus.com/ | grep -i "operational\|degraded\|outage"
```

### Check SSH Key
```bash
# Test SSH connection
ssh -T git@github.com

# Expected: "Hi USERNAME! You've successfully authenticated..."
```

### Fix SSH Authentication
```bash
# Add SSH key to agent
ssh-add ~/.ssh/id_ed25519
# or
ssh-add ~/.ssh/id_rsa

# Verify key is added
ssh-add -l
```

### Alternative: Use HTTPS
```bash
# Change remote to HTTPS
git remote set-url origin https://github.com/daon-network/daon.git

# Push (will prompt for credentials)
git push origin main
```

## Alternative: Manual Server Deployment

If you can't push to GitHub but need to deploy NOW:

```bash
# 1. Copy files to server
rsync -avz --exclude '.git' --exclude 'node_modules' \
  /Users/alyssapowell/Documents/projects/greenfield-blockchain/ \
  USER@SERVER_IP:/opt/daon-source/

# 2. SSH to server
ssh USER@SERVER_IP

# 3. Deploy on server
cd /opt/daon-source

# Fix permissions
sudo mkdir -p /opt/daon-database/blockchain
sudo chown -R 1000:1000 /opt/daon-database/blockchain

# Build images
docker build -t daon-blockchain:latest ./daon-core
docker build -t daon-api:latest ./api-server

# Deploy stack
docker compose down
docker compose up -d --remove-orphans

# Wait for services
sleep 60

# Check status
docker compose ps

# View logs
docker logs daon-blockchain --tail=50
```

## Verification After Deployment

```bash
# 1. Check all services are healthy
ssh USER@SERVER 'cd /opt/daon-source && docker compose ps'

# 2. Check blockchain logs (should NOT show errors)
ssh USER@SERVER 'docker logs daon-blockchain --tail=30'

# Expected to see:
# ✅ Blockchain initialized (or already initialized)
# 🚀 Starting blockchain...
# (Should NOT see "set min gas price" error anymore)

# 3. Test API
curl https://api.daon.network/health
```

## Questions?

See DEPLOYMENT_STATUS.md for full troubleshooting guide.
