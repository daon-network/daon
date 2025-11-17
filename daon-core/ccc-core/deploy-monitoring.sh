#!/bin/bash

# DAON Network Monitoring Stack Deployment Script

set -e

echo "🚀 Deploying DAON Monitoring Stack..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Please install docker-compose."
    exit 1
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p grafana/{dashboards,provisioning/{datasources,dashboards}}

# Check if configuration files exist
REQUIRED_FILES=(
    "prometheus.yml"
    "alert_rules.yml" 
    "alertmanager.yml"
    "grafana/provisioning/datasources/prometheus.yml"
    "grafana/provisioning/dashboards/default.yml"
    "grafana/dashboards/daon-api-overview.json"
    "grafana/dashboards/daon-blockchain-overview.json"
)

echo "🔍 Checking configuration files..."
for file in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo "❌ Missing configuration file: $file"
        echo "Please ensure all monitoring configuration files are present."
        exit 1
    else
        echo "✅ Found: $file"
    fi
done

# Start monitoring services
echo "🐳 Starting monitoring stack..."

# Stop existing services if running
docker-compose down 2>/dev/null || true

# Start core monitoring services
docker-compose up -d prometheus grafana alertmanager node-exporter

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo "🏥 Checking service health..."

# Check Prometheus
if curl -sf http://localhost:9093/targets > /dev/null; then
    echo "✅ Prometheus is running"
else
    echo "❌ Prometheus health check failed"
fi

# Check Grafana  
if curl -sf http://localhost:3000/api/health > /dev/null; then
    echo "✅ Grafana is running"
else
    echo "❌ Grafana health check failed"
fi

# Check Alertmanager
if curl -sf http://localhost:9093/api/v1/status > /dev/null; then
    echo "✅ Alertmanager is running" 
else
    echo "❌ Alertmanager health check failed"
fi

# Display access information
echo ""
echo "🎉 DAON Monitoring Stack deployed successfully!"
echo ""
echo "📊 Access URLs:"
echo "  • Grafana:      http://localhost:3000 (admin/ccc-admin)"
echo "  • Prometheus:   http://localhost:9093"  
echo "  • Alertmanager: http://localhost:9093"
echo ""
echo "📈 Available Dashboards:"
echo "  • DAON API Overview"
echo "  • DAON Blockchain Overview"
echo ""
echo "🔧 Next Steps:"
echo "  1. Start your DAON validators and API server"
echo "  2. Configure alert notifications in alertmanager.yml" 
echo "  3. Customize dashboards as needed"
echo "  4. Review monitoring guide: docs/MONITORING_GUIDE.md"
echo ""
echo "📋 Check running services:"
echo "  docker-compose ps"
echo ""
echo "📋 View logs:"
echo "  docker-compose logs -f [service-name]"