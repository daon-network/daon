#!/bin/bash
# DAON Key Rotation Script
# Rotates secrets and keys with appropriate strategies for each type
#
# Usage:
#   ./rotate-keys.sh secrets      # Rotate application secrets (JWT, session)
#   ./rotate-keys.sh database     # Rotate database password (requires downtime)
#   ./rotate-keys.sh blockchain   # Rotate blockchain keys (complex, see docs)
#   ./rotate-keys.sh all          # Rotate all rotatable keys

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SECRETS_DIR="${SECRETS_DIR:-/opt/daon/secrets}"
BACKUP_DIR="${BACKUP_DIR:-/opt/daon/backups}"
LOG_FILE="/opt/daon/logs/key-rotation-$(date +%Y%m%d_%H%M%S).log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || mkdir -p "$PROJECT_ROOT/logs"
LOG_FILE="${LOG_FILE:-$PROJECT_ROOT/logs/key-rotation-$(date +%Y%m%d_%H%M%S).log}"

# Logging
log() {
    echo -e "${2:-$NC}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

log_error() { log "ERROR: $1" "$RED"; }
log_success() { log "✅ $1" "$GREEN"; }
log_warning() { log "⚠️  $1" "$YELLOW"; }
log_info() { log "ℹ️  $1" "$BLUE"; }

# Detect environment
if [ -f "$PROJECT_ROOT/.env" ]; then
    ENV_FILE="$PROJECT_ROOT/.env"
elif [ -f "/opt/daon-source/.env" ]; then
    ENV_FILE="/opt/daon-source/.env"
    PROJECT_ROOT="/opt/daon-source"
else
    log_error "Cannot find .env file. Aborting."
    exit 1
fi

# Function to backup .env file
backup_env() {
    local backup_location="$BACKUP_DIR/secrets-backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_location"
    cp "$ENV_FILE" "$backup_location/.env.backup"
    chmod 600 "$backup_location/.env.backup"
    log_success "Backed up .env to: $backup_location/.env.backup"
    echo "$backup_location"
}

# Function to update .env variable
update_env_var() {
    local var_name="$1"
    local new_value="$2"

    if grep -q "^${var_name}=" "$ENV_FILE"; then
        # Variable exists, update it
        sed -i.bak "s|^${var_name}=.*|${var_name}=${new_value}|" "$ENV_FILE"
    else
        # Variable doesn't exist, append it
        echo "${var_name}=${new_value}" >> "$ENV_FILE"
    fi

    log_success "Updated $var_name in .env"
}

# Function to generate secure secret
generate_secret() {
    local length="${1:-32}"
    openssl rand -base64 64 | tr -d "=+/" | cut -c1-"$length"
}

# Function to rotate application secrets (zero downtime possible)
rotate_application_secrets() {
    log_info "Starting application secrets rotation..."
    log_warning "This will require a rolling restart of API servers"

    echo ""
    read -p "$(echo -e ${YELLOW}Continue with secrets rotation? [y/N]: ${NC})" CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        log_warning "Rotation cancelled"
        return 1
    fi

    # Backup current .env
    BACKUP_LOCATION=$(backup_env)

    # Generate new secrets
    log_info "Generating new secrets..."
    NEW_JWT_SECRET=$(generate_secret 64)
    NEW_SESSION_SECRET=$(generate_secret 32)
    NEW_API_KEY_SECRET=$(generate_secret 32)

    # Update .env file
    update_env_var "JWT_SECRET" "$NEW_JWT_SECRET"
    update_env_var "SESSION_SECRET" "$NEW_SESSION_SECRET"
    update_env_var "API_KEY_SECRET" "$NEW_API_KEY_SECRET"

    # Save to secrets directory
    mkdir -p "$SECRETS_DIR"
    chmod 700 "$SECRETS_DIR"
    ROTATION_RECORD="$SECRETS_DIR/rotation-$(date +%Y%m%d_%H%M%S).env"
    cat > "$ROTATION_RECORD" << EOF
# Key Rotation Record
# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)

JWT_SECRET=$NEW_JWT_SECRET
SESSION_SECRET=$NEW_SESSION_SECRET
API_KEY_SECRET=$NEW_API_KEY_SECRET
EOF
    chmod 600 "$ROTATION_RECORD"
    log_success "Rotation record saved to: $ROTATION_RECORD"

    # Rolling restart of API instances
    log_info "Performing rolling restart of API instances..."
    cd "$PROJECT_ROOT"

    # Check which API containers exist
    API_CONTAINERS=$(docker compose ps --services | grep -i api || true)

    if [ -z "$API_CONTAINERS" ]; then
        log_warning "No API containers found. Manual restart may be required."
        return 0
    fi

    # Restart each API container with delay
    echo "$API_CONTAINERS" | while read container; do
        log_info "Restarting $container..."
        docker compose restart "$container"
        sleep 5  # Wait for container to stabilize

        # Verify container is healthy
        if docker compose ps "$container" | grep -q "Up"; then
            log_success "$container restarted successfully"
        else
            log_error "$container failed to restart!"
            log_error "ROLLBACK: Restore .env from $BACKUP_LOCATION/.env.backup"
            exit 1
        fi
    done

    log_success "Application secrets rotated successfully"
    log_warning "Users with active sessions may need to re-login"

    return 0
}

# Function to rotate database credentials (requires brief downtime)
rotate_database_credentials() {
    log_info "Starting database credentials rotation..."
    log_warning "This will cause brief API downtime (30-60 seconds)"

    echo ""
    read -p "$(echo -e ${RED}This requires downtime. Continue? [y/N]: ${NC})" CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        log_warning "Rotation cancelled"
        return 1
    fi

    # Backup current .env
    BACKUP_LOCATION=$(backup_env)

    # Generate new database password
    log_info "Generating new database password..."
    NEW_POSTGRES_PASSWORD=$(generate_secret 32)

    # Get current database user
    DB_USER=$(grep "^DATABASE_URL=" "$ENV_FILE" | grep -oP '://\K[^:]+' | head -1)
    DB_USER=${DB_USER:-daon_api}

    # Stop API servers
    log_info "Stopping API servers..."
    cd "$PROJECT_ROOT"
    docker compose stop $(docker compose ps --services | grep -i api) 2>/dev/null || true

    # Update database password
    log_info "Updating database password for user: $DB_USER..."
    docker compose exec -T postgres psql -U postgres << EOF || {
        log_error "Failed to update database password"
        log_error "ROLLBACK: Restore .env from $BACKUP_LOCATION/.env.backup and restart API"
        exit 1
    }
ALTER USER $DB_USER WITH PASSWORD '$NEW_POSTGRES_PASSWORD';
EOF

    log_success "Database password updated"

    # Update .env file
    update_env_var "POSTGRES_PASSWORD" "$NEW_POSTGRES_PASSWORD"

    # Update DATABASE_URL with new password
    CURRENT_DATABASE_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d'=' -f2-)
    NEW_DATABASE_URL=$(echo "$CURRENT_DATABASE_URL" | sed "s|://[^:]*:[^@]*@|://$DB_USER:$NEW_POSTGRES_PASSWORD@|")
    update_env_var "DATABASE_URL" "$NEW_DATABASE_URL"

    # Restart API servers
    log_info "Restarting API servers..."
    docker compose up -d $(docker compose ps --services | grep -i api) 2>/dev/null || true

    # Wait for services to stabilize
    log_info "Waiting for services to stabilize (10 seconds)..."
    sleep 10

    # Verify API health
    if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
        log_success "API health check passed"
    else
        log_warning "API health check failed. Check logs: docker compose logs"
    fi

    log_success "Database credentials rotated successfully"

    return 0
}

# Function to rotate blockchain keys
rotate_blockchain_keys() {
    log_info "Starting blockchain key rotation..."

    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}BLOCKCHAIN KEY ROTATION OPTIONS${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "1. Rotate API Wallet (same chain)"
    echo "   - Creates new wallet"
    echo "   - Transfers funds from old to new"
    echo "   - Updates API_MNEMONIC in .env"
    echo "   - Blockchain chain stays the same"
    echo ""
    echo "2. Full Reset (new validator key + new chain)"
    echo "   - Requires complete wipe and reset"
    echo "   - Use: ./scripts/operations/wipe-and-reset.sh"
    echo "   - Recommended for test environments only"
    echo ""
    read -p "Choose option (1-2, or Q to quit): " CHOICE

    case "$CHOICE" in
        1)
            rotate_api_wallet
            ;;
        2)
            log_info "Full blockchain reset requires wipe-and-reset.sh"
            log_info "Run: ./scripts/operations/wipe-and-reset.sh"
            return 1
            ;;
        [Qq])
            log_info "Blockchain rotation cancelled"
            return 1
            ;;
        *)
            log_error "Invalid choice"
            return 1
            ;;
    esac
}

# Function to rotate API wallet
rotate_api_wallet() {
    log_info "Rotating API wallet (creating new wallet on same chain)..."

    # Backup current .env
    BACKUP_LOCATION=$(backup_env)

    # Get current chain ID
    CHAIN_ID=$(grep "^CHAIN_ID=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    log_info "Chain ID: $CHAIN_ID"

    # Create new wallet
    log_info "Creating new API wallet..."
    NEW_WALLET_OUTPUT=$(docker compose exec -T daon-blockchain daond keys add api-new --keyring-backend test --output json 2>&1 || true)

    if echo "$NEW_WALLET_OUTPUT" | grep -q "address"; then
        NEW_ADDRESS=$(echo "$NEW_WALLET_OUTPUT" | jq -r '.address' 2>/dev/null || echo "unknown")
        NEW_MNEMONIC=$(echo "$NEW_WALLET_OUTPUT" | jq -r '.mnemonic' 2>/dev/null || echo "unknown")

        log_success "New wallet created: $NEW_ADDRESS"

        # Save mnemonic
        mkdir -p "$SECRETS_DIR"
        NEW_WALLET_FILE="$SECRETS_DIR/api-wallet-new-$(date +%Y%m%d_%H%M%S).txt"
        echo "# New API Wallet - Created $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$NEW_WALLET_FILE"
        echo "# Address: $NEW_ADDRESS" >> "$NEW_WALLET_FILE"
        echo "# Chain ID: $CHAIN_ID" >> "$NEW_WALLET_FILE"
        echo "" >> "$NEW_WALLET_FILE"
        echo "$NEW_MNEMONIC" >> "$NEW_WALLET_FILE"
        chmod 600 "$NEW_WALLET_FILE"
        log_success "New wallet mnemonic saved to: $NEW_WALLET_FILE"

        # Get old wallet address
        OLD_MNEMONIC=$(grep "^API_MNEMONIC=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'")

        if [ -n "$OLD_MNEMONIC" ]; then
            log_warning "TODO: Transfer funds from old wallet to new wallet"
            log_info "Old wallet mnemonic is in your backup: $BACKUP_LOCATION/.env.backup"
            log_info "New wallet address: $NEW_ADDRESS"
            log_info "Run: daond tx bank send <old-address> $NEW_ADDRESS <amount> --chain-id $CHAIN_ID"
        fi

        # Update .env
        update_env_var "API_MNEMONIC" "\"$NEW_MNEMONIC\""

        log_success "API wallet rotated successfully"
        log_warning "Remember to transfer funds from old wallet to new wallet"
    else
        log_error "Failed to create new wallet"
        log_error "Output: $NEW_WALLET_OUTPUT"
        return 1
    fi

    return 0
}

# Function to rotate all rotatable keys
rotate_all() {
    log_info "Rotating all rotatable keys..."

    echo ""
    log_warning "This will rotate:"
    log_warning "  - Application secrets (JWT, session, API keys)"
    log_warning "  - Database credentials"
    echo ""
    read -p "$(echo -e ${RED}Continue with full rotation? [y/N]: ${NC})" CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        log_warning "Full rotation cancelled"
        return 1
    fi

    # Rotate application secrets first
    if rotate_application_secrets; then
        log_success "Application secrets rotated"
    else
        log_error "Application secrets rotation failed"
        return 1
    fi

    # Wait a bit
    sleep 5

    # Rotate database credentials
    if rotate_database_credentials; then
        log_success "Database credentials rotated"
    else
        log_error "Database credentials rotation failed"
        return 1
    fi

    log_success "All rotations completed successfully"
    log_info "Log file: $LOG_FILE"

    return 0
}

# Main script
ROTATION_TYPE="${1:-}"

if [ -z "$ROTATION_TYPE" ]; then
    echo -e "${YELLOW}DAON Key Rotation Script${NC}"
    echo ""
    echo "Usage: $0 <rotation-type>"
    echo ""
    echo "Rotation types:"
    echo "  secrets      Rotate application secrets (JWT, session)"
    echo "  database     Rotate database password (requires brief downtime)"
    echo "  blockchain   Rotate blockchain keys (interactive)"
    echo "  all          Rotate all rotatable keys"
    echo ""
    exit 1
fi

log_info "Starting $ROTATION_TYPE rotation"
log_info "Project root: $PROJECT_ROOT"
log_info "Log file: $LOG_FILE"

case "$ROTATION_TYPE" in
    secrets)
        rotate_application_secrets
        ;;
    database)
        rotate_database_credentials
        ;;
    blockchain)
        rotate_blockchain_keys
        ;;
    all)
        rotate_all
        ;;
    *)
        log_error "Unknown rotation type: $ROTATION_TYPE"
        echo ""
        echo "Valid rotation types: secrets, database, blockchain, all"
        exit 1
        ;;
esac

# Final summary
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Rotation completed at $(date)${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Important reminders:${NC}"
echo "  - Backups are stored in: $BACKUP_DIR/secrets-backup-*"
echo "  - Rotation records are in: $SECRETS_DIR/rotation-*"
echo "  - Log file: $LOG_FILE"
echo "  - Verify services: docker compose ps"
echo "  - Test API: curl http://localhost:3000/health"
echo ""
