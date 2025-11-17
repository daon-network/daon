#!/bin/bash

# DAON API Server Setup Script
# For Ubuntu 24.04 LTS on Hetzner CPX22
# Automated setup with PostgreSQL, Docker, Nginx, and SSL

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="api.daon.network"
EMAIL="admin@daon.network"
DB_NAME="daon"
DB_USER="daon"
DOCKER_COMPOSE_VERSION="2.24.0"

log() {
    echo -e "${GREEN}[SETUP]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   error "This script should not be run as root. Run as regular user with sudo access."
fi

log "Starting DAON API Server setup..."

# Update system
log "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essential packages
log "Installing essential packages..."
sudo apt install -y \
    curl \
    wget \
    git \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    ufw \
    htop \
    nano \
    fail2ban

# Create application directory
log "Creating application directories..."
sudo mkdir -p /opt/daon
sudo mkdir -p /opt/daon/data
sudo mkdir -p /opt/daon/logs
sudo mkdir -p /opt/daon/config
sudo mkdir -p /opt/daon/backups
sudo mkdir -p /opt/daon/caddy
sudo mkdir -p /opt/daon-source
sudo chown -R $USER:$USER /opt/daon
sudo chown -R $USER:$USER /opt/daon-source

# Check for additional volumes (Hetzner volumes for persistence)
log "Checking for additional volumes..."
if lsblk | grep -q "sdb"; then
    warn "Additional volume detected at /dev/sdb - configure manually after setup"
    echo "# Mount additional volumes:" >> /opt/daon/SETUP_INFO.txt
    echo "# Database volume: sudo mount /dev/sdb1 /var/lib/postgresql" >> /opt/daon/SETUP_INFO.txt
    echo "# Backup/SSL volume: sudo mount /dev/sdc1 /opt/daon" >> /opt/daon/SETUP_INFO.txt
    echo "# This will persist: backups, SSL certs, app data" >> /opt/daon/SETUP_INFO.txt
fi

# Install/Update Docker
log "Installing/Updating Docker..."
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Ensure Docker daemon is running
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
log "Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Node.js (for potential admin tools)
log "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Caddy
log "Installing Caddy..."
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

# Configure firewall
log "Configuring firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

# Generate secure passwords
log "Generating secure passwords..."
DB_PASSWORD=$(openssl rand -base64 32)
POSTGRES_ROOT_PASSWORD=$(openssl rand -base64 32)

# Create environment file
log "Creating environment configuration..."
cat > /opt/daon/.env << EOF
# DAON API Configuration
NODE_ENV=production
PORT=3000

# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
POSTGRES_PASSWORD=${POSTGRES_ROOT_PASSWORD}

# API Configuration
API_BASE_URL=https://${DOMAIN}
JWT_SECRET=$(openssl rand -base64 64)

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000

# Blockchain Configuration (placeholder)
BLOCKCHAIN_NETWORK=mainnet
BLOCKCHAIN_RPC_URL=

# Email Configuration (for notifications)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=${EMAIL}

# Monitoring
LOG_LEVEL=info
ENABLE_METRICS=true
EOF

# Secure the environment file
chmod 600 /opt/daon/.env

# Create Docker Compose configuration
log "Creating Docker Compose configuration..."
cat > /opt/daon/docker-compose.yml << EOF
version: '3.8'

services:
  postgres:
    image: postgres:16
    container_name: daon-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${DB_NAME}
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASSWORD}
      POSTGRES_ROOT_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${DB_USER} -d \${DB_NAME}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: daon-redis
    restart: unless-stopped
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  daon-api:
    image: daonnetwork/api:latest
    container_name: daon-api
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  redis_data:
EOF

# Create initial database schema
log "Creating initial database schema..."
cat > /opt/daon/init.sql << EOF
-- DAON Database Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Protections table
CREATE TABLE protections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_hash VARCHAR(64) UNIQUE NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    license VARCHAR(100) NOT NULL DEFAULT 'liberation_v1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verification_url TEXT,
    creator_id UUID,
    blockchain_tx_id VARCHAR(128)
);

-- API Keys table
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '{"protect": true, "verify": true}',
    rate_limit_tier VARCHAR(50) DEFAULT 'free',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

-- Rate limiting table
CREATE TABLE rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID REFERENCES api_keys(id),
    endpoint VARCHAR(255) NOT NULL,
    requests_count INTEGER DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_protections_content_hash ON protections(content_hash);
CREATE INDEX idx_protections_created_at ON protections(created_at DESC);
CREATE INDEX idx_protections_creator_id ON protections(creator_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_rate_limits_api_key ON rate_limits(api_key_id);
CREATE INDEX idx_rate_limits_window ON rate_limits(window_start);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS \$\$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
\$\$ language 'plpgsql';

CREATE TRIGGER update_protections_updated_at BEFORE UPDATE ON protections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EOF

# Configure Caddy with persistent SSL certificates
log "Configuring Caddy..."

# Override Caddy data directory to persist certificates
sudo mkdir -p /opt/daon/caddy/data
sudo mkdir -p /opt/daon/caddy/config
sudo chown -R caddy:caddy /opt/daon/caddy

# Create systemd override for custom data directory
sudo mkdir -p /etc/systemd/system/caddy.service.d
sudo tee /etc/systemd/system/caddy.service.d/override.conf > /dev/null << EOF
[Service]
Environment="XDG_DATA_HOME=/opt/daon/caddy/data"
Environment="XDG_CONFIG_HOME=/opt/daon/caddy/config"
EOF

sudo tee /etc/caddy/Caddyfile > /dev/null << EOF
# DAON API Server Configuration
${DOMAIN} {
    # Automatic HTTPS with Let's Encrypt
    
    # Security headers
    header {
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer-when-downgrade"
        Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'"
        X-Robots-Tag "noindex, nofollow"
        
        # CORS headers
        Access-Control-Allow-Origin "*"
        Access-Control-Allow-Methods "GET, POST, OPTIONS, PUT, DELETE"
        Access-Control-Allow-Headers "Content-Type, Authorization, X-API-Key"
    }
    
    # Handle preflight OPTIONS requests
    @options {
        method OPTIONS
    }
    respond @options 200
    
    # Basic rate limiting (can add fail2ban rules separately)
    
    # Health check endpoint (no logging)
    @health {
        path /health
    }
    
    # Main API proxy
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Real-IP {remote_host}
        
        # Health check
        health_uri /health
        health_interval 30s
        health_timeout 10s
    }
    
    # Logging
    log {
        output file /var/log/caddy/daon-api.log {
            roll_size 100mb
            roll_keep 5
        }
        format json
    }
}

# Redirect www subdomain if accessed
www.${DOMAIN} {
    redir https://${DOMAIN}{uri} permanent
}
EOF

# Create log directory
sudo mkdir -p /var/log/caddy
sudo chown caddy:caddy /var/log/caddy

# Test Caddy configuration
sudo caddy validate --config /etc/caddy/Caddyfile

# Reload systemd and enable Caddy
sudo systemctl daemon-reload
sudo systemctl enable caddy

# Caddy handles SSL automatically, no need for Certbot
log "Caddy will handle SSL certificates automatically..."

# Configure fail2ban
log "Configuring fail2ban..."
sudo tee /etc/fail2ban/jail.local > /dev/null << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
EOF

sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Create systemd service for DAON
log "Creating systemd service..."
sudo tee /etc/systemd/system/daon.service > /dev/null << EOF
[Unit]
Description=DAON API Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/daon
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable daon.service

# Create backup script
log "Creating backup script..."
sudo tee /opt/daon/backup.sh > /dev/null << EOF
#!/bin/bash
# DAON Backup Script

BACKUP_DIR="/opt/daon/backups"
DATE=\$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p \$BACKUP_DIR

log_backup() {
    echo "[\$(date '+%Y-%m-%d %H:%M:%S')] \$1" >> \$BACKUP_DIR/backup.log
}

log_backup "Starting backup process..."

# Database backup
log_backup "Backing up database..."
if docker exec daon-postgres pg_dump -U ${DB_USER} ${DB_NAME} | gzip > \$BACKUP_DIR/db_\$DATE.sql.gz; then
    log_backup "Database backup successful: db_\$DATE.sql.gz"
else
    log_backup "ERROR: Database backup failed"
    exit 1
fi

# Config backup
log_backup "Backing up configuration..."
if tar -czf \$BACKUP_DIR/config_\$DATE.tar.gz /opt/daon/.env /opt/daon/docker-compose.yml /opt/daon/init.sql; then
    log_backup "Config backup successful: config_\$DATE.tar.gz"
else
    log_backup "WARNING: Config backup failed"
fi

# Docker volumes backup (if using volumes)
log_backup "Backing up Docker volumes..."
if docker run --rm -v daon_postgres_data:/source -v \$BACKUP_DIR:/backup alpine tar -czf /backup/postgres_volume_\$DATE.tar.gz -C /source .; then
    log_backup "Postgres volume backup successful: postgres_volume_\$DATE.tar.gz"
else
    log_backup "WARNING: Postgres volume backup failed"
fi

if docker run --rm -v daon_redis_data:/source -v \$BACKUP_DIR:/backup alpine tar -czf /backup/redis_volume_\$DATE.tar.gz -C /source .; then
    log_backup "Redis volume backup successful: redis_volume_\$DATE.tar.gz"
else
    log_backup "WARNING: Redis volume backup failed"
fi

# Application data backup (including SSL certificates)
log_backup "Backing up application data..."
if tar -czf \$BACKUP_DIR/app_data_\$DATE.tar.gz /opt/daon/data /opt/daon/logs /opt/daon/caddy; then
    log_backup "App data backup successful: app_data_\$DATE.tar.gz"
else
    log_backup "WARNING: App data backup failed"
fi

# Cleanup old backups
log_backup "Cleaning up old backups (older than \$RETENTION_DAYS days)..."
find \$BACKUP_DIR -type f -name "*.gz" -mtime +\$RETENTION_DAYS -delete
find \$BACKUP_DIR -type f -name "*.tar.gz" -mtime +\$RETENTION_DAYS -delete

# Backup size summary
BACKUP_SIZE=\$(du -sh \$BACKUP_DIR | cut -f1)
BACKUP_COUNT=\$(find \$BACKUP_DIR -type f -name "*_\$DATE.*" | wc -l)

log_backup "Backup completed: \$BACKUP_COUNT files created, total backup size: \$BACKUP_SIZE"

# Optional: Upload to external storage (uncomment and configure)
# log_backup "Uploading to external storage..."
# rclone copy \$BACKUP_DIR remote:daon-backups/
EOF

chmod +x /opt/daon/backup.sh

# Add backup cron job
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/daon/backup.sh >> /opt/daon/logs/backup.log 2>&1") | crontab -

# Create monitoring script
log "Creating monitoring script..."
tee /opt/daon/monitor.sh > /dev/null << EOF
#!/bin/bash
# DAON Health Monitor

check_service() {
    if ! docker-compose -f /opt/daon/docker-compose.yml ps | grep -q "Up"; then
        echo "\$(date): DAON services not running" >> /opt/daon/logs/monitor.log
        cd /opt/daon && docker-compose up -d
    fi
}

check_disk() {
    USAGE=\$(df /opt/daon | awk 'NR==2 {print \$5}' | sed 's/%//')
    if [ \$USAGE -gt 80 ]; then
        echo "\$(date): Disk usage is \$USAGE%" >> /opt/daon/logs/monitor.log
    fi
}

check_service
check_disk
EOF

chmod +x /opt/daon/monitor.sh

# Add monitoring cron job
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/daon/monitor.sh") | crontab -

# Save configuration summary
log "Saving configuration summary..."
cat > /opt/daon/SETUP_INFO.txt << EOF
DAON API Server Setup Complete
=============================

Server: CPX22 Hetzner Nuremberg
Domain: ${DOMAIN}
Database: PostgreSQL 16
Cache: Redis 7

Important Files:
- Environment: /opt/daon/.env
- Compose: /opt/daon/docker-compose.yml  
- Caddy: /etc/caddy/Caddyfile
- Logs: /opt/daon/logs/
- Backups: /opt/daon/backups/

Database Credentials:
- Database: ${DB_NAME}
- User: ${DB_USER}  
- Password: ${DB_PASSWORD}

Next Steps:
1. Configure Hetzner volumes (if added):
   - Database: sudo mkfs.ext4 /dev/sdb && sudo mount /dev/sdb /var/lib/postgresql  
   - Persistent: sudo mkfs.ext4 /dev/sdc && sudo mount /dev/sdc /opt/daon
   - Add to /etc/fstab for persistence
   - Persistent volume includes: backups, SSL certs, app data
2. Configure DNS: Point ${DOMAIN} to this server IP
3. Start Caddy: sudo systemctl restart caddy
4. Start services: cd /opt/daon && docker-compose up -d
5. Test API: curl https://${DOMAIN}/health
6. Run initial backup: /opt/daon/backup.sh

Useful Commands:
- View logs: docker-compose -f /opt/daon/docker-compose.yml logs -f
- Restart: sudo systemctl restart daon
- Backup: /opt/daon/backup.sh
- Monitor: /opt/daon/monitor.sh

Setup completed at: $(date)
EOF

log "Setup completed successfully!"
warn "IMPORTANT: Save the database password from /opt/daon/.env"
# Create volume setup helper script
tee /opt/daon/setup-volumes.sh > /dev/null << EOF
#!/bin/bash
# Hetzner Volume Setup Helper

setup_volume() {
    local device=\$1
    local mount_point=\$2
    local label=\$3
    
    echo "Setting up \$label volume at \$device -> \$mount_point"
    
    # Format if not already formatted
    if ! blkid \$device; then
        sudo mkfs.ext4 -L "\$label" \$device
    fi
    
    # Create mount point
    sudo mkdir -p \$mount_point
    
    # Mount
    sudo mount \$device \$mount_point
    
    # Add to fstab if not already there
    if ! grep -q \$device /etc/fstab; then
        echo "\$device \$mount_point ext4 defaults 0 2" | sudo tee -a /etc/fstab
    fi
    
    echo "\$label volume setup complete"
}

# Check for volumes and prompt user
if lsblk | grep -q "sdb"; then
    echo "Additional volumes detected:"
    lsblk | grep "sd[b-z]"
    echo ""
    read -p "Setup database volume at /dev/sdb? (y/n): " -r
    if [[ \$REPLY =~ ^[Yy]\$ ]]; then
        setup_volume "/dev/sdb" "/var/lib/postgresql" "daon-database"
    fi
fi

if lsblk | grep -q "sdc"; then
    read -p "Setup persistent volume at /dev/sdc for backups & SSL certs? (y/n): " -r
    if [[ \$REPLY =~ ^[Yy]\$ ]]; then
        setup_volume "/dev/sdc" "/opt/daon" "daon-persistent"
        echo "Note: This will persist backups, SSL certificates, and app data"
    fi
fi

echo "Volume setup complete. You can now start DAON services."
EOF

chmod +x /opt/daon/setup-volumes.sh

warn "Next steps:"
echo "1. If you added Hetzner volumes, run: /opt/daon/setup-volumes.sh"
echo "2. Point ${DOMAIN} DNS to this server's IP address"
echo "3. Run: sudo certbot --nginx -d ${DOMAIN}"
echo "4. Start services: cd /opt/daon && sudo docker-compose up -d"
echo "5. Test: curl https://${DOMAIN}/health"
echo ""
echo "Configuration saved in: /opt/daon/SETUP_INFO.txt"
echo "Reboot recommended to ensure docker group membership: sudo reboot"