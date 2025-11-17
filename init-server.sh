#!/bin/bash

# Server Initialization Script for DAON Deployment
# Run this ONCE on your server before first deployment

set -e

echo "🚀 Initializing DAON server directories and permissions..."

# Get server details from GitHub secrets or prompt
if [ -z "$1" ]; then
  echo "Usage: ./init-server.sh user@server-ip"
  echo "Example: ./init-server.sh root@123.45.67.89"
  exit 1
fi

SERVER=$1

echo "📡 Connecting to $SERVER..."

# Initialize server via SSH
ssh $SERVER << 'ENDSSH'

# Create deployment directories
echo "📁 Creating deployment directories..."
sudo mkdir -p /opt/daon
sudo mkdir -p /opt/daon-source
sudo mkdir -p /opt/daon/logs
sudo mkdir -p /opt/daon/backups

# Create daon user if doesn't exist
if ! id "daon" &>/dev/null; then
    echo "👤 Creating daon user..."
    sudo useradd -r -s /bin/bash -d /opt/daon -m daon
fi

# Set permissions
echo "🔒 Setting permissions..."
sudo chown -R daon:daon /opt/daon
sudo chown -R daon:daon /opt/daon-source
sudo chmod 755 /opt/daon
sudo chmod 755 /opt/daon-source

# Allow current user to access directories
CURRENT_USER=$(whoami)
echo "👥 Adding $CURRENT_USER to daon group..."
sudo usermod -a -G daon $CURRENT_USER

# Set ACLs to allow group write access
sudo setfacl -R -m g:daon:rwx /opt/daon
sudo setfacl -R -m g:daon:rwx /opt/daon-source
sudo setfacl -R -d -m g:daon:rwx /opt/daon
sudo setfacl -R -d -m g:daon:rwx /opt/daon-source

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker daon
    sudo usermod -aG docker $CURRENT_USER
    echo "✅ Docker installed"
else
    echo "✅ Docker already installed"
fi

# Install docker-compose if not present
if ! command -v docker-compose &> /dev/null; then
    echo "🐳 Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose installed"
else
    echo "✅ Docker Compose already installed"
fi

# Verify installations
echo ""
echo "📋 Installation Summary:"
echo "===================="
docker --version
docker-compose --version
echo ""
echo "📁 Directory Structure:"
ls -la /opt/ | grep daon
echo ""
echo "👤 User Groups:"
groups $CURRENT_USER

echo ""
echo "✅ Server initialization complete!"
echo ""
echo "⚠️  IMPORTANT: You may need to log out and log back in for group changes to take effect."
echo ""

ENDSSH

echo ""
echo "✅ Server initialized successfully!"
echo ""
echo "🔄 Next steps:"
echo "1. If you changed users/groups, log out and back in to the server"
echo "2. Re-run the GitHub Actions deployment"
echo "3. Or push a commit to trigger auto-deployment"
echo ""
echo "🚀 Push to deploy:"
echo "   git push origin main"
