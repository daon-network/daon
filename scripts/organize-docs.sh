#!/bin/bash
# Organize documentation files into structured folders
# Usage: ./scripts/organize-docs.sh

set -e

echo "📚 Organizing documentation files..."

# Create documentation folder structure
mkdir -p documentation/{deployment,operations,development,guides,project,legal,ci-cd,security,archive}

# Deployment docs
mv DEPLOYMENT_SUCCESS.md documentation/deployment/ 2>/dev/null || true
mv DEPLOYMENT_GUIDE.md documentation/deployment/ 2>/dev/null || true
mv DEPLOYMENT_STATUS.md documentation/deployment/ 2>/dev/null || true
mv DEPLOYMENT_SUMMARY.md documentation/deployment/ 2>/dev/null || true
mv PRODUCTION_READY.md documentation/deployment/ 2>/dev/null || true
mv PRODUCTION_DEPLOYMENT.md documentation/deployment/ 2>/dev/null || true
mv DOCKER_DEPLOYMENT.md documentation/deployment/ 2>/dev/null || true
mv MULTI_DC_DEPLOYMENT.md documentation/deployment/ 2>/dev/null || true
mv DEPLOY_NOW.md documentation/deployment/ 2>/dev/null || true
mv PUSH_WHEN_READY.md documentation/deployment/ 2>/dev/null || true
mv READY_TO_PUSH.md documentation/deployment/ 2>/dev/null || true

# Operations docs
mv DEVOPS_STRATEGY.md documentation/operations/ 2>/dev/null || true
mv VALIDATOR_SETUP.md documentation/operations/ 2>/dev/null || true
mv QUICK_REFERENCE.md documentation/operations/ 2>/dev/null || true
mv INFRASTRUCTURE_TESTING.md documentation/operations/ 2>/dev/null || true

# Development docs
mv ARCHITECTURE.md documentation/development/ 2>/dev/null || true
mv TECHNICAL_ARCHITECTURE.md documentation/development/ 2>/dev/null || true
mv CRITICAL_PATTERNS.md documentation/development/ 2>/dev/null || true
mv SETUP.md documentation/development/ 2>/dev/null || true
mv TESTING_STRATEGY.md documentation/development/ 2>/dev/null || true
mv BLOCKCHAIN_INTEGRATION.md documentation/development/ 2>/dev/null || true
mv BLOCKCHAIN_INTEGRATION_COMPLETE.md documentation/development/ 2>/dev/null || true

# User guides
mv CREATOR_ONBOARDING_GUIDE.md documentation/guides/ 2>/dev/null || true
mv AO3_INTEGRATION_GUIDE.md documentation/guides/ 2>/dev/null || true
mv BLOCKCHAIN_SETUP.md documentation/guides/ 2>/dev/null || true
mv GITHUB_PAGES_SETUP.md documentation/guides/ 2>/dev/null || true
mv GITHUB_PAGES_READY.md documentation/guides/ 2>/dev/null || true

# Project docs
mv DAON_MISSION.md documentation/project/ 2>/dev/null || true
mv PROJECT_ROADMAP.md documentation/project/ 2>/dev/null || true
mv CURRENT_PRIORITIES.md documentation/project/ 2>/dev/null || true
mv NEXT_STEPS.md documentation/project/ 2>/dev/null || true
mv FUNDING_CAMPAIGN.md documentation/project/ 2>/dev/null || true
mv PRE_LAUNCH_ROADMAP.md documentation/project/ 2>/dev/null || true
mv PRE_DEPLOYMENT_CHECKLIST.md documentation/project/ 2>/dev/null || true
mv PRE_LAUNCH_TESTING.md documentation/project/ 2>/dev/null || true
mv DIGITAL_ASSET_OWNERSHIP.md documentation/project/ 2>/dev/null || true
mv OTW_PRESENTATION.md documentation/project/ 2>/dev/null || true

# Legal docs
mv LICENSE_SUMMARY.md documentation/legal/ 2>/dev/null || true
mv AI_TRAINING_COMPLIANCE.md documentation/legal/ 2>/dev/null || true
mv AI_SCRAPING_EVIDENCE.md documentation/legal/ 2>/dev/null || true
mv CREATIVE_COMMONS_CHAIN_CHARTER.md documentation/legal/ 2>/dev/null || true

# CI/CD docs
mv MONOREPO_WORKFLOWS.md documentation/ci-cd/ 2>/dev/null || true
mv BRANCH_PROTECTION_SETUP.md documentation/ci-cd/ 2>/dev/null || true
mv CI_CD_GATES.md documentation/ci-cd/ 2>/dev/null || true
mv CI_INTEGRATION_TESTING.md documentation/ci-cd/ 2>/dev/null || true
mv ENABLE_BRANCH_PROTECTION.md documentation/ci-cd/ 2>/dev/null || true
mv DOCKER_HUB_CLEANUP.md documentation/ci-cd/ 2>/dev/null || true

# Security docs
mv SECURITY_SCAN.md documentation/security/ 2>/dev/null || true
mv GITHUB_SECRETS_SETUP.md documentation/security/ 2>/dev/null || true

# Archive (old session notes)
mv SESSION_COMPLETE.md documentation/archive/ 2>/dev/null || true
mv SESSION_CONTEXT.md documentation/archive/ 2>/dev/null || true
mv SESSION_RECOVERY.md documentation/archive/ 2>/dev/null || true
mv DEPLOYMENT_STATUS.txt documentation/archive/ 2>/dev/null || true
mv WAR_PREPARATION.md documentation/archive/ 2>/dev/null || true

# Create README.md in each subfolder
cat > documentation/README.md << 'EOF'
# DAON Documentation

This directory contains all project documentation organized by category.

## Structure

- **[deployment/](deployment/)** - Production deployment guides and status
- **[operations/](operations/)** - DevOps, monitoring, and operational procedures
- **[development/](development/)** - Architecture, setup, and development guides
- **[guides/](guides/)** - User and integration guides
- **[project/](project/)** - Project mission, roadmap, and planning docs
- **[legal/](legal/)** - License information and compliance docs
- **[ci-cd/](ci-cd/)** - CI/CD workflows and automation
- **[security/](security/)** - Security policies and scans
- **[archive/](archive/)** - Historical documentation and session notes

## Key Documents

### For New Contributors
- [SETUP.md](development/SETUP.md) - Development environment setup
- [ARCHITECTURE.md](development/ARCHITECTURE.md) - System architecture
- [CRITICAL_PATTERNS.md](development/CRITICAL_PATTERNS.md) - Common issues and solutions

### For Deployment
- [DEPLOYMENT_SUCCESS.md](deployment/DEPLOYMENT_SUCCESS.md) - Latest deployment status
- [DEVOPS_STRATEGY.md](operations/DEVOPS_STRATEGY.md) - Server maintenance procedures
- [QUICK_REFERENCE.md](operations/QUICK_REFERENCE.md) - Command reference

### For CI/CD
- [MONOREPO_WORKFLOWS.md](ci-cd/MONOREPO_WORKFLOWS.md) - Path-based workflow strategy
- [BRANCH_PROTECTION_SETUP.md](ci-cd/BRANCH_PROTECTION_SETUP.md) - Branch protection guide

### For Users
- [CREATOR_ONBOARDING_GUIDE.md](guides/CREATOR_ONBOARDING_GUIDE.md) - Creator guide
- [AO3_INTEGRATION_GUIDE.md](guides/AO3_INTEGRATION_GUIDE.md) - AO3 integration

## Root Documentation

These docs remain in the repository root:
- `README.md` - Main project README
- `LICENSE.md` - Liberation License v1.0
- `CONTRIBUTING.md` - Contribution guidelines (if exists)
EOF

echo "✅ Documentation organized!"
echo ""
echo "Files remaining in root:"
ls -1 *.md 2>/dev/null || echo "  (none - all organized!)"
echo ""
echo "Documentation structure:"
tree documentation/ -L 1 || ls -la documentation/
