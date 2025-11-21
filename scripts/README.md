# DAON Scripts Directory

Utility scripts for deployment, maintenance, and validator operations.

---

## Directory Structure

```
scripts/
├── validators/          # Validator node setup and management
├── deployment/          # Deployment automation (TBD)
└── maintenance/         # Maintenance and backup scripts (TBD)
```

---

## Validator Scripts

### `validators/setup-validator.sh`

**Purpose:** Automated setup of a dedicated DAON validator node on a fresh Ubuntu server.

**Usage:**
```bash
# SSH into a fresh Ubuntu 22.04 server
ssh root@your-server

# Download and run
curl -fsSL https://raw.githubusercontent.com/daon-network/daon/main/scripts/validators/setup-validator.sh -o setup-validator.sh
chmod +x setup-validator.sh
./setup-validator.sh
```

**What it does:**
- Installs Docker and dependencies
- Configures firewall (opens port 26656 for P2P)
- Sets up fail2ban for security
- Creates docker-compose configuration
- Pulls latest validator image
- Sets up automated backups
- Creates monitoring scripts
- Starts validator node

**Requirements:**
- Fresh Ubuntu 22.04 LTS server
- Root access
- At least 2 vCPU, 4GB RAM, 80GB disk
- Public IP address

**Outputs:**
- Validator running at `/opt/daon-validator/`
- Backups in `/opt/daon-validator/backups/`
- Logs in `/opt/daon-validator/logs/`
- Monitoring script: `/opt/daon-validator/monitor.sh`

**Documentation:**
- [Validator Setup Guide](../documentation/operations/VALIDATOR_SETUP.md)
- [Validator Rollout Plan](../documentation/deployment/VALIDATOR_ROLLOUT.md)

---

## Root-Level Scripts (Legacy)

**These scripts are in the project root and will be organized later:**

### Deployment Scripts
- `setup-server.sh` - Original production server setup
- `init-server.sh` - Server initialization
- `manual-deploy.sh` - Manual deployment
- `deploy-load-balancer-fix.sh` - Caddy load balancer fixes
- `fix-load-balancer.sh` - Load balancer repairs

### Blockchain Scripts
- `init-blockchain.sh` - Initialize blockchain
- `init-api-wallet.sh` - Create API wallet
- `fund-api-wallet.sh` - Fund API wallet with tokens
- `troubleshoot-blockchain.sh` - Debug blockchain issues

### Testing Scripts
- `test-e2e.sh` - End-to-end integration tests
- `test-caddy-setup.sh` - Test Caddy configuration
- `verify-production.sh` - Production health checks
- `verify-ready.sh` - Pre-deployment verification
- `check-production.sh` - Production status check

---

## Planned Script Organization

**Future structure (TBD):**

```
scripts/
├── validators/
│   ├── setup-validator.sh        # ✅ Done
│   ├── backup-validator.sh       # Backup validator keys
│   └── monitor-validator.sh      # Health monitoring
│
├── deployment/
│   ├── deploy-production.sh      # Production deployment
│   ├── deploy-validator.sh       # Deploy specific validator
│   └── rollback.sh               # Rollback deployment
│
├── maintenance/
│   ├── backup-all.sh             # Backup everything
│   ├── update-images.sh          # Update Docker images
│   └── health-check.sh           # System health check
│
└── blockchain/
    ├── init-blockchain.sh        # Initialize chain
    ├── fund-wallet.sh            # Fund wallets
    └── troubleshoot.sh           # Debug tools
```

---

## Usage Guidelines

### For Validators

**Setting up a new validator:**
1. Use `validators/setup-validator.sh`
2. Follow [Validator Rollout Plan](../documentation/deployment/VALIDATOR_ROLLOUT.md)
3. Monitor with `/opt/daon-validator/monitor.sh`

**Maintenance:**
```bash
# Check validator status
ssh your-validator "/opt/daon-validator/monitor.sh"

# View logs
ssh your-validator "docker logs -f daon-validator"

# Manual backup
ssh your-validator "/opt/daon-validator/backup.sh"
```

### For Deployment

**Currently use root-level scripts:**
- Production deployment: See [Production Deployment](../documentation/deployment/PRODUCTION_DEPLOYMENT.md)
- Manual deploy: `./manual-deploy.sh`
- Verification: `./verify-production.sh`

**These will be moved to `deployment/` directory in future updates.**

---

## Script Standards

When creating new scripts:

### Structure
```bash
#!/bin/bash
#
# Script Name
# Brief description
#
# Usage: ./script.sh [options]
#

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Functions
log() { echo -e "${GREEN}[INFO]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Main logic
main() {
    # Script logic here
}

main "$@"
```

### Best Practices
- ✅ Use `set -e` to exit on errors
- ✅ Provide clear error messages
- ✅ Add help text (`--help` flag)
- ✅ Validate inputs
- ✅ Log important steps
- ✅ Make idempotent when possible
- ✅ Clean up temporary files
- ✅ Document in this README

### Security
- ❌ Never hardcode credentials
- ❌ Never commit API keys
- ✅ Use environment variables
- ✅ Validate user input
- ✅ Check for root when needed
- ✅ Use secure file permissions

---

## Contributing Scripts

**Before adding a new script:**

1. **Determine correct directory:**
   - Validator operations → `validators/`
   - Deployment → `deployment/`
   - Maintenance → `maintenance/`
   - Blockchain operations → `blockchain/` (create if needed)

2. **Follow naming conventions:**
   - Use lowercase with hyphens: `setup-validator.sh`
   - Be descriptive: `backup-validator-keys.sh` not `backup.sh`
   - Use `.sh` extension

3. **Add documentation:**
   - Add entry to this README
   - Include usage examples
   - Link to related documentation

4. **Test thoroughly:**
   - Test on fresh server
   - Test error cases
   - Verify cleanup
   - Document requirements

---

## Maintenance

### When to Update This README
- Adding new scripts
- Moving scripts between directories
- Changing script usage
- Deprecating old scripts

### Script Cleanup TODO
- [ ] Move root-level deployment scripts to `deployment/`
- [ ] Move blockchain scripts to `blockchain/`
- [ ] Move test scripts to `testing/` (or keep in root?)
- [ ] Create maintenance scripts
- [ ] Document all legacy scripts
- [ ] Archive deprecated scripts

---

## Support

**Script issues:**
- Open issue: https://github.com/daon-network/daon/issues
- Tag with `scripts` label

**Script requests:**
- Describe use case in issue
- Explain why manual process is painful
- We'll prioritize based on impact

---

**Last Updated:** 2025-11-21
