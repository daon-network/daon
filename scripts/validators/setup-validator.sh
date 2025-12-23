#!/bin/bash
#
# DAON Validator Setup Script
# Sets up a dedicated validator node on a fresh Ubuntu server
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/daon-network/daon/main/setup-validator.sh | bash
#   OR
#   ./setup-validator.sh
#
# Requirements:
#   - Fresh Ubuntu 22.04 LTS server
#   - Root access
#   - At least 2 vCPU, 4GB RAM, 80GB disk
#   - Port 26656 open for P2P
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root (use sudo)"
fi

# Banner
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██████╗  █████╗  ██████╗ ███╗   ██╗                   ║
║   ██╔══██╗██╔══██╗██╔═══██╗████╗  ██║                   ║
║   ██║  ██║███████║██║   ██║██╔██╗ ██║                   ║
║   ██║  ██║██╔══██║██║   ██║██║╚██╗██║                   ║
║   ██████╔╝██║  ██║╚██████╔╝██║ ╚████║                   ║
║   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝                   ║
║                                                           ║
║          Validator Node Setup Script                     ║
║          Protecting Creators with Blockchain             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF

echo ""
log "Starting DAON validator setup..."
echo ""

# Get configuration from user
read -p "Enter validator moniker (name): " MONIKER
if [[ -z "$MONIKER" ]]; then
    MONIKER="daon-validator-$(hostname)"
    warn "No moniker provided, using: $MONIKER"
fi

read -p "Enter your public IP or domain: " PUBLIC_IP
if [[ -z "$PUBLIC_IP" ]]; then
    PUBLIC_IP=$(curl -s ifconfig.me)
    warn "No IP provided, detected: $PUBLIC_IP"
fi

read -p "Enter chain ID [daon-mainnet-1]: " CHAIN_ID
CHAIN_ID=${CHAIN_ID:-daon-mainnet-1}

read -p "Enter persistent peers (comma-separated, or press Enter for auto-discovery): " PERSISTENT_PEERS

echo ""
log "Configuration:"
echo "  Moniker: $MONIKER"
echo "  Public IP: $PUBLIC_IP"
echo "  Chain ID: $CHAIN_ID"
echo "  Persistent Peers: ${PERSISTENT_PEERS:-auto-discovery}"
echo ""
read -p "Continue with this configuration? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    error "Setup cancelled"
fi

# Update system
log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# Install dependencies
log "Installing dependencies..."
apt-get install -y -qq \
    curl \
    wget \
    git \
    jq \
    ufw \
    fail2ban \
    htop \
    ca-certificates \
    gnupg \
    lsb-release

# Install Docker
log "Installing Docker..."
if ! command -v docker &> /dev/null; then
    # Add Docker's official GPG key
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Set up Docker repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Start Docker
    systemctl enable docker
    systemctl start docker
    
    log "Docker installed successfully"
else
    log "Docker already installed"
fi

# Configure firewall
log "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 26656/tcp comment 'Blockchain P2P'
# Optionally allow RPC for monitoring (localhost only by default)
# ufw allow from any to any port 26657 proto tcp comment 'Blockchain RPC (monitoring)'
ufw --force enable
log "Firewall configured"

# Configure fail2ban
log "Configuring fail2ban for SSH protection..."
systemctl enable fail2ban
systemctl start fail2ban

# Create directories
log "Creating directories..."
mkdir -p /opt/daon-validator
mkdir -p /opt/daon-validator/logs
mkdir -p /opt/daon-validator/backups

# Create docker-compose file
log "Creating docker-compose configuration..."
cat > /opt/daon-validator/docker-compose.yml << EOF
version: '3.8'

services:
  daon-validator:
    image: daonnetwork/validator:latest
    container_name: daon-validator
    restart: unless-stopped
    ports:
      - "26656:26656"  # P2P - public
      - "127.0.0.1:26657:26657"  # RPC - localhost only
      - "127.0.0.1:1317:1317"    # REST API - localhost only
    volumes:
      - validator_data:/daon/.daon
      - ./logs:/daon/logs
    environment:
      CHAIN_ID: ${CHAIN_ID}
      MONIKER: ${MONIKER}
      EXTERNAL_ADDRESS: tcp://${PUBLIC_IP}:26656
      PERSISTENT_PEERS: ${PERSISTENT_PEERS}
    command: ["daond", "start", "--home", "/daon/.daon"]
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:26657/status || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    deploy:
      resources:
        limits:
          memory: 6G
          cpus: '1.8'
        reservations:
          memory: 2G
          cpus: '1.0'
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"

volumes:
  validator_data:
    driver: local

networks:
  default:
    name: daon-validator-network
EOF

# Create environment file
log "Creating environment file..."
cat > /opt/daon-validator/.env << EOF
CHAIN_ID=$CHAIN_ID
MONIKER=$MONIKER
PUBLIC_IP=$PUBLIC_IP
PERSISTENT_PEERS=$PERSISTENT_PEERS
EOF

# Create backup script
log "Creating backup script..."
cat > /opt/daon-validator/backup.sh << 'BACKUP_EOF'
#!/bin/bash
# DAON Validator Backup Script

BACKUP_DIR="/opt/daon-validator/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

mkdir -p $BACKUP_DIR

log_backup() {
    echo "[$​(date '+%Y-%m-%d %H:%M:%S')] $1" >> $BACKUP_DIR/backup.log
}

log_backup "Starting validator backup..."

# Backup validator keys (CRITICAL!)
log_backup "Backing up validator keys..."
if docker exec daon-validator test -f /daon/.daon/config/priv_validator_key.json; then
    docker cp daon-validator:/daon/.daon/config/priv_validator_key.json $BACKUP_DIR/priv_validator_key_$DATE.json
    log_backup "✓ Validator keys backed up: priv_validator_key_$DATE.json"
else
    log_backup "⚠ Validator key not found"
fi

# Backup validator state
if docker exec daon-validator test -f /daon/.daon/data/priv_validator_state.json; then
    docker cp daon-validator:/daon/.daon/data/priv_validator_state.json $BACKUP_DIR/priv_validator_state_$DATE.json
    log_backup "✓ Validator state backed up"
fi

# Backup configuration
docker cp daon-validator:/daon/.daon/config/config.toml $BACKUP_DIR/config_$DATE.toml 2>/dev/null || true
docker cp daon-validator:/daon/.daon/config/app.toml $BACKUP_DIR/app_$DATE.toml 2>/dev/null || true
docker cp daon-validator:/daon/.daon/config/genesis.json $BACKUP_DIR/genesis_$DATE.json 2>/dev/null || true

log_backup "✓ Configuration backed up"

# Cleanup old backups
log_backup "Cleaning up old backups (older than $RETENTION_DAYS days)..."
find $BACKUP_DIR -type f -name "*.json" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -type f -name "*.toml" -mtime +$RETENTION_DAYS -delete

BACKUP_COUNT=$(ls -1 $BACKUP_DIR/*.json 2>/dev/null | wc -l)
log_backup "✓ Backup completed. Total backups: $BACKUP_COUNT"

# Optional: Upload to remote storage
# Uncomment and configure if you want off-site backups
# log_backup "Uploading to remote storage..."
# rclone copy $BACKUP_DIR remote:daon-validator-backups/
BACKUP_EOF

chmod +x /opt/daon-validator/backup.sh

# Create monitoring script
log "Creating monitoring script..."
cat > /opt/daon-validator/monitor.sh << 'MONITOR_EOF'
#!/bin/bash
# DAON Validator Monitoring Script

echo "=== DAON Validator Status ==="
echo ""

# Check if container is running
if docker ps | grep -q daon-validator; then
    echo "✓ Container: Running"
else
    echo "✗ Container: Not running"
    exit 1
fi

# Get sync status
SYNC_INFO=$(curl -s http://localhost:26657/status | jq -r '.result.sync_info')
LATEST_BLOCK=$(echo $SYNC_INFO | jq -r '.latest_block_height')
CATCHING_UP=$(echo $SYNC_INFO | jq -r '.catching_up')

echo "✓ Block Height: $LATEST_BLOCK"
if [ "$CATCHING_UP" = "false" ]; then
    echo "✓ Sync Status: Synced"
else
    echo "⚠ Sync Status: Catching up..."
fi

# Get peer count
PEERS=$(curl -s http://localhost:26657/net_info | jq -r '.result.n_peers')
echo "✓ Connected Peers: $PEERS"

# Get validator info
VALIDATOR_INFO=$(curl -s http://localhost:26657/status | jq -r '.result.validator_info')
VOTING_POWER=$(echo $VALIDATOR_INFO | jq -r '.voting_power')
ADDRESS=$(echo $VALIDATOR_INFO | jq -r '.address')

echo ""
echo "=== Validator Info ==="
echo "Address: $ADDRESS"
echo "Voting Power: $VOTING_POWER"

# Check disk usage
DISK_USAGE=$(df -h /var/lib/docker | tail -1 | awk '{print $5}')
echo ""
echo "=== System ==="
echo "Disk Usage: $DISK_USAGE"

# Check memory
MEM_USAGE=$(free -h | grep Mem | awk '{print $3 "/" $2}')
echo "Memory Usage: $MEM_USAGE"

echo ""
MONITOR_EOF

chmod +x /opt/daon-validator/monitor.sh

# Add cron job for backups
log "Setting up automated backups..."
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/daon-validator/backup.sh >> /opt/daon-validator/logs/backup.log 2>&1") | crontab -

# Create systemd service for monitoring (optional)
log "Creating monitoring service..."
cat > /etc/systemd/system/daon-validator-monitor.service << 'SERVICE_EOF'
[Unit]
Description=DAON Validator Health Monitor
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/opt/daon-validator/monitor.sh
StandardOutput=append:/opt/daon-validator/logs/monitor.log
StandardError=append:/opt/daon-validator/logs/monitor.log

[Install]
WantedBy=multi-user.target
SERVICE_EOF

cat > /etc/systemd/system/daon-validator-monitor.timer << 'TIMER_EOF'
[Unit]
Description=Run DAON Validator Health Monitor every 5 minutes
Requires=daon-validator-monitor.service

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
TIMER_EOF

systemctl daemon-reload
systemctl enable daon-validator-monitor.timer
systemctl start daon-validator-monitor.timer

# Pull validator image
log "Pulling validator image..."
docker pull daonnetwork/validator:latest

# Start validator
log "Starting validator..."
cd /opt/daon-validator
docker compose up -d

# Wait for startup
log "Waiting for validator to start..."
sleep 10

# Check status
if docker ps | grep -q daon-validator; then
    log "✓ Validator container is running"
else
    error "✗ Validator container failed to start. Check logs: docker logs daon-validator"
fi

# Display info
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}║  ✓ DAON Validator Setup Complete!                        ║${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
log "Validator Information:"
echo "  Moniker: $MONIKER"
echo "  Chain ID: $CHAIN_ID"
echo "  P2P Address: tcp://$PUBLIC_IP:26656"
echo ""
log "Next Steps:"
echo "  1. Monitor sync status: /opt/daon-validator/monitor.sh"
echo "  2. View logs: docker logs -f daon-validator"
echo "  3. Check sync: curl http://localhost:26657/status | jq '.result.sync_info'"
echo "  4. Wait for full sync (catching_up: false)"
echo "  5. Once synced, bond tokens to become active validator"
echo ""
log "Useful Commands:"
echo "  Status:  /opt/daon-validator/monitor.sh"
echo "  Logs:    docker logs -f daon-validator"
echo "  Backup:  /opt/daon-validator/backup.sh"
echo "  Restart: cd /opt/daon-validator && docker compose restart"
echo "  Stop:    cd /opt/daon-validator && docker compose stop"
echo "  Start:   cd /opt/daon-validator && docker compose start"
echo ""
log "Backups:"
echo "  Location: /opt/daon-validator/backups/"
echo "  Schedule: Daily at 3 AM"
echo "  ⚠ CRITICAL: Store validator keys off-server!"
echo ""
log "Support:"
echo "  Documentation: https://docs.daon.network"
echo "  Issues: https://github.com/daon-network/daon/issues"
echo ""
log "Setup complete! 🎉"
