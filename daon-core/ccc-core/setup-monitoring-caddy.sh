#!/bin/bash

# DAON Monitoring Caddy Configuration Setup Script

set -e

echo "🔧 Setting up Caddy for DAON Monitoring Access..."

# Check if caddy command is available
if ! command -v caddy &> /dev/null; then
    echo "❌ Caddy not found. Please install Caddy first."
    exit 1
fi

# Get domain from user
read -p "Enter your domain (e.g., api.daon.network): " DOMAIN
if [[ -z "$DOMAIN" ]]; then
    DOMAIN="localhost"
    echo "📝 Using localhost for local development"
fi

# Get monitoring password
echo "🔐 Setting up monitoring access credentials..."
read -p "Enter username for monitoring access (default: admin): " MONITORING_USER
MONITORING_USER=${MONITORING_USER:-admin}

read -s -p "Enter password for monitoring access: " MONITORING_PASS
echo ""

if [[ -z "$MONITORING_PASS" ]]; then
    echo "❌ Password cannot be empty"
    exit 1
fi

# Generate password hash
echo "🔑 Generating password hash..."
PASS_HASH=$(caddy hash-password --plaintext "$MONITORING_PASS")

# Create monitoring Caddyfile
echo "📝 Creating monitoring Caddyfile..."

cat > Caddyfile.monitoring.configured << EOF
# DAON Monitoring Stack Caddy Configuration
# Generated on $(date)

# Option 1: Separate subdomains for each service
grafana.${DOMAIN} {
    # Basic Authentication
    basicauth {
        ${MONITORING_USER} ${PASS_HASH}
    }
    
    # Security headers
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Robots-Tag "noindex, nofollow"
    }
    
    # Proxy to Grafana container
    reverse_proxy grafana:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto https
        header_up Host {host}
    }
    
    # Logging
    log {
        output file /var/log/caddy/grafana.log {
            roll_size 10mb
            roll_keep 5
        }
        format json
    }
}

prometheus.${DOMAIN} {
    # Basic Authentication
    basicauth {
        ${MONITORING_USER} ${PASS_HASH}
    }
    
    # Security headers
    header {
        X-Content-Type-Options "nosniff"
        X-Robots-Tag "noindex, nofollow"
    }
    
    reverse_proxy prometheus:9090 {
        header_up X-Real-IP {remote_host}
    }
    
    log {
        output file /var/log/caddy/prometheus.log
        format json
    }
}

alerts.${DOMAIN} {
    # Basic Authentication
    basicauth {
        ${MONITORING_USER} ${PASS_HASH}
    }
    
    # Security headers  
    header {
        X-Content-Type-Options "nosniff"
        X-Robots-Tag "noindex, nofollow"
    }
    
    reverse_proxy alertmanager:9093 {
        header_up X-Real-IP {remote_host}
    }
    
    log {
        output file /var/log/caddy/alertmanager.log
        format json
    }
}

# Option 2: Single monitoring subdomain with path-based routing
monitoring.${DOMAIN} {
    # Basic Authentication for all monitoring tools
    basicauth {
        ${MONITORING_USER} ${PASS_HASH}
    }
    
    # Security headers
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        X-Robots-Tag "noindex, nofollow"
    }
    
    # Grafana at /grafana/*
    handle_path /grafana/* {
        reverse_proxy grafana:3000 {
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto https
            header_up Host {host}
        }
    }
    
    # Prometheus at /prometheus/*
    handle_path /prometheus/* {
        reverse_proxy prometheus:9090 {
            header_up X-Real-IP {remote_host}
        }
    }
    
    # Alertmanager at /alerts/*
    handle_path /alerts/* {
        reverse_proxy alertmanager:9093 {
            header_up X-Real-IP {remote_host}
        }
    }
    
    # Root redirects to Grafana
    handle {
        redir /grafana/ permanent
    }
    
    log {
        output file /var/log/caddy/monitoring.log {
            roll_size 10mb
            roll_keep 5
        }
        format json
    }
}
EOF

echo "✅ Monitoring Caddyfile created: Caddyfile.monitoring.configured"

# Create integration instructions
cat > CADDY_INTEGRATION.md << EOF
# Integrating DAON Monitoring with Caddy

## 📋 Generated Configuration

Your monitoring Caddyfile has been created: \`Caddyfile.monitoring.configured\`

**Credentials:**
- Username: \`${MONITORING_USER}\`
- Password: \`[hidden]\`

## 🔗 Access URLs

### Option 1: Separate Subdomains
- **Grafana**: https://grafana.${DOMAIN}
- **Prometheus**: https://prometheus.${DOMAIN} 
- **Alertmanager**: https://alerts.${DOMAIN}

### Option 2: Single Monitoring Subdomain
- **Monitoring Dashboard**: https://monitoring.${DOMAIN}
- **Grafana**: https://monitoring.${DOMAIN}/grafana/
- **Prometheus**: https://monitoring.${DOMAIN}/prometheus/
- **Alertmanager**: https://monitoring.${DOMAIN}/alerts/

## 🚀 Integration Steps

### For New Caddy Installation:
1. Copy the configuration to your main Caddyfile:
   \`\`\`bash
   cat Caddyfile.monitoring.configured >> /etc/caddy/Caddyfile
   \`\`\`

2. Validate and reload Caddy:
   \`\`\`bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   \`\`\`

### For Existing Caddy Installation:
1. Add the monitoring configuration to your existing Caddyfile
2. Ensure monitoring services are in the same Docker network as Caddy
3. Test the configuration and reload

### Using Docker Compose:
1. Add Caddy to your docker-compose.yml:
   \`\`\`yaml
   caddy:
     image: caddy:alpine
     container_name: daon-caddy
     ports:
       - "80:80"
       - "443:443"
     volumes:
       - ./Caddyfile.monitoring.configured:/etc/caddy/Caddyfile:ro
       - caddy_data:/data
       - caddy_config:/config
       - /var/log/caddy:/var/log/caddy
     networks:
       - ccc-network
   \`\`\`

2. Add volumes to docker-compose.yml:
   \`\`\`yaml
   volumes:
     caddy_data:
     caddy_config:
   \`\`\`

## 🔒 Security Notes

- All monitoring endpoints are protected with HTTP Basic Auth
- Consider adding IP restrictions for additional security
- Change the default password after setup
- Monitor access logs in \`/var/log/caddy/\`

## 🔄 To Change Passwords Later:

1. Generate new hash:
   \`\`\`bash
   caddy hash-password --plaintext "new_password"
   \`\`\`

2. Update Caddyfile with new hash
3. Reload Caddy: \`sudo systemctl reload caddy\`
EOF

echo ""
echo "🎉 Caddy monitoring setup complete!"
echo ""
echo "📁 Files created:"
echo "  • Caddyfile.monitoring.configured"
echo "  • CADDY_INTEGRATION.md (integration instructions)"
echo ""
echo "🔗 Your monitoring URLs will be:"
if [[ "$DOMAIN" != "localhost" ]]; then
    echo "  • Grafana:      https://grafana.${DOMAIN}"
    echo "  • Prometheus:   https://prometheus.${DOMAIN}"
    echo "  • Alertmanager: https://alerts.${DOMAIN}"
    echo "  • All-in-one:   https://monitoring.${DOMAIN}"
else
    echo "  • Grafana:      http://grafana.localhost"
    echo "  • Prometheus:   http://prometheus.localhost"  
    echo "  • Alertmanager: http://alerts.localhost"
    echo "  • All-in-one:   http://monitoring.localhost"
fi
echo ""
echo "🔐 Login credentials:"
echo "  • Username: ${MONITORING_USER}"
echo "  • Password: [the password you entered]"
echo ""
echo "📖 Next steps: See CADDY_INTEGRATION.md for integration instructions"