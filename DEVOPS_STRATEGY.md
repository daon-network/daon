# DAON DevOps Strategy

**Last Updated:** November 20, 2025  
**Server:** ubuntu-4gb-nbg1-16-daon (Hetzner)  
**OS:** Ubuntu Server (latest LTS)

---

## Table of Contents

1. [Server Update Strategy](#server-update-strategy)
2. [Zero-Downtime Update Process](#zero-downtime-update-process)
3. [Emergency Rollback Procedures](#emergency-rollback-procedures)
4. [Backup Strategy](#backup-strategy)
5. [Monitoring & Alerts](#monitoring--alerts)
6. [Disaster Recovery](#disaster-recovery)
7. [Maintenance Schedule](#maintenance-schedule)

---

## Server Update Strategy

### Current Setup
- **Server:** Hetzner Cloud VPS (ubuntu-4gb-nbg1-16-daon)
- **OS:** Ubuntu Server LTS
- **Automated Backups:** ✅ Enabled (Hetzner daily snapshots)
- **Update Policy:** Security updates applied automatically, feature updates manual

---

## Zero-Downtime Update Process

### Philosophy
**Never update the production server directly.** Always use blue-green deployment or canary rollouts.

### Strategy: Containerized Blue-Green Deployment

Since DAON runs in Docker containers, updates happen at the **container level**, not the OS level. This means:

✅ **OS updates don't require service restarts**  
✅ **Application updates are instant rollbacks**  
✅ **Zero downtime for most changes**

---

## Update Scenarios & Procedures

### Scenario 1: Linux OS Security Updates

**Frequency:** Weekly (automated)  
**Risk Level:** 🟢 Low  
**Downtime:** None (containers keep running)

**Automated Update Script:**
```bash
#!/bin/bash
# /opt/daon/scripts/os-update.sh

echo "🔄 Starting OS security updates..."

# Update package list
sudo apt update

# Install only security updates (unattended)
sudo unattended-upgrade -d

# Check if reboot is required
if [ -f /var/run/reboot-required ]; then
  echo "⚠️  Reboot required for kernel updates"
  echo "Scheduling reboot for maintenance window..."
  
  # Send alert (replace with your notification method)
  curl -X POST https://your-notification-webhook \
    -d "DAON server requires reboot for kernel updates"
  
  # Schedule reboot for 3 AM Sunday
  echo "sudo reboot" | at 03:00 Sunday
else
  echo "✅ Updates complete, no reboot needed"
fi
```

**Cron Job:**
```cron
# Run security updates weekly on Sunday at 2 AM
0 2 * * 0 /opt/daon/scripts/os-update.sh >> /var/log/daon-updates.log 2>&1
```

**Manual Process (for major updates):**
```bash
# 1. Take Hetzner snapshot first
# (Via Hetzner Cloud Console)

# 2. SSH to server
ssh daon

# 3. Update OS packages
sudo apt update
sudo apt upgrade -y

# 4. Check if reboot needed
cat /var/run/reboot-required

# 5. If reboot needed, follow "Graceful Reboot" procedure below
```

---

### Scenario 2: Kernel Updates (Requires Reboot)

**Frequency:** Monthly or as-needed for security  
**Risk Level:** 🟡 Medium  
**Downtime:** ~2 minutes (graceful restart)

**Graceful Reboot Procedure:**

```bash
#!/bin/bash
# /opt/daon/scripts/graceful-reboot.sh

echo "🔄 Preparing for graceful reboot..."

# 1. Verify Hetzner backup exists (taken within last 24 hours)
echo "Verify latest Hetzner backup before proceeding!"
echo "Press ENTER to continue or CTRL+C to abort..."
read

# 2. Stop accepting new requests (optional - set maintenance mode)
# curl -X POST https://api.daon.network/admin/maintenance -d '{"enabled":true}'

# 3. Wait for active requests to complete (30 seconds grace period)
echo "Waiting for active requests to complete..."
sleep 30

# 4. Gracefully stop containers
echo "Stopping containers gracefully..."
cd /opt/daon-source
docker compose stop

# 5. Reboot server
echo "Rebooting server..."
sudo reboot
```

**Post-Reboot Verification:**
```bash
# Containers should auto-start (if configured with restart: always)
# If not, manually start:

ssh daon
cd /opt/daon-source
docker compose up -d

# Verify all services healthy
docker ps
docker compose ps

# Test API
curl https://api.daon.network/health

# Check blockchain
docker exec daon-blockchain daond status
```

**Expected Downtime:** 
- Reboot: ~60 seconds
- Container startup: ~30 seconds
- **Total: ~2 minutes**

---

### Scenario 3: Application Updates (Code Changes)

**Frequency:** As-needed (per release)  
**Risk Level:** 🟢 Low (with proper testing)  
**Downtime:** None (rolling update)

**Zero-Downtime Deployment Process:**

```bash
#!/bin/bash
# /opt/daon/scripts/deploy-app.sh

set -e

echo "🚀 Starting zero-downtime deployment..."

# 1. Fetch latest code
cd /opt/daon-source
git fetch origin
git checkout main
git pull origin main

# 2. Build new images with version tags
NEW_VERSION=$(git rev-parse --short HEAD)
echo "Building version: $NEW_VERSION"

docker build -t daon-api:$NEW_VERSION ./api-server
docker build -t daon-blockchain:$NEW_VERSION ./daon-core

# 3. Tag as latest
docker tag daon-api:$NEW_VERSION daon-api:latest
docker tag daon-blockchain:$NEW_VERSION daon-blockchain:latest

# 4. Rolling update (one instance at a time)
echo "Starting rolling update..."

# Update API instances one by one
for i in 1 2 3; do
  echo "Updating daon-api-$i..."
  docker compose up -d --no-deps --force-recreate daon-api-$i
  
  # Wait for health check
  sleep 10
  
  # Verify healthy before proceeding
  if ! docker ps | grep -q "daon-api-$i.*healthy"; then
    echo "❌ daon-api-$i failed health check! Rolling back..."
    docker tag daon-api:previous daon-api:latest
    docker compose up -d --no-deps --force-recreate daon-api-$i
    exit 1
  fi
  
  echo "✅ daon-api-$i updated successfully"
done

# Update blockchain (if needed - usually doesn't require updates)
echo "Updating blockchain..."
docker compose up -d --no-deps --force-recreate daon-blockchain

# 5. Verify deployment
echo "🔍 Verifying deployment..."
curl -f https://api.daon.network/health || exit 1
docker exec daon-blockchain daond status || exit 1

echo "✅ Deployment complete! Version: $NEW_VERSION"

# 6. Clean up old images
docker image prune -f
```

**No downtime because:**
- Caddy load balancer keeps routing to healthy instances
- We update one API instance at a time
- Health checks prevent bad deployments
- 2 instances remain online while 1 updates

---

### Scenario 4: Database Migrations

**Frequency:** Rare (schema changes)  
**Risk Level:** 🔴 High (data-related)  
**Downtime:** Depends on migration (usually < 1 minute)

**Safe Migration Process:**

```bash
#!/bin/bash
# /opt/daon/scripts/migrate-db.sh

set -e

echo "🗄️  Starting database migration..."

# 1. CRITICAL: Take Hetzner snapshot
echo "⚠️  TAKE HETZNER SNAPSHOT FIRST!"
echo "Go to Hetzner Cloud Console → Snapshots → Create Snapshot"
echo "Type 'SNAPSHOT_TAKEN' to continue:"
read CONFIRM

if [ "$CONFIRM" != "SNAPSHOT_TAKEN" ]; then
  echo "❌ Aborting - snapshot not confirmed"
  exit 1
fi

# 2. Also backup database locally
BACKUP_FILE="/opt/daon-backups/pre-migration-$(date +%Y%m%d-%H%M%S).sql"
docker exec daon-postgres pg_dump -U daon daon > $BACKUP_FILE
echo "✅ Database backed up to: $BACKUP_FILE"

# 3. Enable maintenance mode (optional)
# This prevents new protections during migration
echo "Setting maintenance mode..."
# curl -X POST https://api.daon.network/admin/maintenance -d '{"enabled":true}'

# 4. Run migration
echo "Running migration..."
cd /opt/daon-source/api-server
npm run migrate

# 5. Test migration
echo "Testing migration..."
docker exec daon-postgres psql -U daon daon -c "\dt" # List tables
# Add more validation queries here

# 6. Disable maintenance mode
echo "Disabling maintenance mode..."
# curl -X POST https://api.daon.network/admin/maintenance -d '{"enabled":false}'

echo "✅ Migration complete!"
```

**Rollback Procedure (if migration fails):**
```bash
# Stop services
docker compose stop

# Restore database from backup
cat /opt/daon-backups/pre-migration-*.sql | \
  docker exec -i daon-postgres psql -U daon daon

# Restart services
docker compose up -d

# Or: Restore entire server from Hetzner snapshot
```

---

### Scenario 5: Major Ubuntu LTS Upgrade (20.04 → 22.04 → 24.04)

**Frequency:** Every 2 years (LTS release cycle)  
**Risk Level:** 🔴 High (major system change)  
**Downtime:** 30-60 minutes (planned maintenance)

**Strategy: Blue-Green Server Migration**

Instead of upgrading in-place, **provision a new server** with the new OS:

**Step-by-Step Process:**

```bash
# 1. Provision new Hetzner server (Green)
# - Same size: ubuntu-4gb-nbg1-16
# - New Ubuntu LTS version
# - Name: ubuntu-4gb-nbg1-16-daon-NEW

# 2. Set up new server from scratch
ssh daon-new

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Clone repository
git clone https://github.com/your-org/daon.git /opt/daon-source
cd /opt/daon-source

# Copy .env from old server
scp daon:/opt/daon-source/.env /opt/daon-source/.env

# 3. Sync blockchain data (MOST IMPORTANT)
# On old server, create blockchain backup
ssh daon "docker exec daon-blockchain tar czf - /daon/.daon" > blockchain-backup.tar.gz

# Transfer to new server
scp blockchain-backup.tar.gz daon-new:/tmp/

# On new server, restore blockchain
ssh daon-new
mkdir -p /opt/daon-database/blockchain
tar xzf /tmp/blockchain-backup.tar.gz -C /opt/daon-database/blockchain
sudo chown -R 1000:1000 /opt/daon-database/blockchain

# 4. Sync database
# On old server
ssh daon "docker exec daon-postgres pg_dump -U daon daon" > database.sql

# On new server
scp database.sql daon-new:/tmp/
ssh daon-new

# Start postgres temporarily
cd /opt/daon-source
docker compose up -d daon-postgres
sleep 10

# Import database
cat /tmp/database.sql | docker exec -i daon-postgres psql -U daon daon

# 5. Start all services on new server
docker compose up -d

# 6. Test new server
curl http://NEW_SERVER_IP:3000/health

# 7. Update DNS / Load Balancer
# Point api.daon.network to NEW server IP
# Wait for DNS propagation (5-10 minutes)

# 8. Verify production traffic on new server
ssh daon-new
docker logs daon-api-1 -f

# 9. Keep old server running for 24 hours (fallback)
# If problems, switch DNS back to old server

# 10. After 24 hours of stable operation:
# - Destroy old server
# - Rename new server: daon-new → daon
# - Update SSH config
```

**Downtime:** 
- DNS propagation: 5-10 minutes
- During this time, both servers can serve traffic
- True downtime: ~2 minutes (during DNS switch)

---

## Emergency Rollback Procedures

### Rollback 1: Application Code

**If new code causes issues:**

```bash
# 1. Quick rollback to previous Docker image
cd /opt/daon-source

# Re-tag previous version as latest
docker tag daon-api:previous daon-api:latest
docker tag daon-blockchain:previous daon-blockchain:latest

# Force recreation with previous version
docker compose up -d --force-recreate

# 2. Verify rollback
curl https://api.daon.network/health
docker exec daon-blockchain daond status
```

**Time to rollback:** ~30 seconds

---

### Rollback 2: Database Migration

**If migration corrupts data:**

```bash
# Option A: Restore from local backup (faster)
cd /opt/daon-source
docker compose stop

cat /opt/daon-backups/pre-migration-*.sql | \
  docker exec -i daon-postgres psql -U daon daon

docker compose up -d

# Option B: Restore from Hetzner snapshot (more comprehensive)
# Via Hetzner Cloud Console:
# 1. Destroy current server
# 2. Create new server from snapshot
# 3. Update DNS if needed
```

**Time to rollback:** 
- Local backup: ~5 minutes
- Hetzner snapshot: ~15-20 minutes

---

### Rollback 3: OS Update Breaks System

**If kernel update causes boot failure:**

```bash
# Via Hetzner Cloud Console:
# 1. Access server via VNC console
# 2. Boot into recovery mode
# 3. Restore from Hetzner snapshot

# OR (if accessible via SSH):
ssh daon

# Rollback kernel to previous version
sudo apt install linux-image-PREVIOUS_VERSION
sudo update-grub
sudo reboot
```

**Time to rollback:** ~10 minutes

---

## Backup Strategy

### Current Backups (✅ Enabled)

**Hetzner Automated Backups:**
- **Frequency:** Daily
- **Retention:** Last 7 days
- **Coverage:** Full server snapshot
- **Recovery Time:** 15-20 minutes (full server restore)
- **Cost:** Included in server plan

**What's Covered:**
- ✅ Full OS state
- ✅ All Docker volumes
- ✅ Blockchain data
- ✅ PostgreSQL database
- ✅ Configuration files
- ✅ SSL certificates

**Recovery Process:**
```bash
# Via Hetzner Cloud Console:
# 1. Servers → daon → Snapshots
# 2. Select backup date
# 3. "Create Server from Snapshot"
# 4. Update DNS if needed (new IP)
# 5. Test: curl https://NEW_IP/health
```

---

### Optional: Application-Level Backups

**For faster recovery of specific components:**

```bash
#!/bin/bash
# /opt/daon/scripts/incremental-backup.sh

BACKUP_DIR="/opt/daon-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Blockchain state (most critical - 10GB+)
docker exec daon-blockchain tar czf - /daon/.daon > "$BACKUP_DIR/blockchain.tar.gz" &

# Database (fast - usually < 100MB)
docker exec daon-postgres pg_dump -U daon daon | gzip > "$BACKUP_DIR/database.sql.gz" &

# Configuration files (tiny)
tar czf "$BACKUP_DIR/config.tar.gz" \
  /opt/daon-source/.env \
  /opt/daon-source/docker-compose.yml

wait # Wait for parallel backups to finish

# Optional: Upload to S3/Backblaze for off-site storage
# aws s3 sync "$BACKUP_DIR" s3://daon-backups/$(date +%Y%m%d)/

# Keep only last 7 days locally (Hetzner has older ones)
find /opt/daon-backups -type d -mtime +7 -exec rm -rf {} +

echo "✅ Backup complete: $BACKUP_DIR"
```

**Cron Job (hourly incremental backups):**
```cron
0 * * * * /opt/daon/scripts/incremental-backup.sh >> /var/log/daon-backups.log 2>&1
```

**Recommendation:**
- Hetzner daily backups = **Sufficient for most scenarios**
- Add incremental backups only if:
  - You need < 24 hour recovery point
  - You want off-site redundancy (S3)
  - You process high-value transactions

---

## Monitoring & Alerts

### Health Check Script (Simple)

```bash
#!/bin/bash
# /opt/daon/scripts/health-check.sh

# Email for alerts
ALERT_EMAIL="admin@daon.network"

# Check API health
if ! curl -sf https://api.daon.network/health > /dev/null; then
  echo "ALERT: API is down!" | mail -s "🚨 DAON API Down" $ALERT_EMAIL
fi

# Check blockchain
if ! docker exec daon-blockchain daond status > /dev/null 2>&1; then
  echo "ALERT: Blockchain is down!" | mail -s "🚨 DAON Blockchain Down" $ALERT_EMAIL
fi

# Check disk space
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
  echo "ALERT: Disk usage at ${DISK_USAGE}%!" | mail -s "⚠️ DAON Disk Space Warning" $ALERT_EMAIL
fi

# Check Docker containers
UNHEALTHY=$(docker ps -a --filter "health=unhealthy" --format "{{.Names}}")
if [ -n "$UNHEALTHY" ]; then
  echo "ALERT: Unhealthy containers: $UNHEALTHY" | mail -s "🚨 DAON Container Unhealthy" $ALERT_EMAIL
fi
```

**Cron Job:**
```cron
*/5 * * * * /opt/daon/scripts/health-check.sh
```

---

### Advanced: Prometheus + Grafana (Optional)

**For comprehensive metrics:**
- Request latency
- Error rates
- Blockchain block height
- Database connections
- Memory/CPU usage
- Custom business metrics

**Setup time:** 4-6 hours  
**Benefit:** Professional-grade monitoring dashboards

---

## Disaster Recovery

### Recovery Time Objectives (RTO)

| Scenario | RTO | Procedure |
|----------|-----|-----------|
| Single container crash | < 1 min | Docker auto-restart |
| Application bug | < 5 min | Rollback to previous image |
| Database corruption | < 15 min | Restore from backup |
| Full server failure | < 30 min | Restore from Hetzner snapshot |
| Data center outage | < 2 hours | Deploy to new region |

### Recovery Point Objectives (RPO)

| Data Type | RPO | Backup Method |
|-----------|-----|---------------|
| Blockchain state | 24 hours | Hetzner daily snapshot |
| Database | 24 hours | Hetzner daily snapshot |
| Configuration | 24 hours | Git + Hetzner snapshot |
| Optional: All data | 1 hour | Incremental backups (if configured) |

---

## Maintenance Schedule

### Weekly (Automated)
- ✅ Security updates (Sunday 2 AM)
- ✅ Health checks (every 5 minutes)
- ✅ Log rotation

### Monthly (Manual)
- 🔍 Review disk usage
- 🔍 Check for kernel updates
- 🔍 Review error logs
- 🔍 Test backup restoration

### Quarterly (Manual)
- 🔍 Review and update dependencies
- 🔍 Security audit
- 🔍 Performance optimization
- 🔍 Disaster recovery drill

### Yearly (Manual)
- 🔍 Ubuntu LTS upgrade evaluation
- 🔍 Infrastructure cost review
- 🔍 Capacity planning

---

## DevOps Best Practices

### ✅ Always Do
1. **Take Hetzner snapshot before major changes**
2. **Test in staging/local first**
3. **Use rolling updates (one instance at a time)**
4. **Monitor health checks during updates**
5. **Keep rollback commands ready**
6. **Document changes in git commits**

### ❌ Never Do
1. **Never `apt upgrade` without Hetzner snapshot**
2. **Never update all API instances at once**
3. **Never run untested migrations in production**
4. **Never skip health checks**
5. **Never delete backups without verifying new ones**

---

## Quick Reference Commands

### System Updates
```bash
# Check for updates
ssh daon "apt list --upgradable"

# Security updates only
ssh daon "sudo unattended-upgrade -d"

# Full update (after snapshot!)
ssh daon "sudo apt update && sudo apt upgrade -y"
```

### Container Updates
```bash
# Rolling update
/opt/daon/scripts/deploy-app.sh

# Quick rollback
docker tag daon-api:previous daon-api:latest
docker compose up -d --force-recreate
```

### Backup & Restore
```bash
# Manual backup
/opt/daon/scripts/incremental-backup.sh

# Restore database
cat backup.sql | docker exec -i daon-postgres psql -U daon daon

# Restore from Hetzner snapshot
# (Via Hetzner Cloud Console)
```

---

## Conclusion

**DevOps Strategy Summary:**

✅ **OS Updates:** Automated security patches, manual major upgrades  
✅ **App Updates:** Zero-downtime rolling deployments  
✅ **Backups:** Hetzner daily snapshots (sufficient for most cases)  
✅ **Monitoring:** Health checks (simple script or Prometheus)  
✅ **Disaster Recovery:** RTO < 30 minutes for most scenarios  
✅ **Rollback:** Sub-minute rollbacks for app issues  

**Key Principle:** 
**Containerization = Most updates don't require server restarts**

Only kernel updates require reboots, and those happen ~once per month with 2-minute downtime.

---

**Questions or issues? Check:**
- CRITICAL_PATTERNS.md (common pitfalls)
- DEPLOYMENT_SUCCESS.md (production status)
- NEXT_STEPS.md (task backlog)
