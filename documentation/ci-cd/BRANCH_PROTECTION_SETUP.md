# Branch Protection Rules Setup

**Goal:** Enforce PR → CI → Review cycle for all changes to main branch

---

## Setup Instructions

### 1. Go to Branch Protection Settings

**URL:** https://github.com/daon-network/daon/settings/branches

**Or manually:**
1. Go to repository: https://github.com/daon-network/daon
2. Click **Settings** tab
3. Click **Branches** in left sidebar
4. Click **Add branch protection rule**

---

## Recommended Branch Protection Rules

### Branch Name Pattern
```
main
```

### Protection Rules to Enable

#### ✅ Require a pull request before merging
- **Require approvals:** 1 (you can approve your own PRs)
- **Dismiss stale pull request approvals when new commits are pushed:** ✓
- **Require review from Code Owners:** ⚪ (optional - only if you create CODEOWNERS file)

#### ✅ Require status checks to pass before merging
- **Require branches to be up to date before merging:** ✓

**Status checks to require:**
Once workflows are created, add:
- `Integration Tests` (from integration-tests.yml)
- `Security Audit` (from deploy.yml)
- `Test API` (from deploy.yml)
- `Commit Lint` (from commit-lint.yml)

#### ✅ Require conversation resolution before merging
**Enabled:** ✓

#### ✅ Require signed commits
**Optional:** ⚪ (adds security but requires GPG setup)

#### ✅ Require linear history
**Enabled:** ✓ (prevents messy merge commits)

#### ✅ Include administrators
**Enabled:** ✓ (even you must follow the rules!)

#### ⚪ Allow force pushes
**Disabled:** ⚪ (prevents history rewriting)

#### ⚪ Allow deletions
**Disabled:** ⚪ (prevents accidental branch deletion)

---

## Configuration Summary

```yaml
# Visual representation of settings

Branch: main

Protection Rules:
  ✅ Require pull request before merging
     - Required approvals: 1
     - Dismiss stale reviews: Yes
  
  ✅ Require status checks to pass
     - Require up-to-date branches: Yes
     - Required checks:
       - Integration Tests
       - Security Audit
       - Test API
       - Commit Lint
  
  ✅ Require conversation resolution: Yes
  ✅ Require linear history: Yes
  ✅ Include administrators: Yes
  ⚪ Require signed commits: No (optional)
  ⚪ Allow force pushes: No
  ⚪ Allow deletions: No
```

---

## Workflow After Branch Protection

### For Solo Development (You Only)

**Old workflow:**
```bash
# Direct commit to main
git add .
git commit -m "feat: Add feature"
git push origin main
```

**New workflow:**
```bash
# 1. Create feature branch
git checkout -b feature/add-cool-feature

# 2. Make changes and commit
git add .
git commit -m "feat: Add cool feature"
git push origin feature/add-cool-feature

# 3. Create PR via GitHub UI or CLI
gh pr create --title "feat: Add cool feature" --body "Description"

# 4. Wait for CI checks to pass (auto-runs)

# 5. Review and approve your own PR (if 1 approval required)

# 6. Merge PR (squash merge recommended)
gh pr merge --squash

# 7. Delete feature branch
git checkout main
git pull origin main
git branch -d feature/add-cool-feature
```

---

## GitHub CLI Quick Commands

### Create PR
```bash
gh pr create --title "feat: Add feature" --body "Description"
```

### List PRs
```bash
gh pr list
```

### Check PR status
```bash
gh pr status
```

### Merge PR
```bash
gh pr merge --squash  # Squash merge (recommended)
gh pr merge --merge   # Merge commit
gh pr merge --rebase  # Rebase merge
```

### Approve PR (if you need to approve your own)
```bash
gh pr review --approve
```

---

## Branch Naming Convention

Use conventional prefixes:

```
feature/your-feature-name    - New features
fix/bug-description          - Bug fixes
docs/what-you-updated        - Documentation
refactor/what-you-refactored - Code refactoring
chore/maintenance-task       - Maintenance tasks
test/test-description        - Test additions
ci/workflow-changes          - CI/CD changes
```

**Examples:**
```
feature/node-sdk-retry-logic
fix/api-cors-headers
docs/update-installation-guide
refactor/blockchain-client
chore/update-dependencies
test/add-integration-tests
ci/add-sdk-workflows
```

---

## Commit Message Convention

Already enforced by `commit-lint.yml`:

```
type(scope): Brief description

Optional longer description

Optional footer with breaking changes
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance
- `ci`: CI/CD changes

**Examples:**
```
feat(node-sdk): Add automatic retry logic with exponential backoff
fix(api): Resolve CORS header issue for cross-origin requests
docs(readme): Update installation instructions for Windows
refactor(blockchain): Switch to CosmJS registry-based signing
chore(deps): Update dependencies to latest versions
test(api): Add integration tests for bulk protection endpoint
ci(workflows): Add path-based SDK publishing workflows
```

---

## CI/CD Integration

### Current Workflows (Will Run on PRs)

1. **Integration Tests** (`.github/workflows/integration-tests.yml`)
   - Runs on: PR to main/develop
   - Tests: Full API + Blockchain integration
   - Must pass before merge

2. **Commit Lint** (`.github/workflows/commit-lint.yml`)
   - Validates commit messages
   - Must pass before merge

3. **PR Workflow** (`.github/workflows/pr.yml`)
   - Runs PR-specific checks
   - Must pass before merge

### New Workflows (To Be Created)

4. **SDK Tests** (path-based)
   - Runs when SDK files change
   - Tests specific SDK
   - Must pass before merge

---

## Exception: Emergency Hotfixes

If you need to bypass branch protection for urgent production fix:

**Option 1: Temporarily disable protection**
1. Go to Settings → Branches
2. Disable "Include administrators"
3. Push hotfix directly
4. Re-enable protection

**Option 2: Fast-track PR**
1. Create branch: `hotfix/critical-issue`
2. Create PR with "HOTFIX" in title
3. Approve immediately
4. Merge (checks still run)

**Recommended:** Always use Option 2 unless absolute emergency

---

## Benefits of Branch Protection

### Quality Control
✅ All code reviewed (even if self-reviewed)
✅ CI tests must pass
✅ Commit messages validated
✅ No accidental force pushes

### Documentation
✅ PRs document what changed and why
✅ Easier to track features in PR history
✅ Better for future debugging

### Safety
✅ Can't accidentally push broken code
✅ Easy rollback via PR revert
✅ Clear audit trail

### Professional Practice
✅ Industry-standard workflow
✅ Good habits for future collaborators
✅ Better for open source contributions

---

## Example: Full Feature Development Flow

### 1. Start Feature
```bash
git checkout main
git pull origin main
git checkout -b feature/add-webhooks
```

### 2. Develop
```bash
# Make changes
vim api-server/src/webhooks.ts

# Test locally
npm test

# Commit
git add api-server/
git commit -m "feat(api): Add webhook notification system"
```

### 3. Push and Create PR
```bash
git push origin feature/add-webhooks

gh pr create \
  --title "feat(api): Add webhook notification system" \
  --body "Implements webhook notifications for content protection events.

- Add webhook registration endpoints
- Implement event emission
- Add signature verification
- Update API documentation

Closes #42"
```

### 4. Wait for CI
GitHub Actions automatically runs:
- Integration tests
- Security audit
- Commit lint

**Status:** ⏳ Checks running...

### 5. Review (Self-Review)
```bash
# Review your own code on GitHub
# Check diff
# Verify CI passed

# Approve (if required)
gh pr review --approve
```

### 6. Merge
```bash
# Squash merge (recommended - cleaner history)
gh pr merge --squash

# Or via GitHub UI: Click "Squash and merge"
```

### 7. Cleanup
```bash
git checkout main
git pull origin main
git branch -d feature/add-webhooks
git remote prune origin  # Remove stale remote branches
```

---

## Status Checks Reference

### Required Checks (After Workflow Creation)

| Check | Workflow | Purpose |
|-------|----------|---------|
| Integration Tests | `integration-tests.yml` | Full system tests |
| Security Audit | `deploy.yml` | Dependency vulnerabilities |
| Test API | `deploy.yml` | API unit tests |
| Commit Lint | `commit-lint.yml` | Commit message format |
| *Node SDK Tests* | `publish-node-sdk.yml` | Node SDK (when changed) |
| *Python SDK Tests* | `publish-python-sdk.yml` | Python SDK (when changed) |
| *Go SDK Tests* | `publish-go-sdk.yml` | Go SDK (when changed) |
| *Ruby SDK Tests* | `publish-ruby-sdk.yml` | Ruby SDK (when changed) |
| *PHP SDK Tests* | `publish-php-sdk.yml` | PHP SDK (when changed) |

*Italic checks only run when relevant files change (path-based)*

---

## Troubleshooting

### "Required status checks are not passing"
**Solution:** Wait for CI to finish, or fix failing tests

### "Branch is out of date"
**Solution:** 
```bash
git checkout feature/my-branch
git pull origin main
git push
```

### "Can't push to main directly"
**Solution:** Create a branch and PR (this is by design!)

### "PR requires approval but I'm the only developer"
**Solution:** 
- Approve your own PR: `gh pr review --approve`
- Or reduce required approvals to 0 (not recommended)

---

## Next Steps

1. ✅ Push current changes to main (completed)
2. 🔲 Enable branch protection with settings above
3. 🔲 Create SDK workflow files
4. 🔲 Add status checks to branch protection as workflows are created
5. 🔲 Test workflow with first PR

---

## Quick Setup Checklist

- [ ] Go to https://github.com/daon-network/daon/settings/branches
- [ ] Click "Add branch protection rule"
- [ ] Branch name pattern: `main`
- [ ] ✅ Require pull request before merging (1 approval)
- [ ] ✅ Require status checks to pass
- [ ] ✅ Require conversation resolution
- [ ] ✅ Require linear history
- [ ] ✅ Include administrators
- [ ] ⚪ Allow force pushes (disabled)
- [ ] ⚪ Allow deletions (disabled)
- [ ] Click "Create" or "Save changes"
- [ ] Verify by trying to push directly to main (should fail)

---

**Ready to enable branch protection?** 

After enabling, we'll create the SDK workflow files using PRs (the new workflow!)
