---
layout: default
title: "Browser Extension Guide"
description: "Protect your creative work on any website with DAON browser extension"
---

# 🌐 Browser Extension Guide

**Protect your creative work instantly on any website with our browser extension.**

---

## 🚀 Quick Installation

### 1. Install Extension
```
Chrome Web Store: "DAON Creator Protection"
Firefox Add-ons: "DAON Creator Protection"
Edge Add-ons: "DAON Creator Protection"
```

### 2. Grant Permissions
- **Active tab access** - To detect creative content
- **Storage permission** - To remember your protection settings
- **API access** - To communicate with DAON blockchain

### 3. Start Protecting
The shield icon appears automatically when the extension detects protectable content.

---

## 🛡️ Supported Platforms

### **Fanfiction Platforms**
- ✅ **Archive of Our Own (AO3)** - Automatic work detection
- ✅ **FanFiction.Net** - Story and chapter protection
- ✅ **Wattpad** - Story protection support
- ✅ **Custom platforms** - Manual content selection

### **Blogging Platforms**
- ✅ **Medium** - Article protection
- ✅ **Substack** - Newsletter and post protection
- ✅ **Dev.to** - Technical article protection
- ✅ **Blogger** - Blog post protection

### **Social Platforms**
- ✅ **Twitter** - Thread protection
- ✅ **Reddit** - Long-form post protection
- ✅ **LinkedIn** - Article protection
- ✅ **Any website** - Manual text selection

---

## 🎯 How to Use

### **Automatic Detection (AO3/FFN)**
1. **Visit your work** - Extension automatically detects fanfiction
2. **See shield icon** - Green shield = ready to protect
3. **Click to protect** - One click adds blockchain protection
4. **Get verification** - Receive proof URL immediately

### **Manual Protection (Any Site)**
1. **Select content** - Highlight text you want to protect
2. **Right-click menu** - Choose "Protect with DAON"
3. **Add metadata** - Title, author, description
4. **Choose license** - Liberation License recommended
5. **Confirm protection** - Get blockchain verification

### **Bulk Protection**
1. **Bulk mode** - Enable in extension settings
2. **Navigate works** - Visit multiple works in tabs
3. **Batch protect** - Protect all open tabs at once
4. **Progress tracking** - See protection status

---

## ⚙️ Extension Settings

### **Protection Preferences**
```
Default License: Liberation License v1.0
Auto-protect detected works: ✅
Show protection badges: ✅
Save verification URLs: ✅
Enable bulk mode: □
```

### **Platform Settings**
```
AO3 Integration:
├── Auto-detect works ✅
├── Protect on publish ✅  
├── Include work metadata ✅
└── Show in work header ✅

FFN Integration:
├── Chapter-by-chapter ✅
├── Complete story mode ✅
└── Author note inclusion □
```

### **Privacy Settings**
```
Data Storage:
├── Save protection history ✅
├── Remember license preferences ✅
├── Store verification URLs ✅
└── Anonymous mode □
```

---

## 📋 Protection Workflow

### **For AO3 Writers**
1. **Publish work** on AO3 as normal
2. **Extension detects** your published work automatically
3. **Shield icon appears** in browser toolbar (green = ready)
4. **Click shield** to add DAON protection
5. **Verification appears** in work header with link

### **For General Content**
1. **Create content** on any platform
2. **Select text** you want to protect
3. **Right-click** and choose "Protect with DAON"
4. **Fill metadata** (title, author, etc.)
5. **Choose license** and confirm protection

### **Bulk Protection Flow**
1. **Enable bulk mode** in extension settings
2. **Open multiple tabs** with works to protect
3. **Click bulk protect** in extension popup
4. **Monitor progress** as each tab gets protected
5. **Download report** with all verification URLs

---

## 🔧 Technical Details

### **Content Detection**
```javascript
// Automatic detection for supported platforms
const detectors = {
    'archiveofourown.org': detectAO3Work,
    'fanfiction.net': detectFFNStory,
    'medium.com': detectMediumArticle,
    'wattpad.com': detectWattpadStory
};

// Manual selection for any site
document.addEventListener('selectionchange', detectSelection);
```

### **Protection API**
```javascript
// Extension to DAON API communication
const protection = await daon.protect({
    content: selectedText,
    metadata: {
        title: workTitle,
        author: authorName,
        url: currentURL,
        platform: detectPlatform()
    },
    license: userPreferences.defaultLicense
});
```

### **Data Storage**
```
Local Storage:
├── Protection history (URLs + hashes)
├── User preferences 
├── License defaults
└── Platform settings

Sync Storage:
├── Cross-browser settings sync
├── Protection badge preferences  
└── Bulk mode configurations
```

---

## 🎨 UI Components

### **Shield Icon States**
```
🛡️ Green: Content detected, ready to protect
🟡 Yellow: Protection in progress
✅ Green check: Successfully protected
❌ Red X: Protection failed
⚪ Gray: No content detected
```

### **Protection Modal**
```html
<!-- Appears when protecting content -->
<div class="daon-protection-modal">
    <h3>🛡️ Protect Your Content</h3>
    
    <input type="text" placeholder="Content title" />
    <input type="text" placeholder="Author name" />
    <textarea placeholder="Description (optional)"></textarea>
    
    <select name="license">
        <option value="liberation_v1">Liberation License v1.0</option>
        <option value="cc_by_nc">CC BY-NC</option>
        <option value="all_rights">All Rights Reserved</option>
    </select>
    
    <button class="protect-btn">🛡️ Protect Now</button>
</div>
```

### **Protection Badge**
```html
<!-- Automatically inserted into protected content -->
<div class="daon-protection-notice">
    🛡️ Protected by DAON | 
    <a href="verification-url" target="_blank">Verify</a> |
    <span class="protection-date">Protected: March 15, 2024</span>
</div>
```

---

## 📊 Success Stories

### **AO3 Fanfiction Writer**
> *"Protected 847 fanfics in 20 minutes using bulk mode. Now I have blockchain proof I wrote them before any AI company trained on them."*

### **Medium Writer**
> *"Extension caught someone copying my articles. The verification URLs provided perfect evidence for DMCA takedown."*

### **Twitter Thread Creator**
> *"Now I protect all my viral threads. When someone stole one for a paid course, I had timestamped proof it was mine."*

---

## 🛠️ Installation Guide

### **Chrome Installation**
1. Visit [Chrome Web Store](https://chrome.google.com/webstore/)
2. Search "DAON Creator Protection"
3. Click "Add to Chrome"
4. Grant permissions when prompted
5. Look for shield icon in toolbar

### **Firefox Installation**  
1. Visit [Firefox Add-ons](https://addons.mozilla.org/)
2. Search "DAON Creator Protection"
3. Click "Add to Firefox"
4. Approve permissions
5. Extension ready to use

### **Edge Installation**
1. Visit [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/)
2. Search "DAON Creator Protection"
3. Click "Get"
4. Allow permissions
5. Start protecting content

---

## 🔍 FAQ

### **"Does this work on mobile browsers?"**
Not yet. Mobile extensions are planned for 2024. Use the web tool at protect.daon.network for mobile protection.

### **"Can it detect AI-generated content?"**
No, DAON protects human-created content. It doesn't detect or flag AI content.

### **"What data does the extension collect?"**
Only content you choose to protect and basic metadata. No personal browsing data is collected.

### **"Does it work offline?"**
Protection requires internet connection. The extension can queue protections for when you're back online.

### **"Can I protect content I didn't write?"**
Only protect content you own or have permission to protect. Protecting others' work without permission violates terms of service.

---

## 📥 Download & Support

<div class="download-section">

**[🌐 Chrome Extension](https://chrome.google.com/webstore/detail/daon-creator-protection/)**

**[🦊 Firefox Add-on](https://addons.mozilla.org/en-US/firefox/addon/daon-creator-protection/)**

**[📘 Documentation](https://github.com/daon-network/browser-extension)**

**[💬 Get Support](https://discord.gg/daon)**

**[🐛 Report Bug](https://github.com/daon-network/browser-extension/issues)**

</div>

---

**Install today and start protecting your creative work instantly. Every protected work fights exploitation.** 🛡️