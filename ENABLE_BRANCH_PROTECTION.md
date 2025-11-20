# Enable Branch Protection - Quick Guide

**Goal**: Prevent deployments unless all CI tests pass

---

## Step 1: Navigate to Branch Protection Settings

**URL**: https://github.com/daon-network/daon/settings/branch_protection_rules/new

Or:
1. Go to your GitHub repo
2. Click **Settings** tab
3. Click **Branches** in left sidebar
4. Click **Add branch protection rule**

---

## Step 2: Configure Protection Rules

### Branch name pattern
```
main
```

### Protect matching branches

**☑ Require a pull request before merging**
- ☑ Require approvals: **1**
- ☑ Dismiss stale pull request approvals when new commits are pushed
- ☑ Require review from Code Owners (if you have CODEOWNERS file)

**☑ Require status checks to pass before merging**
- ☑ Require branches to be up to date before merging

**Required status checks** - Select these:
- ☑ `Security Audit`
- ☑ `Test API`
- ☑ `Integration Tests`
- ☑ `API Build Test`  
- ☑ `Blockchain Build Test`
- ☑ `Validate Deployment Readiness` (new!)

**☑ Require conversation resolution before merging**

**☑ Require signed commits** (optional but recommended)

**☑ Require linear history** (prevents merge commits)

**☐ Do not allow bypassing the above settings**
- Leave unchecked if you need emergency bypass capability
- Check if you want strict enforcement (no exceptions)

**☑ Restrict who can push to matching branches**
- Add yourself and any other admins
- Or leave empty to allow all with write access

---

## Step 3: Save Changes

Click **Create** button at bottom

---

## Step 4: Test It Works

### Create a test PR

```bash
# Create test branch
git checkout -b test/branch-protection
echo "# Test" >> BRANCH_PROTECTION_TEST.md
git add BRANCH_PROTECTION_TEST.md
git commit -m "test: verify branch protection"
git push origin test/branch-protection

# Create PR
gh pr create \
  --title "test: verify branch protection works" \
  --body "Testing that CI must pass before merge"
```

### Verify Protection

1. Go to the PR on GitHub
2. You should see:
   ```
   ⏳ Some checks haven't completed yet
   
   Required:
   - Security Audit (running...)
   - Test API (running...)
   - Integration Tests (running...)
   - etc.
   
   Merging is blocked
   ```

3. Wait for checks to complete
4. After all pass:
   ```
   ✅ All checks have passed
   
   1 approval required
   
   Merge button enabled
   ```

5. **Try to merge without approval** → Should be blocked!
6. Approve the PR
7. **Now** merge button should work

### Clean up

```bash
# After testing, close the PR
gh pr close test/branch-protection

# Delete the branch
git branch -D test/branch-protection
git push origin --delete test/branch-protection

# Delete the test file
git checkout main
git pull
git rm BRANCH_PROTECTION_TEST.md
git commit -m "chore: remove branch protection test file"
git push
```

---

## What This Prevents

### ❌ Before Branch Protection

```
Developer → Push to main → Broken code in production
```

Anyone could push directly to main, bypassing tests!

### ✅ After Branch Protection

```
Developer → Create PR → CI runs
  ↓
  ❌ Tests fail → Cannot merge (blocked)
  ↓
  Fix code → Tests pass
  ↓
  Get approval → Merge to main
  ↓
  ✅ Only tested code reaches main
```

---

## How Deployments Work Now

### Before (Risky)

```bash
# Anyone could deploy untested code
git push origin main
gh workflow run deploy.yml
```

### After (Safe)

```bash
# 1. Create PR
git checkout -b feat/my-feature
git commit -m "feat: add feature"
git push origin feat/my-feature
gh pr create

# 2. Wait for CI (automatic)
# ✅ Security Audit
# ✅ Tests
# ✅ Integration Tests
# ✅ Build Tests

# 3. Get approval, merge
gh pr merge --squash

# 4. Deploy (manually)
gh workflow run deploy.yml --ref main

# Deployment workflow will:
# ✅ Verify deploying from main
# ✅ Run tests again (belt & suspenders)
# ✅ Build images
# ✅ Deploy to production
```

---

## Emergency Bypass (Use Sparingly!)

If you MUST bypass protection (production down, critical hotfix):

### Option 1: Admin Override

1. Go to PR
2. Click "Merge without waiting for requirements to be met (bypass branch protections)"
3. **Document why** in PR description
4. Create follow-up PR to add tests

### Option 2: Temporarily Disable

1. Settings → Branches → main → Edit
2. Uncheck "Require status checks to pass"
3. Merge emergency fix
4. **RE-ENABLE IMMEDIATELY**

**⚠️ NEVER leave protection disabled!**

---

## Monitoring

### Check Protection Status

```bash
# Via GitHub CLI
gh api repos/daon-network/daon/branches/main/protection

# Or visit
# https://github.com/daon-network/daon/settings/branches
```

### See Protected Branches

Settings → Branches → "Branch protection rules"

Should show:
```
main
  ✅ Require pull request reviews before merging
  ✅ Require status checks to pass before merging
  ✅ Require conversation resolution before merging
```

---

## Troubleshooting

### "Required status check X is missing"

**Cause**: Workflow name changed or not running

**Fix**: Update required checks list to match workflow names

### "Merge button still disabled after tests pass"

**Cause**: Missing approval

**Fix**: Get another team member to approve, or approve yourself if allowed

### "Can't find status check in dropdown"

**Cause**: Check hasn't run yet on a PR

**Fix**: 
1. Create a PR
2. Let CI run
3. Go back to branch protection
4. Refresh - checks should now appear

---

## Success!

You'll know it's working when:

✅ Can't push directly to main
✅ PRs require tests to pass
✅ PRs require approval
✅ Deployments only happen from main
✅ Team confident code is tested before merge

---

**Ready to enable? Visit the URL and follow Step 2!**

https://github.com/daon-network/daon/settings/branch_protection_rules/new
