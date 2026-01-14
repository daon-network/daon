# Frontend Deployment Status

## Current Status: ✅ PRODUCTION

**Deployed**: January 14, 2026
**URL**: https://app.daon.network
**Version**: 1.0.0

## Architecture

- **Framework**: Next.js 16 with React 19
- **Hosting**: Docker container on DAON infrastructure
- **Reverse Proxy**: Nginx (internal) → Caddy (external)
- **Database**: Shared PostgreSQL with API
- **Authentication**: Magic links + 2FA via API

## Features Deployed

✅ Authentication (magic links, 2FA, device trust)
✅ Content protection (file upload, text paste)
✅ Dashboard (view protected content)
✅ Account settings
🚧 Device management (API ready, UI pending)
🚧 Bulk registration (API ready, UI pending)
📅 Email change (API ready, UI pending)

## Deployment Process

Frontend is deployed via GitHub Actions workflow:
1. Code pushed to `main` branch
2. Docker image built: `daon-frontend:latest`
3. Deployed to production with `docker-compose.production.yml`
4. Nginx routes traffic to port 3000
5. Caddy (host) routes `app.daon.network` to Nginx

## Health Checks

- Internal: `http://daon-frontend:3000`
- Nginx: `https://localhost/`
- External: `https://app.daon.network`

## Infrastructure Details

### Docker Container

```yaml
daon-frontend:
  image: daon-frontend:latest
  container_name: daon-frontend
  restart: unless-stopped
  environment:
    NODE_ENV: production
    NEXT_PUBLIC_API_URL: http://api-server:3000
  networks:
    - daon-network
```

### Nginx Configuration

```nginx
upstream frontend_backend {
    server daon-frontend:3000;
}

location / {
    proxy_pass http://frontend_backend;
    # ... additional proxy settings
}
```

### Caddy Configuration

```caddyfile
app.daon.network {
    reverse_proxy localhost:8080
    encode gzip
}
```

Where port 8080 maps to nginx:80 in docker-compose.

## Monitoring

The frontend is monitored via:
- Docker health checks (every 30s)
- Nginx access logs
- Prometheus metrics (if configured)
- Grafana dashboards (if configured)

## Rollback Procedure

If issues occur:

1. SSH to production server
2. Stop the frontend container:
   ```bash
   docker stop daon-frontend
   ```
3. Investigate logs:
   ```bash
   docker logs daon-frontend
   ```
4. Roll back to previous image (if available)
5. Or comment out frontend service in docker-compose.production.yml
6. Redeploy: `docker compose up -d`

## Troubleshooting

### Frontend Not Responding

```bash
# Check container status
docker ps | grep daon-frontend

# Check logs
docker logs daon-frontend --tail 100

# Restart container
docker restart daon-frontend
```

### 502 Bad Gateway

This usually means nginx can't reach the frontend:

```bash
# Check if frontend is running
docker exec -it daon-frontend wget -O- http://localhost:3000

# Check nginx logs
docker logs daon-nginx
```

### API Connection Issues

```bash
# Test API from within frontend container
docker exec -it daon-frontend wget -O- http://api-server:3000/health

# Check NEXT_PUBLIC_API_URL environment variable
docker inspect daon-frontend | grep NEXT_PUBLIC_API_URL
```

## Performance Metrics

Target performance:
- **Page Load**: <2s
- **Time to Interactive**: <3s
- **Lighthouse Score**: 90+

Monitor via:
- Browser DevTools
- Lighthouse CI
- Real User Monitoring (if configured)

## Security

- SSL/TLS via Caddy (automatic Let's Encrypt)
- HTTPS-only (HTTP redirects to HTTPS)
- Security headers via Nginx
- CORS properly configured
- No sensitive data in environment variables

## Maintenance

### Updating Frontend

1. Push changes to `main` branch
2. GitHub Actions builds and deploys automatically
3. Monitor deployment logs in GitHub Actions
4. Verify at https://app.daon.network

### Manual Deployment

If automatic deployment fails:

```bash
# SSH to production server
ssh user@production-server

# Navigate to source directory
cd /opt/daon-source

# Pull latest code
git pull origin main

# Build frontend image
docker build -t daon-frontend:latest ./daon-frontend

# Restart services
docker compose up -d --remove-orphans
```

## Contact

For deployment issues:
- GitHub Issues: https://github.com/daon-network/daon/issues
- Email: ops@daon.network
