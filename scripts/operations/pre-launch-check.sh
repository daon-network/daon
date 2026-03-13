#!/bin/bash
# DAON Pre-Launch Verification Script
# Comprehensive production readiness checks
#
# Exit codes:
#   0 = All checks passed
#   1 = One or more checks failed
#   2 = Critical failures found

set +e  # Don't exit on errors, we want to run all checks

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check counters
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOMAIN="${DOMAIN:-api.daon.network}"

# Symbols
CHECK="✅"
CROSS="❌"
WARNING="⚠️ "
INFO="ℹ️ "

# Logging functions
log_pass() {
    echo -e "${GREEN}${CHECK} $1${NC}"
    ((PASS_COUNT++))
}

log_fail() {
    echo -e "${RED}${CROSS} $1${NC}"
    ((FAIL_COUNT++))
}

log_warn() {
    echo -e "${YELLOW}${WARNING}$1${NC}"
    ((WARN_COUNT++))
}

log_info() {
    echo -e "${BLUE}${INFO}$1${NC}"
}

log_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Banner
clear
echo -e "${BLUE}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     DAON Pre-Launch Verification System                  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

log_info "Starting comprehensive pre-launch checks..."
log_info "Project root: $PROJECT_ROOT"
echo ""

# Detect environment
if [ -f "$PROJECT_ROOT/.env" ]; then
    ENV_FILE="$PROJECT_ROOT/.env"
elif [ -f "/opt/daon-source/.env" ]; then
    ENV_FILE="/opt/daon-source/.env"
    PROJECT_ROOT="/opt/daon-source"
else
    log_fail "Cannot find .env file"
    exit 2
fi

# Load environment
set -a
source "$ENV_FILE" 2>/dev/null || true
set +a

# ==================== INFRASTRUCTURE CHECKS ====================
log_section "1. INFRASTRUCTURE"

# DNS resolution
log_info "Checking DNS resolution for $DOMAIN..."
if host "$DOMAIN" > /dev/null 2>&1; then
    IP_ADDRESS=$(host "$DOMAIN" | grep "has address" | awk '{print $4}' | head -1)
    log_pass "DNS resolves: $DOMAIN → $IP_ADDRESS"
else
    log_fail "DNS resolution failed for $DOMAIN"
fi

# SSL certificate check (if remote domain)
if [[ "$DOMAIN" != "localhost" ]] && [[ "$DOMAIN" != "127.0.0.1" ]]; then
    log_info "Checking SSL certificate for $DOMAIN..."
    SSL_OUTPUT=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)

    if [ $? -eq 0 ]; then
        NOT_AFTER=$(echo "$SSL_OUTPUT" | grep "notAfter" | cut -d'=' -f2)
        EXPIRY_DATE=$(date -d "$NOT_AFTER" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$NOT_AFTER" +%s 2>/dev/null)
        CURRENT_DATE=$(date +%s)
        DAYS_UNTIL_EXPIRY=$(( ($EXPIRY_DATE - $CURRENT_DATE) / 86400 ))

        if [ $DAYS_UNTIL_EXPIRY -gt 30 ]; then
            log_pass "SSL certificate valid (expires in $DAYS_UNTIL_EXPIRY days)"
        elif [ $DAYS_UNTIL_EXPIRY -gt 0 ]; then
            log_warn "SSL certificate expires soon (in $DAYS_UNTIL_EXPIRY days)"
        else
            log_fail "SSL certificate has expired!"
        fi
    else
        log_fail "Cannot verify SSL certificate"
    fi

    # Port 443 accessibility
    log_info "Checking port 443 accessibility..."
    if timeout 5 bash -c "cat < /dev/null > /dev/tcp/$DOMAIN/443" 2>/dev/null; then
        log_pass "Port 443 is accessible"
    else
        log_fail "Port 443 is not accessible"
    fi
fi

# Disk space
log_info "Checking disk space..."
DISK_FREE_GB=$(df -BG . | tail -1 | awk '{print $4}' | tr -d 'G')
if [ "$DISK_FREE_GB" -gt 20 ]; then
    log_pass "Disk space: ${DISK_FREE_GB}GB free"
elif [ "$DISK_FREE_GB" -gt 10 ]; then
    log_warn "Disk space low: ${DISK_FREE_GB}GB free (recommend >20GB)"
else
    log_fail "Critical: Only ${DISK_FREE_GB}GB free (need >10GB)"
fi

# Memory availability
log_info "Checking memory..."
if command -v free &> /dev/null; then
    MEM_AVAIL_GB=$(free -g | grep Mem | awk '{print $7}')
    MEM_TOTAL_GB=$(free -g | grep Mem | awk '{print $2}')

    if [ "$MEM_AVAIL_GB" -gt 2 ]; then
        log_pass "Memory: ${MEM_AVAIL_GB}GB available of ${MEM_TOTAL_GB}GB total"
    elif [ "$MEM_AVAIL_GB" -gt 1 ]; then
        log_warn "Memory low: ${MEM_AVAIL_GB}GB available"
    else
        log_fail "Critical: Only ${MEM_AVAIL_GB}GB memory available"
    fi
else
    log_warn "Cannot check memory (free command not available)"
fi

# ==================== SERVICES CHECKS ====================
log_section "2. SERVICES"

# Change to project root for docker compose commands
cd "$PROJECT_ROOT"

# Check if docker compose is available
if ! command -v docker &> /dev/null; then
    log_fail "Docker is not installed"
else
    log_pass "Docker is installed"

    # Check all containers
    log_info "Checking container status..."
    EXPECTED_CONTAINERS=("postgres" "redis" "blockchain" "api")
    RUNNING_CONTAINERS=$(docker compose ps --services --filter "status=running" 2>/dev/null)

    if [ -n "$RUNNING_CONTAINERS" ]; then
        log_pass "Found running containers"

        # Check each expected container
        for container in "${EXPECTED_CONTAINERS[@]}"; do
            if echo "$RUNNING_CONTAINERS" | grep -iq "$container"; then
                log_pass "Container running: $container"
            else
                log_warn "Container not running: $container (may not be required)"
            fi
        done
    else
        log_fail "No containers running"
    fi
fi

# API health check
log_info "Checking API health endpoint..."
API_HEALTH_URL="${API_BASE_URL:-http://localhost:3000}/health"
API_RESPONSE=$(curl -sf "$API_HEALTH_URL" 2>/dev/null)

if [ $? -eq 0 ]; then
    log_pass "API health endpoint responding"

    # Parse response if JSON
    if echo "$API_RESPONSE" | jq . > /dev/null 2>&1; then
        API_STATUS=$(echo "$API_RESPONSE" | jq -r '.status // "unknown"')
        if [ "$API_STATUS" = "ok" ] || [ "$API_STATUS" = "healthy" ]; then
            log_pass "API status: $API_STATUS"
        else
            log_warn "API status: $API_STATUS"
        fi
    fi
else
    log_fail "API health endpoint not responding at $API_HEALTH_URL"
fi

# Blockchain status
log_info "Checking blockchain status..."
BC_STATUS_URL="${BLOCKCHAIN_RPC:-http://localhost:26657}/status"
BC_RESPONSE=$(curl -sf "$BC_STATUS_URL" 2>/dev/null)

if [ $? -eq 0 ]; then
    log_pass "Blockchain RPC responding"

    if echo "$BC_RESPONSE" | jq . > /dev/null 2>&1; then
        CATCHING_UP=$(echo "$BC_RESPONSE" | jq -r '.result.sync_info.catching_up // "unknown"')
        LATEST_HEIGHT=$(echo "$BC_RESPONSE" | jq -r '.result.sync_info.latest_block_height // "unknown"')
        NETWORK=$(echo "$BC_RESPONSE" | jq -r '.result.node_info.network // "unknown"')

        if [ "$CATCHING_UP" = "false" ]; then
            log_pass "Blockchain synced (height: $LATEST_HEIGHT, network: $NETWORK)"
        else
            log_warn "Blockchain still catching up (height: $LATEST_HEIGHT)"
        fi
    fi
else
    log_fail "Blockchain RPC not responding at $BC_STATUS_URL"
fi

# Database check
log_info "Checking database..."
if command -v docker &> /dev/null; then
    if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        log_pass "PostgreSQL is ready"

        # Check database exists
        DB_EXISTS=$(docker compose exec -T postgres psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='daon_production'" 2>/dev/null)
        if [ "$DB_EXISTS" = "1" ]; then
            log_pass "Database 'daon_production' exists"
        else
            log_fail "Database 'daon_production' not found"
        fi
    else
        log_fail "PostgreSQL is not ready"
    fi
fi

# Redis check
log_info "Checking Redis..."
if command -v docker &> /dev/null; then
    REDIS_RESPONSE=$(docker compose exec -T redis redis-cli PING 2>/dev/null)
    if [ "$REDIS_RESPONSE" = "PONG" ]; then
        log_pass "Redis responding to PING"
    else
        log_fail "Redis not responding"
    fi
fi

# ==================== CONFIGURATION CHECKS ====================
log_section "3. CONFIGURATION"

# Required environment variables
log_info "Checking required environment variables..."
REQUIRED_VARS=(
    "NODE_ENV"
    "DATABASE_URL"
    "POSTGRES_PASSWORD"
    "JWT_SECRET"
    "ENCRYPTION_KEY"
    "SESSION_SECRET"
    "BLOCKCHAIN_CHAIN_ID"
    "API_KEY_SECRET"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -n "${!var}" ]; then
        log_pass "$var is set"
    else
        log_fail "$var is NOT set"
    fi
done

# Check secrets are not defaults
log_info "Verifying secrets are not defaults..."
UNSAFE_VALUES=("changeme" "test-secret" "your-secret-here" "password" "secret" "test")

for var in "JWT_SECRET" "POSTGRES_PASSWORD" "ENCRYPTION_KEY" "SESSION_SECRET" "API_KEY_SECRET"; do
    VAR_VALUE="${!var}"
    if [ -n "$VAR_VALUE" ]; then
        IS_UNSAFE=false
        for unsafe in "${UNSAFE_VALUES[@]}"; do
            if [[ "$VAR_VALUE" == *"$unsafe"* ]]; then
                IS_UNSAFE=true
                break
            fi
        done

        if [ "$IS_UNSAFE" = true ]; then
            log_fail "$var appears to use a default/unsafe value"
        else
            log_pass "$var uses a custom value"
        fi
    fi
done

# Chain ID check
log_info "Verifying chain ID..."
if [ -n "$BLOCKCHAIN_CHAIN_ID" ]; then
    if [[ "$BLOCKCHAIN_CHAIN_ID" == "daon-mainnet-"* ]] || [[ "$BLOCKCHAIN_CHAIN_ID" == "daon-test-"* ]]; then
        log_pass "Chain ID format valid: $BLOCKCHAIN_CHAIN_ID"

        # Check if production
        if [[ "$BLOCKCHAIN_CHAIN_ID" == "daon-mainnet-"* ]]; then
            log_info "Production chain detected: $BLOCKCHAIN_CHAIN_ID"
        else
            log_warn "Test chain detected: $BLOCKCHAIN_CHAIN_ID"
        fi
    else
        log_warn "Chain ID format unexpected: $BLOCKCHAIN_CHAIN_ID"
    fi
fi

# NODE_ENV check
log_info "Verifying NODE_ENV..."
if [ "$NODE_ENV" = "production" ]; then
    log_pass "NODE_ENV=production"
elif [ "$NODE_ENV" = "development" ]; then
    log_warn "NODE_ENV=development (should be 'production' for launch)"
else
    log_fail "NODE_ENV=$NODE_ENV (should be 'production')"
fi

# ==================== SECURITY CHECKS ====================
log_section "4. SECURITY"

# Check debug mode
log_info "Checking debug mode..."
if [ "$DEBUG" = "true" ] || [ "$LOG_LEVEL" = "debug" ]; then
    log_warn "Debug mode is enabled (should be disabled in production)"
else
    log_pass "Debug mode is disabled"
fi

# Check rate limiting
log_info "Checking rate limiting configuration..."
if [ -n "$RATE_LIMIT_WINDOW_MS" ] && [ -n "$RATE_LIMIT_MAX" ]; then
    log_pass "Rate limiting configured: $RATE_LIMIT_MAX requests per ${RATE_LIMIT_WINDOW_MS}ms"
else
    log_warn "Rate limiting not configured"
fi

# Check CORS configuration
log_info "Checking CORS configuration..."
if [ -n "$CORS_ORIGIN" ]; then
    if [ "$CORS_ORIGIN" = "*" ]; then
        log_warn "CORS allows all origins (security risk)"
    else
        log_pass "CORS configured: $CORS_ORIGIN"
    fi
else
    log_warn "CORS_ORIGIN not configured"
fi

# Check for secrets in logs (recent logs only)
log_info "Checking for exposed secrets in logs..."
SECRETS_FOUND=false

if [ -d "/opt/daon/logs" ]; then
    # Search for common secret patterns in recent logs
    if grep -riq "password\|secret\|key\|token" /opt/daon/logs/*.log 2>/dev/null | head -5 | grep -qiE "(password|secret|key|token).*="; then
        log_fail "Potential secrets found in logs (check /opt/daon/logs/)"
        SECRETS_FOUND=true
    fi
fi

if [ "$SECRETS_FOUND" = false ]; then
    log_pass "No obvious secrets in recent logs"
fi

# Check file permissions on .env
log_info "Checking .env file permissions..."
ENV_PERMS=$(stat -c "%a" "$ENV_FILE" 2>/dev/null || stat -f "%A" "$ENV_FILE" 2>/dev/null)
if [ "$ENV_PERMS" = "600" ] || [ "$ENV_PERMS" = "400" ]; then
    log_pass ".env permissions: $ENV_PERMS (secure)"
else
    log_warn ".env permissions: $ENV_PERMS (recommend 600)"
fi

# ==================== PERFORMANCE CHECKS ====================
log_section "5. PERFORMANCE"

# API response time
log_info "Measuring API response time..."
START_TIME=$(date +%s%N)
curl -sf "$API_HEALTH_URL" > /dev/null 2>&1
END_TIME=$(date +%s%N)
RESPONSE_TIME=$(( ($END_TIME - $START_TIME) / 1000000 ))  # Convert to milliseconds

if [ $RESPONSE_TIME -lt 1000 ]; then
    log_pass "API response time: ${RESPONSE_TIME}ms"
elif [ $RESPONSE_TIME -lt 2000 ]; then
    log_warn "API response time: ${RESPONSE_TIME}ms (target <1000ms)"
else
    log_fail "API response time: ${RESPONSE_TIME}ms (too slow)"
fi

# Blockchain block time (if available)
log_info "Checking blockchain block time..."
if [ -n "$BC_RESPONSE" ]; then
    BLOCK_TIME=$(echo "$BC_RESPONSE" | jq -r '.result.sync_info.latest_block_time // "unknown"')
    if [ "$BLOCK_TIME" != "unknown" ]; then
        BLOCK_TIMESTAMP=$(date -d "$BLOCK_TIME" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "${BLOCK_TIME%.*}" +%s 2>/dev/null)
        CURRENT_TIMESTAMP=$(date +%s)
        BLOCK_AGE=$(( $CURRENT_TIMESTAMP - $BLOCK_TIMESTAMP ))

        if [ $BLOCK_AGE -lt 10 ]; then
            log_pass "Latest block is recent (${BLOCK_AGE}s ago)"
        elif [ $BLOCK_AGE -lt 60 ]; then
            log_warn "Latest block is ${BLOCK_AGE}s old"
        else
            log_fail "Latest block is ${BLOCK_AGE}s old (blockchain may be stalled)"
        fi
    fi
fi

# Database connection pool
log_info "Checking database connection pool..."
if [ -n "$DB_POOL_MAX" ]; then
    if [ "$DB_POOL_MAX" -ge 10 ]; then
        log_pass "Database pool max connections: $DB_POOL_MAX"
    else
        log_warn "Database pool max connections: $DB_POOL_MAX (recommend ≥10)"
    fi
else
    log_warn "DB_POOL_MAX not configured"
fi

# ==================== FINAL SUMMARY ====================
echo ""
log_section "SUMMARY"

# Calculate total
TOTAL_CHECKS=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))

# Display summary
echo ""
echo -e "  ${GREEN}Passed:${NC}   $PASS_COUNT"
echo -e "  ${RED}Failed:${NC}   $FAIL_COUNT"
echo -e "  ${YELLOW}Warnings:${NC} $WARN_COUNT"
echo -e "  ${BLUE}Total:${NC}    $TOTAL_CHECKS"
echo ""

# Overall status
if [ $FAIL_COUNT -eq 0 ] && [ $WARN_COUNT -eq 0 ]; then
    echo -e "${GREEN}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        ✅ ALL CHECKS PASSED - READY TO LAUNCH             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    EXIT_CODE=0
elif [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${YELLOW}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        ⚠️  WARNINGS FOUND - REVIEW BEFORE LAUNCH          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Review warnings above and address if necessary."
    EXIT_CODE=0
else
    echo -e "${RED}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        ❌ CHECKS FAILED - NOT READY FOR LAUNCH            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Fix failed checks before launching to production."
    EXIT_CODE=1
fi

echo ""
echo -e "${BLUE}Next steps:${NC}"
if [ $EXIT_CODE -eq 0 ]; then
    echo "  1. Review any warnings"
    echo "  2. Run load test: ./scripts/testing/run-load-test.sh"
    echo "  3. If load test passes, proceed with launch"
else
    echo "  1. Fix all failed checks"
    echo "  2. Re-run this script: ./scripts/operations/pre-launch-check.sh"
    echo "  3. Once passing, run load test"
fi
echo ""

exit $EXIT_CODE
