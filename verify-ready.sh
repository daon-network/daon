#!/bin/bash
# Quick verification script to check if you're ready to deploy

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 DAON Deployment Readiness Check"
echo "=================================="
echo ""

# Check 1: Git status
echo -n "1. Checking git status... "
if [ -z "$(git status --porcelain)" ]; then
    echo -e "${GREEN}✓${NC} Working tree clean"
else
    echo -e "${YELLOW}⚠${NC} Uncommitted changes found"
    git status --short
fi

# Check 2: On main branch
echo -n "2. Checking branch... "
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ]; then
    echo -e "${GREEN}✓${NC} On main branch"
else
    echo -e "${RED}✗${NC} Not on main (current: $BRANCH)"
fi

# Check 3: Commits to push
echo -n "3. Checking commits to push... "
COMMITS=$(git log origin/main..HEAD --oneline | wc -l)
if [ "$COMMITS" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} $COMMITS commits ready to push"
    git log origin/main..HEAD --oneline | head -5
else
    echo -e "${YELLOW}⚠${NC} No new commits to push"
fi

# Check 4: Docker running locally (optional check)
echo -n "4. Checking Docker... "
if command -v docker &> /dev/null; then
    if docker ps &> /dev/null; then
        echo -e "${GREEN}✓${NC} Docker running"
    else
        echo -e "${YELLOW}⚠${NC} Docker not running (not critical)"
    fi
else
    echo -e "${YELLOW}⚠${NC} Docker not installed (not critical for push)"
fi

# Check 5: GitHub CLI (optional)
echo -n "5. Checking GitHub CLI... "
if command -v gh &> /dev/null; then
    if gh auth status &> /dev/null; then
        echo -e "${GREEN}✓${NC} GitHub CLI authenticated"
    else
        echo -e "${YELLOW}⚠${NC} GitHub CLI not authenticated"
    fi
else
    echo -e "${YELLOW}⚠${NC} GitHub CLI not installed (optional)"
fi

# Check 6: Required files exist
echo -n "6. Checking required files... "
REQUIRED_FILES=(
    ".github/workflows/deploy.yml"
    "docker-compose.yml"
    "api-server/package.json"
    "daon-core/Dockerfile"
)
ALL_EXIST=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}✗${NC} Missing: $file"
        ALL_EXIST=false
    fi
done
if [ "$ALL_EXIST" = true ]; then
    echo -e "${GREEN}✓${NC} All required files present"
fi

echo ""
echo "=================================="
echo "📋 Manual Checks Required:"
echo ""
echo "  Server Setup:"
echo "  • SSH access to server: ssh USER@SERVER_IP"
echo "  • Directories: /opt/daon and /opt/daon-source exist"
echo "  • Docker installed on server"
echo ""
echo "  GitHub Secrets (Repository → Settings → Secrets):"
echo "  • SERVER_HOST"
echo "  • SERVER_USER"
echo "  • SERVER_SSH_KEY"
echo "  • DOCKERHUB_USERNAME"
echo "  • DOCKERHUB_TOKEN"
echo "  • POSTGRES_PASSWORD"
echo "  • API_KEY_SECRET"
echo ""
echo "  DNS Configuration (optional):"
echo "  • api.daon.network → YOUR_SERVER_IP"
echo ""
echo "  Docker Hub Cleanup:"
echo "  • Check: https://hub.docker.com/r/daonnetwork/api"
echo "  • Delete if exists (old API image)"
echo ""
echo "=================================="
echo ""

# Final recommendation
if [ "$BRANCH" = "main" ] && [ "$COMMITS" -gt 0 ]; then
    echo -e "${GREEN}✓ Ready to deploy!${NC}"
    echo ""
    echo "To deploy, run:"
    echo "  git push origin main"
    echo ""
    echo "Then monitor:"
    echo "  GitHub → Actions → Deploy DAON Production"
    echo "  or: gh run watch"
else
    echo -e "${YELLOW}⚠ Not ready to deploy yet${NC}"
    if [ "$BRANCH" != "main" ]; then
        echo "  → Switch to main branch: git checkout main"
    fi
    if [ "$COMMITS" -eq 0 ]; then
        echo "  → No commits to push. Already up to date?"
    fi
fi

echo ""
