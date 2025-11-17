# DAON Remote Deployment Guide

This guide covers deploying the DAON API infrastructure to your remote server.

## Overview

**What gets deployed:**
- Private API server (built locally on server)
- PostgreSQL database
- Redis cache
- Blockchain validator node
- Caddy reverse proxy with auto-SSL

**What does NOT get deployed to Docker Hub:**
- ❌ API Server (remains private on your infrastructure)
- ✅ Validator Node (public - `daonnetwork/validator:latest`)

## Prerequisites

### 1. Remote Server Requirements
- **Provider:** Hetzner, DigitalOcean, AWS, etc.
- **OS:** Ubuntu 24.04 LTS (recommended)
- **RAM:** 8GB minimum
- **CPU:** 4 cores minimum
- **Storage:** 100GB SSD minimum
- **Network:** Public IPv4 address

### 2. Domain Configuration
- Point `api.daon.network` to your server's IP address
- DNS A record should be configured before deployment
- Wait for DNS propagation (~5-15 minutes)

### 3. GitHub Secrets Setup

Configure these in your GitHub repository:
**Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | How to Get It | Example |
|-------------|---------------|---------|
| `SERVER_HOST` | Your server IP address | `123.45.67.89` |
| `SERVER_USER` | SSH user (usually `root` or `ubuntu`) | `root` |
| `SERVER_SSH_KEY` | Generate with `ssh-keygen -t ed25519` | Paste private key |
| `DOCKERHUB_USERNAME` | Your Docker Hub username | `yourname` |
| `DOCKERHUB_TOKEN` | Docker Hub → Account Settings → Security | Generate token |
| `POSTGRES_PASSWORD` | Generate with `openssl rand -base64 32` | Random password |
| `API_KEY_SECRET` | Generate with `openssl rand -base64 64` | Random secret |

## Deployment Methods

### Method 1: Automated GitHub Actions (Recommended)

#### Step 1: Initialize Server

From your local machine:

```bash
# Clone repository (if not already done)
git clone https://github.com/your-org/daon.git
cd daon

# Initialize server directories and install Docker
./init-server.sh root@YOUR_SERVER_IP

# Example:
./init-server.sh root@123.45.67.89
```

This script:
- Creates `/opt/daon` and `/opt/daon-source` directories
- Installs Docker and Docker Compose
- Sets up proper permissions
- Creates daon user

#### Step 2: Configure GitHub Secrets

Add all the secrets listed above to your GitHub repository.

#### Step 3: Deploy

```bash
# Commit and push to trigger deployment
git push origin main

# Or trigger manually via GitHub Actions UI
# Actions → Deploy DAON Production → Run workflow
```

#### Step 4: Monitor Deployment

```bash
# Watch GitHub Actions logs
# Repository → Actions → Deploy DAON Production

# Or SSH to server and check
ssh root@YOUR_SERVER_IP
docker ps
docker logs daon-api-1 -f
```

### Method 2: Manual Deployment

If you prefer manual control or need to troubleshoot:

#### Step 1: SSH to Server

```bash
ssh root@YOUR_SERVER_IP
```

#### Step 2: Install Dependencies

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Caddy (for reverse proxy)
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install caddy
```

#### Step 3: Clone Repository

```bash
# Create directories
mkdir -p /opt/daon-source
cd /opt/daon-source

# Clone repository
git clone https://github.com/your-org/daon.git .
```

#### Step 4: Create Environment File

```bash
cd /opt/daon-source

# Generate secrets
POSTGRES_PASSWORD=$(openssl rand -base64 32)
API_KEY_SECRET=$(openssl rand -base64 64)

# Create .env file
cat > .env << EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
API_KEY_SECRET=${API_KEY_SECRET}
LOG_LEVEL=info
EOF

# Save passwords somewhere safe!
echo "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}"
echo "API_KEY_SECRET: ${API_KEY_SECRET}"
```

#### Step 5: Build and Deploy

```bash
cd /opt/daon-source

# Build API locally
docker build -t daon-api:latest ./api-server

# Build blockchain validator
docker build -t daon-blockchain:latest ./daon-core

# Start services
docker compose up -d

# Check status
docker compose ps
docker compose logs -f
```

#### Step 6: Configure Caddy

```bash
# Create Caddyfile
cat > /etc/caddy/Caddyfile << 'EOF'
api.daon.network {
    reverse_proxy localhost:3001
    
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        Access-Control-Allow-Origin "*"
    }
}
EOF

# Reload Caddy
systemctl reload caddy
```

## Verification

### Check All Services

```bash
# On server:
docker compose ps

# Expected output:
# NAME              STATUS          PORTS
# daon-api-1        Up (healthy)    0.0.0.0:3001->3000/tcp
# daon-api-2        Up (healthy)    0.0.0.0:3002->3000/tcp
# daon-api-3        Up (healthy)    0.0.0.0:3003->3000/tcp
# daon-blockchain   Up (healthy)    26656-26657/tcp
# daon-postgres     Up (healthy)    5432/tcp
# daon-redis        Up              6379/tcp
```

### Test API Endpoints

```bash
# From your local machine:

# Health check
curl https://api.daon.network/health

# Expected response:
# {"status":"healthy","timestamp":"..."}

# API info
curl https://api.daon.network/api/v1

# Test protection endpoint
curl -X POST https://api.daon.network/api/v1/protect \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test content",
    "metadata": {"title": "Test"},
    "license": "liberation_v1"
  }'
```

### Check Blockchain Sync

```bash
# On server:
docker exec daon-blockchain curl http://localhost:26657/status | jq '.result.sync_info'

# Expected:
# {
#   "latest_block_height": "...",
#   "catching_up": false
# }
```

## Troubleshooting

### Services Won't Start

```bash
# Check logs
docker compose logs

# Specific service
docker compose logs daon-api-1

# Check disk space
df -h

# Check memory
free -h
```

### Database Connection Errors

```bash
# Check postgres is running
docker compose ps postgres

# Test connection
docker exec daon-postgres pg_isready -U daon_api

# View postgres logs
docker compose logs postgres
```

### SSL Certificate Issues

```bash
# Check Caddy logs
journalctl -u caddy -f

# Verify DNS
dig api.daon.network

# Test HTTP (should redirect to HTTPS)
curl -I http://api.daon.network
```

### Blockchain Not Syncing

```bash
# Check blockchain logs
docker compose logs daon-blockchain

# Check ports are open
netstat -tuln | grep 26656

# Restart blockchain
docker compose restart daon-blockchain
```

### API Returns 502/504

```bash
# Check API containers
docker compose ps | grep api

# Check API logs
docker compose logs daon-api-1

# Verify Caddy config
caddy validate --config /etc/caddy/Caddyfile

# Test API directly (bypass Caddy)
curl http://localhost:3001/health
```

## Maintenance

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f daon-api-1

# Last 100 lines
docker compose logs --tail=100 daon-api-1
```

### Backup Database

```bash
# Create backup
docker exec daon-postgres pg_dump -U daon_api daon_production | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore backup
gunzip < backup_20250117.sql.gz | docker exec -i daon-postgres psql -U daon_api daon_production
```

### Update Deployment

```bash
# Pull latest code
cd /opt/daon-source
git pull origin main

# Rebuild images
docker build -t daon-api:latest ./api-server
docker build -t daon-blockchain:latest ./daon-core

# Rolling update (zero downtime)
docker compose up -d --no-deps --build daon-api-1
sleep 10
docker compose up -d --no-deps --build daon-api-2
sleep 10
docker compose up -d --no-deps --build daon-api-3

# Or restart all (brief downtime)
docker compose up -d --force-recreate
```

### Monitor Resources

```bash
# Container resource usage
docker stats

# System resources
htop

# Disk usage
df -h
du -sh /var/lib/docker/*
```

## Security Checklist

- [ ] Firewall configured (only ports 80, 443, 22, 26656 open)
- [ ] SSH key authentication enabled
- [ ] SSH password authentication disabled
- [ ] fail2ban installed and configured
- [ ] Strong passwords in .env file
- [ ] SSL certificates auto-renewing (Caddy handles this)
- [ ] Database not exposed to public internet
- [ ] Regular backups configured
- [ ] Monitoring/alerting configured

## Firewall Configuration

```bash
# Enable UFW
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow 22/tcp

# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow blockchain P2P
ufw allow 26656/tcp

# Enable firewall
ufw enable

# Check status
ufw status
```

## Next Steps

1. **Test thoroughly** - Run test suite against deployed API
2. **Set up monitoring** - Configure Grafana dashboards
3. **Configure backups** - Automate daily database backups
4. **Add validators** - Deploy public validator nodes
5. **Update DNS** - Point production domain to server
6. **Launch SDKs** - Update SDK configs to use your API

## Support

- **Deployment Issues:** Check GitHub Actions logs first
- **Server Issues:** SSH to server and check docker logs
- **Network Issues:** Verify DNS, firewall, Caddy config
- **Emergency:** Stop services with `docker compose down`

---

**Ready to deploy?**

```bash
# From your local machine:
./init-server.sh root@YOUR_SERVER_IP
# Configure GitHub secrets
git push origin main
# Watch it deploy!
```
