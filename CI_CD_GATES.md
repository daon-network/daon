# CI/CD Gates Strategy

**Goal**: Prevent broken code from reaching production by requiring all tests to pass before deployment.

---

## Current State vs Desired State

### Current (Unsafe)
```
Developer commits → Push to main → Manual deploy → Production
                                  ⚠️ No gates!
```

### Desired (Safe)
```
Developer creates PR
  ↓
All CI tests must pass:
  ✅ Unit tests
  ✅ Integration tests
  ✅ Security audit
  ✅ Build tests
  ↓
PR approved & merged to main
  ↓
Deployment requires:
  ✅ All tests passing
  ✅ Images built successfully
  ↓
Deploy to production
```

---

## Implementation Plan

### Phase 1: Protected Branch Rules (GitHub UI)

**Navigate to**: https://github.com/daon-network/daon/settings/branches

**Steps**:

1. Click "Add branch protection rule"
2. Branch name pattern: `main`
3. Enable the following:

```
☑ Require a pull request before merging
  ☑ Require approvals: 1
  ☑ Dismiss stale pull request approvals when new commits are pushed
  
☑ Require status checks to pass before merging
  ☑ Require branches to be up to date before merging
  
  Required status checks (select these):
  ☑ Security Audit
  ☑ Test API
  ☑ Integration Tests
  ☑ API Build Test
  ☑ Blockchain Build Test
  
☑ Require conversation resolution before merging

☑ Do not allow bypassing the above settings
```

**Result**: Can't merge to `main` unless all tests pass!

---

### Phase 2: Deployment Workflow Gates

**Current deployment workflow** (`deploy.yml`):
- Manually triggered
- Runs tests inline
- No dependency on PR status

**Improved deployment workflow**:
- Still manually triggered (good!)
- Checks that commit has passing tests
- Blocks if any tests failed

**Add this check to deploy.yml**:

```yaml
jobs:
  # NEW: Pre-deployment validation
  validate-deployment:
    name: Validate Deployment Readiness
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Check commit status
        uses: actions/github-script@v7
        with:
          script: |
            // Get all status checks for this commit
            const { data: statuses } = await github.rest.repos.getCombinedStatusForRef({
              owner: context.repo.owner,
              repo: context.repo.repo,
              ref: context.sha
            });
            
            // Check if all required checks passed
            const failedChecks = statuses.statuses.filter(s => s.state !== 'success');
            
            if (failedChecks.length > 0) {
              core.setFailed(`Cannot deploy: ${failedChecks.length} status checks failed:\\n` +
                failedChecks.map(s => `- ${s.context}: ${s.state}`).join('\\n'));
            }
            
            console.log('✅ All status checks passed');
      
      - name: Verify this is main branch
        run: |
          if [ "${{ github.ref }}" != "refs/heads/main" ]; then
            echo "❌ Can only deploy from main branch"
            exit 1
          fi
          echo "✅ Deploying from main branch"

  # All other jobs depend on this validation
  security-audit:
    needs: validate-deployment
    # ... rest of job

  test-api:
    needs: validate-deployment
    # ... rest of job
```

---

### Phase 3: Update PR Workflow

**Ensure integration tests run on PRs**:

`.github/workflows/integration-tests.yml`:
```yaml
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]
```

Already configured! ✅

---

### Phase 4: Automated Merge Protection (Optional)

**Using GitHub Actions** to block merges:

`.github/workflows/pr-gate.yml`:
```yaml
name: PR Gate Check

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  gate-check:
    name: Verify PR Ready for Merge
    runs-on: ubuntu-latest
    steps:
      - name: Check PR title format
        run: |
          TITLE="${{ github.event.pull_request.title }}"
          if ! echo "$TITLE" | grep -qE '^(feat|fix|docs|chore|test|refactor|perf|ci):'; then
            echo "❌ PR title must start with: feat|fix|docs|chore|test|refactor|perf|ci"
            exit 1
          fi
      
      - name: Check PR has description
        run: |
          BODY="${{ github.event.pull_request.body }}"
          if [ -z "$BODY" ] || [ ${#BODY} -lt 20 ]; then
            echo "❌ PR must have a description (at least 20 characters)"
            exit 1
          fi
      
      - name: PR gate passed
        run: echo "✅ PR ready for review"
```

---

## Deployment Safety Checklist

### Before Every Deployment

Manual checklist in workflow:

```yaml
jobs:
  pre-deploy-checklist:
    name: Pre-Deployment Checklist
    runs-on: ubuntu-latest
    steps:
      - name: Display checklist
        run: |
          echo "## 🚦 Pre-Deployment Checklist"
          echo ""
          echo "Verify the following before proceeding:"
          echo "- ✅ All PR checks passed"
          echo "- ✅ Code reviewed and approved"
          echo "- ✅ Integration tests passed"
          echo "- ✅ No known critical bugs"
          echo "- ✅ Database migrations ready (if any)"
          echo "- ✅ Monitoring dashboards ready"
          echo "- ✅ Rollback plan in place"
          echo ""
          echo "Proceeding with deployment in 30 seconds..."
          sleep 30
```

---

## Example Workflows

### Safe Development Flow

**1. Developer creates feature branch**:
```bash
git checkout -b feat/new-feature
# Make changes
git commit -m "feat: add new feature"
git push origin feat/new-feature
```

**2. Create PR**:
```bash
gh pr create --title "feat: add new feature" --body "Description..."
```

**3. CI runs automatically**:
- ✅ Security Audit
- ✅ Unit Tests (Node 18, 20)
- ✅ Integration Tests (full stack)
- ✅ Build Tests (API + Blockchain)

**4. PR status updates**:
```
PR #123: feat: add new feature
├─ ✅ Security Audit
├─ ✅ Tests (Node 18)
├─ ✅ Tests (Node 20)
├─ ✅ Integration Tests
├─ ✅ API Build Test
└─ ✅ Blockchain Build Test

✅ All checks passed - Ready to merge!
```

**5. Merge PR** (only allowed if all ✅):
```bash
gh pr merge --squash
```

**6. Deploy to production**:
```bash
# Manually trigger deployment
gh workflow run deploy.yml --ref main

# Deployment verifies:
# ✅ All tests passed on this commit
# ✅ Deploying from main branch
# ✅ Images build successfully
# → Proceeds with deployment
```

---

### Blocked Deployment Flow

**Scenario**: Tests fail

**1. Developer pushes broken code**:
```bash
git push origin feat/broken-feature
gh pr create
```

**2. CI catches the issue**:
```
PR #124: feat: broken feature
├─ ✅ Security Audit
├─ ❌ Tests (Node 18) - FAILED
├─ ✅ Tests (Node 20)
├─ ❌ Integration Tests - FAILED
├─ ✅ API Build Test
└─ ✅ Blockchain Build Test

❌ Some checks failed - Cannot merge
```

**3. Attempt to merge → BLOCKED**:
```
GitHub: "Review required before merging"
GitHub: "Required status check 'Tests (Node 18)' has not succeeded"
GitHub: "Required status check 'Integration Tests' has not succeeded"

[Merge] button is DISABLED
```

**4. Fix the issue**:
```bash
# Fix code
git commit -m "fix: resolve test failures"
git push

# Tests re-run automatically
# ✅ All tests pass
# [Merge] button becomes enabled
```

---

## Deployment Status Integration

**Add to Slack/Discord** (optional):

```yaml
jobs:
  notify-deployment:
    name: Notify Team
    runs-on: ubuntu-latest
    if: always()
    needs: [deploy]
    steps:
      - name: Send notification
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
        run: |
          if [ "${{ needs.deploy.result }}" = "success" ]; then
            STATUS="✅ Deployment Successful"
            COLOR="good"
          else
            STATUS="❌ Deployment Failed"
            COLOR="danger"
          fi
          
          curl -X POST $SLACK_WEBHOOK \
            -H 'Content-Type: application/json' \
            -d "{
              \"text\": \"$STATUS\",
              \"attachments\": [{
                \"color\": \"$COLOR\",
                \"fields\": [
                  {\"title\": \"Environment\", \"value\": \"Production\"},
                  {\"title\": \"Branch\", \"value\": \"${{ github.ref }}\"},
                  {\"title\": \"Commit\", \"value\": \"${{ github.sha }}\"},
                  {\"title\": \"Deployed by\", \"value\": \"${{ github.actor }}\"}
                ]
              }]
            }"
```

---

## Quick Setup Guide

### Step 1: Enable Branch Protection

```bash
# Visit GitHub UI (easier than CLI for this)
# https://github.com/daon-network/daon/settings/branch_protection_rules/new

# Or use GitHub CLI:
gh api repos/daon-network/daon/branches/main/protection \
  --method PUT \
  --input - << 'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Security Audit",
      "Test API (Node 18)",
      "Test API (Node 20)",
      "Integration Tests",
      "API Build Test",
      "Blockchain Build Test"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

### Step 2: Test the Gates

**Create a test PR**:
```bash
git checkout -b test/ci-gates
echo "# Test" >> TEST.md
git add TEST.md
git commit -m "test: verify CI gates"
git push origin test/ci-gates
gh pr create --title "test: verify CI gates work" --body "Testing deployment gates"
```

**Watch CI run**:
```bash
gh pr checks
```

**Try to merge before tests complete**:
- Should be blocked!

**After tests pass**:
- Merge button enabled ✅

---

## Bypass Procedures (Emergency Only)

**If you MUST bypass gates** (production emergency):

### Option 1: Temporary Disable (Admins Only)
```bash
# GitHub UI → Settings → Branches → main → Edit
# Uncheck "Require status checks to pass before merging"
# Merge emergency fix
# RE-ENABLE protection immediately after
```

### Option 2: Hotfix Branch
```bash
# Create hotfix branch from main
git checkout -b hotfix/emergency-fix main

# Make fix
git commit -m "hotfix: emergency fix"

# Push directly to main (if admin)
git push origin hotfix/emergency-fix:main

# Or merge via PR with admin override
```

**⚠️ IMPORTANT**: 
- Document why bypass was needed
- Create follow-up PR to add tests
- Review incident in postmortem

---

## Metrics to Track

### PR Quality
- Average time from PR open to merge
- Percentage of PRs failing initial CI
- Number of revisions before tests pass

### Deployment Safety
- Deployments blocked by gates (good!)
- Emergency bypasses (should be rare)
- Failed deployments after gates

### CI Performance
- CI run duration (should be <10 min)
- Flaky test rate (should be <1%)
- False positive rate

---

## Success Criteria

**You know it's working when**:

✅ Can't accidentally merge broken code to main
✅ All deployments have passed CI
✅ Zero production incidents from untested code
✅ Team trusts the CI process
✅ Can deploy confidently any time

**Red flags**:

❌ Frequently bypassing gates
❌ Tests taking >15 minutes
❌ High false positive rate
❌ Deployments failing despite passing CI

---

## Next Steps

1. **Enable branch protection** (GitHub UI)
2. **Test with a PR** (verify gates work)
3. **Update deploy.yml** (add validation step)
4. **Document for team** (how to work with gates)
5. **Monitor metrics** (track effectiveness)

---

## References

- [GitHub Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Required Status Checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)
- [GitHub Actions Status](https://docs.github.com/en/actions/learn-github-actions/contexts#github-context)

---

**Ready to implement? Start with Step 1: Enable branch protection!**
