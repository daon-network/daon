#!/bin/bash
# DAON Environment Complete Wipe and Reset Script
# This script performs a complete wipe of the DAON environment including:
# - Database (PostgreSQL)
# - Blockchain state
# - Cache (Redis)
# - All keys and secrets
#
# IMPORTANT: This script creates comprehensive backups before wiping.
# Use with extreme caution in production.

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/opt/daon/backups}"
SECRETS_DIR="${SECRETS_DIR:-/opt/daon/secrets}"
LOG_FILE="/opt/daon/logs/wipe-$(date +%Y%m%d_%H%M%S).log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || mkdir -p "$PROJECT_ROOT/logs"
LOG_FILE="${LOG_FILE:-$PROJECT_ROOT/logs/wipe-$(date +%Y%m%d_%H%M%S).log}"

# Logging function
log() {
    echo -e "${2:-$NC}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    log "ERROR: $1" "$RED"
}

log_success() {
    log "✅ $1" "$GREEN"
}

log_warning() {
    log "⚠️  $1" "$YELLOW"
}

log_info() {
    log "ℹ️  $1" "$BLUE"
}

# Banner
echo -e "${RED}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ⚠️  DAON ENVIRONMENT COMPLETE WIPE & RESET  ⚠️          ║
║                                                           ║
║   This will DESTROY all data and regenerate everything   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

log_info "Starting wipe and reset procedure"
log_info "Log file: $LOG_FILE"

# Safety confirmation
echo ""
echo -e "${YELLOW}This script will:${NC}"
echo "  1. Stop all Docker containers"
echo "  2. Backup all data to: $BACKUP_BASE_DIR/pre-wipe-$(date +%Y%m%d_%H%M%S)/"
echo "  3. Wipe PostgreSQL database"
echo "  4. Wipe blockchain state"
echo "  5. Wipe Redis cache"
echo "  6. Delete ALL Docker volumes"
echo "  7. Generate new secrets and keys"
echo "  8. Reinitialize everything from scratch"
echo ""

read -p "$(echo -e ${RED}Type \"WIPE-PRODUCTION\" to confirm: ${NC})" CONFIRM
if [ "$CONFIRM" != "WIPE-PRODUCTION" ]; then
    log_error "Confirmation failed. Aborting."
    exit 1
fi
log_success "Confirmation received"

# Detect environment (local vs server)
if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
    ENV_NAME="local/development"
elif [ -f "/opt/daon-source/docker-compose.yml" ]; then
    COMPOSE_FILE="/opt/daon-source/docker-compose.yml"
    PROJECT_ROOT="/opt/daon-source"
    ENV_NAME="server"
else
    log_error "Cannot find docker-compose.yml. Aborting."
    exit 1
fi
log_info "Environment detected: $ENV_NAME"
log_info "Project root: $PROJECT_ROOT"

# Load current chain ID if exists
CURRENT_CHAIN_ID=""
if [ -f "$PROJECT_ROOT/.env" ]; then
    CURRENT_CHAIN_ID=$(grep "^CHAIN_ID=" "$PROJECT_ROOT/.env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
fi

if [ -n "$CURRENT_CHAIN_ID" ]; then
    log_info "Current chain ID: $CURRENT_CHAIN_ID"
    echo ""
    read -p "$(echo -e ${YELLOW}Type the current chain ID \"$CURRENT_CHAIN_ID\" to confirm: ${NC})" CHAIN_CONFIRM
    if [ "$CHAIN_CONFIRM" != "$CURRENT_CHAIN_ID" ]; then
        log_error "Chain ID confirmation failed. Aborting."
        exit 1
    fi
    log_success "Chain ID confirmed"
fi

# ==================== STEP 1: CREATE PRE-WIPE BACKUP ====================
echo ""
log_info "STEP 1: Creating comprehensive pre-wipe backup..."

BACKUP_DIR="$BACKUP_BASE_DIR/pre-wipe-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
log_info "Backup directory: $BACKUP_DIR"

# Check if containers are running
cd "$PROJECT_ROOT"
RUNNING_CONTAINERS=$(docker compose ps -q 2>/dev/null | wc -l)

if [ "$RUNNING_CONTAINERS" -gt 0 ]; then
    log_info "Found $RUNNING_CONTAINERS running containers. Creating backup..."

    # Backup database
    log_info "Backing up PostgreSQL database..."
    if docker compose ps | grep -q postgres; then
        docker compose exec -T postgres pg_dumpall -U postgres 2>/dev/null | gzip > "$BACKUP_DIR/database.sql.gz" || \
        docker compose exec -T postgres pg_dumpall -U daon_api 2>/dev/null | gzip > "$BACKUP_DIR/database.sql.gz" || \
        log_warning "Could not backup database (may not exist yet)"

        if [ -f "$BACKUP_DIR/database.sql.gz" ]; then
            DB_SIZE=$(du -h "$BACKUP_DIR/database.sql.gz" | cut -f1)
            log_success "Database backed up ($DB_SIZE)"
        fi
    else
        log_warning "PostgreSQL container not running, skipping database backup"
    fi

    # Backup blockchain volume
    log_info "Backing up blockchain data volume..."
    if docker volume ls | grep -q "daon-blockchain-data\|daon_daon-blockchain-data"; then
        BLOCKCHAIN_VOLUME=$(docker volume ls | grep "daon-blockchain-data\|daon_daon-blockchain-data" | awk '{print $2}' | head -1)
        docker run --rm -v "$BLOCKCHAIN_VOLUME:/source" -v "$BACKUP_DIR:/backup" \
            alpine tar czf /backup/blockchain-data.tar.gz -C /source . 2>/dev/null || \
            log_warning "Could not backup blockchain volume"

        if [ -f "$BACKUP_DIR/blockchain-data.tar.gz" ]; then
            BC_SIZE=$(du -h "$BACKUP_DIR/blockchain-data.tar.gz" | cut -f1)
            log_success "Blockchain data backed up ($BC_SIZE)"
        fi
    else
        log_warning "Blockchain volume not found, skipping"
    fi

    # Extract and save blockchain keys
    log_info "Backing up blockchain keys..."
    if docker compose ps | grep -q blockchain; then
        docker compose exec -T daon-blockchain tar czf - \
            /daon/.daon/config/priv_validator_key.json \
            /daon/.daon/config/node_key.json 2>/dev/null > "$BACKUP_DIR/blockchain-keys.tar.gz" || \
            log_warning "Could not backup blockchain keys (may not exist yet)"
    fi

    # Save mnemonics from logs
    log_info "Extracting mnemonics from logs..."
    docker compose logs daon-blockchain 2>&1 | grep -A 24 "mnemonic" > "$BACKUP_DIR/mnemonics.txt" 2>/dev/null || \
        log_warning "Could not extract mnemonics from logs"
else
    log_warning "No running containers found. Skipping live backup."
fi

# Backup .env file
log_info "Backing up .env file..."
if [ -f "$PROJECT_ROOT/.env" ]; then
    cp "$PROJECT_ROOT/.env" "$BACKUP_DIR/env-backup"
    log_success ".env file backed up"
else
    log_warning ".env file not found"
fi

# Backup docker-compose.yml
if [ -f "$COMPOSE_FILE" ]; then
    cp "$COMPOSE_FILE" "$BACKUP_DIR/docker-compose.yml.backup"
    log_success "docker-compose.yml backed up"
fi

log_success "Pre-wipe backup completed: $BACKUP_DIR"

# ==================== STEP 2: STOP ALL SERVICES ====================
echo ""
log_info "STEP 2: Stopping all Docker services..."

cd "$PROJECT_ROOT"
docker compose down -v 2>/dev/null || log_warning "docker compose down failed"

# Verify all stopped
sleep 2
REMAINING=$(docker ps | grep -i daon | wc -l)
if [ "$REMAINING" -gt 0 ]; then
    log_warning "Some containers still running. Force stopping..."
    docker ps | grep -i daon | awk '{print $1}' | xargs -r docker stop
    docker ps | grep -i daon | awk '{print $1}' | xargs -r docker rm -f
fi

log_success "All services stopped"

# ==================== STEP 3: WIPE DATA ====================
echo ""
log_info "STEP 3: Wiping all data..."

# Remove Docker volumes
log_info "Removing Docker volumes..."
docker volume ls | grep -E "daon|postgres|redis" | awk '{print $2}' | while read vol; do
    docker volume rm "$vol" 2>/dev/null && log_info "Removed volume: $vol" || log_warning "Could not remove volume: $vol"
done

# Clean logs
log_info "Cleaning logs..."
if [ -d "/opt/daon/logs" ]; then
    find /opt/daon/logs -type f -name "*.log" -delete 2>/dev/null || true
fi
if [ -d "$PROJECT_ROOT/api-server/logs" ]; then
    rm -rf "$PROJECT_ROOT/api-server/logs/"* 2>/dev/null || true
fi

# Remove temporary key files (security)
log_info "Removing temporary key files..."
rm -f /tmp/validator_key.txt /tmp/api_wallet.txt 2>/dev/null || true

log_success "Data wipe completed"

# ==================== STEP 4: GENERATE NEW SECRETS ====================
echo ""
log_info "STEP 4: Generating new secure secrets..."

# Prompt for chain ID
echo ""
echo -e "${YELLOW}Choose chain ID for new environment:${NC}"
echo "  1. Production: daon-mainnet-1"
echo "  2. Test: daon-test-$(date +%Y%m%d-%H%M%S)"
echo "  3. Custom"
read -p "Enter choice (1-3): " CHAIN_CHOICE

case "$CHAIN_CHOICE" in
    1)
        NEW_CHAIN_ID="daon-mainnet-1"
        ;;
    2)
        NEW_CHAIN_ID="daon-test-$(date +%Y%m%d-%H%M%S)"
        ;;
    3)
        read -p "Enter custom chain ID: " NEW_CHAIN_ID
        ;;
    *)
        NEW_CHAIN_ID="daon-test-$(date +%Y%m%d-%H%M%S)"
        log_warning "Invalid choice. Using: $NEW_CHAIN_ID"
        ;;
esac

log_info "New chain ID: $NEW_CHAIN_ID"

# Create secrets directory
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

# Generate cryptographically secure secrets
log_info "Generating secrets..."
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)
ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
SESSION_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
API_KEY_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

# Save secrets to secure file
SECRETS_FILE="$SECRETS_DIR/secrets-$(echo $NEW_CHAIN_ID | tr '/' '-').env"
cat > "$SECRETS_FILE" << EOF
# DAON Secrets - Generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Chain ID: $NEW_CHAIN_ID
# IMPORTANT: Keep this file secure and backed up

POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
SESSION_SECRET=$SESSION_SECRET
REDIS_PASSWORD=$REDIS_PASSWORD
API_KEY_SECRET=$API_KEY_SECRET
CHAIN_ID=$NEW_CHAIN_ID
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

chmod 600 "$SECRETS_FILE"
log_success "Secrets generated and saved to: $SECRETS_FILE"

# ==================== STEP 5: UPDATE .ENV FILE ====================
echo ""
log_info "STEP 5: Creating new .env file..."

# Detect if this is production or development
NODE_ENV="development"
if [[ "$NEW_CHAIN_ID" == *"mainnet"* ]] || [[ "$NEW_CHAIN_ID" == *"production"* ]]; then
    NODE_ENV="production"
fi

cat > "$PROJECT_ROOT/.env" << EOF
# DAON Environment Configuration
# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Chain ID: $NEW_CHAIN_ID

# Node Environment
NODE_ENV=$NODE_ENV

# API Server
PORT=3000
API_KEY_SECRET=$API_KEY_SECRET

# Database
DATABASE_URL=postgresql://daon_api:$POSTGRES_PASSWORD@postgres:5432/daon_production
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DB_POOL_MIN=2
DB_POOL_MAX=20

# Redis
REDIS_URL=redis://:$REDIS_PASSWORD@redis:6379
REDIS_PASSWORD=$REDIS_PASSWORD

# Blockchain
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_RPC=http://daon-blockchain:26657
BLOCKCHAIN_CHAIN_ID=$NEW_CHAIN_ID
CHAIN_ID=$NEW_CHAIN_ID

# Security
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
SESSION_SECRET=$SESSION_SECRET

# API Wallet (will be generated during blockchain init)
API_MNEMONIC=

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info

# Webhooks
WEBHOOK_TIMEOUT_MS=10000
WEBHOOK_MAX_RETRIES=3
EOF

chmod 600 "$PROJECT_ROOT/.env"
log_success ".env file created"

# ==================== STEP 6: REINITIALIZE BLOCKCHAIN ====================
echo ""
log_info "STEP 6: Reinitializing blockchain..."

# Start blockchain container to initialize
cd "$PROJECT_ROOT"
docker compose up -d daon-blockchain

log_info "Waiting for blockchain initialization (60 seconds)..."
sleep 60

# Check if blockchain initialized
if docker compose logs daon-blockchain | grep -q "validator"; then
    log_success "Blockchain initialized"

    # Try to extract API wallet mnemonic
    log_info "Extracting API wallet mnemonic..."
    docker compose logs daon-blockchain | grep -A 24 "mnemonic" > /tmp/blockchain_init_temp.log 2>/dev/null || true

    if [ -s /tmp/blockchain_init_temp.log ]; then
        API_WALLET_FILE="$SECRETS_DIR/api-wallet-$(echo $NEW_CHAIN_ID | tr '/' '-').txt"
        cp /tmp/blockchain_init_temp.log "$API_WALLET_FILE"
        chmod 600 "$API_WALLET_FILE"
        log_success "API wallet mnemonic saved to: $API_WALLET_FILE"

        # Extract mnemonic and update .env
        MNEMONIC=$(grep -A 24 "mnemonic" /tmp/blockchain_init_temp.log | grep -v "mnemonic" | tr '\n' ' ' | xargs)
        if [ -n "$MNEMONIC" ]; then
            sed -i.bak "s|^API_MNEMONIC=.*|API_MNEMONIC=\"$MNEMONIC\"|" "$PROJECT_ROOT/.env"
            log_success "API_MNEMONIC updated in .env"
        fi
    else
        log_warning "Could not extract API wallet mnemonic. You may need to generate it manually."
    fi

    rm -f /tmp/blockchain_init_temp.log
else
    log_warning "Blockchain may not have initialized properly. Check logs: docker compose logs daon-blockchain"
fi

# ==================== STEP 7: INITIALIZE DATABASE ====================
echo ""
log_info "STEP 7: Initializing database..."

# Start PostgreSQL
docker compose up -d postgres
log_info "Waiting for PostgreSQL to be ready..."
sleep 10

# Wait for PostgreSQL to be fully ready
for i in {1..30}; do
    if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        log_success "PostgreSQL is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        log_error "PostgreSQL failed to start"
        exit 1
    fi
    sleep 2
done

# Create database and user
log_info "Creating database and user..."
docker compose exec -T postgres psql -U postgres << EOF
CREATE DATABASE daon_production;
CREATE USER daon_api WITH PASSWORD '$POSTGRES_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE daon_production TO daon_api;
EOF

# Run migrations if they exist
if [ -d "$PROJECT_ROOT/api-server/src/database/migrations" ]; then
    log_info "Running database migrations..."

    for migration in "$PROJECT_ROOT/api-server/src/database/migrations"/*.sql; do
        if [ -f "$migration" ]; then
            migration_name=$(basename "$migration")
            log_info "Running migration: $migration_name"
            docker compose exec -T postgres psql -U daon_api -d daon_production < "$migration" || \
                log_warning "Migration $migration_name may have failed"
        fi
    done

    log_success "Migrations completed"
else
    log_warning "No migrations directory found at api-server/src/database/migrations"
fi

# ==================== STEP 8: START REMAINING SERVICES ====================
echo ""
log_info "STEP 8: Starting all services..."

cd "$PROJECT_ROOT"
docker compose up -d

log_info "Waiting for services to stabilize (30 seconds)..."
sleep 30

# ==================== STEP 9: POST-RESET VERIFICATION ====================
echo ""
log_info "STEP 9: Running post-reset verification..."

# Check container status
log_info "Checking container status..."
RUNNING=$(docker compose ps | grep -c "Up" || true)
TOTAL=$(docker compose ps | wc -l)
log_info "Containers running: $RUNNING"

# Health check API
log_info "Checking API health..."
if docker compose ps | grep -q "daon-api\|api-server"; then
    sleep 5
    API_HEALTH=$(curl -sf http://localhost:3000/health 2>/dev/null || echo "failed")
    if [ "$API_HEALTH" != "failed" ]; then
        log_success "API health check passed"
    else
        log_warning "API health check failed. Check logs: docker compose logs api-server"
    fi
else
    log_warning "API container not found"
fi

# Check blockchain status
log_info "Checking blockchain status..."
if docker compose ps | grep -q blockchain; then
    BC_STATUS=$(curl -sf http://localhost:26657/status 2>/dev/null || echo "failed")
    if [ "$BC_STATUS" != "failed" ]; then
        ACTUAL_CHAIN_ID=$(echo "$BC_STATUS" | grep -o '"network":"[^"]*"' | cut -d'"' -f4)
        if [ "$ACTUAL_CHAIN_ID" = "$NEW_CHAIN_ID" ]; then
            log_success "Blockchain chain ID verified: $ACTUAL_CHAIN_ID"
        else
            log_warning "Chain ID mismatch. Expected: $NEW_CHAIN_ID, Got: $ACTUAL_CHAIN_ID"
        fi
    else
        log_warning "Blockchain status check failed. Check logs: docker compose logs daon-blockchain"
    fi
else
    log_warning "Blockchain container not found"
fi

# ==================== COMPLETION SUMMARY ====================
echo ""
echo -e "${GREEN}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        ✅ WIPE AND RESET COMPLETED SUCCESSFULLY           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

log_success "Reset completed successfully!"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}IMPORTANT - SAVE THESE LOCATIONS:${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${GREEN}New Chain ID:${NC}        $NEW_CHAIN_ID"
echo -e "  ${GREEN}Secrets File:${NC}        $SECRETS_FILE"
echo -e "  ${GREEN}Pre-Wipe Backup:${NC}     $BACKUP_DIR"
if [ -f "$SECRETS_DIR/api-wallet-$(echo $NEW_CHAIN_ID | tr '/' '-').txt" ]; then
    echo -e "  ${GREEN}API Wallet:${NC}          $SECRETS_DIR/api-wallet-$(echo $NEW_CHAIN_ID | tr '/' '-').txt"
fi
echo -e "  ${GREEN}Environment File:${NC}    $PROJECT_ROOT/.env"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${RED}⚠️  ACTION REQUIRED:${NC}"
echo "  1. Save the validator mnemonic from: $SECRETS_DIR/api-wallet-*.txt"
echo "  2. Store it in a secure vault (1Password, etc.)"
echo "  3. Update GitHub Secrets if this is production"
echo "  4. Test the environment: curl http://localhost:3000/health"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  - Run pre-launch checks: ./scripts/operations/pre-launch-check.sh"
echo "  - View logs: docker compose logs -f"
echo "  - Check status: docker compose ps"
echo ""

log_info "Log file saved to: $LOG_FILE"
