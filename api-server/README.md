# 🛡️ DAON API Server

**REST API server bridging DAON SDKs to the blockchain for creator protection.**

This Express.js server provides HTTP endpoints for content protection, verification, and management, allowing all DAON SDKs to interact with the blockchain through a unified REST API.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- DAON blockchain running (optional - has demo mode)

### Installation

1. **Install Dependencies**
   ```bash
   cd api-server/
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Verify Installation**
   ```bash
   curl http://localhost:3000/health
   ```

## 📋 API Endpoints

### 🔍 **Health & Documentation**
```http
GET /health                # Server health check
GET /api/v1               # API documentation
```

### 🛡️ **Content Protection**
```http
POST /api/v1/protect      # Protect single content
POST /api/v1/protect/bulk # Protect multiple works
```

### ✅ **Verification**
```http
GET /api/v1/verify/:hash  # Verify content protection
GET /api/v1/stats         # Get protection statistics
```

## 🔧 Usage Examples

### Protect Content
```javascript
const response = await fetch('http://localhost:3000/api/v1/protect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: 'My creative work content here...',
    metadata: {
      title: 'My Amazing Story',
      author: 'Creator Name',
      type: 'story'
    },
    license: 'liberation_v1'
  })
});

const result = await response.json();
console.log('Protected:', result.verificationUrl);
```

### Verify Content
```javascript
const contentHash = '7f8b9c2d4a1e3f5a...'; // SHA-256 hash
const response = await fetch(`http://localhost:3000/api/v1/verify/${contentHash}`);
const verification = await response.json();

if (verification.isValid) {
  console.log('Content is protected!', verification);
} else {
  console.log('Content not found in registry');
}
```

### Bulk Protection
```javascript
const response = await fetch('http://localhost:3000/api/v1/protect/bulk', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    works: [
      {
        content: 'First work content...',
        metadata: { title: 'Work 1' }
      },
      {
        content: 'Second work content...',
        metadata: { title: 'Work 2' }
      }
    ],
    license: 'liberation_v1'
  })
});

const result = await response.json();
console.log(`Protected ${result.protected} works`);
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `BLOCKCHAIN_RPC` | Blockchain node URL | `http://localhost:26657` |
| `BLOCKCHAIN_ENABLED` | Enable blockchain integration | `false` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:3000` |
| `LOG_LEVEL` | Logging level | `info` |

### Features

- ✅ **Content Protection** - SHA-256 hashing and registration
- ✅ **Liberation License** - Automatic license application  
- ✅ **Rate Limiting** - Protection against abuse
- ✅ **CORS Support** - Cross-origin requests for web apps
- ✅ **Input Validation** - Secure request validation
- ✅ **Bulk Operations** - Protect multiple works at once
- ✅ **Demo Mode** - Works without blockchain connection
- ⏳ **Blockchain Integration** - Connect to DAON blockchain
- ⏳ **Database Storage** - Persistent storage
- ⏳ **API Authentication** - API key support
- ⏳ **Webhooks** - Event notifications

## 🔒 Security Features

### Rate Limiting
- **General API:** 100 requests/15 minutes per IP
- **Protection:** 10 protections/minute per IP
- **Verification:** 1000 verifications/minute per IP

### Input Validation
- Content size limit: 10MB
- SHA-256 hash validation
- License type validation
- Metadata sanitization

### Security Headers
- Helmet.js for security headers
- CORS configuration
- Request logging and monitoring

## 🛠️ Development

### Available Scripts
```bash
npm start          # Production server
npm run dev        # Development with auto-reload  
npm test          # Run tests
npm run lint      # Code linting
npm run format    # Code formatting
```

### Project Structure
```
api-server/
├── src/
│   ├── server.js         # Main server file
│   ├── routes/           # API route handlers
│   ├── middleware/       # Custom middleware
│   ├── services/         # Business logic
│   └── test/             # Test files
├── logs/                 # Log files
├── package.json          # Dependencies
├── .env.example          # Environment template
└── README.md             # This file
```

### Adding New Features

1. **New Endpoint**
   ```javascript
   app.get('/api/v1/new-endpoint', (req, res) => {
     res.json({ message: 'Hello from new endpoint!' });
   });
   ```

2. **Middleware**
   ```javascript
   const customMiddleware = (req, res, next) => {
     // Custom logic here
     next();
   };
   app.use('/api/v1/protected', customMiddleware);
   ```

3. **Validation**
   ```javascript
   app.post('/api/v1/new', [
     body('field').notEmpty().withMessage('Field required'),
     handleValidationErrors
   ], handler);
   ```

## ⛓️ Blockchain Integration

### Current Status: Demo Mode
The server currently runs in demo mode with in-memory storage. This allows all SDKs to work immediately without blockchain setup.

### Enabling Blockchain
1. **Start DAON Blockchain**
   ```bash
   cd daon-core/
   make install
   daond start
   ```

2. **Configure Connection**
   ```bash
   export BLOCKCHAIN_RPC=http://localhost:26657
   export BLOCKCHAIN_ENABLED=true
   ```

3. **Integration Points**
   - Content registration → `contentregistry` module
   - Hash verification → Query blockchain state
   - License enforcement → Smart contract validation

## 📊 Monitoring

### Logging
- **Console:** Development logs
- **Files:** `logs/combined.log`, `logs/error.log`
- **Levels:** error, warn, info, debug

### Health Monitoring
```bash
# Check server status
curl http://localhost:3000/health

# Response
{
  "status": "healthy",
  "timestamp": "2024-03-15T14:32:17Z",
  "version": "1.0.0",
  "blockchain": "demo-mode"
}
```

### Statistics
```bash
# Get protection stats
curl http://localhost:3000/api/v1/stats

# Response  
{
  "success": true,
  "stats": {
    "totalProtected": 1337,
    "byLicense": {
      "liberation_v1": 1200,
      "cc0": 100,
      "cc-by": 37
    }
  }
}
```

## 🚀 Deployment

### Production Deployment

1. **Environment Setup**
   ```bash
   export NODE_ENV=production
   export PORT=80
   export BLOCKCHAIN_ENABLED=true
   ```

2. **Start Server**
   ```bash
   npm start
   ```

3. **Process Management** (PM2)
   ```bash
   npm install -g pm2
   pm2 start src/server.js --name daon-api
   pm2 startup
   pm2 save
   ```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
EXPOSE 3000
CMD ["npm", "start"]
```

### Reverse Proxy (Nginx)
```nginx
server {
  listen 80;
  server_name api.daon.network;
  
  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

## 🆘 Troubleshooting

### Common Issues

#### Server Won't Start
```bash
# Check port availability
lsof -i :3000

# Check logs
tail -f logs/error.log

# Verify dependencies
npm list
```

#### Blockchain Connection Failed
```bash
# Verify blockchain is running
curl http://localhost:26657/status

# Check RPC configuration
echo $BLOCKCHAIN_RPC

# Test with demo mode
export BLOCKCHAIN_ENABLED=false
```

#### Rate Limit Exceeded
```bash
# Check current limits
curl -I http://localhost:3000/api/v1/protect

# Reset by restarting server
pm2 restart daon-api
```

### Debug Mode
```bash
export LOG_LEVEL=debug
export NODE_ENV=development
npm run dev
```

## 📞 Support

### Technical Support
- **API Issues:** api-support@daon.network
- **Integration Help:** integrations@daon.network
- **Discord:** #developers channel

### Contributing
1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit pull request

### Security Issues
Report security vulnerabilities to: security@daon.network

---

## 🎯 Roadmap

### Phase 1: Core API ✅
- [x] Content protection endpoints
- [x] Content verification  
- [x] Bulk operations
- [x] Rate limiting and security
- [x] Demo mode for immediate use

### Phase 2: Blockchain Integration ⏳
- [ ] Connect to DAON blockchain
- [ ] Real transaction submission
- [ ] Blockchain state queries
- [ ] Smart contract integration

### Phase 3: Production Features ⏳  
- [ ] Database persistence
- [ ] API authentication
- [ ] Webhook notifications
- [ ] Advanced monitoring

### Phase 4: Enterprise ⏳
- [ ] Multi-tenant support
- [ ] Custom licensing flows
- [ ] Analytics dashboard
- [ ] White-label deployment

---

**🛡️ DAON API Server: Bridging Creator Protection to Every Platform**

*Every API call is a step toward creator liberation.*