---
layout: default
title: "DAON API Reference"
description: "Complete REST API reference for DAON creator protection"
---

# 🔌 DAON API Reference

**Complete REST API documentation for integrating DAON creator protection into any platform.**

---

## 🚀 Base Information

### **API Endpoints**
- **Production:** `https://api.daon.network/v1/`
- **Sandbox:** `https://sandbox-api.daon.network/v1/`
- **Documentation:** `https://api.daon.network/docs`

### **Authentication**
```http
Authorization: Bearer your-api-key-here
Content-Type: application/json
```

### **Rate Limits**
- **Free Tier:** 1,000 protections/month, 100 requests/minute
- **Creator Tier:** 10,000 protections/month, 500 requests/minute
- **Platform Tier:** 100,000 protections/month, 2,000 requests/minute

---

## 📝 Core Endpoints

### **POST /protect**
Register content with cryptographic protection.

**Request:**
```http
POST /v1/protect
Authorization: Bearer api_key_here
Content-Type: application/json

{
  "content": "Your creative work content here...",
  "metadata": {
    "title": "Work Title",
    "author": "Creator Name",
    "description": "Optional description",
    "url": "https://example.com/work",
    "type": "article|story|poem|code|research",
    "tags": ["tag1", "tag2"],
    "language": "en"
  },
  "license": "liberation_v1|cc_by_nc|cc_by_sa|all_rights",
  "platform": "wordpress|ao3|medium|custom"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "contentHash": "7f8b9c2d4a1e3f5a9b7d2c8e6f4a9b8c",
    "verificationUrl": "https://verify.daon.network/7f8b9c2d4a1e3f5a",
    "timestamp": "2024-03-15T14:32:17.123Z",
    "blockHeight": 12345,
    "license": "liberation_v1",
    "protectionId": "prot_1234567890abcdef"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "CONTENT_TOO_LARGE",
    "message": "Content exceeds 10MB limit",
    "details": {
      "maxSizeBytes": 10485760,
      "actualSizeBytes": 15728640
    }
  }
}
```

---

### **GET /verify/{contentHash}**
Verify content protection and get details.

**Request:**
```http
GET /v1/verify/7f8b9c2d4a1e3f5a9b7d2c8e6f4a9b8c
Authorization: Bearer api_key_here
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "contentHash": "7f8b9c2d4a1e3f5a9b7d2c8e6f4a9b8c",
    "protectionId": "prot_1234567890abcdef",
    "timestamp": "2024-03-15T14:32:17.123Z",
    "blockHeight": 12345,
    "license": "liberation_v1",
    "metadata": {
      "title": "Work Title",
      "author": "Creator Name",
      "type": "article"
    },
    "verificationUrl": "https://verify.daon.network/7f8b9c2d4a1e3f5a",
    "blockchainTx": "0x1234567890abcdef..."
  }
}
```

---

### **POST /protect/bulk**
Protect multiple works in a single request.

**Request:**
```http
POST /v1/protect/bulk
Authorization: Bearer api_key_here
Content-Type: application/json

{
  "works": [
    {
      "content": "First work content...",
      "metadata": {
        "title": "First Work",
        "author": "Creator Name"
      }
    },
    {
      "content": "Second work content...",
      "metadata": {
        "title": "Second Work", 
        "author": "Creator Name"
      }
    }
  ],
  "license": "liberation_v1",
  "platform": "wordpress"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalWorks": 2,
    "protected": 2,
    "failed": 0,
    "results": [
      {
        "index": 0,
        "status": "protected",
        "contentHash": "7f8b9c2d4a1e3f5a...",
        "verificationUrl": "https://verify.daon.network/...",
        "protectionId": "prot_1234567890"
      },
      {
        "index": 1,
        "status": "protected", 
        "contentHash": "9a8b7c6d5e4f3a2b...",
        "verificationUrl": "https://verify.daon.network/...",
        "protectionId": "prot_0987654321"
      }
    ]
  }
}
```

---

### **GET /protection/{protectionId}**
Get protection details by protection ID.

**Request:**
```http
GET /v1/protection/prot_1234567890abcdef
Authorization: Bearer api_key_here
```

**Response:**
```json
{
  "success": true,
  "data": {
    "protectionId": "prot_1234567890abcdef",
    "contentHash": "7f8b9c2d4a1e3f5a9b7d2c8e6f4a9b8c",
    "timestamp": "2024-03-15T14:32:17.123Z",
    "license": "liberation_v1",
    "metadata": {
      "title": "Work Title",
      "author": "Creator Name",
      "url": "https://example.com/work"
    },
    "blockchainTx": "0x1234567890abcdef...",
    "status": "confirmed"
  }
}
```

---

### **GET /protections**
List protections for your API key.

**Request:**
```http
GET /v1/protections?limit=50&offset=0&sort=timestamp
Authorization: Bearer api_key_here
```

**Response:**
```json
{
  "success": true,
  "data": {
    "protections": [
      {
        "protectionId": "prot_1234567890",
        "contentHash": "7f8b9c2d...",
        "timestamp": "2024-03-15T14:32:17Z",
        "metadata": {
          "title": "Latest Work"
        }
      }
    ],
    "pagination": {
      "total": 847,
      "limit": 50,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

---

## 🔑 Authentication

### **API Key Authentication**
```http
Authorization: Bearer sk_live_1234567890abcdef
```

### **Getting API Keys**
1. **Free Account:** [Sign up](https://api.daon.network/signup) for free tier
2. **Paid Tiers:** [Upgrade account](https://api.daon.network/pricing) for higher limits
3. **Enterprise:** [Contact sales](mailto:enterprise@daon.network) for custom limits

### **API Key Types**
```
sk_live_...    - Production API key
sk_test_...    - Sandbox/testing API key  
sk_readonly_... - Read-only verification key
```

---

## ⚠️ Error Codes

### **Common Error Codes**
```json
{
  "INVALID_API_KEY": "Authentication failed",
  "RATE_LIMIT_EXCEEDED": "Too many requests",
  "CONTENT_TOO_LARGE": "Content exceeds 10MB limit", 
  "INVALID_LICENSE": "Unknown license type",
  "NETWORK_ERROR": "Temporary service unavailability",
  "VALIDATION_ERROR": "Invalid request format",
  "INSUFFICIENT_CREDITS": "API limit exceeded"
}
```

### **Error Response Format**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid content format",
    "details": {
      "field": "content",
      "issue": "Content cannot be empty"
    },
    "timestamp": "2024-03-15T14:32:17Z",
    "requestId": "req_1234567890"
  }
}
```

### **HTTP Status Codes**
- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid API key)
- `403` - Forbidden (insufficient permissions)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error
- `503` - Service Unavailable

---

## 📊 Rate Limiting

### **Rate Limit Headers**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1679155937
X-RateLimit-Type: requests
```

### **Handling Rate Limits**
```javascript
// Example error handling
if (response.status === 429) {
    const resetTime = response.headers['X-RateLimit-Reset'];
    const waitTime = (resetTime * 1000) - Date.now();
    await new Promise(resolve => setTimeout(resolve, waitTime));
    // Retry request
}
```

### **Best Practices**
- **Batch requests** using `/protect/bulk` endpoint
- **Implement exponential backoff** for retries
- **Cache verification results** to reduce API calls
- **Use webhooks** for async processing

---

## 🔗 Webhooks

### **Webhook Events**
```
protection.completed - Content protection finished
protection.failed    - Protection attempt failed
verification.requested - Someone verified your content
blockchain.confirmed - Protection confirmed on blockchain
```

### **Webhook Payload**
```json
{
  "event": "protection.completed",
  "timestamp": "2024-03-15T14:32:17Z",
  "data": {
    "protectionId": "prot_1234567890",
    "contentHash": "7f8b9c2d...",
    "verificationUrl": "https://verify.daon.network/...",
    "metadata": {
      "title": "Work Title"
    }
  },
  "signature": "sha256=1234567890abcdef..."
}
```

### **Webhook Verification**
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    
    return `sha256=${expectedSignature}` === signature;
}
```

---

## 🛠️ SDK Examples

### **Node.js/JavaScript**
```javascript
import { DAON } from '@daon/sdk';

const daon = new DAON('your-api-key');

// Protect content
const result = await daon.protect('My creative work', {
    title: 'My Story',
    author: 'Author Name'
}, 'liberation_v1');

console.log('Protected:', result.verificationUrl);
```

### **Python**
```python
import daon

daon.api_key = 'your-api-key'

# Protect content
result = daon.protect(
    content='My creative work',
    metadata={'title': 'My Story', 'author': 'Author Name'},
    license='liberation_v1'
)

print(f"Protected: {result.verification_url}")
```

### **Ruby**
```ruby
require 'daon'

Daon.api_key = 'your-api-key'

# Protect content
result = Daon.protect(
    'My creative work',
    title: 'My Story',
    author: 'Author Name',
    license: 'liberation_v1'
)

puts "Protected: #{result.verification_url}"
```

### **PHP**
```php
use Daon\DaonClient;

$daon = new DaonClient('your-api-key');

// Protect content
$result = $daon->protect(
    'My creative work',
    ['title' => 'My Story', 'author' => 'Author Name'],
    'liberation_v1'
);

echo "Protected: " . $result->verification_url;
```

### **Go**
```go
package main

import (
    "github.com/daon-network/go-sdk"
)

func main() {
    client := daon.NewClient("your-api-key")
    
    result, err := client.Protect(daon.ProtectionRequest{
        Content: "My creative work",
        Metadata: map[string]string{
            "title": "My Story",
            "author": "Author Name",
        },
        License: "liberation_v1",
    })
    
    if err != nil {
        log.Fatal(err)
    }
    
    fmt.Printf("Protected: %s\n", result.VerificationURL)
}
```

---

## 🧪 Testing

### **Sandbox Environment**
```
Base URL: https://sandbox-api.daon.network/v1/
API Key: sk_test_1234567890abcdef

Features:
- No blockchain writes (faster testing)
- Reset data monthly
- Unlimited requests for testing
- Same API interface as production
```

### **Test API Key**
```bash
curl -X POST https://sandbox-api.daon.network/v1/protect \
  -H "Authorization: Bearer sk_test_1234567890abcdef" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test content for API testing",
    "metadata": {"title": "Test Work"},
    "license": "liberation_v1"
  }'
```

---

## 📞 Support

### **API Support**
- **Documentation Issues:** [GitHub Issues](https://github.com/daon-network/api-docs/issues)
- **API Bugs:** [api-support@daon.network](mailto:api-support@daon.network)
- **Rate Limit Increases:** [Contact Sales](mailto:sales@daon.network)

### **Developer Resources**
- **Discord #developers:** [Join Community](https://discord.gg/daon)
- **Stack Overflow:** Tag questions with `daon-api`
- **Status Page:** [status.daon.network](https://status.daon.network)

---

**Ready to integrate DAON protection? Every API call is an act of creator protection.** 🛡️