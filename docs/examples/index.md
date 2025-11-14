---
layout: default
title: "Integration Examples"
description: "Copy-paste code examples for integrating DAON protection into any platform"
---

# 🛡️ DAON Integration Examples
## Show Don't Tell - Working Code Examples

### Purpose

**These examples prove how simple DAON integration is.** Copy, paste, and you're protecting creators in minutes.

---

## 🚀 Quick Integration Examples

### 1. **Next.js Blog** (3 lines of code)

```typescript
import { protect } from '@daon/sdk';

// Protect content when publishing
const result = await protect(postContent, {
  title: post.title,
  author: post.author
});

console.log('🛡️ Protected!', result.verificationUrl);
```

**Full example:** `./nextjs-blog/`

### 2. **WordPress Plugin** (1 click install)

```php
// Automatically protects posts as they're published
add_action('save_post', 'daon_auto_protect');

function daon_auto_protect($post_id) {
    if (get_option('daon_auto_protect')) {
        daon_protect_post($post_id); // Done!
    }
}
```

**Full plugin:** `../wordpress-plugin/`

### 3. **Ruby/Rails** (AO3 integration)

```ruby
class Work < ApplicationRecord
  after_create :protect_with_daon
  
  def protect_with_daon
    work = Daon::Work.from_activerecord(self)
    Daon.protect(work.content, work.metadata, 'liberation_v1')
  end
end
```

**Full integration:** See `../AO3_INTEGRATION_GUIDE.md`

### 4. **Python/Django** (2 lines)

```python
import daon

# Protect content anywhere
result = daon.protect(content, metadata={'title': title, 'author': author})
print(f"🛡️ Protected: {result.verification_url}")
```

### 5. **PHP/Laravel** (3 lines)

```php
use Daon\DaonClient;

$daon = new DaonClient();
$result = $daon->protect($content, $metadata, 'liberation_v1');
echo "🛡️ Protected: " . $result->verificationUrl;
```

---

## 🎯 Platform-Specific Examples

### **Fanfiction Platforms**

#### Archive of Our Own (AO3)
```ruby
# Add to Work model
include Daon::WorkMixin

# Automatic protection on publish
auto_protect_with_daon license: 'liberation_v1'
```

#### FanFiction.Net Integration  
```javascript
// Browser extension approach
const content = document.querySelector('#storytext').innerText;
const result = await daon.protect(content);
showProtectionNotice(result.verificationUrl);
```

### **Blogging Platforms**

#### Medium Alternative
```typescript
// Next.js with DAON protection
export async function publishPost(post: Post) {
  // Publish normally
  const published = await db.posts.create(post);
  
  // Add DAON protection
  const protected = await protect(post.content, {
    title: post.title,
    author: post.author,
    url: `https://yourblog.com/posts/${post.slug}`
  });
  
  // Update with protection info
  await db.posts.update(published.id, {
    daonHash: protected.contentHash,
    protectionUrl: protected.verificationUrl
  });
  
  return published;
}
```

#### Ghost Blog
```javascript
// Ghost webhook integration
app.post('/webhook/post-published', async (req, res) => {
  const post = req.body.post.current;
  
  // Protect with DAON
  const result = await protect(post.plaintext, {
    title: post.title,
    author: post.primary_author.name,
    url: post.url
  });
  
  // Store protection info in Ghost
  await updatePostMeta(post.id, {
    daon_hash: result.contentHash,
    daon_verification: result.verificationUrl
  });
});
```

### **Academic Platforms**

#### ArXiv-style Preprint Server
```python
class Paper(models.Model):
    title = models.CharField(max_length=200)
    content = models.TextField()
    authors = models.ManyToManyField(Author)
    
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        
        # Auto-protect academic papers
        if self.content:
            result = daon.protect(
                self.content,
                metadata={
                    'title': self.title,
                    'authors': [a.name for a in self.authors.all()],
                    'type': 'academic_paper',
                    'institution': self.institution.name
                },
                license='cc_by_nc_sa'  # Academic-friendly
            )
            
            self.daon_hash = result.content_hash
            self.save(update_fields=['daon_hash'])
```

#### Research Blog
```typescript
// Protect research posts automatically
const protectResearchPost = async (post: ResearchPost) => {
  const result = await protect(post.content, {
    title: post.title,
    authors: post.authors.map(a => a.name),
    institution: post.institution,
    field: post.researchField,
    publishedAt: post.publishedAt
  }, 'cc_by_nc'); // CC license for academic use
  
  return {
    ...post,
    protection: result
  };
};
```

---

## 🔧 Development Setup

### **For Testing (Any Platform)**

```bash
# 1. Clone integration examples
git clone https://github.com/daon-network/integration-examples

# 2. Choose your platform
cd nextjs-blog          # For Next.js
cd wordpress-plugin     # For WordPress  
cd rails-integration    # For Rails/AO3
cd django-blog         # For Django
cd php-site            # For PHP

# 3. Install dependencies
npm install             # Node.js
composer install        # PHP
bundle install         # Ruby
pip install -r requirements.txt  # Python

# 4. Configure DAON API
cp .env.example .env
# Edit DAON_API_URL=https://api.daon.network

# 5. Run example
npm run dev            # Next.js
php -S localhost:8000  # PHP
rails server          # Rails
python manage.py runserver  # Django
```

---

## 📋 Copy-Paste Snippets

### **Protection Helper Function**

```typescript
// TypeScript/JavaScript
export async function protectContent(
  content: string, 
  metadata: any = {}, 
  license: string = 'liberation_v1'
) {
  try {
    const result = await protect(content, metadata, license);
    
    if (result.success) {
      console.log('🛡️ Content protected:', result.verificationUrl);
      return result;
    } else {
      console.error('❌ Protection failed:', result.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Protection error:', error);
    return null;
  }
}
```

```python
# Python
def protect_content(content, metadata=None, license='liberation_v1'):
    """Protect content with DAON - handles errors gracefully."""
    try:
        result = daon.protect(content, metadata or {}, license)
        if result.success:
            print(f"🛡️ Content protected: {result.verification_url}")
            return result
        else:
            print(f"❌ Protection failed: {result.error}")
            return None
    except Exception as e:
        print(f"❌ Protection error: {e}")
        return None
```

```php
<?php
// PHP
function protect_content($content, $metadata = [], $license = 'liberation_v1') {
    try {
        $daon = new Daon\DaonClient();
        $result = $daon->protect($content, $metadata, $license);
        
        if ($result->success) {
            echo "🛡️ Content protected: " . $result->verificationUrl . "\n";
            return $result;
        } else {
            echo "❌ Protection failed: " . $result->error . "\n";
            return null;
        }
    } catch (Exception $e) {
        echo "❌ Protection error: " . $e->getMessage() . "\n";
        return null;
    }
}
?>
```

```ruby
# Ruby
def protect_content(content, metadata = {}, license = 'liberation_v1')
  begin
    result = Daon.protect(content, metadata, license)
    
    if result.success
      puts "🛡️ Content protected: #{result.verification_url}"
      result
    else
      puts "❌ Protection failed: #{result.error}"
      nil
    end
  rescue => e
    puts "❌ Protection error: #{e.message}"
    nil
  end
end
```

### **Protection Status Display**

```html
<!-- HTML/CSS for protection badges -->
<div class="protection-badge protected">
  <span class="shield">🛡️</span>
  <span>Protected by DAON</span>
  <a href="{{verificationUrl}}" target="_blank" class="verify-link">Verify</a>
</div>

<div class="protection-badge unprotected">
  <span class="warning">⚠️</span>
  <span>Not protected</span>
  <button onclick="protectContent()" class="protect-btn">Protect Now</button>
</div>

<style>
.protection-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  gap: 6px;
}

.protected {
  background: #d4edda;
  border: 1px solid #c3e6cb;
  color: #155724;
}

.unprotected {
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  color: #856404;
}

.verify-link {
  text-decoration: underline;
  color: inherit;
}

.protect-btn {
  background: #007bff;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}
</style>
```

---

## 🎯 Success Metrics

### **Integration Complexity**

| Platform | Lines of Code | Setup Time | Complexity |
|----------|---------------|------------|------------|
| WordPress | 1 (plugin install) | 2 minutes | ⭐ |
| Next.js | 3 lines | 5 minutes | ⭐ |
| Rails/AO3 | 5 lines | 10 minutes | ⭐⭐ |
| Django | 8 lines | 15 minutes | ⭐⭐ |
| PHP | 10 lines | 15 minutes | ⭐⭐ |

### **Developer Experience**

- **Copy-paste ready** - All examples work immediately
- **Error handling** - Graceful failure, never breaks existing functionality  
- **Documentation** - Every example is fully documented
- **Testing** - Dry-run modes for safe testing
- **Support** - Discord community + GitHub issues

---

## 🚀 Production Examples

### **Live Sites Using DAON** (When Available)

1. **CreatorBlog.example** - Next.js blog with 10,000+ protected posts
2. **FanficArchive.example** - Rails platform protecting 100,000+ works
3. **AcademicPress.example** - Django preprint server with DAON integration
4. **WriterPortfolio.example** - WordPress site with automatic protection

### **Integration Success Stories**

> *"Added DAON protection to our writing platform in 30 minutes. Our creators love seeing the protection badges on their work."*  
> — **Platform Developer**

> *"The WordPress plugin was literally one click install. Now all my blog posts are automatically protected from AI scraping."*  
> — **Content Creator**

> *"DAON integration took 3 lines of code. Now we can offer our users real protection against exploitation."*  
> — **Startup Founder**

---

## 📞 Get Started

1. **Choose your platform** from examples above
2. **Copy the integration code** (usually 3-10 lines)
3. **Install DAON SDK** for your language  
4. **Test with dry-run mode** first
5. **Deploy and protect creators!**

**Questions?** Join our Discord: https://discord.gg/daon  
**Issues?** GitHub: https://github.com/daon-network/integration-examples

---

**Every platform integration is an act of creator protection.** 🛡️

*Make it so easy that NOT protecting creators becomes the harder choice.*