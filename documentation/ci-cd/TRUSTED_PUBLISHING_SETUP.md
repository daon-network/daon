# Trusted Publishing Setup Guide

**Modern, secure way to publish packages without API tokens!**

Trusted publishing uses **OIDC (OpenID Connect)** to authenticate GitHub Actions workflows directly with package registries. No tokens to manage, rotate, or leak!

---

## What is Trusted Publishing?

Instead of storing API tokens in GitHub Secrets, package registries verify GitHub Actions workflows using OIDC. When your workflow runs, GitHub proves:
- The workflow is running from your repository
- The workflow file hasn't been tampered with
- The publisher identity matches what you configured

**Benefits:**
✅ No API tokens to manage or rotate  
✅ More secure (tokens can't leak)  
✅ Automatic provenance/attestations  
✅ Better supply chain security  
✅ Easier setup (configure once, forget it)  

---

## Setup Instructions

### 1. PyPI (Python) ✅ CONFIGURED

**Registry:** https://pypi.org  
**Setup URL:** https://pypi.org/manage/account/publishing/

#### Steps:
1. Go to https://pypi.org/manage/account/publishing/
2. Click "Add a new pending publisher"
3. Fill in details:
   - **PyPI Project Name:** `daon-sdk`
   - **Owner:** `daon-network`
   - **Repository name:** `daon`
   - **Workflow name:** `publish-python-sdk.yml`
   - **Environment name:** (leave blank)
4. Click "Add"

**Status:** ✅ You mentioned this is complete!

#### Workflow Configuration:
```yaml
permissions:
  id-token: write  # Required for OIDC
  contents: read

steps:
  - name: Publish to PyPI
    uses: pypa/gh-action-pypi-publish@release/v1
    with:
      packages-dir: sdks/python/dist/
```

**Documentation:** https://docs.pypi.org/trusted-publishers/

---

### 2. npm (Node.js)

**Registry:** https://www.npmjs.com  
**Setup URL:** https://www.npmjs.com/settings/~/tokens

#### Steps:

**Option A: Granular Access Tokens with Automation (Recommended)**
1. Go to https://www.npmjs.com/settings/~/tokens
2. Click "Generate New Token" → "Granular Access Token"
3. Configure:
   - **Token name:** `GitHub Actions - DAON SDK`
   - **Expiration:** 90 days or custom
   - **Packages and scopes:**
     - Select: `Read and write`
     - Package: `@daon/sdk`
   - **Organizations:** (select your org if applicable)
   - **IP allowlist:** (optional - can restrict to GitHub Actions IPs)
4. Copy token and add to GitHub Secrets as `NPM_TOKEN`

**Option B: Full Trusted Publishing (Coming Soon)**
npm is working on full OIDC support similar to PyPI. For now, use granular tokens with `--provenance` flag.

#### Workflow Configuration:
```yaml
permissions:
  id-token: write  # Required for provenance
  contents: read

steps:
  - name: Publish to npm
    run: npm publish --provenance --access public
    env:
      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**What `--provenance` does:**
- Generates signed attestation of build
- Links package to source code and workflow
- Visible on npm package page
- Improves supply chain security

**Documentation:** https://docs.npmjs.com/generating-provenance-statements

---

### 3. RubyGems (Ruby)

**Registry:** https://rubygems.org  
**Setup URL:** https://rubygems.org/profile/api_keys (for gem ownership first)

#### Steps:

**First, ensure you own the gem:**
1. If gem doesn't exist yet, you'll claim it on first publish
2. If gem exists, ensure your account has owner permissions

**Then configure trusted publishing:**
1. Go to your gem's settings: `https://rubygems.org/gems/daon/settings`
2. Navigate to "Trusted Publishing" section
3. Click "Add a new GitHub Actions trusted publisher"
4. Fill in:
   - **Repository:** `daon-network/daon`
   - **Workflow:** `publish-ruby-sdk.yml`
   - **Environment:** (leave blank unless using GitHub Environments)
5. Save

#### Workflow Configuration:
```yaml
permissions:
  id-token: write  # Required for OIDC
  contents: read

steps:
  - name: Publish to RubyGems
    uses: rubygems/release-gem@v1
```

**Documentation:** https://guides.rubygems.org/trusted-publishing/

---

### 4. Go Modules (No Setup Needed!)

**Registry:** Go module proxy (proxy.golang.org)  
**Authentication:** Git tags (no tokens at all)

#### How it works:
1. Workflow creates a git tag: `sdks/go/v1.0.0`
2. Go module proxy reads directly from GitHub
3. Users install: `go get github.com/daon-network/daon/sdks/go@v1.0.0`

**No configuration needed!** ✅

#### Workflow Configuration:
```yaml
# No special permissions needed
steps:
  - name: Create and push tag
    run: |
      git tag sdks/go/v1.0.0
      git push origin sdks/go/v1.0.0
```

---

### 5. Packagist (PHP - No Setup Needed!)

**Registry:** https://packagist.org  
**Authentication:** Git tags + webhook

#### How it works:
1. Register package once on Packagist (link to GitHub repo)
2. Packagist auto-updates when you push git tags
3. Workflow creates tag: `sdks/php/v1.0.0`
4. Packagist detects new tag and indexes it

#### One-time setup:
1. Go to https://packagist.org/packages/submit
2. Enter repository URL: `https://github.com/daon-network/daon`
3. Packagist will find `sdks/php/composer.json`
4. Set up GitHub webhook (Packagist provides URL)
5. Done!

**Workflow creates tags, Packagist handles the rest.** ✅

#### Workflow Configuration:
```yaml
# No special permissions needed
steps:
  - name: Create and push tag
    run: |
      git tag sdks/php/v1.0.0
      git push origin sdks/php/v1.0.0
```

---

## Summary Table

| Registry | Method | Setup Needed | Token Needed | OIDC |
|----------|--------|--------------|--------------|------|
| **PyPI** | Trusted Publisher | ✅ Yes (one-time) | ❌ No | ✅ Yes |
| **npm** | Provenance + Token | ⚠️ Token (90 day) | ✅ Yes | 🟡 Partial |
| **RubyGems** | Trusted Publisher | ✅ Yes (one-time) | ❌ No | ✅ Yes |
| **Go** | Git Tags | ❌ No | ❌ No | N/A |
| **Packagist** | Git Tags + Webhook | ✅ Yes (one-time) | ❌ No | N/A |

---

## Required GitHub Secrets

After completing setup above, add these secrets:

**Go to:** https://github.com/daon-network/daon/settings/secrets/actions

### Secrets to Add:

```
NPM_TOKEN - Granular access token from npm (expires 90 days)
```

### Secrets NOT Needed (using trusted publishing):
```
PYPI_TOKEN          - ❌ Not needed (using OIDC)
RUBYGEMS_API_KEY    - ❌ Not needed (using OIDC)
```

---

## Testing Trusted Publishing

### Test PyPI Publishing
```bash
# 1. Update version in setup.py
vim sdks/python/setup.py
# Change version to 1.0.1

# 2. Commit and push
git add sdks/python/setup.py
git commit -m "chore(python-sdk): Bump version to 1.0.1"
git push origin main

# 3. Watch workflow
# Go to: https://github.com/daon-network/daon/actions
# publish-python-sdk.yml should run automatically

# 4. Verify on PyPI
# Check: https://pypi.org/project/daon-sdk/
```

### Test npm Publishing
```bash
# 1. Update version in package.json
vim sdks/node/package.json
# Change version to 1.0.1

# 2. Commit and push
git add sdks/node/package.json
git commit -m "chore(node-sdk): Bump version to 1.0.1"
git push origin main

# 3. Watch workflow
# publish-node-sdk.yml should run

# 4. Verify on npm
# Check: https://www.npmjs.com/package/@daon/sdk
```

### Test RubyGems Publishing
```bash
# 1. Update version in gemspec
vim sdks/ruby/daon.gemspec
# Change version to 1.0.1

# 2. Commit and push
git add sdks/ruby/daon.gemspec
git commit -m "chore(ruby-sdk): Bump version to 1.0.1"
git push origin main

# 3. Watch workflow
# publish-ruby-sdk.yml should run

# 4. Verify on RubyGems
# Check: https://rubygems.org/gems/daon
```

---

## Troubleshooting

### PyPI: "Trusted publishing exchange failure"

**Cause:** Workflow configuration doesn't match PyPI settings

**Fix:**
1. Double-check PyPI publisher settings
2. Verify workflow name is exactly `publish-python-sdk.yml`
3. Ensure `permissions: id-token: write` is set
4. Check repository name matches exactly

### npm: "provenance not supported"

**Cause:** Package is private or npm account doesn't support provenance

**Fix:**
1. Ensure package is public: `npm publish --access public`
2. Update npm CLI: `npm install -g npm@latest`
3. Verify `permissions: id-token: write` is set

### RubyGems: "Unauthorized"

**Cause:** Trusted publisher not configured or gem ownership issue

**Fix:**
1. Verify you own the gem on RubyGems.org
2. Check trusted publisher settings in gem settings
3. Ensure workflow name matches exactly
4. Try manual publish first to claim gem name

---

## Security Benefits

### Traditional API Tokens:
❌ Can be stolen if leaked  
❌ Need manual rotation  
❌ Broad permissions  
❌ Hard to audit usage  
❌ Single point of failure  

### Trusted Publishing (OIDC):
✅ Can't be stolen (no static token)  
✅ Auto-expires after workflow run  
✅ Scoped to specific workflow  
✅ Full audit trail in workflow logs  
✅ Cryptographically verified  

---

## Additional Resources

**PyPI Trusted Publishing:**
- https://docs.pypi.org/trusted-publishers/
- https://github.com/pypa/gh-action-pypi-publish

**npm Provenance:**
- https://docs.npmjs.com/generating-provenance-statements
- https://github.blog/2023-04-19-introducing-npm-package-provenance/

**RubyGems Trusted Publishing:**
- https://guides.rubygems.org/trusted-publishing/
- https://github.com/rubygems/release-gem

**GitHub OIDC:**
- https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect

---

## Next Steps

1. ✅ PyPI - Already configured!
2. ⏳ npm - Add `NPM_TOKEN` secret (granular token)
3. ⏳ RubyGems - Configure trusted publisher
4. ⏳ Packagist - Register package + webhook
5. ✅ Go - No setup needed!

**Once configured, publishing is fully automatic on version changes!**
