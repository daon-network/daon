---
layout: default
title: "Platform Integration Overview"
description: "Add DAON creator protection to your platform in 3 lines of code"
---

# DAON for Platforms

**Add creator protection to your platform in 3 lines of code.** Give your users the power to fight AI exploitation.

---

## Why Integrate DAON?

<div class="md-grid">
  <div class="md-feature">
    <div class="md-feature__icon"><svg class="icon" aria-hidden="true"><use href="#i-users"/></svg></div>
    <h3 class="md-feature__title">Your Creators Get</h3>
    <ul class="md-feature__list">
      <li>Cryptographic ownership proof for their content</li>
      <li>Legal standing against AI exploitation</li>
      <li>Liberation License blocking unauthorized training</li>
      <li>Peace of mind their work is protected</li>
    </ul>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><svg class="icon" aria-hidden="true"><use href="#i-building"/></svg></div>
    <h3 class="md-feature__title">Your Platform Gets</h3>
    <ul class="md-feature__list">
      <li>Competitive advantage over platforms without protection</li>
      <li>Creator loyalty from providing protection tools</li>
      <li>Legal compliance with creator rights frameworks</li>
      <li>Marketing differentiation as a creator-friendly platform</li>
    </ul>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><svg class="icon" aria-hidden="true"><use href="#i-trending-up"/></svg></div>
    <h3 class="md-feature__title">Business Benefits</h3>
    <ul class="md-feature__list">
      <li>Higher creator retention rates</li>
      <li>Premium feature for monetization</li>
      <li>Positive PR and community trust</li>
      <li>Future-proofing against AI regulations</li>
    </ul>
  </div>
</div>

---

## Integration Options

<div class="md-grid">
  <div class="md-feature">
    <div class="md-feature__icon"><svg class="icon" aria-hidden="true"><use href="#i-code-xml"/></svg></div>
    <h3 class="md-feature__title">SDK Integration (Recommended)</h3>
    <p class="md-feature__description">Add protection directly to your codebase</p>
    <ul class="md-feature__list">
      <li>Automatic protection for all content</li>
      <li>Native UI integration</li>
      <li>Full control over user experience</li>
      <li>3-line code implementation</li>
    </ul>
    <p><strong>Best For:</strong> Custom platforms, CMSs, writing apps</p>
    <a href="/examples/" class="md-feature__link">See SDK Examples →</a>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><svg class="icon" aria-hidden="true"><use href="#i-plug"/></svg></div>
    <h3 class="md-feature__title">WordPress Plugin</h3>
    <p class="md-feature__description">Ready-made solution for WordPress sites</p>
    <ul class="md-feature__list">
      <li>Zero-code installation</li>
      <li>Automatic protection settings</li>
      <li>Admin dashboard integration</li>
      <li>Works with any theme</li>
    </ul>
    <p><strong>Best For:</strong> WordPress blogs, news sites, content publishers</p>
    <a href="/examples/wordpress/" class="md-feature__link">Download Plugin →</a>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><svg class="icon" aria-hidden="true"><use href="#i-globe"/></svg></div>
    <h3 class="md-feature__title">Web API Integration</h3>
    <p class="md-feature__description">REST API for any platform or language</p>
    <ul class="md-feature__list">
      <li>Platform-agnostic HTTP calls</li>
      <li>Works with any tech stack</li>
      <li>Webhook support for automation</li>
      <li>JSON request/response</li>
    </ul>
    <p><strong>Best For:</strong> Legacy systems, custom integrations, microservices</p>
    <a href="/api/reference/" class="md-feature__link">API Documentation →</a>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><svg class="icon" aria-hidden="true"><use href="#i-settings"/></svg></div>
    <h3 class="md-feature__title">Custom Solutions</h3>
    <p class="md-feature__description">Tailored integration for enterprise needs</p>
    <ul class="md-feature__list">
      <li>White-label branding options</li>
      <li>Custom business logic</li>
      <li>Enterprise support & SLA</li>
      <li>On-premise deployment</li>
    </ul>
    <p><strong>Best For:</strong> Large platforms, enterprise customers</p>
    <a href="mailto:enterprise@daon.network" class="md-feature__link">Contact Enterprise →</a>
  </div>
</div>

---

## Implementation Examples by Platform Type

### **Content Management Systems**

#### WordPress
```php
<?php
// WordPress auto-protection hook
add_action('save_post', 'daon_auto_protect');

function daon_auto_protect($post_id) {
    if (get_option('daon_auto_protect')) {
        daon_protect_post($post_id); // Done!
    }
}
?>
```

#### Ghost
```javascript
// Ghost webhook integration
app.post('/webhook/content-published', async (req, res) => {
    const content = req.body.post.current;
    await daon.protect(content.html, {
        title: content.title,
        author: content.authors[0].name
    });
});
```

### **Fanfiction Platforms**

#### Ruby on Rails (AO3-style)
```ruby
class Work < ApplicationRecord
  after_create :protect_with_daon
  
  def protect_with_daon
    work = Daon::Work.from_activerecord(self)
    Daon.protect(work.content, work.metadata, 'liberation_v1')
  end
end
```

### **Social Platforms**

#### Django (Python)
```python
# Django model with DAON protection
class Post(models.Model):
    content = models.TextField()
    author = models.ForeignKey(User)
    daon_hash = models.CharField(max_length=64, blank=True)
    
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.daon_hash:
            result = daon.protect(
                content=self.content,
                metadata={'author': self.author.username},
                license='liberation_v1'
            )
            self.daon_hash = result.content_hash
            self.save(update_fields=['daon_hash'])
```

### **Academic Platforms**

#### Next.js (Preprint Server)
```javascript
// Next.js with DAON protection
export default async function publishPaper(req, res) {
  const { title, abstract, content, authors } = req.body;
  
  // Protect with DAON
  const protection = await daon.protect(content, {
    title,
    authors: authors.join(', '),
    type: 'academic_paper'
  });
  
  // Save to database
  const paper = await db.papers.create({
    title, abstract, content,
    daonHash: protected.contentHash,
    daonUrl: protected.verificationUrl
  });
}
```

---

## Integration Patterns

### **Pattern 1: Auto-Protection**
Automatically protect all content when published
```javascript
// Protect everything automatically
contentModel.afterCreate(async (content) => {
    await daon.protect(content.text, content.metadata);
});
```

### **Pattern 2: Opt-In Protection** 
Let users choose when to protect content
```javascript
// User chooses protection
if (user.wantsDAONProtection) {
    const result = await daon.protect(content);
    content.protectionBadge = result.verificationUrl;
}
```

### **Pattern 3: Bulk Protection**
Protect existing content libraries
```javascript
// Migrate existing content
const unprotectedContent = await db.getUnprotectedContent();
for (const item of unprotectedContent) {
    await daon.protect(item.content, item.metadata);
}
```

### **Pattern 4: Real-Time Protection**
Protect content as users type (drafts)
```javascript
// Auto-save with protection
const autosave = debounce(async (content) => {
    const result = await daon.protect(content, {isDraft: true});
    showProtectionStatus(result.status);
}, 5000);
```

---

## Available SDKs

**One SDK is published.** The rest exist as source in the repository but are not
on any package registry — their publish workflows last failed in March 2026.

### JavaScript/Node.js — published

```bash
npm install daon-sdk
```

- TypeScript support
- CommonJS & ESM

### Python, Ruby, PHP, Go — source only

Not published. Use them from a checkout of
[`sdks/`](https://github.com/daon-network/daon/tree/main/sdks).

> **Do not run `pip install daon`.** That name belongs to an unrelated project —
> "Daon Korean Analyzer" by `rasoio` — and has nothing to do with DAON. Earlier
> versions of this page told people to install it.

This page previously advertised `@daon/sdk`, `pip install daon`,
`gem install daon`, `composer require daon/client` and
`go get github.com/daon-network/go-sdk`. None of those exist.

---

## Success Stories

There are none yet. This section previously carried testimonials from creators
who do not exist -- several asserting legal or financial outcomes -- and they
have been removed rather than rewritten.

If DAON is useful to you and you are willing to be named, open an issue. One real
account is worth more than the invented ones were.

---

## Integration Checklist

### **Phase 1: Setup (30 minutes)**
- [ ] Choose your integration method (SDK/API/Plugin)
- [ ] Install DAON package or plugin
- [ ] Configure API credentials
- [ ] Test protection on sample content

### **Phase 2: Implementation (2-4 hours)**
- [ ] Add protection hooks to content creation
- [ ] Implement UI indicators for protected content
- [ ] Add user opt-in/opt-out controls
- [ ] Test error handling and edge cases

### **Phase 3: Launch (1 week)**
- [ ] Deploy to staging environment
- [ ] Run user acceptance testing
- [ ] Create user documentation
- [ ] Deploy to production
- [ ] Monitor protection metrics

### **Phase 4: Optimization (Ongoing)**
- [ ] Collect user feedback
- [ ] Optimize protection performance
- [ ] Add advanced features (bulk protection, etc.)
- [ ] Track creator satisfaction metrics

---

## Technical Architecture

### **Security & Privacy**
- **No Content Storage:** Only SHA-256 hashes stored on blockchain
- **GDPR Compliant:** Minimal data collection, full user control
- **End-to-End Encryption:** All API communications secured
- **Rate Limiting:** Built-in protection against abuse

### **Performance**
- **Async Processing:** Non-blocking content protection
- **CDN Distribution:** Global API endpoints for low latency
- **Caching Layer:** Intelligent caching for duplicate content
- **Batch Operations:** Bulk protection for performance

### **Reliability**
- **99.9% Uptime SLA:** Redundant infrastructure
- **Automatic Failover:** Multiple blockchain nodes
- **Graceful Degradation:** Fallback protection modes
- **Real-time Monitoring:** 24/7 system monitoring

---

## Integration Support

### **Documentation & Resources**
- [Complete API Reference](/api/reference/)
- [SDK Documentation by Language](/api/)
- [Integration Examples](/examples/)
- [Error Handling Guide](/api/errors/)
- [Rate Limiting Guide](/api/rate-limits/)

### **Community Support**
- [GitHub Issues](https://github.com/daon-network/issues) - Bug reports
- [Stack Overflow](https://stackoverflow.com/questions/tagged/daon) - Q&A

### **Professional Support**
- **Integration Support:** integrations@daon.network
- **Enterprise Sales:** enterprise@daon.network
- **Technical Issues:** technical@daon.network
- **Partnership Inquiries:** partnerships@daon.network

---

## Ready to Integrate?

<div class="md-grid">
  <div class="md-feature">
    <div class="md-feature__icon"><svg class="icon" aria-hidden="true"><use href="#i-clipboard-list"/></svg></div>
    <h3 class="md-feature__title">See Examples</h3>
    <p class="md-feature__description">Copy-paste integration code</p>
    <a href="/examples/" class="md-feature__link">See Examples →</a>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><svg class="icon" aria-hidden="true"><use href="#i-book"/></svg></div>
    <h3 class="md-feature__title">API Docs</h3>
    <p class="md-feature__description">Complete technical reference</p>
    <a href="/api/reference/" class="md-feature__link">API Docs →</a>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><svg class="icon" aria-hidden="true"><use href="#i-message-circle"/></svg></div>
    <h3 class="md-feature__title">Get Help</h3>
    <p class="md-feature__description">Chat with developers</p>
    <a href="https://github.com/daon-network/daon/issues" class="md-feature__link">Get Help →</a>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><svg class="icon" aria-hidden="true"><use href="#i-handshake"/></svg></div>
    <h3 class="md-feature__title">Enterprise</h3>
    <p class="md-feature__description">Custom solutions & support</p>
    <a href="mailto:integrations@daon.network" class="md-feature__link">Enterprise →</a>
  </div>
</div>

---

<div class="bottom-message">

## Protect Your Community

**Every platform with DAON protection is a victory for creator rights.**

*Build the future where creators control their work.*  
*Join the resistance against exploitation.*  
*Integrate DAON today.*

</div>