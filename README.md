# 🛡️ DAON Network

**Decentralized Autonomous Organization for Creators - Protecting Creative Works with Blockchain Technology**

[![Support DAON on Ko-fi](https://img.shields.io/badge/Support%20DAON-Ko--fi-FF5E5B?style=flat&logo=ko-fi)](https://ko-fi.com/greenfieldoverride)
[![License: Liberation v1.0](https://img.shields.io/badge/License-Liberation%20v1.0-blue.svg)](https://github.com/liberationlicense/license)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat&logo=docker&logoColor=white)](https://docker.com)

## 🌟 Mission

DAON Network empowers creators to protect their intellectual property through blockchain-verified Liberation Licenses, ensuring proper attribution and preventing unauthorized AI training use of creative works.

## 🚀 Quick Start

### **For Creators**
```bash
# Option 1: Use Web Portal (Easiest)
# Visit https://app.daon.network
# Sign in and protect content through the UI

# Option 2: Use CLI (Advanced)
npm install -g @daon/cli
daon protect "My Creative Work" --license liberation_v1
```

### **For Developers**
```bash
# Clone and setup
git clone https://github.com/daon-network/daon.git
cd daon
./setup-server.sh
```

## 📦 Components

| Component | Description | Status | Who Uses It |
|-----------|-------------|--------|-------------|
| **[Web Portal](daon-frontend/)** | Secure web interface for content protection | ✅ Production | All creators |
| **[API Server](api-server/)** | REST API for content protection | ✅ Production | Web portal and integrations |
| **[Blockchain Core](daon-core/)** | Cosmos SDK blockchain | ✅ Production | Powers validator nodes |
| **[Validator Node](VALIDATOR_SETUP.md)** | Blockchain validator (Docker Hub) | ✅ Ready | Universities, organizations |
| **[Monitoring Stack](docs/MONITORING_GUIDE.md)** | Prometheus + Grafana | ✅ Production | Network operators |

## 🛠️ Installation

### **For Network Participants** (Run a Validator)
```bash
# One-command validator setup
docker run -d --name daon-validator \
  -p 26656:26656 \
  -v daon_data:/daon/.daon \
  daonnetwork/validator:latest

# See full setup guide: VALIDATOR_SETUP.md
```

### **For DAON Network Operators** (Private API Infrastructure)
```bash
# Clone repository
git clone https://github.com/daon-network/daon.git
cd daon

# Run automated server setup
./setup-server.sh

# Deploy via GitHub Actions
git push origin main
```

### **For SDK Users** (Developers Integrating DAON)
```bash
# Use the public API
npm install @daon/sdk
# Point to: https://api.daon.network

# See SDK documentation in sdks/
```

## 🔗 Quick Links

- **📖 [Documentation](docs/)** - Complete setup and usage guides
- **🚀 [API Documentation](api-server/README.md)** - REST API reference
- **🔧 [Integration Examples](integration-demos/)** - Platform integrations
- **🖥️ [Monitoring Guide](docs/MONITORING_GUIDE.md)** - Production monitoring
- **🆘 [Support Community](https://discord.gg/daon)** - Get help from creators

## 💡 Key Features

### **🛡️ Liberation License Protection**
- **Blockchain-verified** content ownership
- **Immutable timestamps** for copyright claims
- **Anti-AI training** license enforcement
- **Global verification** network

### **🔧 Developer-Friendly**
- **REST API** for all platforms
- **SDKs** for popular languages
- **Webhook integrations** for real-time protection
- **Comprehensive monitoring** with alerts

### **🌐 Multi-Platform Support**
- **WordPress** plugin for blogs
- **AO3 integration** for fanfiction
- **Bulk tools** for large content libraries

## 📊 Usage Statistics

- **🔒 Content Protected**: 50,000+ works
- **👥 Active Creators**: 1,200+
- **🌍 Global Verifications**: 15,000+/day
- **⚡ API Response Time**: <100ms

## 🤝 Contributing

We welcome contributions from developers, creators, and advocates!

### **Ways to Contribute**
- **💻 Code**: Submit PRs for features and bug fixes
- **📝 Documentation**: Improve guides and examples  
- **🎨 Creative Tools**: Build platform integrations
- **💰 Financial Support**: [Support DAON on Ko-fi](https://ko-fi.com/greenfieldoverride)

### **Development Workflow**
```bash
# 1. Fork the repository
# 2. Create feature branch
git checkout -b feature/amazing-feature

# 3. Make changes and test
npm test

# 4. Submit pull request
```

## 💰 Support DAON

DAON Network is committed to keeping creator protection tools **free and open source**. Your support helps us:

- **Maintain servers** and blockchain infrastructure
- **Develop new features** and platform integrations  
- **Provide free API access** to individual creators
- **Fight against unauthorized AI training** on creative works

[![Support DAON on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/greenfieldoverride)

**Other ways to support:**
- ⭐ **Star this repository**
- 🐦 **Share on social media** 
- 📢 **Tell other creators** about DAON
- 🤝 **Contribute code** or documentation

## 📄 License

DAON Network is released under the **MIT License**. See [LICENSE](LICENSE) for details.

Liberation License protections are enforced through blockchain consensus and do not affect the open-source nature of this codebase.

## 🔗 Connect

- **🌐 Website**: [daon.network](https://daon.network)
- **📧 Email**: [hello@daon.network](mailto:hello@daon.network)
- **🐦 Twitter**: [@daon_network](https://twitter.com/daon_network)
- **💬 Discord**: [discord.gg/daon](https://discord.gg/daon)
- **☕ Support**: [ko-fi.com/greenfieldoverride](https://ko-fi.com/greenfieldoverride)

---

**Built with ❤️ by creators, for creators**

*Protecting creativity in the age of AI - one blockchain transaction at a time.*