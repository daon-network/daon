# 🛡️ DAON Creator Onboarding Guide
## Protect Your Work in Minutes, Not Hours

### Welcome, Creator! 

**You've spent countless hours creating. Now protect that work from AI exploitation in just a few minutes.**

---

## 🎯 Quick Start (Choose Your Path)

### Path 1: **I Use WordPress** (2 minutes)
1. Install the "DAON Creator Protection" plugin
2. Activate and choose "Liberation License" 
3. Done! All new posts automatically protected

**[Download WordPress Plugin →](../wordpress-plugin/)**

### Path 2: **I Use AO3** (Web tool - 5 minutes)  
1. Sign in at app.daon.network
2. Paste a work you have published
3. Choose your licence terms
4. The work now has blockchain protection

**[Register a work →](https://app.daon.network)**

> **There is no DAON browser extension.** One was considered and rejected: it
> would have to keep your signing key in ordinary browser storage, and the web
> store can update it silently for everyone at once. If you are offered a "DAON
> extension", it is not from us.

### Path 3: **I Have Lots of Existing Work** (10 minutes)
1. Download the bulk protection tool
2. Export your works (JSON, files, whatever format)
3. Run: `python simple-bulk-protector.py my_works/`
4. Hundreds of works protected automatically

**[Download Bulk Tool →](../creator-tools/)**

### Path 4: **I'm On Another Platform**
We have SDKs for almost everything. Check if your platform has DAON integration, or ask them to add it!

**[See All Platforms →](../integration-demos/)**

---

## 🛡️ What You Get

### **Immediate Benefits**
- **Cryptographic ownership proof** that travels with your work
- **Legal standing** if someone steals your content
- **AI exploitation blocking** via Liberation License
- **Cross-platform protection** - works everywhere

### **Technical Details** (Optional Reading)
- Content gets a unique SHA-256 hash stored on blockchain
- Tamper-proof timestamp proving when you created it
- Works across platform changes, site failures, etc.
- No personal data stored - just the content fingerprint

### **License Options**
- **Liberation License v1.0** (Recommended) - Blocks corporate AI training without compensation
- **Creative Commons BY-NC** - Traditional attribution + non-commercial  
- **All Rights Reserved** - Full copyright protection
- **Custom License** - Whatever terms you want

---

## 📋 Step-by-Step Guide

### **For New Creators**

#### Step 1: Choose Your License
**Most creators choose Liberation License because:**
- ✅ Allows personal use, education, humanitarian purposes
- ❌ Blocks corporate AI training without compensation  
- ❌ Blocks commercial exploitation without permission
- ✅ Gives you legal tools to fight violations

#### Step 2: Protect As You Create
- Install the platform plugin for where you publish
- Protection happens automatically as you publish
- Green shield means you're protected
- Orange warning means vulnerability

#### Step 3: Verify Protection
- Click verification links to see blockchain proof
- Share verification URLs to prove ownership
- Use in legal situations if violations occur

### **For Existing Creators** 

#### Step 1: Export Your Works
**WordPress:** Use export tool (WP Admin → Tools → Export)
**AO3:** Request data download (Account → Privacy → Request Data)  
**Other Platforms:** Save works as text files in a folder

#### Step 2: Run Bulk Protection
```bash
# Download protection tool
wget https://daon.network/tools/simple-bulk-protector.py

# Protect your works
python simple-bulk-protector.py my_exported_works/

# Options:
# --dry-run          Test without actually protecting
# --license cc_by_nc Choose different license
# --help             See all options
```

#### Step 3: Set Up Future Protection
Install the platform plugin for where you publish, so new works get protected automatically.

---

## 🎨 Platform-Specific Instructions

### **WordPress Bloggers**
1. **Install Plugin:** Search "DAON Creator Protection" in WP Admin
2. **Configure:** Settings → DAON Protection
3. **Choose:** Enable auto-protection + Liberation License
4. **Result:** All new posts automatically protected

**Protects:** Blog posts, pages, custom post types
**Time:** 2 minutes setup, automatic forever

### **AO3 Fanfiction Writers**  
1. **Web tool:** Sign in at app.daon.network
2. **Paste:** One published work at a time
3. **Protect:** Choose licence terms and register
4. **Bulk Protect:** Use the bulk tool for many works at once

**Protects:** Fanfiction, original fiction, poetry
**Time:** 30 seconds per work, or bulk protect hundreds

### **Medium/Substack Writers**
1. **Copy Content:** Select and copy your published article
2. **Use Web Tool:** Visit app.daon.network  
3. **Paste & Protect:** Choose license and protect
4. **Save Verification:** Keep blockchain proof link

**Protects:** Articles, newsletters, essays
**Time:** 1 minute per article

### **Academic Researchers**
1. **Export Papers:** From institutional repository or personal files
2. **Bulk Tool:** Use with CC-BY-NC license (standard for academia)  
3. **Verify:** Share blockchain verification with citation
4. **Prevent:** Stops commercial AI training on your research

**Protects:** Papers, preprints, dissertations
**Time:** Bulk protect entire research portfolio

### **Social Media Creators**
1. **Screenshot/Copy:** Save your original content  
2. **Text Files:** Convert to .txt files in folder
3. **Bulk Protect:** Run protection tool on folder
4. **Evidence:** Now have proof you created content first

**Protects:** Tweet threads, Instagram captions, TikTok scripts
**Time:** 5 minutes for hundreds of posts

---

## 🔍 FAQ

### **"Is this really free?"**
Yes, completely free. No subscriptions, no limits, no hidden costs. Creator protection should be accessible to everyone.

### **"What if I don't trust blockchain?"**
You don't have to! DAON just stores a cryptographic fingerprint, not your content. Your work stays exactly where it is.

### **"Will this slow down my website?"**
No. Protection happens in the background after publishing. Zero impact on site speed or visitor experience.

### **"What if DAON disappears?"**
Your protection records are stored on a distributed blockchain with validators worldwide. No single point of failure.

### **"Can I remove protection later?"**
You can stop protecting new work anytime. Existing protection records are permanent (that's the point - proof can't be erased).

### **"Does this work internationally?"**
Yes! DAON is hosted in Europe under GDPR protection, and blockchain records are global and immutable.

### **"What about fair use?"**
Liberation License explicitly allows fair use, education, research, and personal use. It only blocks commercial exploitation without compensation.

### **"How do I prove someone violated my work?"**
The blockchain record provides cryptographic proof you created the content first. This is admissible evidence in court proceedings.

---

## Success Stories

None yet. This section carried four accounts from creators who do not exist --
one referencing a lawsuit, another an AI company caught scraping. They are gone.

If DAON is useful to you and you are willing to be named, open an issue.

---

## 🎯 Get Started Right Now

### **1 Minute Quick Start:**
- **WordPress Users:** [Install Plugin](../wordpress-plugin/)
- **AO3 Users:** [Register a work](https://app.daon.network)  
- **Everyone Else:** [Download Bulk Tool](../creator-tools/)

### **Need Help?**
- **Email Support:** creators@daon.network
- **Documentation:** https://daon.network
- **Status:** https://api.daon.network/health

### **Spread the Word**
- **Twitter:** Share your protection status
- **Discord:** Join the creator protection community  
- **Platforms:** Ask your platform to add DAON integration
- **Friends:** Help other creators get protected

---

## ⚔️ Why This Matters

### **The Problem**
- AI companies are scraping **billions** of creative works without permission
- Creators get **zero compensation** for training the AI that might replace them
- No legal recourse because **no proof** of creation date or ownership
- Your work fuels **billion-dollar AI companies** while you get nothing

### **The Solution**
- **DAON provides cryptographic proof** you created your work first
- **Liberation License blocks** corporate exploitation without compensation
- **Legal standing** to fight violations with real evidence
- **Community of protected creators** supporting each other

### **The Future**  
- **Every creator protected** by blockchain verification
- **AI companies forced** to compensate creators fairly
- **Culture stays in creators' control**, not corporate exploitation
- **Creative work valued** instead of stolen

---

## 🔥 Ready to Protect Your Work?

### **The Time Is Now**
Every day you wait is more potential exploitation of your unprotected work.

### **It Takes 2 Minutes**
Seriously. Install plugin, activate protection, done forever.

### **Join the Movement**  
DAON is early. If it is useful to you, the project would benefit from hearing so.

---

**[🛡️ PROTECT YOUR WORK NOW →](https://daon.network/get-started)**

*Every protected work is a victory against exploitation.*  
*Every creator matters.*  
*Every line of code is an act of revolution.*

🛡️ **DAON: Creator Rights Guardian**