# DAON API Server - Production Deployment Guide

## Pre-Deployment Checklist

### ✅ Prerequisites
- [ ] Server with Docker & Docker Compose installed
- [ ] Domain name configured (e.g., `api.yourdomain.com`)
- [ ] SSL certificate (Let's Encrypt recommended)
- [ ] PostgreSQL 15+ (or use provided Docker setup)
- [ ] Minimum 4GB RAM, 2 CPU cores
- [ ] 20GB+ storage

### ✅ Required Secrets
Generate these before deployment:
```bash
# JWT Secret (32+ characters)
openssl rand -hex 32

# Encryption Key (32 characters)
openssl rand -hex 16

# Session Secret (32+ characters)
openssl rand -hex 32

# PostgreSQL Password
openssl rand -hex 24

# Redis Password
openssl rand -hex 16
```

---

## Step 1: Server Setup

### 1.1 Install Docker & Docker Compose
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### 1.2 Configure Firewall
```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow SSH
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

---

## Step 2: Clone Repository

```bash
# Clone repo
git clone https://github.com/your-org/greenfield-blockchain.git
cd greenfield-blockchain

# Checkout production branch
git checkout main
```

---

## Step 3: Environment Configuration

### 3.1 Create Production .env
```bash
cd api-server
cp .env.production.example .env.production
```

### 3.2 Edit .env.production
```bash
nano .env.production
```

**Required variables:**
```bash
# Database
DATABASE_URL=postgresql://daon_api:YOUR_POSTGRES_PASSWORD@postgres:5432/daon_production

# Security (use generated secrets)
JWT_SECRET=your_generated_jwt_secret_here
ENCRYPTION_KEY=your_generated_encryption_key_here
SESSION_SECRET=your_generated_session_secret_here

# Domain
API_DOMAIN=api.yourdomain.com
CORS_ORIGIN=https://yourdomain.com

# Blockchain
API_MNEMONIC="your 24 word mnemonic phrase here"
```

### 3.3 Create Root .env
```bash
cd ..
nano .env
```

**Add:**
```bash
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_USER=daon_api
POSTGRES_DB=daon_production
REDIS_PASSWORD=your_redis_password
CHAIN_ID=daon-mainnet-1
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_encryption_key
SESSION_SECRET=your_session_secret
BLOCKCHAIN_ENABLED=true
API_MNEMONIC="your mnemonic"
CORS_ORIGIN=https://yourdomain.com
LOG_LEVEL=info
GRAFANA_PASSWORD=your_grafana_password
```

---

## Step 4: SSL Certificate Setup

### Option A: Let's Encrypt (Recommended)
```bash
# Install Certbot
sudo apt install certbot

# Generate certificate
sudo certbot certonly --standalone -d api.yourdomain.com

# Copy certificates
sudo mkdir -p nginx/ssl
sudo cp /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/api.yourdomain.com/privkey.pem nginx/ssl/

# Set permissions
sudo chmod 644 nginx/ssl/fullchain.pem
sudo chmod 600 nginx/ssl/privkey.pem
```

### Option B: Self-Signed (Development Only)
```bash
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/privkey.pem \
  -out nginx/ssl/fullchain.pem
```

---

## Step 5: Database Initialization

```bash
# Start only PostgreSQL first
docker-compose -f docker-compose.production.yml up -d postgres

# Wait for PostgreSQL to be ready
sleep 10

# Run migrations
docker exec -i daon-postgres-production psql -U daon_api -d daon_production < api-server/src/database/migrations/001_initial_schema.sql
docker exec -i daon-postgres-production psql -U daon_api -d daon_production < api-server/src/database/migrations/002_add_broker_system.sql
docker exec -i daon-postgres-production psql -U daon_api -d daon_production < api-server/src/database/migrations/003_add_webhook_system.sql
```

---

## Step 6: Deploy Services

### 6.1 Build Images
```bash
# Build API server
cd api-server
docker build -f Dockerfile.production -t daon-api:production .
cd ..
```

### 6.2 Start All Services
```bash
docker-compose -f docker-compose.production.yml up -d
```

### 6.3 Verify Deployment
```bash
# Check all services are running
docker-compose -f docker-compose.production.yml ps

# Check logs
docker-compose -f docker-compose.production.yml logs -f api-server

# Test health endpoint
curl https://api.yourdomain.com/health
```

---

## Step 7: Create First Broker

```bash
# Connect to database
docker exec -it daon-postgres-production psql -U daon_api -d daon_production

# Create broker
INSERT INTO brokers (
  domain, name, certification_tier, certification_status,
  contact_email, rate_limit_per_hour, rate_limit_per_day,
  enabled, created_at
) VALUES (
  'your-platform.com',
  'Your Platform Name',
  'standard',
  'active',
  'admin@your-platform.com',
  1000,
  10000,
  true,
  NOW()
) RETURNING id;

# Note the returned ID
\q
```

### Generate API Key
```bash
# Run script to generate API key
docker exec -it daon-api-production node -e "
const crypto = require('crypto');
const bcrypt = require('bcrypt');

async function generateKey() {
  const key = \`DAON_BR_\${crypto.randomBytes(32).toString('hex')}\`;
  const hash = await bcrypt.hash(key, 12);
  const prefix = key.substring(0, 16);
  
  console.log('API Key:', key);
  console.log('Prefix:', prefix);
  console.log('Hash:', hash);
  console.log('\nSave this SQL:');
  console.log(\`INSERT INTO broker_api_keys (broker_id, key_hash, key_prefix, key_name, scopes, created_at)
VALUES (YOUR_BROKER_ID, '\${hash}', '\${prefix}', 'Production Key', 
ARRAY['broker:register', 'broker:verify', 'broker:transfer', 'broker:webhooks'], NOW());\`);
}

generateKey();
"
```

---

## Step 8: Monitoring Setup

### 8.1 Access Grafana
```
URL: http://your-server-ip:3001
Username: admin
Password: (your GRAFANA_PASSWORD from .env)
```

### 8.2 Access Prometheus
```
URL: http://your-server-ip:9090
```

### 8.3 Configure Alerts (Optional)
Edit `monitoring/prometheus.yml` to add alerting rules.

---

## Step 9: Backup Configuration

### 9.1 Database Backups
```bash
# Create backup script
cat > /usr/local/bin/backup-daon-db.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/backups/daon"
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
docker exec daon-postgres-production pg_dump -U daon_api daon_production | gzip > $BACKUP_DIR/daon_$DATE.sql.gz
# Keep only last 30 days
find $BACKUP_DIR -name "daon_*.sql.gz" -mtime +30 -delete
EOF

chmod +x /usr/local/bin/backup-daon-db.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-daon-db.sh") | crontab -
```

### 9.2 Volume Backups
```bash
# Backup Docker volumes
docker run --rm -v daon-postgres-data:/data -v $(pwd)/backups:/backup alpine tar czf /backup/postgres-data.tar.gz /data
```

---

## Step 10: SSL Certificate Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Add renewal hook
sudo nano /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

**Add:**
```bash
#!/bin/bash
cp /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem /path/to/nginx/ssl/
cp /etc/letsencrypt/live/api.yourdomain.com/privkey.pem /path/to/nginx/ssl/
docker-compose -f /path/to/docker-compose.production.yml restart nginx
```

```bash
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

---

## Step 11: Testing

### 11.1 Health Check
```bash
curl https://api.yourdomain.com/health
```

**Expected:**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "..."
}
```

### 11.2 Broker Verification
```bash
curl https://api.yourdomain.com/api/v1/broker/verify \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 11.3 Content Protection
```bash
curl -X POST https://api.yourdomain.com/api/v1/broker/protect \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test content",
    "username": "testuser",
    "license": "cc-by"
  }'
```

---

## Troubleshooting

### Check Logs
```bash
# API Server
docker logs daon-api-production -f

# PostgreSQL
docker logs daon-postgres-production -f

# Nginx
docker logs daon-nginx -f

# All services
docker-compose -f docker-compose.production.yml logs -f
```

### Restart Services
```bash
# Restart specific service
docker-compose -f docker-compose.production.yml restart api-server

# Restart all
docker-compose -f docker-compose.production.yml restart
```

### Database Connection Issues
```bash
# Test connection
docker exec -it daon-postgres-production psql -U daon_api -d daon_production -c "SELECT version();"
```

### SSL Issues
```bash
# Test certificate
openssl s_client -connect api.yourdomain.com:443 -servername api.yourdomain.com

# Check Nginx config
docker exec daon-nginx nginx -t
```

---

## Maintenance

### Updates
```bash
# Pull latest code
git pull origin main

# Rebuild images
docker-compose -f docker-compose.production.yml build

# Restart with new images
docker-compose -f docker-compose.production.yml up -d
```

### Scaling
```bash
# Scale API servers
docker-compose -f docker-compose.production.yml up -d --scale api-server=3
```

---

## Security Checklist

- [ ] Strong passwords for all services
- [ ] SSL/TLS configured
- [ ] Firewall configured
- [ ] Database not exposed publicly
- [ ] Regular backups configured
- [ ] Monitoring alerts configured
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] Security headers enabled
- [ ] Regular security updates

---

## Production URLs

- **API:** https://api.yourdomain.com
- **Health:** https://api.yourdomain.com/health
- **Metrics:** http://server-ip:9090 (Prometheus)
- **Monitoring:** http://server-ip:3001 (Grafana)

---

## Support

- Documentation: https://docs.daon.network
- Issues: https://github.com/your-org/greenfield-blockchain/issues
- Community: https://discord.gg/daon
