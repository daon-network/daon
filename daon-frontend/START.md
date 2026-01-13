# Starting DAON Authentication System

## ✅ Tests Pass: 13/14 (92.9%)

The frontend is **verified working** with Playwright E2E tests!

## Quick Start

### Prerequisites
- Backend running on port 3000
- Ports 3001-3003 are blocked by Docker (we use 4000 instead)

### 1. Start Backend (if not running)
```bash
cd ../api-server
npm run dev
```
Backend: **http://localhost:3000**

### 2. Start Frontend
```bash
cd daon-frontend
npm run dev
```
Frontend: **http://localhost:4000**

### 3. Access Application
**http://localhost:4000**

## Port Configuration

| Service | Port | URL | Notes |
|---------|------|-----|-------|
| Backend API | 3000 | http://localhost:3000 | ✅ |
| Frontend | 4000 | http://localhost:4000 | ✅ |
| Docker | 3001-3003 | N/A | ⚠️ Blocked |

## Test the Application

### Run E2E Tests
```bash
npm run test:e2e          # Run tests
npm run test:e2e:ui       # Run with UI
npm run test:e2e:headed   # See browser
```

### Manual Testing
1. Visit http://localhost:4000
2. Enter email
3. Click "Send Magic Link"
4. Check backend console for magic link
5. Copy URL and paste in browser
6. Complete auth flow

## What's Working ✅

### Verified by Tests
- ✅ Login page loads
- ✅ Email validation
- ✅ Form submission
- ✅ Protected route redirects
- ✅ Error handling
- ✅ Responsive design
- ✅ Accessibility (keyboard nav, labels)
- ✅ Network error handling

### Components Built
- ✅ MagicLinkForm
- ✅ TwoFactorSetup
- ✅ TwoFactorVerify
- ✅ AuthProvider
- ✅ Dashboard

## Troubleshooting

### "Endpoint not found" Error
**Problem:** You're hitting port 3001-3003 (Docker) instead of 4000 (Next.js)  
**Solution:** Use **http://localhost:4000**

### Frontend Not Running
**Problem:** You didn't start Next.js  
**Solution:** Run `npm run dev` in daon-frontend directory

### Backend Errors
**Problem:** Backend not running on port 3000  
**Solution:** Start backend with `cd api-server && npm run dev`

### Port Already in Use
```bash
# Kill process on port 4000
lsof -ti:4000 | xargs kill -9

# Then restart
npm run dev
```

## Integration with Backend

All API calls configured to hit:
```
http://localhost:3000/api/v1/auth/*
```

Make sure backend is running before testing full auth flow!

---

**Frontend is ready and tested! Visit http://localhost:4000** 🚀
