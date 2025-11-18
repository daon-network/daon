# Multi-Datacenter Deployment Guide

## Overview

DAON supports multi-datacenter deployment for high availability and geographic distribution. This guide covers deploying DAON infrastructure across multiple regions/datacenters.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Global Load Balancer                     │
│                   (Cloudflare / AWS Route53)                 │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────┐          ┌─────▼────┐          ┌────▼────┐
   │  DC 1   │          │   DC 2   │          │  DC 3   │
   │  (US)   │          │   (EU)   │          │  (ASIA) │
   └─────────┘          └──────────┘          └─────────┘
        │                     │                     │
   ┌────▼────────┐      ┌────▼────────┐      ┌────▼────────┐
   │ API Cluster │      │ API Cluster │      │ API Cluster │
   │ PostgreSQL  │      │ PostgreSQL  │      │ PostgreSQL  │
   │ Redis       │      │ Redis       │      │ Redis       │
   └─────────────┘      └─────────────┘      └─────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Blockchain Network│
                    │  (P2P Consensus)  │
                    └───────────────────┘
```

## Components Per Datacenter

### Required Per DC:
- ✅ API Server (3 instances for HA)
- ✅ PostgreSQL (with replication)
- ✅ Redis (ephemeral cache)
- ✅ Blockchain Validator Node

### Shared Globally:
- ✅ Blockchain Network (P2P mesh across all DCs)
- ✅ Docker Hub (validator images)

## Deployment Steps

### 1. Provision Servers

For each datacenter, provision:
- **1 server** for API + Database + Blockchain (minimum)
- **3 servers** for production HA (recommended)

**Minimum specs per server:**
- 8GB RAM
- 4 CPU cores
- 100GB SSD
- Ubuntu 24.04 LTS

### 2. Initial Setup (Per DC)

Run the init script on each server:

```bash
# On each new server
curl -sSL https://raw.githubusercontent.com/daon-network/daon/main/setup-server.sh | sudo bash

# Or manually
git clone https://github.com/daon-network/daon.git
cd daon
sudo ./setup-server.sh
```

This creates:
- `/opt/daon/` - Deployment directory
- `/opt/daon-source/` - Source code
- `/opt/daon-database/` - Persistent volumes

### 3. Configure GitHub Secrets (Per DC)

Each DC needs its own deployment secrets:

**For DC1 (US):**
```
SERVER_HOST_DC1=us-server-ip
SERVER_USER_DC1=deploy
SERVER_SSH_KEY_DC1=<ssh-private-key>
```

**For DC2 (EU):**
```
SERVER_HOST_DC2=eu-server-ip
SERVER_USER_DC2=deploy
SERVER_SSH_KEY_DC2=<ssh-private-key>
```

**Shared secrets:**
```
POSTGRES_PASSWORD=<same-across-dcs>
API_KEY_SECRET=<same-across-dcs>
DOCKERHUB_USERNAME=daonnetwork
DOCKERHUB_TOKEN=<token>
```

### 4. Deploy to Each DC

**Manual deployment (recommended for multi-DC):**

```bash
# Deploy to DC1
gh workflow run deploy.yml -f environment=production-dc1

# Deploy to DC2
gh workflow run deploy.yml -f environment=production-dc2

# Deploy to DC3
gh workflow run deploy.yml -f environment=production-dc3
```

### 5. Blockchain Network Setup

**CRITICAL:** Blockchain nodes need to discover each other.

#### First DC (Genesis Node):

The first DC will auto-initialize with `init-blockchain.sh`. Save the output:

```bash
# On DC1 server
ssh deploy@dc1-server
docker logs daon-blockchain | grep "node_id"

# Output: node_id: abc123...
# Note down the node ID
```

#### Subsequent DCs (Peer Nodes):

Configure persistent peers in `.env`:

```bash
# On DC2 and DC3 servers
PERSISTENT_PEERS="abc123@dc1-server-ip:26656"
```

Update `docker-compose.yml` to use persistent peers:

```yaml
daon-blockchain:
  environment:
    CHAIN_ID: daon-mainnet-1
    MONIKER: daon-validator-${DC_NAME}
    PERSISTENT_PEERS: ${PERSISTENT_PEERS}
```

The blockchain will auto-initialize on first run and connect to peers.

### 6. Database Replication (Optional)

For read replicas across DCs:

**Primary (DC1):**
```yaml
postgres:
  environment:
    POSTGRES_REPLICATION_MODE: master
    POSTGRES_REPLICATION_USER: replicator
    POSTGRES_REPLICATION_PASSWORD: ${REPLICATION_PASSWORD}
```

**Replicas (DC2, DC3):**
```yaml
postgres:
  environment:
    POSTGRES_REPLICATION_MODE: slave
    POSTGRES_MASTER_HOST: dc1-postgres-ip
    POSTGRES_MASTER_PORT: 5432
    POSTGRES_REPLICATION_USER: replicator
    POSTGRES_REPLICATION_PASSWORD: ${REPLICATION_PASSWORD}
```

### 7. Load Balancer Configuration

**Cloudflare:**
```yaml
api.daon.network:
  - dc1.api.daon.network (US)
  - dc2.api.daon.network (EU)
  - dc3.api.daon.network (ASIA)
  
  Load balancing: Geo-routing
  Health check: /health
  Failover: Automatic
```

**AWS Route53:**
```yaml
Routing policy: Geolocation
- US: dc1-server-ip
- EU: dc2-server-ip
- Asia: dc3-server-ip

Health check:
  Protocol: HTTPS
  Path: /health
  Interval: 30s
```

## Verification

### Per DC:

```bash
# SSH to server
ssh deploy@dc-server

# Check all services
docker compose ps

# Check blockchain status
docker exec daon-blockchain curl http://localhost:26657/status | jq

# Check blockchain peers
docker exec daon-blockchain curl http://localhost:26657/net_info | jq '.result.n_peers'

# Check API health
curl https://dc1.api.daon.network/health
```

### Global:

```bash
# Test load balancer
curl https://api.daon.network/health

# Test from different regions
curl -H "CF-IPCountry: US" https://api.daon.network/health
curl -H "CF-IPCountry: EU" https://api.daon.network/health
curl -H "CF-IPCountry: CN" https://api.daon.network/health
```

## Blockchain Initialization Checklist

✅ **First DC automatically initializes:**
- Genesis file created
- Validator keys generated
- Genesis account funded
- Genesis transaction created

✅ **Subsequent DCs automatically:**
- Initialize with same chain ID
- Generate own validator keys
- Connect to existing network via persistent peers
- Sync blockchain state

⚠️ **IMPORTANT: Save these from EACH DC:**
- `priv_validator_key.json` - Validator signing key (CRITICAL)
- `node_key.json` - P2P identity
- Validator mnemonic (from init logs)

## Monitoring

**Per DC metrics:**
```bash
# API request rate
curl https://dc1.api.daon.network/metrics | grep request_count

# Blockchain sync status
docker exec daon-blockchain curl http://localhost:26657/status | jq '.result.sync_info.catching_up'

# Database connections
docker exec daon-postgres psql -U daon_api -c "SELECT count(*) FROM pg_stat_activity;"
```

**Global health dashboard:**
- Grafana: https://monitoring.daon.network
- Metrics: Prometheus endpoints from each DC
- Alerts: PagerDuty / Slack integration

## Disaster Recovery

### DC Failure Scenario:

**If DC1 goes down:**
1. Load balancer auto-routes to DC2/DC3
2. Blockchain continues (2/3 validators still available)
3. API requests served by remaining DCs
4. No data loss (blockchain is distributed)

**Recovery:**
1. Fix DC1 server issues
2. Restart services: `docker compose up -d`
3. Blockchain auto-syncs from peers
4. Load balancer detects health and resumes routing

### Complete Network Failure:

**If all DCs go down:**
1. Blockchain state preserved in persistent volumes
2. Restore from last checkpoint
3. Restart validators in order: DC1 → DC2 → DC3
4. Wait for consensus (2/3 validators needed)

## Scaling

### Adding a New DC:

1. Provision server in new region
2. Run `setup-server.sh`
3. Configure GitHub secrets for new DC
4. Deploy: `gh workflow run deploy.yml -f environment=production-dc4`
5. Blockchain auto-initializes and syncs
6. Add to load balancer
7. Update persistent peers on all DCs

### Removing a DC:

1. Remove from load balancer (stop new traffic)
2. Drain existing connections (wait 5 minutes)
3. Stop services: `docker compose down`
4. Update persistent peers on remaining DCs
5. Archive data if needed: `/opt/daon-database/`

## Cost Optimization

**Per DC monthly costs:**
- Server (8GB/4CPU): $50-100
- Bandwidth (500GB): $10-50
- Backup storage: $5-10
- **Total per DC:** ~$65-160/month

**Recommendations:**
- Start with 1 DC for MVP
- Add 2nd DC when traffic increases
- Add 3rd DC for true global coverage
- Use spot instances for dev/staging

## Security

**Per DC firewall rules:**
```bash
# Allow from load balancer
ufw allow from cloudflare-ips to any port 443

# Allow blockchain P2P from other DCs
ufw allow from dc1-ip to any port 26656
ufw allow from dc2-ip to any port 26656
ufw allow from dc3-ip to any port 26656

# Allow SSH from bastion only
ufw allow from bastion-ip to any port 22

# Deny all other traffic
ufw default deny incoming
```

**Validator key security:**
- Store `priv_validator_key.json` in secure vault (1Password, AWS Secrets Manager)
- Different key per DC (can't share validator keys)
- Regular backups to encrypted storage
- Access logs and rotation policies

## Support

**Multi-DC deployment assistance:**
- Email: deploy@daon.network
- Discord: #multi-dc channel
- Emergency: emergency@daon.network

---

**Next Steps:**
1. Review this guide thoroughly
2. Test deployment in staging environment
3. Plan phased rollout (DC1 → DC2 → DC3)
4. Set up monitoring before production
5. Document your specific DC configurations
