# 🛡️ DAON Browser Extension

**Creator Protection for the Digital Age**

## What It Does

The DAON Browser Extension provides **instant protection** for fanfiction creators on Archive of Our Own (AO3) by:

- **Detecting AO3 works** automatically when you visit work pages
- **Generating cryptographic hashes** of your content for tamper-proof ownership
- **Registering with DAON blockchain** for permanent protection records
- **Fighting AI exploitation** with Liberation License enforcement
- **Providing verification tools** to prove your ownership anywhere

## Installation

### From Source (Development)
1. Download/clone this extension folder
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked" and select this folder
5. The DAON shield icon should appear in your browser toolbar

### From Chrome Web Store (Coming Soon)
The extension will be published to the Chrome Web Store once we complete beta testing.

## How It Works

### For Creators:
1. **Visit any AO3 work page** you've written
2. **DAON widget appears** automatically in the corner
3. **Click "Protect with DAON"** to register your work
4. **Choose your license** (Liberation License recommended)
5. **Get blockchain proof** of ownership that travels with your work

### For Readers:
1. **Click the DAON extension icon** on any AO3 work
2. **Verify protection status** to see if the creator is protected
3. **Respect creator licenses** and support protected works
4. **Report AI scraping** when you find violations

## Features

### 🛡️ Instant Protection
- One-click registration with DAON blockchain
- Automatic content fingerprinting
- Tamper-proof ownership records

### ⚖️ Liberation License
- Blocks corporate AI training without compensation
- Allows personal use, education, and humanitarian purposes
- Automatic compliance checking

### 🔍 Verification Tools
- Check protection status of any work
- Generate blockchain proofs for legal cases
- Verify ownership across platforms

### 🌍 Global Network
- Protected by European GDPR laws
- Hosted in Germany for creator-friendly jurisdiction
- Decentralized blockchain prevents single point of failure

## License Options

### Liberation License v1.0 (Recommended)
- **Allows:** Personal use, education, research, humanitarian purposes
- **Blocks:** Corporate profit extraction without creator compensation
- **Best for:** Fanfiction and creative works that fight AI exploitation

### Creative Commons Variants
- **CC BY-NC:** Attribution required, non-commercial use only
- **CC BY-NC-SA:** Attribution + non-commercial + share-alike
- **Best for:** Educational content and collaborative works

### All Rights Reserved
- Traditional copyright protection
- Creator retains all rights
- **Best for:** Professional works and commercial content

## Privacy & Security

### What We Collect:
- **Content hashes only** (not the actual content)
- **Metadata you choose to include** (title, author, tags)
- **Blockchain transaction records** (public by design)

### What We Don't Collect:
- **Your actual fanfiction content** (only hashes for verification)
- **Personal information** beyond what you voluntarily provide
- **Browsing history** outside of AO3 work pages
- **Any data for commercial purposes**

### Security Measures:
- **Local wallet generation** (keys never leave your device)
- **Encrypted storage** of sensitive data
- **German GDPR protection** for EU creator rights
- **Open-source codebase** for transparency

## Technical Details

### Blockchain Integration
- **Cosmos SDK-based** DAON blockchain for scalability
- **REST API** for lightweight browser integration
- **gRPC support** for high-performance applications
- **Multi-platform SDKs** for universal compatibility

### Browser Support
- **Chrome/Chromium** (primary support)
- **Firefox** (coming soon)
- **Safari** (planned)
- **Edge** (Chromium-based, should work)

### Performance
- **Minimal resource usage** - only activates on AO3 pages
- **Background processing** for blockchain operations
- **Local caching** for faster protection checks
- **Offline mode** with sync when connection restored

## Developer Guide

### Architecture
```
Content Script -> Background Script -> DAON API -> Blockchain
     ↓               ↓                  ↓            ↓
AO3 Page Data -> Extension Storage -> REST API -> Cosmos SDK
```

### Key Files:
- `content.js` - Extracts work data from AO3 pages
- `background.js` - Handles DAON blockchain communication
- `popup.js` - Extension UI and user interactions
- `manifest.json` - Extension configuration and permissions

### Building for Production:
1. Update version in `manifest.json`
2. Test on multiple Chrome versions
3. Package as `.zip` for Chrome Web Store
4. Submit for review with creator protection documentation

## Roadmap

### Phase 1 (Current) - MVP Protection
- [x] Basic AO3 integration
- [x] DAON blockchain registration
- [x] Liberation License support
- [x] Wallet generation and management

### Phase 2 - Enhanced Features
- [ ] Multi-platform support (FictionPress, Wattpad, etc.)
- [ ] Bulk protection for existing works
- [ ] Advanced license customization
- [ ] Creator verification badges

### Phase 3 - Legal Integration
- [ ] Automated DMCA generation
- [ ] Legal case documentation tools
- [ ] Integration with creator rights organizations
- [ ] AI training compliance monitoring

## Support

### For Creators:
- **Email:** support@daon.network
- **Documentation:** https://docs.daon.network
- **Community:** Discord server (link in documentation)

### For Developers:
- **GitHub:** https://github.com/daon-network/browser-extension
- **API Docs:** https://api.daon.network/docs
- **SDK Examples:** https://github.com/daon-network/sdks

## Legal

### Extension License:
MIT License - Free for everyone to use and modify

### Creator Protection:
This extension helps creators assert their rights under:
- **Copyright law** (automatic protection)
- **GDPR** (EU data rights)
- **Liberation License** (anti-exploitation terms)
- **German creator-friendly courts** (jurisdiction)

---

## 🚀 Join the Revolution

**Every line of code is an act of revolution.**

Help us build the infrastructure that puts creators back in control of their work.

**Download. Protect. Fight back.**

🛡️ **DAON: Creator Rights Guardian**