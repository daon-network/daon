#!/bin/bash
# DAON Blockchain Troubleshooting Script
# Usage: ./troubleshoot-blockchain.sh [SERVER_USER@SERVER_HOST]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SERVER=${1:-""}

if [ -z "$SERVER" ]; then
    echo -e "${RED}Error: Please provide server SSH connection string${NC}"
    echo "Usage: ./troubleshoot-blockchain.sh USER@SERVER_IP"
    echo ""
    echo "Or run locally if on the server:"
    echo "  docker logs daon-blockchain --tail=100"
    exit 1
fi

echo -e "${BLUE}🔍 DAON Blockchain Troubleshooting${NC}"
echo "=================================="
echo "Server: $SERVER"
echo ""

echo "1. Checking blockchain container status:"
ssh "$SERVER" "docker ps -a | grep daon-blockchain || echo 'Container not found'"
echo ""

echo "2. Checking blockchain logs (last 50 lines):"
echo "---"
ssh "$SERVER" "docker logs daon-blockchain --tail=50 2>&1 || echo 'Cannot get logs'"
echo "---"
echo ""

echo "3. Checking blockchain data directory:"
ssh "$SERVER" "ls -lah /opt/daon-database/blockchain/ 2>&1 || echo 'Directory not found'"
echo ""

echo "4. Checking genesis file:"
ssh "$SERVER" "test -f /opt/daon-database/blockchain/config/genesis.json && echo '✅ Genesis file exists' || echo '❌ Genesis file missing'"
echo ""

echo "5. Checking directory permissions:"
ssh "$SERVER" "stat /opt/daon-database/blockchain 2>&1 | head -5 || echo 'Cannot stat'"
echo ""

echo "6. Testing blockchain RPC (from inside container):"
ssh "$SERVER" "docker exec daon-blockchain curl -s http://localhost:26657/health 2>&1 || echo 'Container not running or RPC not responding'"
echo ""

echo "7. Checking if daond binary exists:"
ssh "$SERVER" "docker exec daon-blockchain which daond 2>&1 || echo 'Container not running'"
echo ""

echo "8. Checking container restart count:"
ssh "$SERVER" "docker inspect daon-blockchain --format='{{.RestartCount}}' 2>&1 || echo 'Container not found'"
echo ""

echo "=================================="
echo -e "${BLUE}💡 Common Fixes${NC}"
echo ""
echo "If blockchain keeps restarting:"
echo "  1. Check logs: ssh $SERVER 'docker logs daon-blockchain --tail=100'"
echo "  2. Remove data: ssh $SERVER 'sudo rm -rf /opt/daon-database/blockchain/*'"
echo "  3. Recreate container: ssh $SERVER 'cd /opt/daon-source && docker compose up -d --force-recreate daon-blockchain'"
echo ""
echo "If permissions issue:"
echo "  ssh $SERVER 'sudo chown -R 1000:1000 /opt/daon-database/blockchain'"
echo ""
echo "If binary not found:"
echo "  ssh $SERVER 'cd /opt/daon-source && docker build -t daon-blockchain:latest ./daon-core'"
echo ""
