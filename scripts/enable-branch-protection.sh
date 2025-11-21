#!/bin/bash
# Enable branch protection on main branch via GitHub CLI
# Usage: ./scripts/enable-branch-protection.sh

set -e

REPO="daon-network/daon"
BRANCH="main"

echo "🔒 Enabling branch protection on $REPO:$BRANCH..."

# Create branch protection rule
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "/repos/$REPO/branches/$BRANCH/protection" \
  -f required_status_checks='{"strict":true,"contexts":["Integration Tests","Security Audit","Test API","Commit Lint"]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"required_approving_review_count":1}' \
  -f restrictions=null \
  -f required_linear_history=true \
  -f allow_force_pushes=false \
  -f allow_deletions=false \
  -f required_conversation_resolution=true \
  -f lock_branch=false \
  -f allow_fork_syncing=false

echo "✅ Branch protection enabled!"
echo ""
echo "Settings applied:"
echo "  ✅ Require pull request before merging (1 approval)"
echo "  ✅ Dismiss stale reviews when new commits pushed"
echo "  ✅ Require status checks to pass before merging"
echo "  ✅ Require branches to be up to date"
echo "  ✅ Require conversation resolution"
echo "  ✅ Require linear history"
echo "  ✅ Include administrators"
echo "  ⚪ Allow force pushes: DISABLED"
echo "  ⚪ Allow deletions: DISABLED"
echo ""
echo "Required status checks:"
echo "  - Integration Tests"
echo "  - Security Audit"
echo "  - Test API"
echo "  - Commit Lint"
echo ""
echo "View settings: https://github.com/$REPO/settings/branches"
