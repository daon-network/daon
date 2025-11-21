# DAON SDK for Node.js

Official Node.js SDK for the Decentralized Archive of Original Narratives (DAON) - a blockchain-based creator protection platform.

## Installation

```bash
npm install daon-sdk
```

## Quick Start

```javascript
const { DAONClient } = require('daon-sdk');

// Initialize the client
const client = new DAONClient({
  baseURL: 'https://api.daon.network',
  apiKey: 'your-api-key' // Optional
});

// Protect a creative work
async function protectWork() {
  const protection = await client.protectContent({
    title: 'My Creative Work',
    content: 'Your creative content here...',
    contentType: 'text/plain',
    metadata: {
      author: 'Your Name',
      createdAt: new Date().toISOString()
    }
  });
  
  console.log('Protected! Content ID:', protection.contentId);
  console.log('Blockchain TX:', protection.txHash);
}

// Verify protection status
async function checkProtection(contentId) {
  const status = await client.getProtectionStatus(contentId);
  console.log('Protection status:', status);
}
```

## Features

- **Blockchain Protection**: Register creative works on the DAON blockchain
- **Verification**: Verify protection status and authenticity
- **AI Scraping Prevention**: Mark content as protected from AI training
- **TypeScript Support**: Full type definitions included
- **ESM & CommonJS**: Works with both module systems

## API Reference

### `DAONClient`

#### Constructor

```typescript
new DAONClient(config: DAONConfig)
```

**Config Options:**
- `baseURL` (string): API endpoint URL (default: 'https://api.daon.network')
- `apiKey` (string, optional): Your API key for authenticated requests
- `timeout` (number, optional): Request timeout in milliseconds (default: 30000)
- `retries` (number, optional): Number of retry attempts (default: 3)

#### Methods

##### `protectContent(data: ProtectionRequest): Promise<ProtectionResponse>`

Register creative content on the blockchain.

**Parameters:**
```typescript
{
  title: string;           // Title of the work
  content: string;         // Content to protect
  contentType: string;     // MIME type (e.g., 'text/plain', 'text/html')
  metadata?: {             // Optional metadata
    author?: string;
    createdAt?: string;
    tags?: string[];
    [key: string]: any;
  }
}
```

**Returns:**
```typescript
{
  contentId: string;       // Unique content identifier
  txHash: string;          // Blockchain transaction hash
  timestamp: string;       // Protection timestamp
  status: 'pending' | 'confirmed';
}
```

##### `getProtectionStatus(contentId: string): Promise<ProtectionStatus>`

Check the protection status of a registered work.

**Returns:**
```typescript
{
  contentId: string;
  status: 'pending' | 'confirmed' | 'not_found';
  txHash?: string;
  timestamp?: string;
  blockHeight?: number;
}
```

##### `verifyContent(content: string, contentId: string): Promise<VerificationResult>`

Verify if content matches a protected work.

**Returns:**
```typescript
{
  verified: boolean;
  contentId: string;
  match: number;           // Match percentage (0-100)
  timestamp?: string;
}
```

## Error Handling

The SDK throws specific error types for better error handling:

```javascript
try {
  await client.protectContent({ /* ... */ });
} catch (error) {
  if (error.response) {
    // API error response
    console.error('API Error:', error.response.status, error.response.data);
  } else if (error.request) {
    // Network error
    console.error('Network Error:', error.message);
  } else {
    // Other error
    console.error('Error:', error.message);
  }
}
```

## Advanced Usage

### Custom Configuration

```javascript
const client = new DAONClient({
  baseURL: 'https://custom-api.example.com',
  apiKey: process.env.DAON_API_KEY,
  timeout: 60000,  // 60 second timeout
  retries: 5       // Retry failed requests 5 times
});
```

### TypeScript

```typescript
import { DAONClient, ProtectionRequest, ProtectionResponse } from 'daon-sdk';

const client = new DAONClient({ baseURL: 'https://api.daon.network' });

const request: ProtectionRequest = {
  title: 'My Story',
  content: 'Once upon a time...',
  contentType: 'text/plain',
  metadata: {
    author: 'Jane Doe',
    tags: ['fiction', 'fantasy']
  }
};

const response: ProtectionResponse = await client.protectContent(request);
```

## License

This project is licensed under the [Liberation License v1.0](https://github.com/liberationlicense/license).

**Key terms:**
- ✅ Free for creators and platforms protecting creative works
- ✅ Free for educational and research purposes
- ❌ Cannot be used by AI companies to identify unprotected content for training
- ❌ Cannot be used to circumvent creator protection

See [LICENSE.md](../../LICENSE.md) for full terms.

## Support

- **Documentation**: https://daon.network/docs
- **Issues**: https://github.com/daon-network/daon/issues
- **Community**: https://github.com/daon-network/daon/discussions

## Contributing

Contributions are welcome! Please read our [Contributing Guide](../../CONTRIBUTING.md) before submitting pull requests.

## About DAON

DAON (Decentralized Archive of Original Narratives) is a blockchain-based platform that helps creators protect their work from unauthorized AI training and scraping. By registering creative works on-chain, creators establish provable ownership and can opt-out of AI training datasets.

Learn more at [daon.network](https://daon.network)
