# Pre-Deployment Checklist

Before pushing to deploy, verify everything is ready.

## 1. Server Setup ✓

You've already done server setup. Verify these exist on your server:

```bash
# SSH to your server
ssh YOUR_USER@YOUR_SERVER_IP

# Check directories exist
ls -la /opt/daon
ls -la /opt/daon-source

# Check Docker is installed
docker --version
docker compose version

# Check Docker is running
docker ps

# Exit server
exit
```

**Expected output:**
- `/opt/daon` and `/opt/daon-source` directories exist
- Docker version 20.10+ installed
- Docker Compose v2 (plugin version)

## 2. GitHub Secrets ✓

You mentioned these are already configured. Verify in GitHub:

**Repository → Settings → Secrets and variables → Actions → Repository secrets**

Required secrets:
- [ ] `SERVER_HOST` - Server IP address
- [ ] `SERVER_USER` - SSH username
- [ ] `SERVER_SSH_KEY` - Full private SSH key (including BEGIN/END lines)
- [ ] `DOCKERHUB_USERNAME` - Docker Hub username
- [ ] `DOCKERHUB_TOKEN` - Docker Hub access token
- [ ] `POSTGRES_PASSWORD` - Strong random password
- [ ] `API_KEY_SECRET` - Strong random secret

## 3. DNS Configuration

Check if DNS is pointing to your server:

```bash
# Check DNS resolution
dig api.daon.network

# Or use nslookup
nslookup api.daon.network

# Should return your server's IP address
```

**If not configured:**
- Go to your DNS provider (Cloudflare, Route53, etc.)
- Add A record: `api.daon.network` → `YOUR_SERVER_IP`
- Wait 5-15 minutes for propagation

## 4. Server Firewall

Verify ports are open on server:

```bash
# SSH to server
ssh YOUR_USER@YOUR_SERVER_IP

# Check firewall status
sudo ufw status

# Required open ports:
# - 22 (SSH)
# - 80 (HTTP)
# - 443 (HTTPS)
# - 26656 (Blockchain P2P)
```

**If not configured:**
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 26656/tcp
sudo ufw enable
```

## 5. Docker Hub Cleanup

Check if old API image was published:

```bash
# Try to pull (from your local machine)
docker pull daonnetwork/api:latest 2>&1
```

**If it exists:**
- Go to: https://hub.docker.com/r/daonnetwork/api
- Delete the repository
- See: `DOCKER_HUB_CLEANUP.md` for details

**If it doesn't exist:**
- ✅ Nothing to clean up!

## 6. Local Code Status

Check what will be deployed:

```bash
cd /path/to/greenfield-blockchain

# Check current branch
git branch --show-current
# Should be: main

# Check commits to be pushed
git log origin/main..HEAD --oneline
# Should show your 3 recent commits

# Check for uncommitted changes
git status
# Should be clean
```

**Expected commits to be pushed:**
1. `ef71740` - Docker Hub cleanup guide
2. `0b07d0e` - Deployment and recovery guides
3. `902f187` - Separate public validator from private API

## 7. Verify Workflow Configuration

The deployment workflow will:

✅ Run security audit on API dependencies
✅ Run API tests
✅ Build validator image and push to Docker Hub
✅ Deploy to your server via SSH
✅ Build API locally on server (not Docker Hub)
✅ Build blockchain locally on server
✅ Start all services with docker compose
✅ Wait for health checks
✅ Verify API responds at https://api.daon.network/health

## 8. Pre-Deployment Test (Optional)

Test the deployment workflow locally:

```bash
# Test building API
cd api-server
npm ci
npm test

# Test building blockchain
cd ../daon-core
docker build -t test-blockchain .

# Test building validator for Docker Hub
docker build -t test-validator .
```

## 9. Backup Existing Server (If Applicable)

If you have existing data on the server:

```bash
# SSH to server
ssh YOUR_USER@YOUR_SERVER_IP

# Backup existing .env if it exists
if [ -f /opt/daon/.env ]; then
  cp /opt/daon/.env /opt/daon/.env.backup.$(date +%Y%m%d)
fi

# Backup database if it exists
if docker ps | grep -q daon-postgres; then
  docker exec daon-postgres pg_dump -U daon_api daon_production | gzip > /tmp/daon_backup_$(date +%Y%m%d).sql.gz
fi
```

## 10. Ready to Deploy!

Final checks:

- [ ] Server has `/opt/daon` and `/opt/daon-source` directories
- [ ] Docker and docker-compose installed on server
- [ ] All 7 GitHub secrets configured
- [ ] DNS pointing to server (if using domain)
- [ ] Firewall configured (ports 22, 80, 443, 26656 open)
- [ ] Old Docker Hub images cleaned up (if any existed)
- [ ] 3 commits ready to push
- [ ] On `main` branch locally
- [ ] No uncommitted changes

## Deployment Command

When ready:

```bash
# Push to deploy
git push origin main

# Watch deployment
# Go to: GitHub → Actions → Deploy DAON Production
# Or use CLI:
gh run watch
```

## Expected Deployment Timeline

1. **Security Audit** - 2-3 minutes
2. **Test API** - 2-3 minutes
3. **Build Validator** - 5-10 minutes (multi-arch build)
4. **Push to Docker Hub** - 2-3 minutes
5. **Deploy to Server** - 5-10 minutes
   - rsync code
   - Build API locally
   - Build blockchain locally
   - Start services
   - Health checks
6. **Total Time** - 15-25 minutes

## Monitoring Deployment

### Via GitHub Actions UI:
- Repository → Actions → Deploy DAON Production

### Via GitHub CLI:
```bash
gh run list --workflow=deploy.yml
gh run watch
```

### Via Server Logs (in separate terminal):
```bash
ssh YOUR_USER@YOUR_SERVER_IP
cd /opt/daon-source
watch -n 2 'docker compose ps'
```

## Post-Deployment Verification

Once deployment completes:

```bash
# Test API health
curl https://api.daon.network/health

# Expected response:
# {"status":"healthy","timestamp":"..."}

# Test protection endpoint
curl -X POST https://api.daon.network/api/v1/protect \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test content",
    "metadata": {"title": "Test"},
    "license": "liberation_v1"
  }'

# Check blockchain sync
ssh YOUR_USER@YOUR_SERVER_IP
docker exec daon-blockchain curl http://localhost:26657/status | jq '.result.sync_info'
```

## If Deployment Fails

1. **Check GitHub Actions logs** - See exact error
2. **Check server logs** - SSH and run `docker compose logs`
3. **Common issues:**
   - SSH key incorrect → Re-add to GitHub secrets
   - Directories don't exist → Run init script
   - Docker not running → `sudo systemctl start docker`
   - Port conflicts → Check what's using ports
   - DNS not propagated → Wait or use HTTP for testing

## Rollback Plan

If something goes wrong:

```bash
# SSH to server
ssh YOUR_USER@YOUR_SERVER_IP

# Stop services
cd /opt/daon-source
docker compose down

# Check what went wrong
docker compose logs

# Fix and redeploy, or restore backup
```

---

## Quick Start (If Everything Above Is ✓)

```bash
# You're ready! Just push:
git push origin main

# Then watch it deploy:
gh run watch

# Or visit:
# https://github.com/YOUR_ORG/daon/actions
```

**Good luck! 🚀**
