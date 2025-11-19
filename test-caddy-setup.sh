#!/bin/bash
# Caddy Load Balancer Diagnostic and Test Script

set -e

echo "========================================="
echo "CADDY LOAD BALANCER DIAGNOSTICS"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if Caddy is installed
echo "1. Checking if Caddy is installed..."
if command -v caddy &> /dev/null; then
    echo -e "${GREEN}✓${NC} Caddy is installed: $(caddy version)"
else
    echo -e "${RED}✗${NC} Caddy is NOT installed"
    echo "Install with: sudo apt install caddy"
    exit 1
fi
echo ""

# Test 2: Check if Caddy service is running
echo "2. Checking Caddy service status..."
if systemctl is-active --quiet caddy 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Caddy service is running"
    systemctl status caddy --no-pager | head -5
else
    echo -e "${RED}✗${NC} Caddy service is NOT running"
    echo "Recent logs:"
    sudo journalctl -u caddy -n 20 --no-pager
    echo ""
    echo "Try: sudo systemctl start caddy"
    exit 1
fi
echo ""

# Test 3: Check if Caddy is listening on port 80/443
echo "3. Checking if Caddy is listening on ports 80 and 443..."
if netstat -tlnp 2>/dev/null | grep -q ':80.*caddy' || ss -tlnp 2>/dev/null | grep -q ':80.*caddy'; then
    echo -e "${GREEN}✓${NC} Caddy is listening on port 80"
else
    echo -e "${RED}✗${NC} Caddy is NOT listening on port 80"
fi

if netstat -tlnp 2>/dev/null | grep -q ':443.*caddy' || ss -tlnp 2>/dev/null | grep -q ':443.*caddy'; then
    echo -e "${GREEN}✓${NC} Caddy is listening on port 443"
else
    echo -e "${RED}✗${NC} Caddy is NOT listening on port 443"
fi
echo ""

# Test 4: Validate Caddyfile syntax
echo "4. Validating Caddyfile syntax..."
if [ -f /etc/caddy/Caddyfile ]; then
    echo "Caddyfile location: /etc/caddy/Caddyfile"
    if sudo caddy validate --config /etc/caddy/Caddyfile 2>&1; then
        echo -e "${GREEN}✓${NC} Caddyfile syntax is valid"
    else
        echo -e "${RED}✗${NC} Caddyfile has syntax errors"
        exit 1
    fi
else
    echo -e "${RED}✗${NC} Caddyfile not found at /etc/caddy/Caddyfile"
    exit 1
fi
echo ""

# Test 5: Show current Caddyfile
echo "5. Current Caddyfile contents:"
echo "-----------------------------------"
sudo cat /etc/caddy/Caddyfile
echo "-----------------------------------"
echo ""

# Test 6: Test backend API instances directly
echo "6. Testing backend API instances..."
for port in 3001 3002 3003; do
    if curl -s -f -m 5 http://localhost:$port/health > /dev/null 2>&1; then
        response=$(curl -s http://localhost:$port/health)
        echo -e "${GREEN}✓${NC} API on port $port is responding: $response"
    else
        echo -e "${RED}✗${NC} API on port $port is NOT responding"
    fi
done
echo ""

# Test 7: Test Caddy locally (should work even if DNS/firewall issues)
echo "7. Testing Caddy proxy locally..."
if curl -s -f -m 5 -H "Host: api.daon.network" http://localhost/health > /dev/null 2>&1; then
    response=$(curl -s -H "Host: api.daon.network" http://localhost/health)
    echo -e "${GREEN}✓${NC} Caddy proxy is working locally: $response"
else
    echo -e "${RED}✗${NC} Caddy proxy is NOT working locally"
    echo "This means Caddy is running but not proxying correctly"
fi
echo ""

# Test 8: Check Caddy logs for errors
echo "8. Recent Caddy logs (last 20 lines)..."
echo "-----------------------------------"
sudo journalctl -u caddy -n 20 --no-pager
echo "-----------------------------------"
echo ""

# Test 9: Check firewall
echo "9. Checking firewall rules..."
if command -v ufw &> /dev/null; then
    echo "UFW status:"
    sudo ufw status | grep -E "80|443|LISTEN"
else
    echo "UFW not installed, checking iptables..."
    sudo iptables -L -n | grep -E "80|443" || echo "No specific rules found"
fi
echo ""

# Test 10: Check SSL certificates
echo "10. Checking SSL certificates..."
if [ -d /var/lib/caddy/.local/share/caddy/certificates ]; then
    echo "Certificate directory exists"
    sudo ls -lh /var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/ 2>/dev/null || echo "No Let's Encrypt certificates found"
else
    echo -e "${YELLOW}⚠${NC} Certificate directory not found (certificates may not be issued yet)"
fi
echo ""

# Summary
echo "========================================="
echo "DIAGNOSTIC SUMMARY"
echo "========================================="
echo ""
echo "Run these commands to troubleshoot:"
echo ""
echo "# Check Caddy status:"
echo "  sudo systemctl status caddy"
echo ""
echo "# View live Caddy logs:"
echo "  sudo journalctl -u caddy -f"
echo ""
echo "# Restart Caddy:"
echo "  sudo systemctl restart caddy"
echo ""
echo "# Reload Caddyfile (after config changes):"
echo "  sudo systemctl reload caddy"
echo ""
echo "# Test local API instances:"
echo "  curl http://localhost:3001/health"
echo "  curl http://localhost:3002/health"
echo "  curl http://localhost:3003/health"
echo ""
echo "# Test Caddy proxy locally:"
echo "  curl -H 'Host: api.daon.network' http://localhost/health"
echo ""
echo "# Test from external (if DNS is set up):"
echo "  curl https://api.daon.network/health"
echo ""
echo "========================================="
