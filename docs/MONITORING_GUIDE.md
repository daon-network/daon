# DAON Network Monitoring Guide

## 🔍 Overview

This guide covers the comprehensive monitoring stack for DAON Network, including blockchain validators and API infrastructure.

## 📊 Monitoring Stack

### **Core Components**
- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards  
- **Alertmanager**: Alert routing and notifications
- **Node Exporter**: System metrics collection

### **Architecture**
```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  Validators │   │ API Server  │   │ Node Exp.   │
│             │   │             │   │             │
│ :26660      │   │ :3000       │   │ :9100       │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                ┌────────▼────────┐
                │  Prometheus     │
                │  :9093          │
                └────────┬────────┘
                         │
                ┌────────▼────────┐
                │    Grafana      │
                │    :3000        │
                └─────────────────┘
```

## 🚀 Quick Start

### **1. Start Monitoring Stack**
```bash
cd daon-core/ccc-core
docker-compose up -d prometheus grafana alertmanager node-exporter
```

### **2. Access Dashboards**
**Local Development:**
- **Grafana**: http://localhost:3000 (admin/ccc-admin)
- **Prometheus**: http://localhost:9093
- **Alertmanager**: http://localhost:9093

**Production (with Caddy):**
- **Grafana**: https://grafana.yourdomain.com
- **Prometheus**: https://prometheus.yourdomain.com
- **Alertmanager**: https://alerts.yourdomain.com
- **All-in-one**: https://monitoring.yourdomain.com

### **3. Import Dashboards**
Dashboards are auto-imported from `grafana/dashboards/`:
- **DAON API Overview**: API performance metrics
- **DAON Blockchain Overview**: Validator and chain metrics

## 📈 Key Metrics

### **Blockchain Metrics**
| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `cometbft_consensus_height` | Current block height | Stale > 2min |
| `cometbft_p2p_peers` | Connected peers | < 2 peers |
| `up{job="daon-validators"}` | Validator status | Down > 1min |
| `cometbft_consensus_block_interval_seconds` | Block time | > 30sec |

### **API Metrics** 
| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `daon_api_http_requests_total` | Total HTTP requests | - |
| `daon_api_http_request_duration_seconds` | Response time | 95th > 1sec |
| `daon_api_content_protections_total` | Content protections | - |
| `daon_api_active_connections` | Active connections | > 100 |

### **System Metrics**
| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `node_memory_MemAvailable_bytes` | Available memory | < 20% |
| `node_filesystem_avail_bytes` | Disk space | < 20% |
| `node_cpu_seconds_total` | CPU usage | > 90% for 5min |

## 🚨 Alert Rules

### **Critical Alerts**
- **ValidatorDown**: Validator unreachable > 1min
- **BlockHeightStale**: No new blocks > 2min  
- **APIServerDown**: API unreachable > 30sec
- **DiskSpaceCritical**: < 10% disk remaining

### **Warning Alerts**
- **HighErrorRate**: API errors > 5%
- **HighResponseTime**: 95th percentile > 1sec
- **LowPeerCount**: < 2 connected peers
- **HighMemoryUsage**: > 90% memory for 5min

## 🛠️ Configuration

### **Prometheus Targets**
Edit `prometheus.yml` to add/modify targets:
```yaml
scrape_configs:
  - job_name: 'daon-validators'
    static_configs:
      - targets: ['validator1:26660', 'validator2:26660']
  
  - job_name: 'daon-api'
    static_configs:
      - targets: ['api-server:3000']
```

### **Alert Notifications**
Configure `alertmanager.yml` for your notification channels:

#### **Slack Setup**
```yaml
receivers:
  - name: 'slack-alerts'
    slack_configs:
      - api_url: 'YOUR_WEBHOOK_URL'
        channel: '#daon-alerts'
        title: 'DAON Alert: {{ .GroupLabels.alertname }}'
```

#### **Email Setup**
```yaml
global:
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_from: 'alerts@daon.network'
  smtp_auth_username: 'your-email@gmail.com'
  smtp_auth_password: 'your-app-password'

receivers:
  - name: 'email-alerts'
    email_configs:
      - to: 'devops@daon.network'
        subject: 'DAON Alert: {{ .GroupLabels.alertname }}'
```

## 📊 Dashboard Guide

### **DAON API Overview Dashboard**
- **Request Rate**: Requests per second across all endpoints
- **Response Time**: 95th percentile response times
- **Error Rate**: Percentage of 5xx responses
- **Active Connections**: Current WebSocket/HTTP connections
- **Content Protections**: Rate of content protection requests

### **DAON Blockchain Overview Dashboard**  
- **Block Height**: Current chain height across validators
- **Validator Status**: Up/Down status for each validator
- **Peer Count**: Number of connected peers per validator
- **Transaction Rate**: Transactions per second
- **Resource Usage**: Memory and CPU utilization

## 🔧 Troubleshooting

### **Metrics Not Appearing**

1. **Check target health** in Prometheus:
   ```bash
   curl http://localhost:9093/targets
   ```

2. **Verify metrics endpoints**:
   ```bash
   # API Server metrics
   curl http://localhost:3001/metrics
   
   # Validator metrics (if exposed)
   curl http://validator1:26660/metrics
   ```

3. **Check container logs**:
   ```bash
   docker-compose logs prometheus
   docker-compose logs grafana
   ```

### **Alerts Not Firing**

1. **Verify alert rules**:
   ```bash
   # Check rules are loaded
   curl http://localhost:9093/api/v1/rules
   ```

2. **Test alert expressions** in Prometheus query browser

3. **Check Alertmanager status**:
   ```bash
   curl http://localhost:9093/api/v1/status
   ```

### **Dashboard Issues**

1. **Verify Grafana datasource** connection to Prometheus
2. **Check dashboard JSON** for query syntax errors  
3. **Confirm time ranges** match your data retention

## 🌐 Public Access Setup

### **Caddy Reverse Proxy Configuration**

For secure public access to monitoring dashboards:

```bash
# 1. Configure Caddy for monitoring access
cd daon-core/ccc-core
./setup-monitoring-caddy.sh

# 2. Enable Caddy in docker-compose.yml
# Uncomment the caddy service section

# 3. Start with Caddy
docker-compose up -d caddy
```

### **Security Features**
- **HTTP Basic Authentication** on all monitoring endpoints
- **HTTPS with automatic Let's Encrypt certificates**
- **Security headers** to prevent common attacks
- **Optional IP restrictions** for additional security

### **Access URLs**
Once configured, access your monitoring stack at:
- `https://grafana.yourdomain.com` - Main dashboards
- `https://prometheus.yourdomain.com` - Raw metrics
- `https://alerts.yourdomain.com` - Alert manager
- `https://monitoring.yourdomain.com` - All-in-one (path-based)

## 📦 Production Deployment

### **Resource Requirements**
- **Prometheus**: 2GB RAM, 100GB storage
- **Grafana**: 1GB RAM, 10GB storage
- **Alertmanager**: 512MB RAM, 1GB storage

### **Data Retention**
Configure retention in `prometheus.yml`:
```yaml
global:
  scrape_interval: 15s
  
# Storage retention
command:
  - '--storage.tsdb.retention.time=30d'
  - '--storage.tsdb.retention.size=50GB'
```

### **High Availability**
For production, consider:
- **Multiple Prometheus instances** with federation
- **Grafana clustering** with shared database
- **Alertmanager clustering** for redundancy

### **Security**
- **Enable authentication** on all components
- **Use TLS/SSL** for external access
- **Configure firewalls** to restrict metric endpoints
- **Regular backup** of Grafana dashboards and Prometheus data

## 🔗 Links

- **Prometheus Docs**: https://prometheus.io/docs/
- **Grafana Docs**: https://grafana.com/docs/
- **Cosmos SDK Metrics**: https://docs.cosmos.network/main/core/telemetry
- **Node Exporter**: https://github.com/prometheus/node_exporter

---

**Need help?** Check our [troubleshooting guide](./TROUBLESHOOTING.md) or file an issue.