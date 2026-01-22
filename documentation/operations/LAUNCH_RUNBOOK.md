# DAON Network Production Launch Runbook

**Version:** 1.0
**Last Updated:** 2026-01-22
**Environment:** Single Hetzner server (test → production)

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Launch Timeline](#pre-launch-timeline)
3. [Launch Day Procedures](#launch-day-procedures)
4. [Post-Launch Monitoring](#post-launch-monitoring)
5. [Rollback Procedures](#rollback-procedures)
6. [Troubleshooting](#troubleshooting)

---

## Overview

This runbook guides the production launch of DAON Network, transitioning a single Hetzner server from testing environment to production.

### Launch Strategy

- **Single Environment:** One server serves as both test and production (sequential)
- **Process:** Test → Load Test → Wipe → Reset → Launch
- **Chain ID Transition:** `daon-test-*` → `daon-mainnet-1`
- **Target:** Handle 1000+ concurrent users with <1% error rate

### Prerequisites

- ✅ Hetzner server provisioned and accessible
- ✅ All scripts created and tested
- ✅ GitHub Secrets configured
- ✅ DNS configured for api.daon.network
- ✅ SSL certificates ready (Caddy handles automatically)
- ✅ Team briefed on launch procedures

---

## Pre-Launch Timeline

### T-7 Days: Infrastructure Preparation

**Goal:** Establish baseline and verify infrastructure

**Tasks:**

1. **Run Infrastructure Verification**
   ```bash
   ./scripts/operations/pre-launch-check.sh
   ```
   - Fix any failures
   - Document warnings for review

2. **Establish Baseline Metrics**
   - Open Grafana dashboard
   - Record current metrics:
     - API response time
     - Database connection count
     - Memory/CPU usage
     - Blockchain height
   - Save screenshots for comparison

3. **Document Current State**
   ```bash
   # Current chain ID
   grep CHAIN_ID .env

   # Current blockchain height
   curl -s http://localhost:26657/status | jq '.result.sync_info.latest_block_height'

   # Current API version
   curl -s http://localhost:3000/health | jq '.'
   ```

4. **Review Backup Strategy**
   - Verify daily backups are running
   - Test backup restoration process
   - Ensure off-site backup configured (rclone/S3)

**Deliverables:**
- ✅ Pre-launch check report (saved)
- ✅ Baseline metrics documented
- ✅ Backup verification complete

---

### T-5 Days: Load Testing

**Goal:** Validate system can handle production load (500-1500 users)

**Tasks:**

1. **Pre-Test Preparation**
   ```bash
   # Ensure system is in good state
   docker compose ps
   ./scripts/operations/pre-launch-check.sh

   # Clear any old test data
   docker compose exec -T redis redis-cli FLUSHDB
   ```

2. **Run Initial Load Test** (500 users)
   ```bash
   ./scripts/testing/run-load-test.sh http://localhost:3000 500 15m
   ```
   - Review results in `/opt/daon/load-tests/results/YYYYMMDD_HHMMSS/REPORT.md`
   - Analyze error rates and response times

3. **Performance Tuning** (if needed)

   If error rate > 5% or p95 > 2s:

   - **Database Tuning:**
     ```javascript
     // api-server/src/database/config.ts
     pool: {
       min: 2,
       max: 30,  // Increase from 20
       idle: 10000,
       acquire: 30000,
     }
     ```

   - **Container Resources:**
     ```yaml
     # docker-compose.production.yml
     daon-api-production:
       deploy:
         resources:
           limits:
             memory: 2G  # Increase from 1G
             cpus: '2.0'  # Increase from 1.0
     ```

   - **Blockchain Block Time:**
     ```toml
     # Check config.toml
     [consensus]
     timeout_commit = "5s"
     ```

4. **Run Full Load Test** (1500 users)
   ```bash
   ./scripts/testing/run-load-test.sh http://localhost:3000 1500 20m
   ```
   - Verify error rate < 10%
   - Verify p95 < 5s
   - Verify system recovers after test

5. **Analyze Results**
   ```bash
   cd /opt/daon/load-tests/results/YYYYMMDD_HHMMSS/
   cat REPORT.md

   # Check system metrics
   tail -50 system-metrics.csv

   # Review errors
   grep ERROR console.log
   ```

**Success Criteria:**
- ✅ Error rate < 10% at 1500 users
- ✅ P95 response time < 5s
- ✅ System stable after load test
- ✅ No memory leaks detected

**Deliverables:**
- ✅ Load test report saved
- ✅ Performance tuning applied (if needed)
- ✅ Re-test passed after tuning

---

### T-3 Days: Security Audit

**Goal:** Ensure production security posture

**Tasks:**

1. **Run Pre-Launch Checks**
   ```bash
   ./scripts/operations/pre-launch-check.sh > security-audit.log
   ```

2. **Review Secrets**
   ```bash
   # Verify no default secrets
   grep -E "changeme|test-secret|password" .env && echo "FAIL: Default secrets found" || echo "PASS"

   # Check secret strength (should be 32+ characters)
   grep JWT_SECRET .env | awk -F'=' '{print length($2)}'
   grep ENCRYPTION_KEY .env | awk -F'=' '{print length($2)}'
   ```

3. **Verify SSL Certificates**
   ```bash
   # Check certificate validity
   echo | openssl s_client -servername api.daon.network -connect api.daon.network:443 2>/dev/null | \
     openssl x509 -noout -dates
   ```

4. **Review Firewall Rules**
   ```bash
   sudo ufw status verbose

   # Expected: Only ports 22, 80, 443 open
   # 22: SSH (restricted to specific IPs if possible)
   # 80: HTTP (redirects to 443)
   # 443: HTTPS
   ```

5. **Check File Permissions**
   ```bash
   # .env should be 600
   ls -la .env

   # Secrets directory should be 700
   ls -ld /opt/daon/secrets/
   ```

6. **Scan for Exposed Secrets**
   ```bash
   # Check recent logs for accidentally logged secrets
   grep -ri "password\|secret\|key\|token" /opt/daon/logs/ | head -20
   ```

7. **Review Dependencies**
   ```bash
   # API server vulnerabilities
   cd api-server
   npm audit

   # Fix critical/high vulnerabilities
   npm audit fix
   ```

**Security Checklist:**
- ✅ All secrets are strong and unique
- ✅ SSL certificate valid for 30+ days
- ✅ Firewall properly configured
- ✅ File permissions secure
- ✅ No secrets in logs
- ✅ No critical/high npm vulnerabilities
- ✅ Rate limiting configured
- ✅ CORS properly configured

**Deliverables:**
- ✅ Security audit log saved
- ✅ All security issues resolved

---

### T-1 Day: Final Verification

**Goal:** Confirm readiness for production launch

**Tasks:**

1. **Full Smoke Test**
   ```bash
   # 1. Register test content
   curl -X POST http://localhost:3000/api/v1/protect \
     -H "Content-Type: application/json" \
     -d '{"content": "Pre-launch test", "metadata": {"title": "Test"}}'

   # 2. Verify blockchain transaction
   curl -s http://localhost:26657/status | jq '.result.sync_info'

   # 3. Query content
   curl -s http://localhost:3000/api/v1/stats | jq '.'
   ```

2. **Test Webhook Delivery** (if webhooks configured)
   ```bash
   # Set up test webhook endpoint
   # Register content
   # Verify webhook received
   ```

3. **Notify Team**
   - Send launch schedule to team
   - Confirm on-call engineer assigned
   - Share monitoring dashboard links
   - Review escalation procedures

4. **Prepare Rollback Plan**
   - Document pre-wipe backup location
   - Test restoration procedure (on dev/staging if available)
   - Prepare rollback commands (see Rollback Procedures section)

5. **Final Pre-Launch Check**
   ```bash
   ./scripts/operations/pre-launch-check.sh
   ```
   - **ALL checks must pass**
   - Address any warnings

**Go/No-Go Decision:**
- ✅ All pre-launch checks passed
- ✅ Load tests successful
- ✅ Security audit complete
- ✅ Team prepared
- ✅ Rollback plan ready

**Deliverables:**
- ✅ Smoke test successful
- ✅ Team notified
- ✅ Rollback plan documented
- ✅ Final checks passed

---

## Launch Day Procedures

### T-4 Hours: Production Transition

**Goal:** Wipe test environment and initialize production chain

**⚠️ POINT OF NO RETURN - Confirm Go/No-Go**

**Tasks:**

1. **Announce Maintenance Window**
   ```bash
   # If you have a status page, update it
   # Notify users via email/social media
   # Estimated downtime: 1-2 hours
   ```

2. **Run Complete Wipe and Reset**
   ```bash
   cd /opt/daon-source
   ./scripts/operations/wipe-and-reset.sh
   ```

   When prompted:
   - Confirmation: Type `WIPE-PRODUCTION`
   - Chain ID confirmation: Type current test chain ID
   - New chain ID: Select option 1 (Production: daon-mainnet-1)

3. **Save Critical Secrets**

   **IMMEDIATELY after wipe:**
   ```bash
   # Copy secrets to secure vault (1Password, etc.)
   # DO NOT skip this step!

   # Validator mnemonic
   cat /opt/daon/secrets/api-wallet-daon-mainnet-1.txt

   # All secrets
   cat /opt/daon/secrets/secrets-daon-mainnet-1.env
   ```

   **Action Required:**
   - Copy validator mnemonic to 1Password
   - Copy all secrets to 1Password
   - Verify secrets are saved before proceeding

4. **Update GitHub Secrets**

   Go to: `https://github.com/YOUR_ORG/daon/settings/secrets/actions`

   Update:
   - `POSTGRES_PASSWORD` (from secrets file)
   - `API_KEY_SECRET` (from secrets file)
   - `API_MNEMONIC` (from wallet file)
   - `CHAIN_ID` → `daon-mainnet-1`

5. **Deploy Production Configuration**
   ```bash
   # Push to main (triggers GitHub Actions deploy)
   git add .env
   git commit -m "chore: configure production environment"
   git push origin main
   ```

   Or manual deploy:
   ```bash
   ./manual-deploy.sh
   ```

6. **Verify Deployment**
   ```bash
   # Wait for deployment to complete (5-10 minutes)
   # Watch GitHub Actions workflow

   # Once complete, verify services
   docker compose ps

   # All containers should be "Up"
   ```

**Checkpoints:**
- ✅ Wipe completed successfully
- ✅ Secrets saved to secure vault
- ✅ GitHub Secrets updated
- ✅ Deployment successful
- ✅ All containers running

---

### T-2 Hours: Validation

**Goal:** Verify production environment is correctly configured

**Tasks:**

1. **Run Pre-Launch Checks**
   ```bash
   ./scripts/operations/pre-launch-check.sh
   ```

   **Expected:**
   - Chain ID: `daon-mainnet-1`
   - NODE_ENV: `production`
   - All checks passing
   - Zero warnings acceptable

2. **Verify Chain ID**
   ```bash
   # Check environment
   grep CHAIN_ID .env

   # Check blockchain
   curl -s http://localhost:26657/status | jq '.result.node_info.network'

   # Should both show: daon-mainnet-1
   ```

3. **Test All API Endpoints**
   ```bash
   # Health
   curl -s http://localhost:3000/health | jq '.'

   # Stats
   curl -s http://localhost:3000/api/v1/stats | jq '.'

   # Protect content (test transaction)
   curl -X POST http://localhost:3000/api/v1/protect \
     -H "Content-Type: application/json" \
     -d '{
       "content": "Production launch test",
       "metadata": {"title": "Launch Test", "type": "test"}
     }' | jq '.'

   # Verify transaction on blockchain
   curl -s http://localhost:26657/tx_search?query='"'"'tx.height>0'"'"' | jq '.result.total_count'
   ```

4. **Test Frontend Connectivity**
   ```bash
   # If frontend is deployed
   curl -s https://app.daon.network | grep -q "DAON" && echo "Frontend OK" || echo "Frontend FAIL"
   ```

5. **Verify Monitoring**
   ```bash
   # Check Prometheus
   curl -s http://localhost:9090/-/healthy

   # Check Grafana
   curl -s http://localhost:3001/api/health

   # Open dashboards and verify metrics flowing
   ```

**Checkpoints:**
- ✅ Pre-launch checks passed
- ✅ Chain ID is `daon-mainnet-1`
- ✅ All API endpoints working
- ✅ Test transaction successful
- ✅ Frontend accessible (if deployed)
- ✅ Monitoring operational

---

### T-1 Hour: Monitoring Setup

**Goal:** Prepare for launch and active monitoring

**Tasks:**

1. **Open Monitoring Dashboards**
   - Grafana: `http://YOUR_SERVER:3001`
   - Prometheus: `http://YOUR_SERVER:9090`
   - Server metrics: `htop` or `docker stats`

2. **Verify Alerts Configured**
   ```bash
   # Check alert rules loaded
   curl -s http://localhost:9090/api/v1/rules | jq '.data.groups[] | .name'

   # Test alert notification (optional - triggers test alert)
   # curl -X POST http://localhost:9090/api/v1/alerts
   ```

3. **Assign On-Call Engineer**
   - Primary: [Name, Contact]
   - Secondary: [Name, Contact]
   - Escalation path: [Manager, Contact]

4. **Prepare Communication Channels**
   - Slack channel ready: #daon-launch
   - Email list prepared
   - Twitter/social media accounts ready

5. **Final System Check**
   ```bash
   # Resource check
   docker stats --no-stream

   # Logs check (should be clean)
   docker compose logs --tail=50 | grep -i error

   # Final health check
   curl -s http://localhost:3000/health
   ```

**Checkpoints:**
- ✅ All dashboards open and accessible
- ✅ Alerts configured and tested
- ✅ On-call engineer assigned
- ✅ Communication channels ready
- ✅ System healthy and ready

---

### T-0: GO LIVE 🚀

**Goal:** Launch to production

**Tasks:**

1. **Remove Maintenance Page** (if any)
   ```bash
   # Update status page to "Operational"
   # Remove any maintenance banners
   ```

2. **Announce Launch**
   ```bash
   # Social media
   # Email subscribers
   # Community channels
   ```

3. **Monitor Actively (First 30 Minutes)**

   Watch for:
   - Error spikes in logs
   - High response times
   - Memory/CPU spikes
   - Alert notifications

   ```bash
   # Live logs
   docker compose logs -f

   # Live stats
   watch -n 5 'docker stats --no-stream'

   # Live metrics
   # Keep Grafana dashboard open
   ```

4. **Test User Flows**
   - Register content as a user
   - Verify content on blockchain
   - Query content via API
   - Test all critical paths

5. **Response to Issues**

   If errors > 5% or critical failures:
   - **DO NOT PANIC**
   - Check logs: `docker compose logs --tail=100`
   - Check metrics in Grafana
   - Consult troubleshooting section
   - Consider rollback if critical (within 1 hour)

**Success Indicators:**
- ✅ Error rate < 1%
- ✅ Response time p95 < 2s
- ✅ No critical alerts firing
- ✅ User transactions completing successfully
- ✅ System stable

---

## Post-Launch Monitoring

### Hour 1: Active Monitoring

**Tasks:**
- Watch logs continuously
- Monitor error rates
- Check user reports/feedback
- Verify all integrations working
- Be ready for immediate response

**Key Metrics:**
- Request rate
- Error rate (target: <1%)
- Response time p95 (target: <2s)
- Memory usage (target: <80%)
- CPU usage (target: <70%)

---

### Hour 4: Metrics Review

**Tasks:**

1. **Generate Metrics Report**
   ```bash
   # API metrics (4-hour window)
   curl -s 'http://localhost:9090/api/v1/query?query=rate(http_requests_total[4h])'

   # Error rate
   curl -s 'http://localhost:9090/api/v1/query?query=rate(http_requests_total{status=~"5.."}[4h])'
   ```

2. **Review Logs for Errors**
   ```bash
   docker compose logs --since 4h | grep -i error | wc -l
   docker compose logs --since 4h | grep -i warning | wc -l
   ```

3. **Verify Backups**
   ```bash
   # Check latest backup
   ls -lh /opt/daon/backups/ | tail -5

   # Verify backup size is reasonable
   du -sh /opt/daon/backups/$(ls -t /opt/daon/backups/ | head -1)
   ```

4. **User Feedback Review**
   - Check support channels
   - Review social media mentions
   - Check for reported issues

---

### Hour 12: Performance Check

**Tasks:**

1. **Performance Analysis**
   ```bash
   # Response time trends
   curl -s 'http://localhost:9090/api/v1/query?query=histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[12h]))'

   # Database performance
   docker compose exec -T postgres psql -U daon_api -d daon_production -c \
     "SELECT query, calls, mean_exec_time, max_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
   ```

2. **Resource Usage Check**
   ```bash
   # Disk usage trend
   df -h

   # Memory usage
   free -h

   # Container stats
   docker stats --no-stream
   ```

3. **Blockchain Health**
   ```bash
   # Block production rate
   curl -s http://localhost:26657/status | jq '.result.sync_info'

   # Transaction count
   curl -s http://localhost:26657/num_unconfirmed_txs | jq '.'
   ```

---

### Hour 24: Comprehensive Review

**Tasks:**

1. **24-Hour Metrics Summary**
   - Total requests
   - Total errors
   - Average response time
   - Peak concurrent users
   - Blockchain transactions
   - User registrations

2. **Post-Launch Report**
   ```markdown
   # DAON Production Launch Report

   **Launch Date:** YYYY-MM-DD
   **Launch Time:** HH:MM UTC

   ## Metrics (24 hours)
   - Total Requests: XXX,XXX
   - Error Rate: X.XX%
   - Avg Response Time: XXXms
   - P95 Response Time: XXXms
   - Peak Concurrent Users: XXX
   - Blockchain Transactions: XXX
   - Uptime: XX.XX%

   ## Issues Encountered
   - [List any issues and resolutions]

   ## Lessons Learned
   - [What went well]
   - [What could be improved]

   ## Next Steps
   - [Follow-up actions]
   ```

3. **Team Debrief**
   - Schedule post-mortem meeting
   - Document lessons learned
   - Update runbook with improvements

---

## Rollback Procedures

### When to Rollback

**Rollback if ANY of these conditions:**
- Critical functionality broken (users cannot register content)
- Error rate > 25% sustained for 10+ minutes
- Data corruption detected
- Security breach discovered
- Blockchain consensus failure

**Timeline:**
- **Within 1 hour of launch:** Can rollback to pre-wipe backup
- **After 1 hour:** Fix forward instead (blockchain state diverged)

---

### Rollback Steps (Within 1 Hour Only)

**⚠️ This DESTROYS production chain and restores test chain**

1. **Stop All Services**
   ```bash
   cd /opt/daon-source
   docker compose down -v
   ```

2. **Restore from Pre-Wipe Backup**
   ```bash
   # Find backup directory
   BACKUP_DIR=$(ls -td /opt/daon/backups/pre-wipe-* | head -1)
   echo "Restoring from: $BACKUP_DIR"

   # Restore database
   gunzip < $BACKUP_DIR/database.sql.gz | \
     docker compose run --rm -T postgres psql -U postgres

   # Restore blockchain volume
   docker volume create daon_daon-blockchain-data
   docker run --rm \
     -v daon_daon-blockchain-data:/target \
     -v $BACKUP_DIR:/backup \
     alpine tar xzf /backup/blockchain-data.tar.gz -C /target

   # Restore .env
   cp $BACKUP_DIR/env-backup /opt/daon-source/.env
   ```

3. **Restart Services**
   ```bash
   docker compose up -d
   ```

4. **Verify Restoration**
   ```bash
   # Check chain ID (should be test chain)
   curl -s http://localhost:26657/status | jq '.result.node_info.network'

   # Check data restored
   curl -s http://localhost:3000/api/v1/stats
   ```

5. **Notify Users**
   ```bash
   # Update status page
   # Send notification: "We've rolled back to resolve issues. Investigating."
   ```

---

### Fix-Forward Procedures (After 1 Hour)

**If blockchain has been running for >1 hour, do NOT rollback**

Instead, fix issues in place:

1. **Identify Root Cause**
   ```bash
   # Check logs
   docker compose logs --tail=500 | grep -i error

   # Check metrics
   # Open Grafana, look for anomalies
   ```

2. **Apply Hot Fixes**
   - Restart failing services
   - Increase resource limits
   - Apply code patches
   - Roll back specific code changes (not full environment)

3. **Monitor Closely**
   - Verify fix resolved issue
   - Watch for regression

---

## Troubleshooting

### Common Issues

#### High Error Rate

**Symptoms:** Error rate > 5%

**Diagnosis:**
```bash
# Check logs for specific errors
docker compose logs daon-api | grep ERROR | tail -50

# Check database connections
docker compose exec -T postgres psql -U daon_api -d daon_production -c \
  "SELECT count(*) FROM pg_stat_activity;"
```

**Solutions:**
- Database connection pool full → Increase `DB_POOL_MAX`
- Blockchain unresponsive → Restart blockchain container
- Memory pressure → Increase container memory limits

---

#### Slow Response Times

**Symptoms:** P95 > 5s

**Diagnosis:**
```bash
# Check slow queries
docker compose exec -T postgres psql -U daon_api -d daon_production -c \
  "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 5;"

# Check system resources
docker stats --no-stream
```

**Solutions:**
- Slow queries → Add database indexes
- High CPU → Scale API containers horizontally
- High memory → Investigate memory leaks

---

#### Blockchain Not Syncing

**Symptoms:** `catching_up: true` in status

**Diagnosis:**
```bash
curl -s http://localhost:26657/status | jq '.result.sync_info'
```

**Solutions:**
- Check peer count → Ensure `p2p_peers > 2`
- Check block height → Compare with network
- Restart blockchain if stuck

---

#### Out of Memory

**Symptoms:** Container crashes, OOM in logs

**Diagnosis:**
```bash
docker compose logs | grep -i "oom\|memory"
```

**Solutions:**
```yaml
# Increase memory limits in docker-compose.production.yml
deploy:
  resources:
    limits:
      memory: 2G  # Increase as needed
```

---

### Emergency Contacts

- **Primary On-Call:** [Name, Phone, Email]
- **Secondary On-Call:** [Name, Phone, Email]
- **Escalation:** [Manager, Phone, Email]
- **Hetzner Support:** support@hetzner.com

---

### Additional Resources

- **Monitoring:** http://YOUR_SERVER:3001 (Grafana)
- **Metrics:** http://YOUR_SERVER:9090 (Prometheus)
- **Logs:** `docker compose logs -f`
- **Documentation:** /documentation/
- **GitHub Issues:** https://github.com/YOUR_ORG/daon/issues

---

## Appendix

### Quick Reference Commands

```bash
# System health check
./scripts/operations/pre-launch-check.sh

# View logs
docker compose logs -f

# Restart service
docker compose restart daon-api

# Check resource usage
docker stats --no-stream

# Database connection count
docker compose exec -T postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Blockchain status
curl -s http://localhost:26657/status | jq '.result.sync_info'

# API health
curl -s http://localhost:3000/health | jq '.'
```

---

**End of Runbook**

Good luck with the launch! 🚀
