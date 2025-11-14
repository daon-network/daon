---
layout: default
title: "DAON SDKs & API Documentation"
description: "Complete API reference and SDK documentation for all supported languages"
---

# DAON SDKs & API Documentation

**Complete API reference and SDK documentation for integrating DAON creator protection into any platform.**

---

## Quick Start

### **1. Choose Your Language**
```bash
# JavaScript/Node.js
npm install @daon/sdk

# Python
pip install daon

# Ruby
gem install daon

# PHP
composer require daon/client

# Go
go get github.com/daon-network/go-sdk
```

### **2. Basic Protection**
```javascript
// Node.js/JavaScript
import { protect } from '@daon/sdk';

const result = await protect(
    content,
    { title: "My Work", author: "Creator Name" },
    'liberation_v1'
);
console.log('Protected:', result.verificationUrl);
```

### **3. Verification**
```javascript
const verification = await verify(result.contentHash);
console.log('Verified:', verification.isValid);
```

---

## SDK Documentation

<div class="md-grid">

  <div class="md-feature">
    <div class="md-feature__icon"><i data-lucide="code"></i></div>
    <h3 class="md-feature__title">JavaScript/TypeScript</h3>
    <p class="md-feature__description">For web apps, Node.js, React, Vue, Angular</p>
    <ul class="md-feature__list">
      <li><a href="/api/nodejs/">Node.js SDK Guide</a></li>
      <li><a href="/api/nodejs/types/">TypeScript Definitions</a></li>
      <li><a href="/api/nodejs/react/">React Integration</a></li>
      <li><a href="/api/nodejs/vue/">Vue Integration</a></li>
      <li><a href="/api/nodejs/express/">Express.js Integration</a></li>
    </ul>
    <p><strong>Key Features:</strong> TypeScript support, CommonJS & ESM modules, Browser compatibility, Async/await ready</p>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><i data-lucide="python"></i></div>
    <h3 class="md-feature__title">Python</h3>
    <p class="md-feature__description">For Django, Flask, FastAPI, academic platforms</p>
    <ul class="md-feature__list">
      <li><a href="/api/python/">Python SDK Guide</a></li>
      <li><a href="/api/python/django/">Django Integration</a></li>
      <li><a href="/api/python/flask/">Flask Integration</a></li>
      <li><a href="/api/python/fastapi/">FastAPI Integration</a></li>
      <li><a href="/api/python/academic/">Academic Use Cases</a></li>
    </ul>
    <p><strong>Key Features:</strong> Django model mixins, Flask decorators, Async support, Type hints included</p>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><i data-lucide="gem"></i></div>
    <h3 class="md-feature__title">Ruby</h3>
    <p class="md-feature__description">For Rails, AO3-style platforms, fanfiction sites</p>
    <ul class="md-feature__list">
      <li><a href="/api/ruby/">Ruby SDK Guide</a></li>
      <li><a href="/api/ruby/rails/">Rails Integration</a></li>
      <li><a href="/api/ruby/activerecord/">ActiveRecord Mixins</a></li>
      <li><a href="/platforms/ao3-integration/">AO3 Integration Example</a></li>
      <li><a href="/api/ruby/sinatra/">Sinatra Integration</a></li>
    </ul>
    <p><strong>Key Features:</strong> ActiveRecord integration, Rails generators, AO3-compatible, Gem-based distribution</p>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><i data-lucide="server"></i></div>
    <h3 class="md-feature__title">PHP</h3>
    <p class="md-feature__description">For WordPress, Laravel, Symfony, legacy systems</p>
    <ul class="md-feature__list">
      <li><a href="/api/php/">PHP SDK Guide</a></li>
      <li><a href="/api/php/wordpress/">WordPress Integration</a></li>
      <li><a href="/api/php/laravel/">Laravel Integration</a></li>
      <li><a href="/api/php/symfony/">Symfony Integration</a></li>
      <li><a href="/api/php/legacy/">Legacy PHP Guide</a></li>
    </ul>
    <p><strong>Key Features:</strong> WordPress hooks, Laravel facades, PSR-4 autoloading, PHP 7.4+ support</p>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><i data-lucide="cpu"></i></div>
    <h3 class="md-feature__title">Go</h3>
    <p class="md-feature__description">For high-performance systems, microservices</p>
    <ul class="md-feature__list">
      <li><a href="/api/go/">Go SDK Guide</a></li>
      <li><a href="/api/go/grpc/">gRPC Integration</a></li>
      <li><a href="/api/go/microservices/">Microservices Pattern</a></li>
      <li><a href="/api/go/performance/">Performance Optimization</a></li>
      <li><a href="/api/go/concurrent/">Concurrent Protection</a></li>
    </ul>
    <p><strong>Key Features:</strong> High performance, Concurrent operations, gRPC support, Minimal dependencies</p>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><i data-lucide="globe"></i></div>
    <h3 class="md-feature__title">REST API</h3>
    <p class="md-feature__description">For any language or custom integrations</p>
    <ul class="md-feature__list">
      <li><a href="/api/reference/">REST API Reference</a></li>
      <li><a href="/api/reference/auth/">Authentication</a></li>
      <li><a href="/api/reference/rate-limits/">Rate Limiting</a></li>
      <li><a href="/api/reference/webhooks/">Webhooks</a></li>
      <li><a href="/api/reference/errors/">Error Handling</a></li>
    </ul>
    <p><strong>Key Features:</strong> Language-agnostic, HTTP/JSON interface, Webhook support, OpenAPI specification</p>
  </div>
</div>

---

## Core API Methods

### **Protect Content**
Register content with cryptographic protection
```http
POST /api/v1/protect
Content-Type: application/json

{
  "content": "Your creative work here...",
  "metadata": {
    "title": "Work Title",
    "author": "Creator Name",
    "type": "article"
  },
  "license": "liberation_v1"
}
```

**Response:**
```json
{
  "success": true,
  "contentHash": "7f8b9c2d4a1e3f5a...",
  "verificationUrl": "https://verify.daon.network/7f8b9c2d...",
  "timestamp": "2024-03-15T14:32:17Z",
  "license": "liberation_v1"
}
```

### **Verify Content**
Check if content is protected and get details
```http
GET /api/v1/verify/{contentHash}
```

**Response:**
```json
{
  "isValid": true,
  "contentHash": "7f8b9c2d4a1e3f5a...",
  "timestamp": "2024-03-15T14:32:17Z",
  "license": "liberation_v1",
  "metadata": {
    "title": "Work Title",
    "author": "Creator Name"
  }
}
```

### **Bulk Protect**
Protect multiple works in a single request
```http
POST /api/v1/protect/bulk
Content-Type: application/json

{
  "works": [
    {
      "content": "First work...",
      "metadata": {"title": "Work 1"}
    },
    {
      "content": "Second work...", 
      "metadata": {"title": "Work 2"}
    }
  ],
  "license": "liberation_v1"
}
```

---

## Authentication

### **API Key Authentication**
```http
POST /api/v1/protect
Authorization: Bearer your-api-key-here
Content-Type: application/json
```

### **OAuth 2.0** (For platforms)
```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&
client_id=your-client-id&
client_secret=your-client-secret
```

### **SDK Authentication**
```javascript
// Configure API key
daon.configure({
  apiKey: process.env.DAON_API_KEY,
  environment: 'production' // or 'sandbox'
});
```

---

## Performance & Limits

### **Rate Limits**
- **Free Tier:** 1,000 protections/month
- **Creator Tier:** 10,000 protections/month  
- **Platform Tier:** 100,000 protections/month
- **Enterprise:** Custom limits

### **Request Limits**
- **Individual:** 100 requests/minute
- **Bulk:** 10 requests/minute (up to 100 works each)
- **Verification:** 1,000 requests/minute

### **Content Limits**
- **Max Content Size:** 10MB per work
- **Supported Formats:** Text, HTML, Markdown, JSON
- **Encoding:** UTF-8 required

---

## Security

### **Data Protection**
- **Content Hashing:** SHA-256 cryptographic fingerprints
- **Transport Security:** TLS 1.3 encryption
- **API Security:** Rate limiting, DDoS protection
- **Privacy:** No content storage, GDPR compliant

### **Verification Integrity**
- **Blockchain Storage:** Immutable record keeping
- **Timestamp Accuracy:** NTP-synchronized servers
- **Hash Verification:** Cryptographic proof validation
- **Legal Standing:** Court-admissible evidence

---

## Error Handling

### **Common Error Codes**
```json
{
  "error": {
    "code": "CONTENT_TOO_LARGE",
    "message": "Content exceeds 10MB limit",
    "details": {
      "maxSize": "10MB",
      "actualSize": "15MB"
    }
  }
}
```

### **Error Types**
- `INVALID_API_KEY` - Authentication failure
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `CONTENT_TOO_LARGE` - Content size limit exceeded
- `INVALID_LICENSE` - Unknown license type
- `NETWORK_ERROR` - Temporary service unavailability

### **SDK Error Handling**
```javascript
try {
  const result = await daon.protect(content);
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, 60000));
    return await daon.protect(content);
  }
  throw error;
}
```

---

## Testing & Development

### **Sandbox Environment**
```javascript
daon.configure({
  environment: 'sandbox',
  apiKey: 'test_key_...'
});
```

### **Test API Key**
For development and testing:
- **Sandbox URL:** `https://sandbox-api.daon.network`
- **Test Key:** Contact support@daon.network
- **Free Tier:** Unlimited sandbox usage

### **Mock Responses**
SDK includes built-in mock responses for testing:
```javascript
import { mockDAON } from '@daon/sdk/testing';

// Enable mocks for unit tests
mockDAON.enable();
```

---

## Support & Resources

### **Documentation**
- [Complete API Reference](/api/reference/)
- [SDK Guides by Language](/api/)
- [Integration Examples](/examples/)
- [Error Reference](/api/errors/)

### **Community**
- [Discord #developers](https://discord.gg/daon) - Live help
- [GitHub Issues](https://github.com/daon-network/issues) - Bug reports
- [Stack Overflow](https://stackoverflow.com/tagged/daon) - Q&A

### **Professional Support**
- **API Issues:** api-support@daon.network
- **SDK Problems:** sdk-support@daon.network
- **Integration Help:** integrations@daon.network
- **Enterprise:** enterprise@daon.network

---

## Get Started Now

<div class="md-grid">
  <div class="md-feature">
    <div class="md-feature__icon"><i data-lucide="book"></i></div>
    <h3 class="md-feature__title">API Reference</h3>
    <p class="md-feature__description">Complete technical docs</p>
    <a href="/api/reference/" class="md-feature__link">API Reference →</a>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><i data-lucide="clipboard-list"></i></div>
    <h3 class="md-feature__title">Code Examples</h3>
    <p class="md-feature__description">Copy-paste snippets</p>
    <a href="/examples/" class="md-feature__link">Code Examples →</a>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><i data-lucide="message-circle"></i></div>
    <h3 class="md-feature__title">Get Help</h3>
    <p class="md-feature__description">Chat with developers</p>
    <a href="https://discord.gg/daon" class="md-feature__link">Get Help →</a>
  </div>

  <div class="md-feature">
    <div class="md-feature__icon"><i data-lucide="wrench"></i></div>
    <h3 class="md-feature__title">Technical Support</h3>
    <p class="md-feature__description">Direct developer help</p>
    <a href="mailto:api-support@daon.network" class="md-feature__link">Technical Support →</a>
  </div>
</div>

---

<div class="bottom-message">

## 🛡️ Build the Protection

**Every line of code is an act of resistance.**

*Integrate DAON and protect your creators.*  
*Build the tools that fight exploitation.*  
*Code the future of creator rights.*

</div>