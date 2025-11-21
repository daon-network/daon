# Monorepo Path-Based Workflows Strategy

**Yes! You can absolutely segregate workflows by folder changes.**

GitHub Actions supports `paths` filters to run workflows only when specific files/folders change.

---

## How It Works

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'sdks/node/**'  # Only run if Node SDK changes
      - '.github/workflows/publish-node-sdk.yml'  # Or workflow itself changes
```

---

## Recommended Workflow Structure

### 1. SDK Publishing - Node.js

**File:** `.github/workflows/publish-node-sdk.yml`

**Triggers:** Changes to `sdks/node/**`

**Actions:**
- Install dependencies
- Run tests
- Build SDK
- Publish to npm (requires `NPM_TOKEN` secret)

---

### 2. SDK Publishing - Python

**File:** `.github/workflows/publish-python-sdk.yml`

**Triggers:** Changes to `sdks/python/**`

**Actions:**
- Setup Python
- Build package
- Run tests
- Publish to PyPI (requires `PYPI_TOKEN` secret)

---

### 3. SDK Publishing - Go

**File:** `.github/workflows/publish-go-sdk.yml`

**Triggers:** Changes to `sdks/go/**`

**Actions:**
- Run tests
- Build package
- Create git tag (Go modules publish via tags)
- Example: `sdks/go/v1.0.0`

---

### 4. SDK Publishing - Ruby

**File:** `.github/workflows/publish-ruby-sdk.yml`

**Triggers:** Changes to `sdks/ruby/**`

**Actions:**
- Build gem
- Run tests
- Publish to RubyGems (requires `RUBYGEMS_API_KEY` secret)

---

### 5. SDK Publishing - PHP

**File:** `.github/workflows/publish-php-sdk.yml`

**Triggers:** Changes to `sdks/php/**`

**Actions:**
- Run tests with Composer
- Create git tag (Composer reads from GitHub)
- Example: `sdks/php/v1.0.0`

---

### 6. API Server Deployment

**File:** `.github/workflows/deploy-api.yml`

**Triggers:** Changes to `api-server/**`

**Actions:**
- Run tests
- Build Docker image
- Deploy to production (rolling restart)
- Health check verification

**Already exists** - just needs path filter added!

---

### 7. Blockchain Deployment

**File:** `.github/workflows/deploy-blockchain.yml`

**Triggers:** Changes to `daon-core/**`

**Actions:**
- Run blockchain tests
- Build Docker image
- Publish to Docker Hub
- Deploy to production (requires manual confirmation)

**Already exists** - just needs path filter added!

---

### 8. Documentation Deployment

**File:** `.github/workflows/deploy-docs.yml`

**Triggers:** Changes to `docs/**`

**Actions:**
- Build Jekyll site
- Validate HTML
- GitHub Pages auto-deploys

---

## Path Filter Examples

### Basic Path Filter
```yaml
on:
  push:
    branches: [main]
    paths:
      - 'sdks/node/**'
```

### Multiple Paths
```yaml
on:
  push:
    branches: [main]
    paths:
      - 'sdks/node/**'
      - 'api-server/**'
      - '.github/workflows/my-workflow.yml'
```

### Exclude Paths
```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

### Specific File Types
```yaml
on:
  push:
    branches: [main]
    paths:
      - 'api-server/**/*.ts'
      - '!**/*.md'  # Exclude markdown
```

---

## Release Flow Example

### Scenario: Update Node SDK

```bash
# Developer makes changes
vim sdks/node/src/index.ts

# Commit and push
git add sdks/node/
git commit -m "feat(node-sdk): Add retry logic"
git push origin main
```

**GitHub Actions Response:**
- ✅ `publish-node-sdk.yml` - **RUNS** (detects `sdks/node/**` change)
- ❌ `publish-python-sdk.yml` - **SKIPS** (no Python changes)
- ❌ `publish-go-sdk.yml` - **SKIPS** (no Go changes)
- ❌ `publish-ruby-sdk.yml` - **SKIPS** (no Ruby changes)
- ❌ `publish-php-sdk.yml` - **SKIPS** (no PHP changes)
- ❌ `deploy-api.yml` - **SKIPS** (no API changes)
- ❌ `deploy-blockchain.yml` - **SKIPS** (no blockchain changes)
- ❌ `deploy-docs.yml` - **SKIPS** (no docs changes)

**Result:** Only Node SDK is tested and published!

---

## Versioning Strategy

### Independent Versions (Recommended)

Each component has its own version:
- `sdks/node/package.json` → `1.2.0`
- `sdks/python/setup.py` → `1.1.5`
- `api-server/package.json` → `0.3.1`
- `daon-core/go.mod` → `0.2.0`

**Pros:**
- Only publish what changed
- Clear version history per component
- Users can pick SDK versions independently

**Cons:**
- More complex to track
- Need version bump automation

### Git Tagging Convention

```bash
# Node SDK
git tag sdks/node/v1.2.0

# Python SDK
git tag sdks/python/v1.1.5

# API Server
git tag api-server/v0.3.1

# Blockchain
git tag daon-core/v0.2.0
```

---

## Required GitHub Secrets

Add these to repository settings:

### SDK Publishing
```
NPM_TOKEN           - npm publish token (get from npmjs.com)
PYPI_TOKEN          - PyPI API token (get from pypi.org)
RUBYGEMS_API_KEY    - RubyGems API key (get from rubygems.org)
```

**Note:** PHP and Go publish via git tags (no tokens needed)

### Deployment (Already Have)
```
SERVER_SSH_KEY      - SSH private key for production server ✅
SERVER_USER         - SSH username ✅
SERVER_HOST         - Server IP/hostname ✅
DOCKERHUB_USERNAME  - Docker Hub username ✅
DOCKERHUB_TOKEN     - Docker Hub access token ✅
```

---

## Workflow Priority & Time Estimates

| Workflow | Status | Priority | Time to Create |
|----------|--------|----------|----------------|
| Node SDK | New | High | 30 min |
| Python SDK | New | High | 30 min |
| Go SDK | New | Medium | 20 min |
| Ruby SDK | New | Medium | 30 min |
| PHP SDK | New | Medium | 20 min |
| API Deploy | **Exists** | High | 10 min (add path filter) |
| Blockchain Deploy | **Exists** | High | 10 min (add path filter) |
| Docs Deploy | **Exists** | Low | 5 min (add path filter) |
| **Total** | | | **~3 hours** |

---

## Example Workflow: Node SDK Publishing

```yaml
name: Publish Node.js SDK

on:
  push:
    branches: [main]
    paths:
      - 'sdks/node/**'
      - '.github/workflows/publish-node-sdk.yml'
  workflow_dispatch:  # Allow manual trigger

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd sdks/node
          npm ci
      
      - name: Run tests
        run: |
          cd sdks/node
          npm test
      
      - name: Build
        run: |
          cd sdks/node
          npm run build

  publish:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: |
          cd sdks/node
          npm ci
      
      - name: Build
        run: |
          cd sdks/node
          npm run build
      
      - name: Publish to npm
        run: |
          cd sdks/node
          npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Example Workflow: API Deployment (Updated)

Just add path filter to existing workflow:

```yaml
name: Deploy API Server

on:
  push:
    branches: [main]
    paths:  # ADD THIS
      - 'api-server/**'
      - '.github/workflows/deploy-api.yml'
  workflow_dispatch:

# ... rest of existing deploy workflow
```

---

## Benefits of This Setup

### Efficiency
✅ Only relevant workflows run
✅ Faster CI/CD (no wasted builds)
✅ Clear change tracking

### Safety
✅ Tests run before publish
✅ Independent deployments
✅ Easy rollbacks per component

### Developer Experience
✅ Change Node SDK → Only Node publishes
✅ Change API → Only API redeploys
✅ Change blockchain → Only blockchain rebuilds

### Cost Savings
✅ Fewer GitHub Actions minutes
✅ Less npm/PyPI bandwidth
✅ Faster feedback loops

---

## Migration Plan

### Phase 1: Add Path Filters (30 minutes)
1. Update existing `deploy.yml` with path filters
2. Test with small commit to each path
3. Verify only relevant workflows run

### Phase 2: SDK Publishing Workflows (3 hours)
1. Create `publish-node-sdk.yml`
2. Create `publish-python-sdk.yml`
3. Create `publish-go-sdk.yml`
4. Create `publish-ruby-sdk.yml`
5. Create `publish-php-sdk.yml`
6. Add required secrets
7. Test each with small SDK changes

### Phase 3: Documentation (30 minutes)
1. Update `deploy-docs.yml` with path filter
2. Document workflow in README
3. Add CI/CD badges to README

---

## Testing Strategy

### Before Enabling Auto-Publish

1. **Test workflows manually:**
   ```yaml
   workflow_dispatch:  # Add to all workflows
   ```

2. **Dry-run publishes:**
   ```bash
   npm publish --dry-run  # Node
   twine upload --skip-existing  # Python
   ```

3. **Use version bumps:**
   - Start with patch versions (1.0.1, 1.0.2)
   - Increment only when ready to publish

### Rollback Plan

If publish fails:
```bash
# npm
npm unpublish @daon/sdk@1.0.1

# PyPI (contact support)
# RubyGems
gem yank daon -v 1.0.1
```

---

## Monitoring & Alerts

### GitHub Actions Notifications

**Enable in repository settings:**
- Email on workflow failure
- Slack/Discord webhook integration
- Status badges in README

### Suggested Alerts

```yaml
# Add to each workflow
on:
  workflow_run:
    workflows: ["Publish Node.js SDK"]
    types: [completed]
    
jobs:
  notify:
    if: failure()
    runs-on: ubuntu-latest
    steps:
      - name: Send alert
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
            -d "Node SDK publish failed!"
```

---

## Best Practices

### 1. Always Include Workflow File in Path
```yaml
paths:
  - 'sdks/node/**'
  - '.github/workflows/publish-node-sdk.yml'  # Trigger on workflow changes too
```

### 2. Add Manual Trigger
```yaml
on:
  push:
    paths: [...]
  workflow_dispatch:  # Allow manual runs
```

### 3. Test Before Publish
```yaml
jobs:
  test:
    # Always test first
  
  publish:
    needs: test  # Only publish if tests pass
```

### 4. Version Gating
```yaml
# Only publish if version changed
- name: Check version change
  run: |
    CURRENT=$(npm show @daon/sdk version)
    NEW=$(jq -r .version package.json)
    if [ "$CURRENT" = "$NEW" ]; then
      echo "Version unchanged, skipping publish"
      exit 0
    fi
```

---

## FAQ

### Q: Can I publish all SDKs at once?
**A:** Yes, but not recommended. Better to let each publish independently when changed.

### Q: What if API and SDK change in same commit?
**A:** Both workflows run! API deploys + SDK publishes.

### Q: Do I need separate repos for SDKs?
**A:** No! Path-based workflows work great in monorepos.

### Q: How do I version SDKs?
**A:** Independent versions recommended. Each SDK maintains its own version number.

### Q: What about breaking changes?
**A:** Use semantic versioning:
- `1.0.0` → `1.0.1` (patch - bug fix)
- `1.0.0` → `1.1.0` (minor - new feature)
- `1.0.0` → `2.0.0` (major - breaking change)

---

## Ready to Implement?

**Next Steps:**

1. ✅ Add path filters to existing workflows (30 min)
2. ✅ Create SDK publishing workflows (3 hours)
3. ✅ Add required secrets to GitHub
4. ✅ Test with manual triggers
5. ✅ Enable auto-publish when confident

**Total Time:** ~4 hours for complete setup

**Want me to create these workflows now?**
