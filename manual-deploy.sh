#!/bin/bash

# Manual deployment script for DAON production
# Use this if CI/CD deployment needs manual intervention

set -e

echo "🚀 Starting manual DAON deployment..."

# Deploy source code to server
echo "📦 Deploying source code..."
rsync -av --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'logs' \
    . daon:/opt/daon-source/

# Run deployment commands on server
echo "🔧 Running deployment on server..."
ssh daon << 'EOF'
cd /opt/daon-source

# Copy docker-compose to deployment directory
cp docker-compose.yml /opt/daon/

# Create environment file if it doesn't exist
if [ ! -f /opt/daon/.env ]; then
    echo "Creating environment file..."
    cat > /opt/daon/.env << ENVEOF
POSTGRES_PASSWORD=your_postgres_password_here
API_KEY_SECRET=your_api_key_secret_here
LOG_LEVEL=info
ENVEOF
    echo "⚠️  Please update /opt/daon/.env with proper secrets"
fi

cd /opt/daon

# Pull latest API image
echo "📥 Pulling latest API image..."
docker pull daonnetwork/api:latest

# Build blockchain image locally
echo "🔨 Building blockchain image..."
docker build -t daon-blockchain:latest /opt/daon-source/daon-core/

# Deploy with docker-compose
echo "🚢 Starting containers..."
docker-compose up -d --remove-orphans

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 30

# Check deployment
echo "🔍 Checking deployment status..."
docker-compose ps

echo "✅ Manual deployment complete!"
echo "🌐 API should be available at: https://api.daon.network"
EOF