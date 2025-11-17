# Docker Hub Cleanup Guide

## Current Situation

Your previous GitHub Actions workflow was pushing `daonnetwork/api:latest` to Docker Hub. We need to:

1. ✅ Stop pushing it (DONE - workflow updated)
2. ❌ Delete existing images from Docker Hub (TODO)
3. ✅ Only publish validator image (workflow ready)

## Images That May Be Published

Based on the old workflow, these may exist on Docker Hub:

- `daonnetwork/api:latest` ❌ DELETE THIS
- `daonnetwork/api:0.1.0-latest` ❌ DELETE THIS
- `daonnetwork/api:0.1.0-main-*` ❌ DELETE ANY TAGS

## Step 1: Check What's Published

### Option A: Web Interface

1. Go to: https://hub.docker.com
2. Login with your credentials
3. Navigate to: Repositories
4. Look for `daonnetwork/api`

### Option B: Command Line

```bash
# Install Docker Hub CLI tool (optional)
npm install -g docker-hub-utils

# Or use curl to check
curl https://hub.docker.com/v2/repositories/daonnetwork/api/tags/

# Or simple docker search
docker search daonnetwork
```

## Step 2: Delete the API Image

### Option A: Web Interface (Easiest)

1. Go to: https://hub.docker.com/r/daonnetwork/api
2. Click on the repository
3. Go to Settings (top right)
4. Scroll down to "Delete Repository"
5. Type the repository name to confirm
6. Click "Delete"

### Option B: Docker Hub CLI

```bash
# Login to Docker Hub
docker login

# Delete specific tags
docker push --delete daonnetwork/api:latest
docker push --delete daonnetwork/api:0.1.0-latest

# Note: This requires Docker Hub Pro/Team
# Free tier users must use web interface
```

### Option C: Docker Hub API

```bash
# Get auth token
HUB_TOKEN=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_USERNAME","password":"YOUR_PASSWORD"}' \
  https://hub.docker.com/v2/users/login/ | jq -r .token)

# Delete repository
curl -X DELETE \
  -H "Authorization: JWT ${HUB_TOKEN}" \
  https://hub.docker.com/v2/repositories/daonnetwork/api/
```

## Step 3: Verify Deletion

```bash
# Try to pull (should fail)
docker pull daonnetwork/api:latest

# Should see:
# Error response from daemon: manifest for daonnetwork/api:latest not found
```

## Step 4: Publish Validator Image (Correct One)

Once the API image is deleted, you can publish the validator:

```bash
# This will happen automatically when you push to main
# The new workflow builds: daonnetwork/validator:latest

# Or manually trigger via GitHub Actions
gh workflow run deploy.yml
```

## What Should Be on Docker Hub (Final State)

After cleanup, your Docker Hub should have:

✅ `daonnetwork/validator:latest` - Public validator node
✅ `daonnetwork/validator:0.1.0-latest` - Version tagged
✅ `daonnetwork/validator:0.1.0-main-<sha>` - Git SHA tagged

❌ Nothing else related to DAON

## Verification Checklist

- [ ] Checked Docker Hub for `daonnetwork/api`
- [ ] Deleted `daonnetwork/api` repository (if exists)
- [ ] Verified `docker pull daonnetwork/api:latest` fails
- [ ] Updated workflow is committed (already done)
- [ ] Next push will build `daonnetwork/validator` instead
- [ ] Validator image successfully published
- [ ] Can run validator with: `docker run daonnetwork/validator:latest`

## If You Haven't Pushed to Docker Hub Yet

Check your GitHub Actions history:

1. Go to: Repository → Actions
2. Look for "Deploy DAON Production" workflows
3. Check if any succeeded with "Build and push API image"
4. If none succeeded, you might not have anything to delete!

```bash
# Check GitHub Actions via CLI
gh run list --workflow=deploy.yml

# Check if any completed successfully
gh run list --workflow=deploy.yml --status=success
```

## Prevention (Already Done)

The workflow has been updated to prevent this in the future:

**Old (WRONG):**
```yaml
build-api:
  name: Build API
  # ... builds and pushes to daonnetwork/api ❌
```

**New (CORRECT):**
```yaml
test-api:
  name: Test API
  # ... only tests, doesn't push ✅

build-validator:
  name: Build Validator Image
  # ... builds and pushes to daonnetwork/validator ✅
```

## Quick Cleanup Script

If you want to automate the check and deletion:

```bash
#!/bin/bash
# docker-hub-cleanup.sh

DOCKER_USERNAME="${DOCKERHUB_USERNAME}"
DOCKER_PASSWORD="${DOCKERHUB_PASSWORD}"

echo "Checking for daonnetwork/api on Docker Hub..."

# Try to pull (will fail if doesn't exist)
if docker pull daonnetwork/api:latest 2>/dev/null; then
    echo "❌ Found daonnetwork/api:latest on Docker Hub"
    echo "Please delete it via web interface:"
    echo "https://hub.docker.com/r/daonnetwork/api/settings"
else
    echo "✅ daonnetwork/api not found on Docker Hub (good!)"
fi

echo ""
echo "Checking for daonnetwork/validator..."

if docker pull daonnetwork/validator:latest 2>/dev/null; then
    echo "✅ Found daonnetwork/validator:latest (this is correct)"
else
    echo "⏳ daonnetwork/validator not yet published"
    echo "Will be published on next deploy to main"
fi
```

## Summary

**Action Required:**
1. Visit https://hub.docker.com
2. Login
3. Check if `daonnetwork/api` exists
4. If yes, delete it completely
5. Push to main to publish validator instead

**No Action Needed:**
- ✅ Workflow already fixed
- ✅ Future deploys won't push API
- ✅ Validator will be published correctly

---

**Once cleanup is done, update this file with:**
```
## Cleanup Status: COMPLETE ✅
- Checked Docker Hub: [DATE]
- API image deleted: [YES/NO/NOT FOUND]
- Validator published: [YES/PENDING]
```
