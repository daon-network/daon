# Caddy Reverse Proxy Setup

## Overview

Caddy runs on the **host server** (not in Docker) and handles:
- External SSL/TLS termination (automatic Let's Encrypt)
- Domain routing (`app.daon.network`, `api.daon.network`)
- HTTP to HTTPS redirects
- Gzip compression
- Request logging

## Architecture

```
Internet
   ↓
Caddy (Host Server - Port 80/443)
   ↓
Nginx (Docker Container - Port 8080)
   ↓
Services (Docker Containers)
   ├── daon-frontend:3000
   ├── api-server:3000
   └── Other services
```

**Key Points:**
- Caddy is the external-facing reverse proxy
- Nginx handles internal routing between Docker containers
- Caddy → Nginx on localhost:8080
- Nginx → Services within Docker network

## Installation

### Install Caddy on Host Server

```bash
# Ubuntu/Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Enable and start service
sudo systemctl enable caddy
sudo systemctl start caddy
```

## Configuration

### Caddyfile Location

The main configuration file is located at:
```
/etc/caddy/Caddyfile
```

### DAON Caddyfile Configuration

Edit `/etc/caddy/Caddyfile`:

```caddyfile
# Frontend - Web Portal
app.daon.network {
    # Reverse proxy to nginx (which routes to frontend container)
    reverse_proxy localhost:8080

    # Enable gzip compression
    encode gzip

    # Logging
    log {
        output file /var/log/caddy/app.log
        format json
        level INFO
    }

    # Security headers
    header {
        # Enable HSTS
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"

        # Prevent clickjacking
        X-Frame-Options "SAMEORIGIN"

        # Prevent MIME type sniffing
        X-Content-Type-Options "nosniff"

        # Enable XSS protection
        X-XSS-Protection "1; mode=block"

        # Referrer policy
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}

# API Server
api.daon.network {
    # Reverse proxy to nginx (which routes to API container)
    reverse_proxy localhost:8080

    # Enable gzip compression
    encode gzip

    # Logging
    log {
        output file /var/log/caddy/api.log
        format json
        level INFO
    }

    # Security headers (same as above)
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    # Rate limiting (optional)
    rate_limit {
        zone api_rate_limit {
            key {remote_host}
            events 100
            window 1m
        }
    }
}
```

### Apply Configuration

```bash
# Test configuration
sudo caddy validate --config /etc/caddy/Caddyfile

# Reload Caddy (zero downtime)
sudo systemctl reload caddy

# Or restart if needed
sudo systemctl restart caddy
```

## SSL/TLS Certificates

Caddy automatically obtains and renews Let's Encrypt certificates.

### Certificate Storage

Certificates are stored at:
```
/var/lib/caddy/.local/share/caddy/certificates/
```

### Force Certificate Renewal

```bash
# Caddy automatically renews 30 days before expiry
# To force renewal:
sudo caddy reload
```

### Check Certificate Status

```bash
# View certificates
sudo caddy list-certificates

# Check expiry
echo | openssl s_client -servername app.daon.network -connect app.daon.network:443 2>/dev/null | openssl x509 -noout -dates
```

## Log Files

### Log Locations

```bash
# Caddy service logs
sudo journalctl -u caddy -f

# Access logs (as configured in Caddyfile)
sudo tail -f /var/log/caddy/app.log
sudo tail -f /var/log/caddy/api.log
```

### Create Log Directory

```bash
# Create log directory if it doesn't exist
sudo mkdir -p /var/log/caddy
sudo chown caddy:caddy /var/log/caddy
```

## Troubleshooting

### Check Caddy Status

```bash
# Service status
sudo systemctl status caddy

# Check if Caddy is listening
sudo netstat -tulpn | grep caddy
# Should show ports 80 and 443
```

### Test Caddy → Nginx Connection

```bash
# From host server, test if nginx is accessible
curl -v http://localhost:8080/health

# Should return API health check
```

### Common Issues

#### 1. Port Already in Use

```bash
# Check what's using port 80/443
sudo lsof -i :80
sudo lsof -i :443

# Stop conflicting service (e.g., Apache)
sudo systemctl stop apache2
sudo systemctl disable apache2
```

#### 2. Certificate Errors

```bash
# Check Caddy can write to cert directory
sudo ls -la /var/lib/caddy/.local/share/caddy/

# Ensure caddy user has permissions
sudo chown -R caddy:caddy /var/lib/caddy/
```

#### 3. DNS Not Resolving

```bash
# Verify DNS points to server
nslookup app.daon.network
dig app.daon.network

# Should return your server's IP
```

#### 4. Caddy Not Starting

```bash
# Check for configuration errors
sudo caddy validate --config /etc/caddy/Caddyfile

# View detailed logs
sudo journalctl -u caddy -n 50 --no-pager
```

## Verification

### Test Frontend Access

```bash
# From external machine
curl -I https://app.daon.network

# Should return:
# HTTP/2 200
# Content-Type: text/html
```

### Test API Access

```bash
# Test API endpoint
curl https://api.daon.network/health

# Should return:
# {"status":"ok","timestamp":"..."}
```

### Test SSL Certificate

```bash
# Check certificate details
curl -vI https://app.daon.network 2>&1 | grep "SSL certificate"
```

## Monitoring

### Caddy Metrics

Caddy doesn't export Prometheus metrics by default. To add:

```caddyfile
{
    servers {
        metrics
    }
}
```

Then metrics available at: `http://localhost:2019/metrics`

### Health Checks

```bash
# Caddy admin API
curl http://localhost:2019/config/

# Check reverse proxy health
curl -f https://app.daon.network || echo "Frontend down"
curl -f https://api.daon.network/health || echo "API down"
```

## Maintenance

### Backup Configuration

```bash
# Backup Caddyfile
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup.$(date +%Y%m%d)

# Backup certificates (optional, Caddy will regenerate)
sudo tar -czf caddy-certs-backup.tar.gz /var/lib/caddy/.local/share/caddy/certificates/
```

### Update Caddy

```bash
# Update to latest version
sudo apt update
sudo apt upgrade caddy

# Restart service
sudo systemctl restart caddy
```

## Additional Domains

To add more domains:

```caddyfile
# Add to /etc/caddy/Caddyfile
docs.daon.network {
    reverse_proxy localhost:8080
    encode gzip
    log {
        output file /var/log/caddy/docs.log
    }
}
```

Then reload:
```bash
sudo systemctl reload caddy
```

## Security Best Practices

1. **Keep Caddy Updated**: `sudo apt upgrade caddy`
2. **Monitor Logs**: Watch for suspicious access patterns
3. **Rate Limiting**: Enable for API endpoints
4. **Firewall Rules**: Only allow 80/443 from outside
5. **Certificate Monitoring**: Alert on expiry (though auto-renews)

## Integration with Docker

Caddy runs on the host, not in Docker. This provides:
- ✅ Persistent SSL certificates across container rebuilds
- ✅ Single point for all SSL/TLS
- ✅ Easy domain management
- ✅ Independent of Docker stack

Port mapping in docker-compose.production.yml:
```yaml
nginx:
  ports:
    - "8080:80"  # Caddy connects here
```

## Notes

- **Caddy config NOT in git**: Configuration is on the production server only
- **Automatic HTTPS**: Caddy handles Let's Encrypt automatically
- **Zero-downtime reloads**: Use `systemctl reload caddy` not `restart`
- **Logs rotate automatically**: Caddy manages log rotation

## Support

For Caddy-specific issues:
- Official Docs: https://caddyserver.com/docs/
- Community Forum: https://caddy.community/
- GitHub: https://github.com/caddyserver/caddy
