#!/bin/bash
# Quick production status check
# Usage: ./check-production.sh

echo "📊 DAON Production Status Check"
echo "================================"
echo ""

echo "🔍 Checking if you have server access configured..."
if [ -z "$DAON_SERVER" ]; then
    echo "⚠️  DAON_SERVER environment variable not set"
    echo ""
    echo "To check production status, set your server:"
    echo "  export DAON_SERVER=user@your-server-ip"
    echo ""
    echo "Or run directly:"
    echo "  ssh user@server 'cd /opt/daon-source && docker compose ps'"
    exit 0
fi

echo "Server: $DAON_SERVER"
echo ""

echo "📦 Container Status:"
ssh $DAON_SERVER 'cd /opt/daon-source && docker compose ps' 2>/dev/null || {
    echo "❌ Cannot connect to server or docker compose not found"
    echo ""
    echo "Try manually:"
    echo "  ssh $DAON_SERVER 'cd /opt/daon-source && docker compose ps'"
    exit 1
}

echo ""
echo "🔍 Recent logs (last 20 lines):"
echo "--- Blockchain ---"
ssh $DAON_SERVER 'docker logs daon-blockchain --tail=20 2>&1' | tail -10

echo ""
echo "--- API ---"
ssh $DAON_SERVER 'docker logs daon-api-1 --tail=20 2>&1' | tail -10

echo ""
echo "🌐 API Health Check:"
ssh $DAON_SERVER 'curl -s http://localhost:3001/health | jq .' 2>/dev/null || \
    ssh $DAON_SERVER 'curl -s http://localhost:3001/health' || \
    echo "❌ API not responding"

echo ""
echo "⛓️  Blockchain Status:"
ssh $DAON_SERVER 'docker exec daon-blockchain daond status 2>&1 | jq .SyncInfo' || \
    echo "⚠️  Cannot get blockchain status"

echo ""
echo "================================"
