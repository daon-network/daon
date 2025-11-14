---
layout: default
title: "DAON SDKs & API Documentation"
description: "Complete API reference and SDK documentation for all supported languages"
---

# 🛠️ DAON SDKs & API Documentation

**Complete API reference and SDK documentation for integrating DAON creator protection into any platform.**

---

## 🚀 Quick Start

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

## 📚 SDK Documentation

<div class="doc-sections">

### **JavaScript/TypeScript**
**For web apps, Node.js, React, Vue, Angular**

- [Node.js SDK Guide](/api/nodejs/)
- [TypeScript Definitions](/api/nodejs/types/)
- [React Integration](/api/nodejs/react/)
- [Vue Integration](/api/nodejs/vue/)
- [Express.js Integration](/api/nodejs/express/)

**Key Features:**
- ✅ TypeScript support
- ✅ CommonJS & ESM modules
- ✅ Browser compatibility
- ✅ Async/await ready

---

### **Python**
**For Django, Flask, FastAPI, academic platforms**

- [Python SDK Guide](/api/python/)
- [Django Integration](/api/python/django/)
- [Flask Integration](/api/python/flask/)
- [FastAPI Integration](/api/python/fastapi/)
- [Academic Use Cases](/api/python/academic/)

**Key Features:**
- ✅ Django model mixins
- ✅ Flask decorators
- ✅ Async support
- ✅ Type hints included

---

### **Ruby**
**For Rails, AO3-style platforms, fanfiction sites**

- [Ruby SDK Guide](/api/ruby/)
- [Rails Integration](/api/ruby/rails/)
- [ActiveRecord Mixins](/api/ruby/activerecord/)
- [AO3 Integration Example](/platforms/ao3-integration/)
- [Sinatra Integration](/api/ruby/sinatra/)

**Key Features:**
- ✅ ActiveRecord integration
- ✅ Rails generators
- ✅ AO3-compatible
- ✅ Gem-based distribution

---

### **PHP**
**For WordPress, Laravel, Symfony, legacy systems**

- [PHP SDK Guide](/api/php/)
- [WordPress Integration](/api/php/wordpress/)
- [Laravel Integration](/api/php/laravel/)
- [Symfony Integration](/api/php/symfony/)
- [Legacy PHP Guide](/api/php/legacy/)

**Key Features:**
- ✅ WordPress hooks
- ✅ Laravel facades
- ✅ PSR-4 autoloading
- ✅ PHP 7.4+ support

---

### **Go**
**For high-performance systems, microservices**

- [Go SDK Guide](/api/go/)
- [gRPC Integration](/api/go/grpc/)
- [Microservices Pattern](/api/go/microservices/)
- [Performance Optimization](/api/go/performance/)
- [Concurrent Protection](/api/go/concurrent/)

**Key Features:**
- ✅ High performance
- ✅ Concurrent operations
- ✅ gRPC support
- ✅ Minimal dependencies

---

### **REST API**
**For any language or custom integrations**

- [REST API Reference](/api/reference/)
- [Authentication](/api/reference/auth/)
- [Rate Limiting](/api/reference/rate-limits/)
- [Webhooks](/api/reference/webhooks/)
- [Error Handling](/api/reference/errors/)

**Key Features:**
- ✅ Language-agnostic
- ✅ HTTP/JSON interface
- ✅ Webhook support
- ✅ OpenAPI specification

</div>

---

## 🔧 Core API Methods

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

## 🔑 Authentication

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

## ⚡ Performance & Limits

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

## 🛡️ Security

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

## 📋 Error Handling

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

## 🧪 Testing & Development

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

## 🆘 Support & Resources

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

## 🚀 Get Started Now

<div class="cta-section">

<a href="/api/reference/" class="cta-button primary">
  📖 **API Reference**<br>
  <small>Complete technical docs</small>
</a>

<a href="/examples/" class="cta-button secondary">
  📋 **Code Examples**<br>
  <small>Copy-paste snippets</small>
</a>

<a href="https://discord.gg/daon" class="cta-button secondary">
  💬 **Get Help**<br>
  <small>Chat with developers</small>
</a>

<a href="mailto:api-support@daon.network" class="cta-button secondary">
  🛠️ **Technical Support**<br>
  <small>Direct developer help</small>
</a>

</div>

---

<div class="bottom-message">

## 🛡️ Build the Protection

**Every line of code is an act of resistance.**

*Integrate DAON and protect your creators.*  
*Build the tools that fight exploitation.*  
*Code the future of creator rights.*

</div>