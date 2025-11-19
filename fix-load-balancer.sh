#!/bin/bash
# Fix Caddy Load Balancer Configuration

set -e

echo "========================================="
echo "FIXING CADDY LOAD BALANCER"
echo "========================================="
echo ""

# Check if running on server
if [ ! -f /etc/caddy/Caddyfile ]; then
    echo "❌ This script must be run on the production server"
    echo "Run: scp fix-load-balancer.sh USER@SERVER: && ssh USER@SERVER 'bash fix-load-balancer.sh'"
    exit 1
fi

# Backup existing Caddyfile
echo "1. Backing up existing Caddyfile..."
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup.$(date +%Y%m%d-%H%M%S)
echo "✓ Backup created"
echo ""

# Show current config
echo "2. Current Caddyfile:"
echo "-----------------------------------"
sudo cat /etc/caddy/Caddyfile
echo "-----------------------------------"
echo ""

# Create new load-balanced configuration
echo "3. Creating new load-balanced configuration..."
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

echo "✓ New configuration created"
echo ""

# Validate new configuration
echo "4. Validating Caddyfile syntax..."
if sudo caddy validate --config /etc/caddy/Caddyfile; then
    echo "✓ Configuration is valid"
else
    echo "❌ Configuration has errors - restoring backup"
    sudo cp /etc/caddy/Caddyfile.backup.* /etc/caddy/Caddyfile 2>/dev/null || true
    exit 1
fi
echo ""

# Test backend instances
echo "5. Testing backend API instances..."
all_healthy=true
for port in 3001 3002 3003; do
    if curl -s -f -m 5 http://localhost:$port/health > /dev/null 2>&1; then
        response=$(curl -s http://localhost:$port/health | jq -r '.instance // "unknown"')
        echo "✓ API on port $port is healthy (instance: $response)"
    else
        echo "❌ API on port $port is NOT responding"
        all_healthy=false
    fi
done
echo ""

if [ "$all_healthy" = false ]; then
    echo "⚠️  Warning: Some API instances are not healthy"
    echo "Consider fixing the API instances before restarting Caddy"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Restart Caddy
echo "6. Restarting Caddy..."
sudo systemctl restart caddy
sleep 2

# Check if Caddy started successfully
if sudo systemctl is-active --quiet caddy; then
    echo "✓ Caddy is running"
else
    echo "❌ Caddy failed to start - check logs:"
    sudo journalctl -u caddy -n 50 --no-pager
    exit 1
fi
echo ""

# Test load balancing
echo "7. Testing load balancing (making 10 requests)..."
instances_seen=()
for i in {1..10}; do
    instance=$(curl -s -H "Host: api.daon.network" http://localhost/health | jq -r '.instance // "unknown"')
    instances_seen+=("$instance")
    echo "Request $i: instance=$instance"
    sleep 0.3
done
echo ""

# Count unique instances
unique_instances=$(printf '%s\n' "${instances_seen[@]}" | sort -u | wc -l)
echo "Unique instances seen: $unique_instances/3"

if [ "$unique_instances" -eq 3 ]; then
    echo "✅ Load balancing is working correctly!"
elif [ "$unique_instances" -eq 1 ]; then
    echo "⚠️  All requests went to the same instance"
    echo "This might be normal if the other instances are marked unhealthy"
else
    echo "⚠️  Only $unique_instances instances are being used"
fi
echo ""

# Test externally
echo "8. Testing external access..."
if curl -s -f -m 5 https://api.daon.network/health > /dev/null 2>&1; then
    response=$(curl -s https://api.daon.network/health | jq -r '.instance')
    echo "✓ External access working (instance: $response)"
else
    echo "❌ External access failed"
    echo "Check DNS and firewall settings"
fi
echo ""

echo "========================================="
echo "LOAD BALANCER FIX COMPLETE!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Monitor logs: sudo journalctl -u caddy -f"
echo "2. Test from your local machine:"
echo "   for i in {1..10}; do curl -s https://api.daon.network/health | jq -r '.instance'; done"
echo "3. If issues persist, check:"
echo "   - API container logs: docker logs daon-api-1"
echo "   - API health endpoints directly"
echo ""
