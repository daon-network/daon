# GitHub Pages Setup Guide

**Status:** ✅ Repository is ready for GitHub Pages deployment  
**Security:** ✅ No secrets found in repository (safe for public access)  
**Documentation:** ✅ Complete Jekyll site in `/docs` folder

---

## Quick Setup (5 Minutes)

### Step 1: Enable GitHub Pages

1. **Go to Repository Settings**
   - Visit: https://github.com/daon-network/daon/settings/pages
   - Or: Repository → Settings → Pages (left sidebar)

2. **Configure Source**
   - **Branch:** Select `main`
   - **Folder:** Select `/docs`
   - Click **Save**

3. **Wait for Deployment**
   - GitHub will build the site (1-2 minutes)
   - You'll see: "Your site is ready to be published at..."

### Step 2: Configure Custom Domain (Optional)

**Option A: Use GitHub Subdomain (No DNS setup)**
- Your site will be live at: `https://daon-network.github.io/daon/`
- No additional configuration needed
- ✅ Works immediately

**Option B: Use Custom Domain (Requires DNS)**
- Your site will be at: `https://daon.network`
- CNAME file already exists: `docs/CNAME` (contains `daon.network`)
- See "DNS Configuration" section below

---

## DNS Configuration (For Custom Domain)

### Current CNAME File
```
daon.network
```

### DNS Records to Add

**If you want `https://daon.network` (root domain):**

1. Go to your DNS provider (where you bought daon.network)
2. Add these records:

```
Type: A
Name: @
Value: 185.199.108.153
TTL: 3600

Type: A
Name: @
Value: 185.199.109.153
TTL: 3600

Type: A
Name: @
Value: 185.199.110.153
TTL: 3600

Type: A
Name: @
Value: 185.199.111.153
TTL: 3600
```

**If you want `https://docs.daon.network` (subdomain):**

1. Update `docs/CNAME` to: `docs.daon.network`
2. Add DNS record:

```
Type: CNAME
Name: docs
Value: daon-network.github.io
TTL: 3600
```

### Enable HTTPS

After DNS propagates (5-60 minutes):
1. Go to Settings → Pages
2. Check "Enforce HTTPS"
3. GitHub will automatically provision SSL certificate

---

## Verification Steps

### 1. Check Build Status
- Go to: https://github.com/daon-network/daon/actions
- Look for "pages build and deployment" workflow
- Should show green checkmark ✅

### 2. Test Site Access

**GitHub Subdomain:**
```bash
curl -I https://daon-network.github.io/daon/
```

**Custom Domain (after DNS):**
```bash
curl -I https://daon.network/
```

### 3. Verify Pages Work
- Homepage: `/`
- API Docs: `/api/reference/`
- Get Started: `/get-started/`
- Examples: `/examples/`

### 4. Check Jekyll Build
If build fails, check:
- Actions tab for error messages
- Gemfile dependencies
- _config.yml syntax
- Markdown frontmatter

---

## Troubleshooting

### Issue: 404 Not Found

**Cause:** Build hasn't completed or DNS not propagated

**Solution:**
1. Check Actions tab for build status
2. Wait 2-5 minutes after enabling Pages
3. Clear browser cache
4. Try incognito/private mode

---

### Issue: Site Shows Raw Markdown

**Cause:** Jekyll not processing files

**Solution:**
1. Verify `/docs` folder contains `_config.yml`
2. Check Gemfile exists
3. Review Actions log for build errors
4. Ensure frontmatter on all pages:
   ```yaml
   ---
   layout: default
   title: "Page Title"
   ---
   ```

---

### Issue: Custom Domain Not Working

**Cause:** DNS not configured or not propagated

**Solution:**
1. Check DNS records with: `dig daon.network` or `dig docs.daon.network`
2. Wait up to 60 minutes for DNS propagation
3. Verify CNAME file contains correct domain
4. Ensure "Enforce HTTPS" is NOT checked during DNS propagation
5. Re-enable HTTPS after DNS works

---

### Issue: HTTPS Certificate Error

**Cause:** DNS pointed to wrong location or HTTPS enforced too early

**Solution:**
1. Disable "Enforce HTTPS" temporarily
2. Wait for DNS to fully propagate
3. Verify domain resolves correctly
4. Re-enable "Enforce HTTPS"
5. GitHub will auto-provision certificate (can take 10-30 minutes)

---

## Current Configuration

### Repository Structure ✅
```
docs/
├── _config.yml        ✅ Jekyll configuration
├── _layouts/          ✅ Custom layouts
├── assets/            ✅ CSS, images
├── CNAME              ✅ Custom domain (daon.network)
├── Gemfile            ✅ Ruby dependencies
├── index.md           ✅ Homepage
├── api/               ✅ API documentation
├── creators/          ✅ Creator guides
├── platforms/         ✅ Platform guides
├── examples/          ✅ Code examples
├── legal/             ✅ Legal framework
├── get-started/       ✅ Onboarding
└── community/         ✅ Community resources
```

### Jekyll Configuration ✅
```yaml
# _config.yml
title: "DAON Creator Protection"
url: "https://daon.network"
baseurl: ""
markdown: kramdown
highlighter: rouge

daon:
  version: "1.0.0"
  api_url: "https://api.daon.network"  # ✅ Production API
```

### Security Status ✅
```
✅ No secrets in repository
✅ Only template .env committed
✅ .gitignore properly configured
✅ Safe for public GitHub Pages
```

---

## Post-Deployment Checklist

After GitHub Pages is live:

- [ ] Verify homepage loads: `https://daon.network/`
- [ ] Test navigation links work
- [ ] Check API reference page: `/api/reference/`
- [ ] Verify code examples display correctly
- [ ] Test mobile responsiveness
- [ ] Confirm HTTPS certificate valid
- [ ] Check all internal links
- [ ] Test search functionality (if enabled)
- [ ] Verify OpenGraph tags (share on social media)
- [ ] Add to Google Search Console (optional)
- [ ] Set up analytics (optional)

---

## Maintenance

### Updating Documentation

1. **Edit Files Locally**
   ```bash
   cd docs/
   # Edit markdown files
   bundle exec jekyll serve  # Test locally
   ```

2. **Commit and Push**
   ```bash
   git add docs/
   git commit -m "docs: Update API reference"
   git push origin main
   ```

3. **Auto-Deploy**
   - GitHub Actions automatically rebuilds site
   - Live in 1-2 minutes
   - Check Actions tab for status

### Monitoring

**Build Status:**
- Actions tab: https://github.com/daon-network/daon/actions
- Look for "pages build and deployment"
- Green = success, Red = build failed

**Site Analytics (Optional):**
- Google Analytics
- GitHub Insights (if repository is public)
- Uptime monitoring (UptimeRobot, Pingdom, etc.)

---

## Next Steps After GitHub Pages is Live

1. **Update API Documentation**
   - Link to live docs from API responses
   - Add "View Docs" buttons

2. **SEO Optimization**
   - Submit sitemap to Google Search Console
   - Add robots.txt (if needed)
   - Verify OpenGraph tags

3. **Social Media**
   - Share launch on Twitter/Discord
   - Use docs URL in announcements
   - Add to GitHub repository description

4. **Creator Onboarding**
   - Send docs link to beta testers
   - Update WordPress plugin to link docs
   - Add docs link to browser extension

---

## Quick Reference

### Repository
- **GitHub:** https://github.com/daon-network/daon
- **Settings:** https://github.com/daon-network/daon/settings/pages
- **Actions:** https://github.com/daon-network/daon/actions

### Site URLs (After Setup)
- **GitHub Pages:** https://daon-network.github.io/daon/
- **Custom Domain:** https://daon.network/ (if DNS configured)
- **API:** https://api.daon.network/

### Support
- **Jekyll Docs:** https://jekyllrb.com/docs/
- **GitHub Pages:** https://docs.github.com/en/pages
- **Custom Domains:** https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site

---

## 🎉 You're Ready!

Your documentation site is ready to go live. Just follow Step 1 above to enable GitHub Pages.

**Estimated time:** 5 minutes  
**Build time:** 1-2 minutes  
**DNS propagation (if custom domain):** 5-60 minutes  
**Total time to live site:** 10 minutes (or up to 1 hour with custom domain)
