#!/bin/bash

# Setup script to install git hooks for conventional commit enforcement
set -e

echo "🔧 Setting up DAON git hooks and configuration..."

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Copy commit-msg hook
if [ -f .githooks/commit-msg ]; then
    cp .githooks/commit-msg .git/hooks/commit-msg
    chmod +x .git/hooks/commit-msg
    echo "✅ Commit message hook installed"
else
    echo "❌ .githooks/commit-msg not found"
    exit 1
fi

# Set commit message template
git config --local commit.template .gitmessage
echo "✅ Commit message template configured"

# Set up helpful git aliases
git config --local alias.cm "commit -m"
git config --local alias.cma "commit -am" 
git config --local alias.amend "commit --amend --no-edit"
git config --local alias.last "log -1 --oneline"
git config --local alias.conv "!f() { git commit -m \"\$1: \$2\"; }; f"

echo "✅ Git aliases configured:"
echo "  git cm '<message>'     - Quick commit"
echo "  git cma '<message>'    - Add all and commit"
echo "  git conv fix 'message' - Conventional commit helper"
echo "  git amend              - Amend last commit"
echo "  git last               - Show last commit"

# Verify hook is working
echo ""
echo "🧪 Testing commit message hook..."
echo "feat: test conventional commit format" > /tmp/test-commit-msg
if .git/hooks/commit-msg /tmp/test-commit-msg; then
    echo "✅ Commit hook is working correctly!"
    rm -f /tmp/test-commit-msg
else
    echo "❌ Commit hook test failed"
    rm -f /tmp/test-commit-msg
    exit 1
fi

echo ""
echo "🎉 Git hooks and configuration complete!"
echo ""
echo "📋 Next steps:"
echo "1. Use the commit template: 'git commit' (opens editor with template)"
echo "2. Or use quick format: 'git cm \"feat: your new feature\"'"
echo "3. Hook will enforce conventional commit format"
echo "4. All team members should run this setup script"
echo ""
echo "💡 Tip: Your commits will now be automatically validated!"
echo "💡 Example: git cm 'fix: resolve authentication timeout'"