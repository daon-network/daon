#!/bin/bash
# Production health verification script
# Usage: ./verify-production.sh [SERVER_USER@SERVER_HOST]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SERVER=${1:-""}

if [ -z "$SERVER" ]; then
    echo -e "${RED}Error: Please provide server SSH connection string${NC}"
    echo "Usage: ./verify-production.sh USER@SERVER_IP"
    exit 1
fi

echo -e "${BLUE}🔍 DAON Production Health Check${NC}"
echo "=================================="
echo "Server: $SERVER"
echo ""

# Function to run remote command and check result
run_check() {
    local name=$1
    local command=$2
    local success_msg=$3
    local fail_msg=$4
    
    echo -n "Checking $name... "
    if ssh "$SERVER" "$command" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $success_msg"
        return 0
    else
        echo -e "${RED}✗${NC} $fail_msg"
        return 1
    fi
}

# Check 1: Server connectivity
echo -n "1. Server connectivity... "
if ssh -o ConnectTimeout=5 "$SERVER" "echo 'connected'" &> /dev/null; then
    echo -e "${GREEN}✓${NC} Connected"
else
    echo -e "${RED}✗${NC} Cannot connect to server"
    exit 1
fi

# Check 2: Docker installed
run_check "Docker installation" \
    "command -v docker" \
    "Docker installed" \
    "Docker not found"

# Check 3: Docker Compose installed
run_check "Docker Compose installation" \
    "docker compose version" \
    "Docker Compose installed" \
    "Docker Compose not found"

# Check 4: Project directory exists
run_check "Project directory" \
    "test -d /opt/daon-source" \
    "/opt/daon-source exists" \
    "/opt/daon-source not found"

# Check 5: Docker containers running
echo "5. Docker containers status:"
ssh "$SERVER" "cd /opt/daon-source && docker compose ps" 2>/dev/null || {
    echo -e "${RED}✗${NC} Cannot get container status"
}
echo ""

# Check 6: Individual service health
echo "6. Service health checks:"

# API Server
echo -n "   API Server... "
if ssh "$SERVER" "docker ps | grep -q daon-api" &> /dev/null; then
    echo -e "${GREEN}✓${NC} Running"
else
    echo -e "${RED}✗${NC} Not running"
fi

# Blockchain
echo -n "   Blockchain... "
if ssh "$SERVER" "docker ps | grep -q daon-blockchain" &> /dev/null; then
    echo -e "${GREEN}✓${NC} Running"
else
    echo -e "${RED}✗${NC} Not running"
fi

# PostgreSQL
echo -n "   PostgreSQL... "
if ssh "$SERVER" "docker ps | grep -q postgres" &> /dev/null; then
    echo -e "${GREEN}✓${NC} Running"
else
    echo -e "${RED}✗${NC} Not running"
fi

# Redis
echo -n "   Redis... "
if ssh "$SERVER" "docker ps | grep -q redis" &> /dev/null; then
    echo -e "${GREEN}✓${NC} Running"
else
    echo -e "${RED}✗${NC} Not running"
fi
echo ""

# Check 7: Blockchain initialization
echo "7. Blockchain status:"
echo -n "   Genesis file... "
if ssh "$SERVER" "test -f /opt/daon-database/blockchain/config/genesis.json" &> /dev/null; then
    echo -e "${GREEN}✓${NC} Exists"
else
    echo -e "${RED}✗${NC} Missing"
fi

echo -n "   Blockchain data... "
if ssh "$SERVER" "test -d /opt/daon-database/blockchain/data" &> /dev/null; then
    echo -e "${GREEN}✓${NC} Exists"
else
    echo -e "${YELLOW}⚠${NC} Missing or new"
fi
echo ""

# Check 8: Container logs (recent errors)
echo "8. Recent container logs (errors only):"
ssh "$SERVER" "cd /opt/daon-source && docker compose logs --tail=20 2>&1 | grep -i 'error\|fatal\|panic\|failed' || echo '   No recent errors found'"
echo ""

# Check 9: Disk space
echo "9. Disk space:"
ssh "$SERVER" "df -h /opt | tail -1"
echo ""

# Check 10: API endpoint test (if accessible)
echo "10. API endpoint test:"
echo -n "    Health check... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null | grep -q "200"; then
    echo -e "${GREEN}✓${NC} API responding (200 OK)"
elif ssh "$SERVER" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/health 2>/dev/null | grep -q '200'"; then
    echo -e "${GREEN}✓${NC} API responding on server (200 OK)"
else
    echo -e "${YELLOW}⚠${NC} Cannot reach API endpoint"
fi
echo ""

# Check 11: Blockchain RPC
echo "11. Blockchain RPC:"
echo -n "    Status query... "
if ssh "$SERVER" "docker exec daon-blockchain daon-cored status 2>/dev/null" &> /dev/null; then
    echo -e "${GREEN}✓${NC} RPC responding"
    ssh "$SERVER" "docker exec daon-blockchain daon-cored status 2>/dev/null | head -10"
else
    echo -e "${YELLOW}⚠${NC} Cannot query blockchain status"
fi
echo ""

# Summary
echo "=================================="
echo -e "${BLUE}📊 Summary${NC}"
echo ""

# Count running containers
RUNNING=$(ssh "$SERVER" "cd /opt/daon-source && docker compose ps --services --filter 'status=running' 2>/dev/null | wc -l" | tr -d ' ')
TOTAL=$(ssh "$SERVER" "cd /opt/daon-source && docker compose ps --services 2>/dev/null | wc -l" | tr -d ' ')

if [ "$RUNNING" -eq "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
    echo -e "${GREEN}✓ All services running ($RUNNING/$TOTAL)${NC}"
else
    echo -e "${YELLOW}⚠ Some services not running ($RUNNING/$TOTAL)${NC}"
fi

echo ""
echo "To view full logs:"
echo "  ssh $SERVER 'cd /opt/daon-source && docker compose logs -f'"
echo ""
echo "To restart services:"
echo "  ssh $SERVER 'cd /opt/daon-source && docker compose restart'"
echo ""
