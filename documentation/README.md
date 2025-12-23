# DAON Documentation

**Decentralized Archive & Ownership Network**

Documentation for the DAON blockchain platform that protects creator content with Liberation Licenses.

---

## 📁 Directory Structure

- **[deployment/](deployment/)** - Production deployment guides and validator rollout
- **[operations/](operations/)** - DevOps, validator setup, and operational procedures
- **[development/](development/)** - Architecture, setup, and development guides
- **[guides/](guides/)** - User and integration guides
- **[project/](project/)** - Project mission, roadmap, and planning docs
- **[legal/](legal/)** - License information and compliance docs
- **[ci-cd/](ci-cd/)** - CI/CD workflows and automation
- **[security/](security/)** - ⚠️ **Security policies and pre-launch checklist**
- **[archive/](archive/)** - Historical documentation and session notes

---

## 🚀 Quick Start by Role

### 👤 I'm a Creator
1. [Creator Onboarding Guide](guides/CREATOR_ONBOARDING_GUIDE.md) - How to protect your content
2. [AO3 Integration](guides/AO3_INTEGRATION_GUIDE.md) - If you're on Archive of Our Own
3. Install browser extension from `/browser-extension/`

### 💻 I'm a Developer
1. [Architecture Overview](development/ARCHITECTURE.md) - System design
2. [Setup Guide](development/SETUP.md) - Local development
3. [Testing Strategy](development/TESTING_STRATEGY.md) - How we test
4. [Critical Patterns](development/CRITICAL_PATTERNS.md) - Important code patterns

### 🔐 I Want to Run a Validator
1. [Validator Setup Guide](operations/VALIDATOR_SETUP.md) - How to run a validator
2. [Validator Rollout Plan](deployment/VALIDATOR_ROLLOUT.md) - Phased deployment strategy
3. Use script: `/scripts/validators/setup-validator.sh`

### 🏗️ I'm Deploying/Operating DAON
1. ⚠️ **[Pre-Launch Security Checklist](security/PRE_LAUNCH_CHECKLIST.md)** - Complete before public launch!
2. [Production Deployment](deployment/PRODUCTION_DEPLOYMENT.md) - Deploy guide
3. [DevOps Strategy](operations/DEVOPS_STRATEGY.md) - Server maintenance
4. [CI/CD Gates](ci-cd/CI_CD_GATES.md) - Automated workflows

---

## 🔥 Critical Pre-Launch Documents

**Before going public, you MUST review:**

1. **[Security Pre-Launch Checklist](security/PRE_LAUNCH_CHECKLIST.md)** ⚠️
   - Rotate API mnemonic (Issue #9)
   - Rotate all production secrets
   - Enable security features
   - Set up monitoring

2. **[Validator Rollout](deployment/VALIDATOR_ROLLOUT.md)**
   - Deploy Helsinki validator
   - Deploy Falkenstein validator
   - Achieve true decentralization

3. **[Pre-Launch Roadmap](project/PRE_LAUNCH_ROADMAP.md)**
   - Overall timeline
   - Feature completion
   - Marketing preparation

---

## 📚 Documentation by Category

### Deployment & Operations
- [Production Deployment](deployment/PRODUCTION_DEPLOYMENT.md) - Full deployment guide
- [Validator Rollout](deployment/VALIDATOR_ROLLOUT.md) - **NEW** - Phased validator deployment
- [Deployment Success](deployment/DEPLOYMENT_SUCCESS.md) - Latest status
- [DevOps Strategy](operations/DEVOPS_STRATEGY.md) - Server operations
- [Validator Setup](operations/VALIDATOR_SETUP.md) - Running validators
- [Quick Reference](operations/QUICK_REFERENCE.md) - Common commands

### Development
- [Architecture](development/ARCHITECTURE.md) - System design
- [Setup](development/SETUP.md) - Development environment
- [Blockchain Integration](development/BLOCKCHAIN_INTEGRATION.md) - Working with the chain
- [Testing Strategy](development/TESTING_STRATEGY.md) - Testing approach
- [Critical Patterns](development/CRITICAL_PATTERNS.md) - Important patterns

### Guides & Tutorials
- [Creator Onboarding](guides/CREATOR_ONBOARDING_GUIDE.md) - For creators
- [AO3 Integration](guides/AO3_INTEGRATION_GUIDE.md) - Archive of Our Own
- [Blockchain Setup](guides/BLOCKCHAIN_SETUP.md) - Blockchain basics

### Project Management
- [DAON Mission](project/DAON_MISSION.md) - Why we exist
- [Pre-Launch Roadmap](project/PRE_LAUNCH_ROADMAP.md) - Path to launch
- [Current Priorities](project/CURRENT_PRIORITIES.md) - What's happening now
- [Project Roadmap](project/PROJECT_ROADMAP.md) - Long-term vision

### Legal & Licensing
- [Liberation License Summary](legal/LICENSE_SUMMARY.md) - Our license
- [AI Scraping Evidence](legal/AI_SCRAPING_EVIDENCE.md) - Why DAON exists
- [AI Training Compliance](legal/AI_TRAINING_COMPLIANCE.md) - Legal framework

### CI/CD
- [CI/CD Gates](ci-cd/CI_CD_GATES.md) - Automated testing
- [Monorepo Workflows](ci-cd/MONOREPO_WORKFLOWS.md) - Path-based workflows
- [Trusted Publishing](ci-cd/TRUSTED_PUBLISHING_SETUP.md) - SDK publishing
- [Branch Protection](ci-cd/BRANCH_PROTECTION_SETUP.md) - Git workflow

### Security
- ⚠️ **[Pre-Launch Checklist](security/PRE_LAUNCH_CHECKLIST.md)** - **CRITICAL**
- [GitHub Secrets Setup](security/GITHUB_SECRETS_SETUP.md) - Configure secrets
- [Security Scan](security/SECURITY_SCAN.md) - Vulnerability scanning

---

## 🗂️ Scripts Organization

**Scripts are now organized in `/scripts/` directory:**

```
scripts/
├── validators/
│   └── setup-validator.sh    # Automated validator setup
├── deployment/
│   └── (deployment scripts TBD)
└── maintenance/
    └── (maintenance scripts TBD)
```

**Root-level scripts** (legacy, will be moved):
- Various `*.sh` files in project root
- Will be organized into appropriate subdirectories

---

## 📝 Documentation Standards

### File Naming
- Use `UPPER_SNAKE_CASE.md` for consistency
- Be descriptive: `VALIDATOR_ROLLOUT.md` not `VAL.md`
- Avoid generic names

### File Placement
- Architecture → `development/`
- How-to guides → `guides/`
- Deployment → `deployment/`
- Operations → `operations/`
- Security → `security/`
- Planning → `project/`
- Legal → `legal/`
- CI/CD → `ci-cd/`
- Historical → `archive/`

### When to Update This README
- Adding new documentation files
- Restructuring directories
- Changing priorities
- Adding critical pre-launch items

---

## 🔗 External Documentation

- **Main README:** `/README.md` (project root)
- **API Docs:** `/api-server/README.md`
- **SDK Docs:** `/sdks/<language>/README.md`
- **Public Docs Site:** https://docs.daon.network (GitHub Pages)
- **License:** `/LICENSE.md`

---

## 📞 Support

- **Issues:** https://github.com/daon-network/daon/issues
- **Discord:** #support channel
- **Email:** support@daon.network
- **Docs Site:** https://docs.daon.network

---

**Last Updated:** 2025-11-21 | **Version:** 0.1.0
