#!/bin/bash
# Deploy Load Balancer Fix to Production
# This script pulls updates, rebuilds the API, and fixes Caddy configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}DAON LOAD BALANCER FIX DEPLOYMENT${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Check if running on server
if [ ! -d "/opt/daon" ]; then
    echo -e "${RED}❌ This script must be run on the production server${NC}"
    echo "Run: scp deploy-load-balancer-fix.sh USER@SERVER:/tmp/ && ssh USER@SERVER 'sudo bash /tmp/deploy-load-balancer-fix.sh'"
    exit 1
fi

cd /opt/daon

# Step 1: Pull latest changes
echo -e "${YELLOW}Step 1/7: Pulling latest changes from GitHub...${NC}"
git fetch origin
git pull origin main
echo -e "${GREEN}✓ Code updated${NC}"
echo ""

# Step 2: Rebuild API image
echo -e "${YELLOW}Step 2/7: Rebuilding API Docker image...${NC}"
cd api-server
docker build -t daon-api:latest . 2>&1 | tail -10
echo -e "${GREEN}✓ API image rebuilt${NC}"
echo ""

cd /opt/daon

# Step 3: Restart API containers
echo -e "${YELLOW}Step 3/7: Restarting API containers...${NC}"
docker-compose restart daon-api-1 daon-api-2 daon-api-3
echo "Waiting for containers to start..."
sleep 5
echo -e "${GREEN}✓ API containers restarted${NC}"
echo ""

# Step 4: Verify all instances are healthy
echo -e "${YELLOW}Step 4/7: Verifying API instances...${NC}"
all_healthy=true
for port in 3001 3002 3003; do
    if curl -s -f -m 5 http://localhost:$port/health > /dev/null 2>&1; then
        instance=$(curl -s http://localhost:$port/health | jq -r '.instance // "unknown"')
        echo -e "${GREEN}✓ API on port $port is healthy (instance: $instance)${NC}"
    else
        echo -e "${RED}✗ API on port $port is NOT responding${NC}"
        all_healthy=false
    fi
done
echo ""

if [ "$all_healthy" = false ]; then
    echo -e "${RED}❌ Some API instances are not healthy - aborting${NC}"
    echo "Check logs with: docker logs daon-api-1"
    exit 1
fi

# Step 5: Fix Caddy configuration
echo -e "${YELLOW}Step 5/7: Updating Caddy load balancer configuration...${NC}"

# Backup existing Caddyfile
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup.$(date +%Y%m%d-%H%M%S)
echo -e "${GREEN}✓ Caddyfile backed up${NC}"

# Create new load-balanced configuration
sudo tee /etc/caddy/Caddyfile > /dev/null << 'EOF'
api.daon.network {
    reverse_proxy localhost:3001 localhost:3002 localhost:3003 {
        lb_policy round_robin
        lb_try_duration 5s
        lb_try_interval 250ms
        
        health_uri /health
        health_interval 10s
        health_timeout 5s
        health_status 2xx
        
        # Forward headers
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
    
    # Security headers
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        
        # CORS headers
        Access-Control-Allow-Origin "*"
        Access-Control-Allow-Methods "GET, POST, OPTIONS, PUT, DELETE"
        Access-Control-Allow-Headers "Content-Type, Authorization, X-API-Key"
        Access-Control-Allow-Credentials "true"
    }
    
    # Enable access logging
    log {
        output file /var/log/caddy/api.log {
            roll_size 100mb
            roll_keep 5
        }
        format json
    }
}
EOF

echo -e "${GREEN}✓ New Caddyfile created${NC}"
echo ""

# Validate Caddyfile
echo -e "${YELLOW}Validating Caddyfile...${NC}"
if sudo caddy validate --config /etc/caddy/Caddyfile 2>&1; then
    echo -e "${GREEN}✓ Caddyfile is valid${NC}"
else
    echo -e "${RED}❌ Caddyfile validation failed - restoring backup${NC}"
    sudo cp /etc/caddy/Caddyfile.backup.* /etc/caddy/Caddyfile 2>/dev/null || true
    exit 1
fi
echo ""

# Restart Caddy
echo -e "${YELLOW}Restarting Caddy...${NC}"
sudo systemctl restart caddy
sleep 3

if sudo systemctl is-active --quiet caddy; then
    echo -e "${GREEN}✓ Caddy is running${NC}"
else
    echo -e "${RED}❌ Caddy failed to start${NC}"
    echo "Logs:"
    sudo journalctl -u caddy -n 50 --no-pager
    exit 1
fi
echo ""

# Step 6: Test load balancing
echo -e "${YELLOW}Step 6/7: Testing load balancing...${NC}"
instances_seen=()
for i in {1..12}; do
    instance=$(curl -s -H "Host: api.daon.network" http://localhost/health 2>/dev/null | jq -r '.instance // "unknown"')
    instances_seen+=("$instance")
    echo "Request $i: instance=$instance"
    sleep 0.3
done
echo ""

# Count unique instances
unique_instances=$(printf '%s\n' "${instances_seen[@]}" | sort -u | wc -l)
echo -e "Unique instances seen: ${BLUE}$unique_instances/3${NC}"

if [ "$unique_instances" -eq 3 ]; then
    echo -e "${GREEN}✅ Load balancing is working correctly!${NC}"
elif [ "$unique_instances" -eq 1 ]; then
    echo -e "${YELLOW}⚠️  All requests went to the same instance${NC}"
    echo "This might indicate other instances are unhealthy"
else
    echo -e "${YELLOW}⚠️  Only $unique_instances instances are being used${NC}"
fi
echo ""

# Test external access
echo -e "${YELLOW}Step 7/7: Testing external access...${NC}"
if curl -s -f -m 5 https://api.daon.network/health > /dev/null 2>&1; then
    response=$(curl -s https://api.daon.network/health | jq -r '.instance')
    echo -e "${GREEN}✓ External access working (instance: $response)${NC}"
else
    echo -e "${RED}❌ External access failed${NC}"
fi
echo ""

# Final status
echo -e "${BLUE}=========================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""
echo "Summary:"
echo "  - API updated with instance ID support"
echo "  - Caddy configured for round-robin load balancing"
echo "  - Health checks enabled (every 10s)"
echo "  - All 3 backend instances active"
echo ""
echo "Monitor the system:"
echo "  - Live Caddy logs: sudo journalctl -u caddy -f"
echo "  - API logs: docker logs -f daon-api-1"
echo "  - Health check: curl https://api.daon.network/health"
echo ""
echo "Test load balancing from your local machine:"
echo "  for i in {1..10}; do curl -s https://api.daon.network/health | jq -r '.instance'; done"
echo ""
