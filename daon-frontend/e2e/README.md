# DAON E2E Test Suite

Comprehensive end-to-end tests for the DAON authentication system.

## Test Coverage

### Complete Auth Flow Tests

**New User Registration:**
- Magic link request and email delivery
- Magic link verification
- 2FA setup with QR code
- TOTP verification
- Backup codes generation and display
- Dashboard access
- Session persistence

**Existing User Login:**
- Magic link authentication
- 2FA verification (segmented input)
- Backup code alternative
- Dashboard access
- Session restoration

### Session Persistence Tests
- Page reload persistence
- Navigation to 404 and back
- Refresh token management
- Multi-tab synchronization

### UI/UX Regression Tests
- No light-on-light text in inputs
- Correct 2FA status display
- Refresh token not stored as "undefined"
- Proper error messages

### Error Handling Tests
- Expired magic links
- Invalid TOTP codes
- Network failures
- API errors

### Security Tests
- Protected route access
- Token cleanup on logout
- Session expiration

## Prerequisites

### Local Development

1. **Start required services:**
   ```bash
   # Start PostgreSQL (Docker)
   docker run -d -p 5432:5432 \
     -e POSTGRES_DB=daon_db \
     -e POSTGRES_USER=daon_user \
     -e POSTGRES_PASSWORD=daon_password \
     postgres:15-alpine
   
   # Start MailHog (Docker)
   docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog
   ```

2. **Setup database:**
   ```bash
   cd api-server
   psql -h localhost -U daon_user -d daon_db -f src/database/schema.sql
   ```

3. **Start API server:**
   ```bash
   cd api-server
   npm install
   ./start-dev.sh
   ```

4. **Install Playwright browsers:**
   ```bash
   cd daon-frontend
   npm install
   npx playwright install chromium webkit firefox
   ```

## Running Tests

### Run all tests
```bash
cd daon-frontend
npm run test:e2e
```

### Run specific test file
```bash
npx playwright test complete-auth-flow.spec.ts
```

### Run specific test
```bash
npx playwright test -g "full registration and 2FA setup flow"
```

### Run tests in headed mode (watch browser)
```bash
npx playwright test --headed
```

### Run tests with UI
```bash
npx playwright test --ui
```

### Run tests in specific browser
```bash
npx playwright test --project=chromium
npx playwright test --project=webkit   # Safari
npx playwright test --project=firefox
```

### Debug a test
```bash
npx playwright test --debug
```

## Test Structure

```
e2e/
├── auth-flow.spec.ts          # Basic UI tests
├── complete-auth-flow.spec.ts # Full authentication flow tests
└── README.md                  # This file
```

## Key Test Scenarios

### 1. New User Flow
```
Login → Enter email → Receive magic link → Click link → 
Setup 2FA (scan QR) → Enter TOTP → Save backup codes → Dashboard
```

### 2. Existing User Flow
```
Login → Enter email → Receive magic link → Click link → 
Enter TOTP → Dashboard
```

### 3. Session Persistence
```
Complete login → Reload page → Still authenticated → 
Navigate to 404 → Back button → Still authenticated
```

### 4. Regression: Refresh Token Bug
```
Complete 2FA setup → Check localStorage → 
Verify refresh_token is NOT "undefined" string
```

### 5. Regression: 2FA Status Display
```
Complete 2FA setup → Dashboard → 
Shows "2FA Enabled" (not "2FA Disabled")
```

### 6. Regression: Light-on-Light Text
```
2FA setup page → TOTP input field → 
Dark text (gray-900) on white background
```

## CI/CD Integration

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Changes to `daon-frontend/**` or `api-server/**`

See `.github/workflows/auth-e2e-tests.yml` for CI configuration.

## Debugging Failed Tests

### View test report
```bash
npx playwright show-report
```

### Check screenshots (on failure)
```bash
ls test-results/
```

### Check traces
```bash
npx playwright show-trace test-results/trace.zip
```

### Enable verbose logging
```bash
DEBUG=pw:api npx playwright test
```

## Test Helpers

The test suite includes helper functions:

- `getLatestMagicLink()` - Fetches the most recent magic link from MailHog
- `clearMailHog()` - Clears all MailHog messages
- `generateTOTP(secret)` - Generates a valid TOTP code from a secret

## Environment Variables

Tests use the following environment variables (defaults shown):

```bash
# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000

# API Server
DB_HOST=localhost
DB_PORT=5432
DB_NAME=daon_db
DB_USER=daon_user
DB_PASSWORD=daon_password
SMTP_HOST=localhost
SMTP_PORT=1025
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
```

## Known Issues

- Tests require MailHog to be running (no mocking)
- TOTP code generation requires time sync (can fail if system clock is off)
- Tests create real database entries (cleanup needed between runs)

## Contributing

When adding new features:

1. **Write tests first** (TDD)
2. **Test critical paths** - especially auth flows
3. **Include regression tests** - for any bugs fixed
4. **Test in all browsers** - use `--project=webkit` and `--project=firefox`
5. **Add accessibility tests** - keyboard navigation, screen readers
6. **Document test scenarios** - update this README

## Performance

Average test run times:
- Full suite: ~3-5 minutes
- Single test: ~15-30 seconds
- CI run: ~5-8 minutes (includes setup)

## Troubleshooting

### Tests fail with "Magic link not found"
- Check MailHog is running: `curl http://localhost:8025/api/v2/messages`
- Check API is sending emails: Check API logs
- Increase wait timeout: Modify `await page.waitForTimeout(2000)` to `5000`

### Tests fail with "Invalid TOTP code"
- System clock may be out of sync
- TOTP secret extraction failed - check selectors
- Time window expired (codes valid for 30 seconds)

### Tests hang indefinitely
- Frontend not started: Check `http://localhost:4000`
- API not started: Check `http://localhost:3000/api/v1/health`
- Database not connected: Check PostgreSQL
- MailHog not running: Check `http://localhost:8025`

### Browser installation issues
```bash
# Reinstall browsers
npx playwright install --force
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [DAON API Documentation](https://docs.daon.network/api/)
- [MailHog Documentation](https://github.com/mailhog/MailHog)
