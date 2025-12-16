#!/bin/bash

# DAON API Server - Production Deployment Script
# This script automates the production deployment process

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║      DAON API Server - Production Deployment Script         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    echo "Please create .env file from .env.production.example"
    exit 1
fi

# Load environment
source .env

echo "📋 Pre-flight checks..."

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Docker installed"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}✗ Docker Compose not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Docker Compose installed"

# Check SSL certificates
if [ ! -f nginx/ssl/fullchain.pem ] || [ ! -f nginx/ssl/privkey.pem ]; then
    echo -e "${YELLOW}⚠${NC}  SSL certificates not found in nginx/ssl/"
    read -p "Continue without SSL? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "🔐 Generating secrets (if needed)..."

# Check required environment variables
REQUIRED_VARS=("POSTGRES_PASSWORD" "JWT_SECRET" "ENCRYPTION_KEY" "SESSION_SECRET")
for VAR in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR}" ]; then
        echo -e "${YELLOW}⚠${NC}  $VAR not set in .env"
        # Generate and append to .env
        VALUE=$(openssl rand -hex 16)
        echo "$VAR=$VALUE" >> .env
        echo -e "${GREEN}✓${NC} Generated $VAR"
    else
        echo -e "${GREEN}✓${NC} $VAR configured"
    fi
done

echo ""
echo "🏗️  Building Docker images..."

# Build API server
cd api-server
docker build -f Dockerfile.production -t daon-api:production . || {
    echo -e "${RED}✗ Failed to build API server image${NC}"
    exit 1
}
cd ..
echo -e "${GREEN}✓${NC} API server image built"

echo ""
echo "🗄️  Initializing database..."

# Start PostgreSQL
docker-compose -f docker-compose.production.yml up -d postgres
echo "Waiting for PostgreSQL to be ready..."
sleep 10

# Run migrations
echo "Running database migrations..."
docker exec -i daon-postgres-production psql -U daon_api -d daon_production < api-server/src/database/migrations/001_initial_schema.sql 2>/dev/null || echo "Schema may already exist"
docker exec -i daon-postgres-production psql -U daon_api -d daon_production < api-server/src/database/migrations/002_add_broker_system.sql 2>/dev/null || echo "Broker system may already exist"
docker exec -i daon-postgres-production psql -U daon_api -d daon_production < api-server/src/database/migrations/003_add_webhook_system.sql 2>/dev/null || echo "Webhook system may already exist"

echo -e "${GREEN}✓${NC} Database initialized"

echo ""
echo "🚀 Deploying all services..."

# Deploy all services
docker-compose -f docker-compose.production.yml up -d

echo "Waiting for services to start..."
sleep 15

echo ""
echo "🏥 Health checks..."

# Check API health
for i in {1..10}; do
    if curl -f http://localhost:3000/health &>/dev/null; then
        echo -e "${GREEN}✓${NC} API server is healthy"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}✗ API server failed to start${NC}"
        docker-compose -f docker-compose.production.yml logs api-server
        exit 1
    fi
    echo "Waiting for API server... ($i/10)"
    sleep 3
done

echo ""
echo "📊 Service Status:"
docker-compose -f docker-compose.production.yml ps

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║               Deployment Successful! 🎉                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📍 Services:"
echo "   API Server:   http://localhost:3000"
echo "   Health:       http://localhost:3000/health"
echo "   Prometheus:   http://localhost:9090"
echo "   Grafana:      http://localhost:3001"
echo ""
echo "📝 Next Steps:"
echo "   1. Create your first broker (see documentation)"
echo "   2. Configure your domain DNS"
echo "   3. Set up SSL certificate"
echo "   4. Configure monitoring alerts"
echo ""
echo "📖 Documentation: ./documentation/deployment/PRODUCTION_DEPLOYMENT_GUIDE.md"
echo ""
