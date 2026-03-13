---
layout: default
title: "Two-Factor Authentication (2FA) Setup Guide"
description: "Complete guide to setting up two-factor authentication for your DAON account"
---

# Two-Factor Authentication (2FA) Setup Guide

Two-factor authentication (2FA) adds an extra layer of security to your DAON account by requiring both your password and a time-based code from your authenticator app to sign in.

## Why Enable 2FA?

2FA significantly improves your account security by requiring two forms of verification:

1. **Something you know** - Your password or magic link
2. **Something you have** - Your phone with the authenticator app

Even if someone discovers your password, they cannot access your account without your authenticator app.

## Quick Setup Overview

1. Sign in to your DAON account
2. Navigate to the 2FA setup page
3. Scan the QR code with your authenticator app
4. Enter the 6-digit code to verify
5. Save your backup codes in a secure location
6. Complete setup and access your dashboard

## Choose Your Authenticator App

Select from one of these popular authenticator apps:

### Google Authenticator

**Platforms:** iOS, Android
**Best for:** Simple, no-frills 2FA

**Download:**
- [iOS App Store](https://apps.apple.com/app/google-authenticator/id388497605)
- [Google Play Store](https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2)

**Setup Steps:**
1. Download Google Authenticator from the App Store or Google Play
2. Open the app and tap the "+" button
3. Select "Scan a QR code"
4. Point your camera at the QR code shown on the DAON 2FA setup page
5. Enter the 6-digit code from the app to complete setup

---

### Authy

**Platforms:** iOS, Android, Desktop
**Best for:** Multi-device support and cloud backup

**Download:**
- [iOS App Store](https://apps.apple.com/app/authy/id494168017)
- [Google Play Store](https://play.google.com/store/apps/details?id=com.authy.authy)
- [Desktop App](https://authy.com/download/)

**Setup Steps:**
1. Download Authy from the App Store, Google Play, or authy.com
2. Create an Authy account if you haven't already
3. Tap the "+" button to add a new account
4. Select "Scan QR Code"
5. Scan the QR code shown on the DAON 2FA setup page
6. Enter the 6-digit code from Authy to complete setup

**Authy Benefits:**
- Cloud backup of your 2FA codes
- Multiple device synchronization
- Desktop app available
- More resistant to phone loss

---

### 1Password

**Platforms:** iOS, Android, Desktop, Browser Extension
**Best for:** Users who already use 1Password as their password manager

**Download:**
- [iOS App Store](https://apps.apple.com/app/1password/id1511601750)
- [Google Play Store](https://play.google.com/store/apps/details?id=com.onepassword.android)
- [Desktop Downloads](https://1password.com/downloads/)

**Setup Steps:**
1. Open 1Password and go to your vault
2. Create a new item or edit your DAON login
3. Click "Add One-Time Password"
4. Click "Scan QR Code" or enter the setup key manually
5. Scan the QR code shown on the DAON 2FA setup page
6. Enter the 6-digit code from 1Password to complete setup

**1Password Benefits:**
- Integrated with your password manager
- Automatic code autofill on supported sites
- Encrypted vault backup
- Family/team sharing options

---

### Microsoft Authenticator

**Platforms:** iOS, Android
**Best for:** Microsoft ecosystem users

**Download:**
- [iOS App Store](https://apps.apple.com/app/microsoft-authenticator/id983156458)
- [Google Play Store](https://play.google.com/store/apps/details?id=com.azure.authenticator)

**Setup Steps:**
1. Download Microsoft Authenticator from the App Store or Google Play
2. Open the app and tap "Add account"
3. Select "Other account (Google, Facebook, etc.)"
4. Tap "Scan a QR code"
5. Scan the QR code shown on the DAON 2FA setup page
6. Enter the 6-digit code from the app to complete setup

**Microsoft Authenticator Benefits:**
- Cloud backup with Microsoft account
- Works offline
- Passwordless sign-in for Microsoft services

---

### Bitwarden

**Platforms:** iOS, Android, Desktop, Browser Extension
**Best for:** Open-source enthusiasts and privacy-conscious users

**Download:**
- [iOS App Store](https://apps.apple.com/app/bitwarden/id1137397744)
- [Google Play Store](https://play.google.com/store/apps/details?id=com.x8bit.bitwarden)
- [Desktop Downloads](https://bitwarden.com/download/)

**Setup Steps:**
1. Open Bitwarden and go to your vault
2. Create a new item or edit your DAON login
3. In the "Authenticator Key (TOTP)" field, click the camera icon
4. Scan the QR code shown on the DAON 2FA setup page
5. Or manually enter the setup key provided
6. Enter the 6-digit code from Bitwarden to complete setup

**Bitwarden Benefits:**
- Open-source and auditable
- Self-hosting option available
- Premium features at low cost
- Strong encryption

---

## Detailed Setup Instructions

### Step 1: Access 2FA Setup

After creating your DAON account or signing in with a magic link, you'll be prompted to set up two-factor authentication.

### Step 2: Scan the QR Code

1. Open your chosen authenticator app
2. Look for an option to "Add Account" or "Scan QR Code"
3. Point your phone's camera at the QR code displayed on screen
4. The app will automatically detect and add your DAON account

**Can't scan the QR code?**
You can manually enter the setup key shown below the QR code:
1. In your authenticator app, choose "Enter key manually"
2. Copy the setup key from the DAON setup page
3. Paste it into your authenticator app
4. Ensure "Time-based" is selected (not "Counter-based")

### Step 3: Verify Your Setup

1. Your authenticator app will now display a 6-digit code that changes every 30 seconds
2. Enter the current 6-digit code in the verification field on the DAON setup page
3. Click "Verify and Enable 2FA"

**Important:** Make sure to enter the code before it expires. If the code changes while you're typing, use the new code.

### Step 4: Save Your Backup Codes

After successful verification, you'll receive 10 backup codes. These are critical for account recovery.

**What are backup codes?**
- Each backup code can be used once to sign in if you lose access to your authenticator app
- They're your safety net if you lose your phone or get a new device

**How to save them:**
1. Click "Download" to save as a text file
2. Or click "Copy" and paste into a password manager
3. Store them somewhere secure and accessible
4. Print a copy and store it in a safe place (optional)

**Never share your backup codes** - treat them like passwords.

### Step 5: Complete Setup

Click "Continue to Dashboard" to start using your DAON account with 2FA protection.

---

## Troubleshooting

### The 6-digit code doesn't work

**Solution:**
1. **Check your phone's time settings** - Authenticator apps rely on accurate time
   - Go to Settings → Date & Time
   - Enable "Set Automatically" or "Use Network-Provided Time"
2. **Wait for a new code** - Codes refresh every 30 seconds
3. **Re-scan the QR code** - Remove the DAON account from your app and add it again
4. **Try the manual key entry method** instead of scanning

### I lost my phone / authenticator app

**Solution:**
1. Use one of your backup codes to sign in
2. Once signed in, disable 2FA in your account settings
3. Set up 2FA again with your new device
4. Save your new backup codes

**Don't have backup codes?**
- Contact DAON support at support@daon.network
- You'll need to verify your identity through other means

### I'm getting "Invalid Code" errors

**Possible causes:**
- Phone time is not synchronized (most common)
- Using an old/expired code
- Typing the code incorrectly
- Account was removed and re-added multiple times

**Solutions:**
1. Enable automatic time synchronization on your phone
2. Ensure you're entering the current code (not the previous one)
3. Remove and re-add the DAON account in your authenticator app
4. Try entering the code more quickly

### The QR code won't scan

**Solution:**
1. **Increase screen brightness** - Make sure the QR code is clearly visible
2. **Try a different camera app** - Some authenticator apps have better scanning
3. **Use manual entry** - Copy the setup key and enter it manually
4. **Clean your camera lens** - Smudges can prevent scanning
5. **Adjust distance** - Move your phone closer or farther from the screen

### I changed phones and forgot to transfer my 2FA

**Solution:**
1. Use a backup code to sign in
2. Disable 2FA in your account settings
3. Set up 2FA on your new phone
4. Save your new backup codes

**Prevention:**
- Use an authenticator app with cloud backup (Authy, Microsoft Authenticator)
- Or use a password manager with 2FA support (1Password, Bitwarden)
- Keep backup codes in a secure, accessible location

---

## Best Practices

### Backup Codes
- ✅ Save backup codes immediately after setup
- ✅ Store them in multiple secure locations (password manager + printed copy)
- ✅ Test one backup code to ensure they work
- ❌ Don't store them in plain text files on your computer
- ❌ Don't share them with anyone
- ❌ Don't store them in email or cloud storage without encryption

### Authenticator App
- ✅ Use an app with cloud backup if you frequently change phones
- ✅ Consider setting up 2FA on multiple devices as backup
- ✅ Keep your authenticator app updated
- ❌ Don't rely solely on SMS-based 2FA (less secure)
- ❌ Don't take screenshots of QR codes (security risk)

### Account Security
- ✅ Enable 2FA on all accounts that support it
- ✅ Use unique, strong passwords for each account
- ✅ Store passwords in a password manager
- ✅ Review trusted devices regularly in account settings
- ❌ Don't use the same password across multiple sites
- ❌ Don't share your account credentials

---

## Frequently Asked Questions

### Do I need 2FA to use DAON?

Yes, DAON requires two-factor authentication for all accounts to ensure the highest level of security for your creative works and intellectual property.

### Can I use SMS-based 2FA instead?

No, DAON uses Time-based One-Time Passwords (TOTP) via authenticator apps for better security. SMS-based 2FA is vulnerable to SIM-swapping attacks and interception.

### What happens if I lose my backup codes?

If you lose both your authenticator app and backup codes, you'll need to contact DAON support to regain access to your account. This process requires identity verification and may take time. Always keep backup codes secure and accessible.

### Can I disable 2FA?

While logged in, you can disable 2FA in your account security settings. However, we strongly recommend keeping it enabled for maximum account protection.

### How many devices can I use for 2FA?

You can add your DAON account to multiple authenticator apps on different devices by scanning the same QR code during setup. This provides redundancy if you lose one device.

### What if I get a new phone?

**Before switching phones:**
1. Set up the authenticator app on your new phone
2. Scan the same QR code or transfer accounts using your app's migration feature
3. Verify the new device works before removing the old one

**After switching (if you forgot):**
1. Use a backup code to sign in
2. Set up 2FA on your new phone
3. Save new backup codes

### Are authenticator apps secure?

Yes, TOTP authenticator apps are considered very secure because:
- Codes are generated locally on your device (offline)
- Each code expires after 30 seconds
- Codes are mathematically generated based on a shared secret and current time
- They're not vulnerable to phishing or interception like SMS

### Can someone guess my 6-digit code?

No. With 1 million possible combinations and codes changing every 30 seconds, the probability of guessing correctly is negligible. Additionally, DAON implements rate limiting to prevent brute force attacks.

### What's the difference between TOTP and SMS 2FA?

**TOTP (Time-based One-Time Password):**
- Codes generated locally on your device
- Works offline
- Not vulnerable to SIM-swapping or SMS interception
- More secure

**SMS 2FA:**
- Codes sent via text message
- Requires cellular service
- Vulnerable to SIM-swapping attacks
- Can be intercepted
- Less secure

### Which authenticator app should I use?

Choose based on your needs:

- **Simplest:** Google Authenticator
- **Best backup:** Authy or Microsoft Authenticator (cloud sync)
- **Password manager users:** 1Password or Bitwarden
- **Privacy-focused:** Bitwarden (open source)
- **Multiple devices:** Authy (multi-device sync)

All apps provide the same level of security for code generation.

---

## Mobile-Specific Tips

### iOS (iPhone/iPad)

**Recommended apps:**
- 1Password (best integration with iOS)
- Google Authenticator (simple and reliable)
- Microsoft Authenticator (good for Microsoft users)

**Tips:**
- Enable Face ID/Touch ID in your authenticator app for quick access
- Use the camera control center widget for faster QR code scanning
- Add your authenticator app to your home screen for easy access

### Android

**Recommended apps:**
- Google Authenticator (native Android integration)
- Authy (best for multi-device support)
- Bitwarden (open source option)

**Tips:**
- Enable biometric authentication in your authenticator app
- Use Quick Settings tiles for faster access
- Keep Google Play Services updated for better security

---

## Need Help?

If you're having trouble setting up 2FA or have questions not covered in this guide:

- **Email Support:** support@daon.network
- **Discord Community:** [DAON Discord](https://discord.gg/daon) - #help channel
- **Documentation:** [docs.daon.network](https://docs.daon.network)

**For urgent account access issues:**
- Email: urgent@daon.network
- Include your account email and a description of the issue

---

## Additional Resources

- [Account Security Best Practices](/get-started/security)
- [Managing Trusted Devices](/get-started/trusted-devices)
- [API Authentication Guide](/api/authentication)
- [Privacy Policy](/legal/privacy)

---

**🛡️ Secure your creative works with confidence using DAON's two-factor authentication.**
