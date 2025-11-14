---
layout: default
title: "WordPress Plugin Guide"
description: "Complete guide to protecting your WordPress blog posts with DAON"
---

# 🔌 WordPress Plugin Guide

**Protect all your blog posts automatically with one-click installation.**

---

## 🚀 Quick Installation

### 1. Download & Install
```bash
# Option 1: WordPress Admin Dashboard
# Go to Plugins → Add New → Search "DAON Creator Protection"

# Option 2: Direct Download
wget https://github.com/daon-network/daon/raw/main/wordpress-plugin/daon-creator-protection.zip
```

### 2. Configure Protection
1. **Activate Plugin** - Go to Plugins → Activate "DAON Creator Protection"
2. **Settings** - Navigate to Settings → DAON Protection
3. **Choose License** - Select "Liberation License v1.0" (recommended)
4. **Auto-Protection** - Enable "Protect new posts automatically"

### 3. Done!
All new blog posts are now automatically protected against AI exploitation.

---

## 🛡️ What Gets Protected

### **Automatic Protection**
- ✅ **Blog Posts** - All new posts protected on publish
- ✅ **Pages** - Static pages get protection too
- ✅ **Custom Post Types** - Works with any content type
- ✅ **Content Updates** - Re-protection on major edits

### **Protection Details**
- **Cryptographic Hash** - SHA-256 fingerprint stored on blockchain
- **Timestamp** - Proof of when you published first
- **Liberation License** - Blocks AI training without compensation
- **Verification URL** - Shareable proof of ownership

---

## ⚙️ Plugin Configuration

### **Settings Panel**

```php
// Settings accessible via WordPress Admin
Settings → DAON Protection

Options:
├── Auto-protect new posts ✅ (Recommended)
├── License type: Liberation License v1.0
├── Show protection badges ✅ 
├── Include in RSS feeds ✅
└── Bulk protect existing posts
```

### **Protection Badges**
Display protection status on your posts:
```html
<!-- Automatically added to post content -->
<div class="daon-protection-badge">
  🛡️ Protected by DAON | <a href="verification-url">Verify</a>
</div>
```

### **Bulk Protection**
Protect all existing posts at once:
1. Go to **DAON Protection** → **Bulk Protection**
2. Select posts to protect (or "All Posts")
3. Choose license type
4. Click "Protect Selected Posts"
5. Process runs in background

---

## 🎯 Usage Examples

### **For Personal Blogs**
```
Perfect for:
- Personal writing and stories
- Opinion articles and essays  
- Photography portfolios
- Recipe blogs and tutorials

Protection: Liberation License blocks AI training
Legal: Full ownership proof for your content
```

### **For Business Blogs**
```
Ideal for:
- Company blog posts
- Marketing content
- Product documentation
- Industry insights

Protection: Prevents unauthorized commercial use
Legal: Strong IP protection for business content
```

### **For News/Magazine Sites**
```
Essential for:
- News articles and reporting
- Editorial content
- Investigative pieces
- Column writing

Protection: Prevents AI scraping for training
Legal: Maintains content ownership rights
```

---

## 📋 Technical Details

### **Plugin Architecture**
```php
// Core protection hook
add_action('save_post', 'daon_auto_protect_post');

function daon_auto_protect_post($post_id) {
    if (get_option('daon_auto_protect')) {
        $content = get_post_field('post_content', $post_id);
        $metadata = [
            'title' => get_the_title($post_id),
            'author' => get_the_author_meta('display_name'),
            'url' => get_permalink($post_id)
        ];
        
        daon_protect_content($content, $metadata);
    }
}
```

### **Database Storage**
```sql
-- Additional post meta fields
wp_postmeta:
├── _daon_protected (boolean)
├── _daon_hash (string) 
├── _daon_verification_url (string)
└── _daon_protection_date (datetime)
```

### **API Integration**
The plugin connects to DAON's API:
- **Endpoint**: `https://api.daon.network/v1/protect`
- **Authentication**: Site-specific API key
- **Rate Limits**: 1000 protections/month (free tier)

---

## 🛠️ Customization

### **Theme Integration**
Display protection status in your theme:
```php
<?php
// In single.php or content.php
if (daon_is_protected(get_the_ID())) {
    echo '<div class="protection-notice">';
    echo '🛡️ This content is protected by DAON';
    echo '<a href="' . daon_get_verification_url(get_the_ID()) . '">Verify Protection</a>';
    echo '</div>';
}
?>
```

### **Custom Styling**
```css
/* Add to your theme's style.css */
.daon-protection-badge {
    background: #d4edda;
    border: 1px solid #c3e6cb;
    border-radius: 6px;
    padding: 10px;
    margin: 20px 0;
    color: #155724;
    font-size: 14px;
}

.daon-verification-link {
    color: #007bff;
    text-decoration: none;
}
```

### **Hook System**
```php
// Custom actions for developers
do_action('daon_before_protection', $post_id);
do_action('daon_after_protection', $post_id, $protection_result);
do_action('daon_protection_failed', $post_id, $error);

// Filter protection metadata
$metadata = apply_filters('daon_protection_metadata', $metadata, $post_id);
```

---

## 🔍 FAQ

### **"Will this slow down my site?"**
No. Protection happens asynchronously after publishing. Zero impact on visitor experience.

### **"What if I don't want to protect a specific post?"**
Use the "Skip DAON Protection" checkbox in the post editor, or disable auto-protection and protect manually.

### **"Can I change licenses for different post types?"**
Yes. Configure different licenses for posts, pages, and custom post types in the settings.

### **"What happens if DAON is down?"**
Protection requests are queued and retried automatically. Your site continues working normally.

### **"Does this work with caching plugins?"**
Yes, fully compatible with WP Rocket, W3 Total Cache, WP Super Cache, etc.

### **"Can I protect posts retroactively?"**
Yes, use the bulk protection tool to protect all existing content at once.

---

## 📊 Success Stories

> **"Installed the plugin in 2 minutes. Three months later, I discovered someone was scraping my blog for AI training. Now I have legal proof to fight it."**  
> — WordPress blogger, 10,000+ monthly visitors

> **"Bulk protected 847 blog posts from 5 years of writing. The peace of mind is incredible."**  
> — Travel blogger

> **"Our company blog is now fully protected. Clients love seeing the protection badges - it shows we care about IP."**  
> — B2B SaaS company

---

## 🛠️ Installation Troubleshooting

### **Common Issues**

**Plugin won't activate:**
- Check PHP version (7.4+ required)
- Verify WordPress version (5.0+ required)
- Ensure cURL extension is enabled

**Protection not working:**
- Check API key in settings
- Verify internet connectivity
- Check WordPress debug logs

**Badge not showing:**
- Clear cache (if using caching plugin)
- Check theme compatibility
- Verify badge display is enabled in settings

### **Support Resources**
- [Plugin Documentation](https://github.com/daon-network/wordpress-plugin)
- [Discord #wordpress](https://discord.gg/daon)
- [Email Support](mailto:wordpress@daon.network)

---

## 🔗 Download Links

<div class="download-section">

**[📥 Download Plugin](https://github.com/daon-network/daon/raw/main/wordpress-plugin/daon-creator-protection.zip)**

**[📖 Full Documentation](https://github.com/daon-network/wordpress-plugin/blob/main/README.md)**

**[💬 Get Support](https://discord.gg/daon)**

**[🐛 Report Issues](https://github.com/daon-network/wordpress-plugin/issues)**

</div>

---

**Protect your WordPress blog today. Every protected post is a victory against exploitation.** 🛡️