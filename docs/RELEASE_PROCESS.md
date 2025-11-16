# DAON Release Process

## Overview

DAON uses semantic versioning with automated release tooling to ensure consistent, reliable deployments.

## Current Status: Pre-Production (0.x.x)

- **Manual versioning** during active development
- **0.x.x versions** indicate pre-production, breaking changes expected
- **Commit SHA tags** for development tracking

## Versioning Strategy

### Pre-Production (Current)
```
0.1.0 → 0.1.1 (patch: bug fixes)
0.1.0 → 0.2.0 (minor: new features)  
0.9.0 → 1.0.0 (major: production ready)
```

### Production (Future)
```
1.0.0 → 1.0.1 (patch: bug fixes)
1.0.0 → 1.1.0 (minor: backward-compatible features)
1.0.0 → 2.0.0 (major: breaking changes)
```

## Manual Release (Current Process)

1. **Update Version**
   ```bash
   cd api-server
   npm version patch|minor|major
   ```

2. **Update Health Endpoint**
   ```javascript
   // src/server.js
   version: '0.2.0'  // Update to match package.json
   ```

3. **Commit and Tag**
   ```bash
   git add .
   git commit -m "chore(release): bump version to 0.2.0"
   git tag v0.2.0
   git push origin main --tags
   ```

4. **Trigger Deployment**
   - Push triggers CI/CD pipeline
   - Docker image tagged with new version
   - Automated deployment to production

## Automated Release (Ready for Activation)

### Enable Automatic Releases

1. **Activate semantic-release workflow**:
   ```yaml
   # .github/workflows/release.yml
   # Uncomment the push trigger:
   on:
     push:
       branches: [main]
   ```

2. **Start using conventional commits**:
   ```bash
   git config --local commit.template .gitmessage
   ```

### Conventional Commit Examples

```bash
# Patch release (0.1.0 → 0.1.1)
fix: resolve authentication timeout issue
fix(api): handle malformed JSON requests properly

# Minor release (0.1.0 → 0.2.0)  
feat: add bulk content protection endpoint
feat(auth): implement JWT authentication

# Major release (0.9.0 → 1.0.0)
feat!: redesign API response format

BREAKING CHANGE: All API responses now wrap data in a 'data' field
```

### What Happens Automatically

1. **Version Detection**: Analyzes commit messages since last release
2. **Version Bump**: Updates package.json based on commit types
3. **Changelog Generation**: Creates/updates CHANGELOG.md
4. **Git Tag**: Creates semantic version tag (v1.2.3)
5. **GitHub Release**: Creates release with notes
6. **Docker Build**: Builds and tags Docker image with version
7. **Docker Push**: Pushes to daonnetwork/api:1.2.3

## Manual Release Trigger

Even with automation, you can manually trigger releases:

```bash
# Via GitHub Actions UI
Actions → Release → Run workflow → Enable semantic release: true
```

## Docker Tagging Strategy

### Current Development Tags
```
daonnetwork/api:latest
daonnetwork/api:0.1.0-latest  
daonnetwork/api:main-abc1234
```

### Future Production Tags
```
daonnetwork/api:1.2.3         # Exact version
daonnetwork/api:1.2           # Minor version  
daonnetwork/api:1             # Major version
daonnetwork/api:latest        # Latest stable
```

## Release Checklist

### Pre-Release
- [ ] All tests passing
- [ ] Security audit clean
- [ ] Documentation updated
- [ ] Breaking changes documented
- [ ] Performance tested

### Release
- [ ] Version bumped (manual or automatic)
- [ ] Changelog updated
- [ ] Docker images built
- [ ] Deployment successful
- [ ] Health checks passing

### Post-Release
- [ ] Monitor error rates
- [ ] Verify functionality
- [ ] Update dependent services
- [ ] Announce release (if major)

## Rollback Process

### Quick Rollback
```bash
# Deploy previous Docker tag
docker pull daonnetwork/api:1.2.2
docker-compose up -d
```

### Full Rollback
```bash
# Revert git tag and redeploy
git revert v1.2.3
git push origin main
# CI/CD rebuilds and deploys
```

## Migration Timeline

### Phase 1: Development (Current)
- Manual versioning
- 0.x.x releases
- Feature development focus

### Phase 2: Pre-Production 
- Enable semantic-release
- Automated 0.x.x releases  
- Stability improvements

### Phase 3: Production
- 1.0.0 release
- Full automation
- Strict backward compatibility

## Configuration Files

- **`.releaserc.json`**: Semantic release configuration
- **`.gitmessage`**: Commit message template
- **`CONTRIBUTING.md`**: Developer guidelines
- **`.github/workflows/release.yml`**: Release automation

## Activation Commands

When ready to enable automated releases:

```bash
# 1. Set commit message template
git config --local commit.template .gitmessage

# 2. Enable release workflow (uncomment push trigger)
# Edit .github/workflows/release.yml

# 3. Start using conventional commits
git commit -m "feat: enable automated semantic releases"

# 4. First automated release will be triggered on next push to main
```

## Questions?

- **Development**: Continue with manual versioning
- **Pre-Production**: Test semantic-release workflow
- **Production**: Full automation with safeguards

The infrastructure is ready - activate when the time is right! 🚀