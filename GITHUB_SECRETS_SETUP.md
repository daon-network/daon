# GitHub Secrets Setup for DAON Deployment

## 🔐 Required Secrets

Your GitHub Actions pipeline needs these secrets configured in your repository settings.

### **Where to Add Secrets**
```
GitHub Repository → Settings → Secrets and variables → Actions → New repository secret
```

---

## 📋 Required Secrets List

### **1. Docker Hub Credentials**

#### `DOCKERHUB_USERNAME`
- **Value**: Your Docker Hub username
- **Used for**: Pushing Docker images to Docker Hub
- **Get it**: Your Docker Hub login username

#### `DOCKERHUB_TOKEN`
- **Value**: Docker Hub access token (NOT your password)
- **Used for**: Authenticating to Docker Hub
- **How to generate**:
  1. Go to https://hub.docker.com/settings/security
  2. Click "New Access Token"
  3. Name it: `github-actions-daon`
  4. Copy the token (you only see it once!)

---

### **2. Server Access**

#### `SERVER_HOST`
- **Value**: Your Hetzner server IP or domain
- **Example**: `123.45.67.89` or `api.daon.network`
- **Used for**: SSH connection to deploy

#### `SERVER_USER`
- **Value**: SSH username on your server
- **Example**: `root` or `daon` or `ubuntu`
- **Used for**: SSH authentication

#### `SERVER_SSH_KEY`
- **Value**: Private SSH key with access to your server
- **Used for**: Passwordless SSH authentication
- **How to generate**:

```bash
# On your local machine
ssh-keygen -t ed25519 -C "github-actions-daon" -f ~/.ssh/daon_deploy_key

# This creates two files:
# ~/.ssh/daon_deploy_key (private key - add to GitHub Secret)
# ~/.ssh/daon_deploy_key.pub (public key - add to server)

# Copy private key (add entire content to GitHub Secret)
cat ~/.ssh/daon_deploy_key

# Copy public key to server
ssh-copy-id -i ~/.ssh/daon_deploy_key.pub user@your-server-ip
# OR manually add to server:
# ssh user@your-server-ip
# echo "YOUR_PUBLIC_KEY_CONTENT" >> ~/.ssh/authorized_keys
```

---

### **3. Application Secrets**

#### `POSTGRES_PASSWORD`
- **Value**: Strong password for PostgreSQL database
- **Used for**: Database authentication
- **Generate**: 
```bash
openssl rand -base64 32
```

#### `API_KEY_SECRET`
- **Value**: Secret key for API authentication/signing
- **Used for**: JWT signing, API key generation
- **Generate**:
```bash
openssl rand -hex 64
```

---

## 🚀 Quick Setup Script

Run this locally to generate all secrets:

```bash
#!/bin/bash

echo "🔐 DAON GitHub Secrets Generation"
echo "=================================="
echo ""

# Generate SSH key
echo "1️⃣ Generating SSH deployment key..."
ssh-keygen -t ed25519 -C "github-actions-daon" -f ~/.ssh/daon_deploy_key -N ""
echo "✅ SSH key generated"
echo ""

# Generate passwords
echo "2️⃣ Generating secure passwords..."
POSTGRES_PASSWORD=$(openssl rand -base64 32)
API_KEY_SECRET=$(openssl rand -hex 64)
echo "✅ Passwords generated"
echo ""

# Display results
echo "=================================="
echo "📋 Copy these values to GitHub Secrets:"
echo "=================================="
echo ""
echo "DOCKERHUB_USERNAME:"
echo "  → Go to Docker Hub and get your username"
echo ""
echo "DOCKERHUB_TOKEN:"
echo "  → Go to https://hub.docker.com/settings/security"
echo "  → Create new access token"
echo ""
echo "SERVER_HOST:"
read -p "  → Enter your server IP or domain: " SERVER_HOST
echo "  Value: $SERVER_HOST"
echo ""
echo "SERVER_USER:"
read -p "  → Enter your server SSH username (e.g., root, ubuntu): " SERVER_USER
echo "  Value: $SERVER_USER"
echo ""
echo "SERVER_SSH_KEY:"
echo "  → Copy the ENTIRE content below (including BEGIN/END lines):"
cat ~/.ssh/daon_deploy_key
echo ""
echo "POSTGRES_PASSWORD:"
echo "  Value: $POSTGRES_PASSWORD"
echo ""
echo "API_KEY_SECRET:"
echo "  Value: $API_KEY_SECRET"
echo ""
echo "=================================="
echo "3️⃣ Add public key to server:"
echo "=================================="
echo ""
echo "Run this command to add the public key to your server:"
echo "ssh-copy-id -i ~/.ssh/daon_deploy_key.pub $SERVER_USER@$SERVER_HOST"
echo ""
echo "OR manually add this to ~/.ssh/authorized_keys on server:"
cat ~/.ssh/daon_deploy_key.pub
echo ""
```

Save this as `generate-secrets.sh`, make it executable, and run:
```bash
chmod +x generate-secrets.sh
./generate-secrets.sh
```

---

## 🎯 Adding Secrets to GitHub

### **Method 1: GitHub Web UI**
1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret one by one

### **Method 2: GitHub CLI (faster)**
```bash
# Install GitHub CLI if needed
brew install gh  # macOS
# or: https://cli.github.com/

# Login
gh auth login

# Add secrets (run from your repo directory)
gh secret set DOCKERHUB_USERNAME
gh secret set DOCKERHUB_TOKEN
gh secret set SERVER_HOST
gh secret set SERVER_USER
gh secret set SERVER_SSH_KEY < ~/.ssh/daon_deploy_key
gh secret set POSTGRES_PASSWORD
gh secret set API_KEY_SECRET
```

---

## ✅ Verification Checklist

Once all secrets are added, verify:

- [ ] **DOCKERHUB_USERNAME** - Your Docker Hub username
- [ ] **DOCKERHUB_TOKEN** - Access token from Docker Hub
- [ ] **SERVER_HOST** - Server IP or domain
- [ ] **SERVER_USER** - SSH username  
- [ ] **SERVER_SSH_KEY** - Private SSH key (with public key on server)
- [ ] **POSTGRES_PASSWORD** - Generated strong password
- [ ] **API_KEY_SECRET** - Generated secret key

---

## 🔥 Test Deployment

Once secrets are configured:

1. **Push to main branch**:
```bash
git add .
git commit -m "feat: configure deployment pipeline"
git push origin main
```

2. **Watch the deployment**:
- Go to repository → **Actions** tab
- Watch the "Deploy DAON Production" workflow

3. **Manual trigger** (if needed):
- Go to **Actions** tab
- Select "Deploy DAON Production"
- Click "Run workflow"

---

## 🚨 Security Best Practices

### **DO:**
✅ Use strong, randomly generated passwords  
✅ Use SSH keys instead of passwords  
✅ Rotate secrets regularly (every 90 days)  
✅ Use separate keys for different environments  
✅ Never commit secrets to git  

### **DON'T:**
❌ Share secrets in Slack/email  
❌ Use the same password for multiple services  
❌ Commit `.env` files with real secrets  
❌ Use weak passwords like "password123"  
❌ Share SSH keys between team members  

---

## 🔄 Rotating Secrets

When you need to rotate secrets:

1. **Generate new secret** (use commands above)
2. **Update GitHub Secret** in repository settings
3. **Update on server** if needed (e.g., database password)
4. **Trigger redeploy** to use new secrets

---

## 🆘 Troubleshooting

### **"Permission denied (publickey)"**
- Public key not added to server
- Wrong username in `SERVER_USER`
- Private key not matching public key on server

**Fix**: Run `ssh-copy-id` again or manually add public key to server

### **"Docker login failed"**
- Wrong Docker Hub username or token
- Token expired or invalid

**Fix**: Generate new token and update `DOCKERHUB_TOKEN`

### **"Database connection failed"**
- `POSTGRES_PASSWORD` mismatch
- Database not initialized

**Fix**: SSH to server, reset database password

---

## 📞 Need Help?

If deployment fails:
1. Check **Actions** tab for detailed logs
2. SSH to server: `ssh user@server-ip`
3. Check logs: `docker-compose logs api-server`
4. Verify secrets are set: GitHub → Settings → Secrets

---

**🎉 Once configured, every push to `main` will automatically deploy to production!**