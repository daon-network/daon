# DAON Validator Node Setup

This guide is for organizations and creators who want to run a DAON validator node to participate in the decentralized creator protection network.

## What is a Validator?

A validator node helps secure the DAON network by:
- Verifying creator content registrations
- Maintaining the blockchain ledger
- Participating in network consensus
- Earning validation rewards

## Quick Start

### Option 1: One-Command Setup (Recommended)

```bash
docker run -d \
  --name daon-validator \
  -p 26656:26656 \
  -v daon_data:/daon/.daon \
  daonnetwork/validator:latest
```

### Option 2: Docker Compose Setup

1. **Download the validator compose file:**
   ```bash
   curl -O https://raw.githubusercontent.com/daon-network/daon/main/validator-node.docker-compose.yml
   ```

2. **Create environment configuration:**
   ```bash
   cat > .env << EOF
   CHAIN_ID=daon-mainnet-1
   MONIKER=my-organization-validator
   EXTERNAL_ADDRESS=tcp://YOUR_PUBLIC_IP:26656
   PERSISTENT_PEERS=
   EOF
   ```

3. **Start your validator:**
   ```bash
   docker-compose -f validator-node.docker-compose.yml up -d
   ```

4. **Verify it's running:**
   ```bash
   docker logs daon-validator
   curl http://localhost:26657/status
   ```

## Requirements

### Minimum Hardware
- **CPU:** 2 cores
- **RAM:** 4GB
- **Storage:** 100GB SSD
- **Network:** 100Mbps
- **Cost:** ~$20-50/month (VPS)

### Recommended Hardware
- **CPU:** 4 cores
- **RAM:** 8GB
- **Storage:** 500GB NVMe
- **Network:** 1Gbps
- **Cost:** ~$50-100/month (VPS)

### Network Requirements
- **Port 26656** must be publicly accessible (P2P)
- Optionally expose port 26657 for monitoring
- Stable internet connection
- Public IP address or domain

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `CHAIN_ID` | Network chain ID | No | `daon-mainnet-1` |
| `MONIKER` | Your validator name | No | `my-validator` |
| `EXTERNAL_ADDRESS` | Public P2P address | Yes* | - |
| `PERSISTENT_PEERS` | Bootstrap peer nodes | No | Auto-detected |

*Required for production validators

### Example .env File

```bash
# Network Configuration
CHAIN_ID=daon-mainnet-1
MONIKER=MIT-CreativeCommons-Validator

# Your public IP or domain
EXTERNAL_ADDRESS=tcp://validator.example.org:26656

# Bootstrap peers (provided by DAON network)
PERSISTENT_PEERS=node1@seed1.daon.network:26656,node2@seed2.daon.network:26656
```

## Monitoring Your Validator

### Check Status
```bash
# View logs
docker logs -f daon-validator

# Check blockchain sync
curl http://localhost:26657/status | jq '.result.sync_info'

# View validator info
curl http://localhost:26657/validators | jq
```

### Health Checks
```bash
# Is the node running?
docker ps | grep daon-validator

# Is it connected to peers?
curl http://localhost:26657/net_info | jq '.result.n_peers'

# What's the current block height?
curl http://localhost:26657/status | jq '.result.sync_info.latest_block_height'
```

## Maintenance

### Backup Your Validator
```bash
# Backup validator keys (IMPORTANT!)
docker cp daon-validator:/daon/.daon/config/priv_validator_key.json ./validator_key_backup.json

# Backup node configuration
docker cp daon-validator:/daon/.daon/config/config.toml ./config_backup.toml
```

**⚠️ CRITICAL:** Store `priv_validator_key.json` securely. If you lose this, you lose your validator identity.

### Update Validator
```bash
# Pull latest image
docker pull daonnetwork/validator:latest

# Restart with new version
docker-compose -f validator-node.docker-compose.yml up -d
```

### View Validator Performance
```bash
# Missed blocks
curl http://localhost:26657/validators | jq '.result.validators[] | select(.address=="YOUR_VALIDATOR_ADDRESS")'

# Current voting power
curl http://localhost:26657/status | jq '.result.validator_info.voting_power'
```

## Troubleshooting

### Validator Won't Start
```bash
# Check logs for errors
docker logs daon-validator --tail 100

# Verify ports are open
netstat -tuln | grep 26656

# Check disk space
df -h
```

### Not Connecting to Peers
```bash
# Check firewall
sudo ufw status
sudo ufw allow 26656/tcp

# Verify external address
curl http://localhost:26657/status | jq '.result.node_info.listen_addr'

# Test connectivity
telnet YOUR_PEER_IP 26656
```

### Slow Sync
```bash
# Check sync status
curl http://localhost:26657/status | jq '.result.sync_info.catching_up'

# If true, you're still syncing (this is normal for new nodes)
# Current block vs network block:
curl http://localhost:26657/status | jq '.result.sync_info | {latest: .latest_block_height, catching_up}'
```

## Validator Economics

### Rewards
- **Block rewards:** Earn DAON tokens for validating blocks
- **Transaction fees:** Share of network fees
- **Creator support:** Optional donations from protected creators

### Costs
- **Server:** $20-100/month depending on specs
- **Bandwidth:** Minimal (usually included)
- **Time:** ~1 hour setup, minimal maintenance

### Break-Even
Most validators break even within 3-6 months depending on network activity and token value.

## Who Should Run a Validator?

### Ideal Validators:
- **Universities** - Protect academic creators, earn research funding
- **Creative organizations** - Archive of Our Own, Library of Congress
- **Creator platforms** - Platforms with vested interest in creator protection
- **Tech companies** - Companies supporting creator rights
- **Individual creators** - With technical skills and community support

### Benefits:
- ✅ Support creator protection mission
- ✅ Earn validation rewards
- ✅ Direct access to network for verifications
- ✅ Influence network governance
- ✅ Community recognition

## Security Best Practices

### Must Do:
1. **Backup validator keys** immediately after setup
2. **Use firewall** - only open required ports
3. **Enable monitoring** - set up alerts for downtime
4. **Update regularly** - stay on latest validator version
5. **Use strong passwords** - for server access

### Optional But Recommended:
- Run behind DDoS protection (Cloudflare, etc.)
- Use dedicated server (not shared hosting)
- Set up automated backups
- Join validator community chat
- Configure monitoring dashboard

## Support

### Community
- **Discord:** #validators channel
- **Forum:** validators.daon.network
- **Email:** validators@daon.network

### Technical Issues
- **GitHub:** github.com/daon-network/daon/issues
- **Emergency:** emergency@daon.network

### Network Status
- **Dashboard:** status.daon.network
- **Explorer:** explorer.daon.network

## Next Steps

1. **Join validator community** - Discord #validators
2. **Announce your validator** - Get added to network docs
3. **Set up monitoring** - Use Prometheus + Grafana
4. **Participate in governance** - Vote on network proposals
5. **Support creators** - Spread the word about DAON protection

---

**Welcome to the DAON validator network!**

*Every validator strengthens creator protection worldwide.*
