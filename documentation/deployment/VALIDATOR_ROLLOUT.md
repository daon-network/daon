# DAON Validator Rollout Plan

## Overview

This document outlines the safe, phased deployment of DAON validators to achieve true decentralization.

**Goal:** Deploy 2 dedicated validators (Helsinki + Falkenstein) to replace/supplement the production validator.

**Strategy:** One at a time, with monitoring between phases.

---

## Current State

```
Production Server (Current Provider, Current Location)
├── Blockchain Validator (genesis validator, 100% voting power)
├── API Servers (3 instances)
├── PostgreSQL
└── Redis
```

**Issues:**
- ❌ Single validator (single point of failure)
- ❌ Validator on same server as API (not ideal separation)
- ❌ Zero geographic redundancy
- ❌ Can't do zero-downtime maintenance

---

## Target State

```
Validator 1 (Helsinki, hel1)          Validator 2 (Falkenstein, fsn1)
├── CX33 Server                       ├── CX33 Server
├── Blockchain Validator              ├── Blockchain Validator
└── 50% voting power                  └── 50% voting power

Production Server (Current Provider, Current Location)
├── Blockchain Full Node (NOT validator)
├── API Servers (3 instances)
├── PostgreSQL
└── Redis
```

**Benefits:**
- ✅ Two validators in different datacenters
- ✅ Geographic redundancy (Finland + Germany)
- ✅ Survives single datacenter outage
- ✅ Validators separate from API infrastructure
- ✅ Zero-downtime maintenance
- ✅ True decentralization

---

## Rollout Phases

### Phase 0: Preparation (Before Starting)

**Tasks:**
1. Verify production validator is healthy
2. Document current validator address and keys
3. Ensure Hetzner account has budget for 2 CX33 servers
4. Review this entire plan
5. Schedule deployment window (low-traffic time recommended)

**Prerequisites:**
- [ ] Production blockchain is synced and producing blocks
- [ ] No critical bugs in production
- [ ] Team available for monitoring

**Expected Duration:** 1 hour of planning

---

### Phase 1: Deploy Helsinki Validator

**Objective:** Add second validator to the network

**Timeline:** 2-4 hours

#### 1.1 Create Server (5 minutes)

```bash
# Option A: Hetzner Cloud Console
# - Go to https://console.hetzner.cloud/
# - Create Server
# - Location: Helsinki (hel1)
# - Image: Ubuntu 22.04
# - Type: CX33 (2 vCPU, 8GB RAM, 80GB SSD)
# - Name: daon-validator-hel
# - SSH Key: Add your key
# - Create

# Option B: Hetzner CLI (if you have hcloud)
hcloud server create \
  --name daon-validator-hel \
  --type cx33 \
  --location hel1 \
  --image ubuntu-22.04 \
  --ssh-key <your-key-name>

# Save the IP address
export HEL_IP=<server-ip>
```

#### 1.2 Run Setup Script (15 minutes)

```bash
# SSH into the new server
ssh root@$HEL_IP

# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/daon-network/daon/main/setup-validator.sh -o setup-validator.sh
chmod +x setup-validator.sh
./setup-validator.sh

# When prompted:
# - Moniker: daon-validator-helsinki
# - Public IP: <auto-detected, press Enter>
# - Chain ID: daon-mainnet-1
# - Persistent Peers: <address-of-production-validator>
```

**How to get persistent peers from production:**
```bash
# On production server
docker exec daon-blockchain daond tendermint show-node-id --home /daon/.daon

# Output will be something like: a1b2c3d4e5f6...
# Format: <node-id>@<production-ip>:26656
# Example: a1b2c3d4e5f6@123.45.67.89:26656
```

#### 1.3 Wait for Sync (30-120 minutes)

```bash
# Monitor sync status on Helsinki server
/opt/daon-validator/monitor.sh

# Check if catching up
curl -s http://localhost:26657/status | jq '.result.sync_info.catching_up'

# When this returns "false", validator is fully synced
```

**While waiting:**
- Monitor production validator (ensure it's still running)
- Check Helsinki logs for errors: `docker logs -f daon-validator`
- Verify P2P connection: Check peer count is > 0

#### 1.4 Get Genesis File (if needed)

If the validator can't sync automatically:

```bash
# On production server, export genesis
docker exec daon-blockchain cat /daon/.daon/config/genesis.json > genesis.json

# Copy to Helsinki server
scp genesis.json root@$HEL_IP:/tmp/

# On Helsinki server
docker cp /tmp/genesis.json daon-validator:/daon/.daon/config/genesis.json
docker restart daon-validator
```

#### 1.5 Bond Helsinki as Validator (5 minutes)

Once fully synced:

```bash
# On Helsinki server
docker exec -it daon-validator bash

# Inside container
daond tx staking create-validator \
  --amount=1000000000stake \
  --pubkey=$(daond tendermint show-validator --home /daon/.daon) \
  --moniker="daon-validator-helsinki" \
  --chain-id=daon-mainnet-1 \
  --commission-rate="0.10" \
  --commission-max-rate="0.20" \
  --commission-max-change-rate="0.01" \
  --min-self-delegation="1" \
  --gas="auto" \
  --gas-adjustment=1.5 \
  --from=validator \
  --keyring-backend=test \
  --home=/daon/.daon \
  --yes

# Note: You'll need to fund the validator account first
# or use an existing account with tokens
```

#### 1.6 Verify Two Validators (10 minutes)

```bash
# Check validator set
curl -s http://localhost:26657/validators | jq '.result.validators | length'
# Should return 2

# Check both are signing
curl -s http://localhost:26657/validators | jq '.result.validators[] | {address, voting_power}'

# Expected output:
# {
#   "address": "...",
#   "voting_power": "XXX"
# }
# {
#   "address": "...",
#   "voting_power": "YYY"
# }
```

**Phase 1 Complete!** ✅
- You now have 2 validators
- Chain can survive one validator going down
- Zero downtime achieved

---

### Phase 2: Monitor & Verify (1 week recommended)

**Objective:** Ensure Helsinki validator is stable before adding third

**Tasks:**

#### Daily Monitoring (5 minutes/day)

```bash
# On Helsinki server
/opt/daon-validator/monitor.sh

# Check for:
# - Block height increasing
# - Validator still signing blocks
# - No excessive missed blocks
# - Disk usage not growing too fast
# - Peer count stable
```

#### Check Production Metrics

```bash
# On production server
curl -s https://api.daon.network/health | jq

# Verify:
# - API still working
# - Blockchain height matches Helsinki
# - No errors in API logs
```

#### What to Watch For:

**Good Signs:**
- ✅ Both validators producing blocks alternately
- ✅ Block heights stay in sync
- ✅ No missed blocks
- ✅ Peer count stays above 1

**Warning Signs:**
- ⚠️ One validator falling behind in block height
- ⚠️ Excessive missed blocks (check voting power)
- ⚠️ Peer count drops to 0
- ⚠️ Disk usage growing rapidly

**Action Items if Issues Found:**
1. Check validator logs: `docker logs daon-validator`
2. Verify network connectivity between validators
3. Check firewall rules (port 26656 open)
4. Verify both validators have same genesis file
5. If needed, can safely remove Helsinki validator and try again

**Duration:** 1 week minimum (can extend if you want more confidence)

---

### Phase 3: Deploy Falkenstein Validator

**Objective:** Add third validator for even more redundancy

**Timeline:** 2-4 hours (same as Phase 1)

**Why Add a Third?**
- Can survive one validator being down without single point of failure
- 2/3 consensus is more robust than 1/2
- Allows zero-downtime updates (update one at a time)

#### 3.1 Create Server (5 minutes)

```bash
# Via Hetzner Cloud Console or CLI
hcloud server create \
  --name daon-validator-fsn \
  --type cx33 \
  --location fsn1 \
  --image ubuntu-22.04 \
  --ssh-key <your-key-name>

export FSN_IP=<server-ip>
```

#### 3.2 Run Setup Script (15 minutes)

```bash
ssh root@$FSN_IP

curl -fsSL https://raw.githubusercontent.com/daon-network/daon/main/setup-validator.sh -o setup-validator.sh
chmod +x setup-validator.sh
./setup-validator.sh

# When prompted:
# - Moniker: daon-validator-falkenstein
# - Public IP: <auto-detected>
# - Chain ID: daon-mainnet-1
# - Persistent Peers: <production-validator>,<helsinki-validator>
```

**Get persistent peers:**
```bash
# Production node ID
ssh production "docker exec daon-blockchain daond tendermint show-node-id"

# Helsinki node ID
ssh $HEL_IP "docker exec daon-validator daond tendermint show-node-id --home /daon/.daon"

# Format both as:
# <node-id-1>@<prod-ip>:26656,<node-id-2>@<hel-ip>:26656
```

#### 3.3 Wait for Sync & Bond (30-120 minutes)

Same process as Phase 1:
1. Monitor sync status
2. Wait for `catching_up: false`
3. Bond as validator
4. Verify 3 validators in set

**Phase 3 Complete!** ✅
- You now have 3 validators
- Maximum redundancy for initial launch
- Can survive 1 validator down and still have 2/3 consensus

---

### Phase 4: Decommission Production Validator (Optional)

**Objective:** Move validator off production server, run dedicated full node instead

**Why?**
- ✅ Cleaner separation (validators separate from API)
- ✅ Production server can be smaller/cheaper
- ✅ Validators are purpose-built, not sharing resources
- ✅ Easier to scale API independently

**Why Not?**
- Having 3 validators is fine
- No urgent need to remove production validator
- Can keep it for extra redundancy

**If you decide to do this:**

#### 4.1 Update Production Server (30 minutes)

```bash
# On production server
cd /opt/daon-source

# Update docker-compose.yml to run full node instead of validator
# Change daon-blockchain service to NOT create validator keys
# Just sync and expose RPC/REST for API

# Restart services
docker compose down
docker compose up -d
```

#### 4.2 Unbond Production Validator (5 minutes)

```bash
# On production server
docker exec -it daon-blockchain bash

# Unbond validator
daond tx staking unbond <validator-address> \
  --from=validator \
  --chain-id=daon-mainnet-1 \
  --yes

# Wait for unbonding period (typically 21 days)
```

#### 4.3 Verify Two Validators Handling Consensus

```bash
# Check validator set
curl -s http://localhost:26657/validators | jq '.result.validators | length'
# Should return 2 (Helsinki + Falkenstein)

# Verify chain still producing blocks
curl -s https://api.daon.network/health | jq '.blockchain.height'
```

---

## Rollback Procedures

### If Helsinki Validator Fails During Phase 1:

```bash
# Simply stop and remove it
ssh $HEL_IP "cd /opt/daon-validator && docker compose down"

# Production validator continues running
# No downtime, no data loss

# Fix issues and try again when ready
```

### If Falkenstein Validator Fails During Phase 3:

```bash
# Stop Falkenstein
ssh $FSN_IP "cd /opt/daon-validator && docker compose down"

# Chain continues with 2 validators (production + Helsinki)
# Fix issues and redeploy when ready
```

### If Both New Validators Fail:

```bash
# Production validator is still running
# No downtime

# Investigate issues:
# - Check logs on failed validators
# - Verify genesis files match
# - Check network connectivity
# - Verify persistent peers configuration

# Can try again anytime
```

---

## Cost Analysis

### During Rollout:

**Phase 1 (Production + Helsinki):**
- Production server: Current cost
- Helsinki CX33: €6.29/month (prorated)
- **Total new cost:** ~€6.29/month

**Phase 3 (Production + Helsinki + Falkenstein):**
- Production server: Current cost
- Helsinki CX33: €6.29/month
- Falkenstein CX33: €6.29/month
- **Total new cost:** ~€12.58/month

**Phase 4 (Helsinki + Falkenstein only):**
- Helsinki CX33: €6.29/month
- Falkenstein CX33: €6.29/month
- Production server: Can potentially downgrade (no validator load)
- **Total new cost:** ~€12.58/month (possibly lower if you downgrade production)

### Annual Cost:

```
2 Validators: €12.58/month × 12 = €150.96/year (~$165/year)

For true decentralization and redundancy:
- €0.41/day for geographic redundancy
- €0.02/hour for zero-downtime operations
- Priceless: Actually being a blockchain
```

---

## Success Criteria

### Phase 1 Success:
- [ ] Helsinki validator fully synced
- [ ] Helsinki validator bonded and signing blocks
- [ ] 2 validators visible in validator set
- [ ] Both validators producing blocks alternately
- [ ] No errors in logs
- [ ] API continues working normally

### Phase 2 Success:
- [ ] Helsinki validator stable for 1+ week
- [ ] No missed blocks or minimal (<1%)
- [ ] Block heights stay in sync
- [ ] Peer connections stable
- [ ] No unexpected issues

### Phase 3 Success:
- [ ] Falkenstein validator fully synced
- [ ] Falkenstein validator bonded and signing blocks
- [ ] 3 validators in set
- [ ] All validators producing blocks
- [ ] Chain continues normally

### Phase 4 Success (if doing):
- [ ] Production server running full node (not validator)
- [ ] API continues working
- [ ] 2 dedicated validators handling consensus
- [ ] Clean separation of concerns

---

## Emergency Contacts

**During Rollout:**
- Have someone available who can SSH into servers
- Keep production server access available
- Monitor Discord/chat for validator issues
- Have rollback plan ready

**If Something Goes Wrong:**
1. Don't panic - production validator is still running
2. Check logs on all servers
3. Can safely remove failed validators
4. Chain will continue with remaining validators
5. Fix issues and try again

---

## Post-Rollout

### Monitoring Setup:

**Add to monitoring:**
- Validator uptime tracking
- Missed blocks alerts
- Disk usage alerts
- Peer count monitoring

**Tools to Consider:**
- Prometheus + Grafana for metrics
- UptimeRobot for basic uptime
- Custom alerting scripts

### Regular Maintenance:

**Weekly:**
- Check validator status
- Review logs for errors
- Monitor disk usage

**Monthly:**
- Update Docker images
- Review security patches
- Check backup integrity

**Quarterly:**
- Test restore from backup
- Review validator performance
- Consider adding more validators

### Documentation:

- [ ] Document actual validator addresses
- [ ] Save validator keys to secure location
- [ ] Update network documentation with new validators
- [ ] Share validator endpoints with community

---

## Next Steps After Rollout

1. **Invite Community Validators**
   - Universities, archives, creator platforms
   - Grow validator set beyond 2-3
   - True decentralization

2. **Set Up Public Explorer**
   - Show validator uptime
   - Display network stats
   - Build community trust

3. **Validator Rewards**
   - Configure block rewards
   - Set up delegation
   - Incentivize more validators

4. **Governance**
   - Enable on-chain voting
   - Validator governance participation
   - Network upgrades via consensus

---

## Conclusion

This phased rollout ensures:
- ✅ Zero downtime at every step
- ✅ Safe rollback options
- ✅ Time to verify each phase
- ✅ Minimal risk to production
- ✅ True decentralization achieved

**Timeline:**
- Phase 1: Half day (2-4 hours)
- Phase 2: One week (monitoring)
- Phase 3: Half day (2-4 hours)
- **Total:** ~2 weeks from start to finish

**Total Cost:**
- €12.58/month for 2 validators
- €18.87/month for 3 validators
- Worth it for actual decentralization

**Result:**
A truly decentralized blockchain protecting creators worldwide. 🎉
