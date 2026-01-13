# DAON Frontend Architecture

This document provides a comprehensive overview of the DAON Frontend architecture, design decisions, and implementation patterns.

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [Project Structure](#project-structure)
3. [Authentication Architecture](#authentication-architecture)
4. [State Management](#state-management)
5. [API Integration](#api-integration)
6. [Security Considerations](#security-considerations)
7. [Testing Strategy](#testing-strategy)
8. [Performance Optimizations](#performance-optimizations)
9. [Design System](#design-system)

---

## Technology Stack

### Core Framework
- **Next.js 16.0.7** - React framework with App Router
- **React 19.2.0** - UI library
- **TypeScript 5** - Type safety and developer experience

### Styling & UI
- **Tailwind CSS 4.0** - Utility-first CSS framework
- **liberation-ui** - Custom component library (local package)
- **PostCSS** - CSS processing

### Forms & Validation
- **react-hook-form 7.68.0** - Form state management and validation

### Authentication & Security
- **@fingerprintjs/fingerprintjs 5.0.1** - Device fingerprinting
- **speakeasy 2.0.0** - TOTP generation for 2FA (dev dependency)
- Native fetch API - No axios to prevent data leaks

### Testing
- **Playwright 1.57.0** - End-to-end testing framework

---

## Project Structure

```
daon-frontend/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout with AuthProvider
│   ├── page.tsx                # Home page with auth redirect
│   ├── auth/                   # Authentication pages
│   │   ├── login/              # Magic link entry
│   │   ├── verify/             # Magic link verification
│   │   ├── setup-2fa/          # First-time 2FA setup
│   │   └── 2fa/                # 2FA verification
│   ├── dashboard/              # Protected dashboard
│   ├── assets/                 # Content protection
│   ├── settings/               # User settings
│   └── verify/[hash]/          # Public verification
│
├── components/                 # React components
│   ├── auth/                   # Authentication components
│   │   ├── MagicLinkForm.tsx   # Email input
│   │   ├── TwoFactorSetup.tsx  # 2FA setup wizard
│   │   └── TwoFactorVerify.tsx # 2FA verification
│   ├── assets/                 # Content protection
│   │   ├── RegisterContentForm.tsx
│   │   └── AssetsList.tsx
│   └── providers/              # Context providers
│       └── AuthProvider.tsx    # Auth state management
│
├── lib/                        # Utilities and services
│   ├── api-client.ts           # API integration layer
│   ├── types.ts                # TypeScript type definitions
│   └── device-fingerprint.ts   # Device identification
│
├── liberation-ui/              # Local UI component library
│   ├── components/             # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   └── Icons.tsx
│   └── package.json            # Local package config
│
├── e2e/                        # Playwright tests
│   ├── complete-auth-flow.spec.ts
│   ├── magic-link.spec.ts
│   └── content-registration.spec.ts
│
└── public/                     # Static assets
```

---

## Authentication Architecture

### Overview

The authentication system uses a passwordless magic link flow with mandatory two-factor authentication (2FA) and device trust capabilities.

### Authentication Flow

```
1. User enters email → Magic link sent
2. User clicks link → Token verified → Check 2FA status
   ├─ No 2FA configured → Setup 2FA (mandatory)
   │  ├─ Generate QR code
   │  ├─ Verify TOTP code
   │  ├─ Generate backup codes
   │  └─ User confirms saved codes
   └─ 2FA configured → Check device trust
      ├─ Trusted device → Login complete
      └─ New device → Require 2FA verification
         ├─ Enter TOTP code OR backup code
         ├─ Optional: Trust this device (30 days)
         └─ Login complete
```

### Token Management

**Access Tokens:**
- Lifetime: 15 minutes
- Storage: In-memory only (never localStorage)
- Format: JWT with user_id, email, totp_enabled
- Usage: Added to Authorization header for API calls

**Refresh Tokens:**
- Lifetime: 30 days
- Storage: localStorage (secure, revocable)
- Usage: Automatically refresh access tokens
- Rotation: Optional, configurable

**Implementation (AuthProvider.tsx):**

```typescript
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshMutexRef = useRef(false);

  // BroadcastChannel for multi-tab sync
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Auto-refresh with mutex to prevent race conditions
  const refreshAccessToken = async () => {
    if (refreshMutexRef.current) return;
    refreshMutexRef.current = true;

    try {
      const result = await apiClient.refreshToken();
      setUser(result.user);
      // Broadcast to other tabs
      channelRef.current?.postMessage({ type: 'TOKEN_REFRESHED' });
    } finally {
      refreshMutexRef.current = false;
    }
  };
}
```

### Device Trust System

**Device Identification:**
1. Primary: localStorage device_id (UUID v4)
2. Fallback: FingerprintJS browser fingerprint
3. Combined: `device_id + fingerprint_id` sent to backend

**Trust Duration:**
- 30 days from last verification
- User can revoke trust for any device
- Automatic expiry and cleanup

---

## State Management

### Global State (React Context)

**AuthContext** - Authentication state
- Current user information
- Loading states
- Login/logout methods
- Token refresh logic
- Multi-tab synchronization

**Why Context over Redux/Zustand?**
- Simple state requirements (only auth)
- Built-in React feature (no extra dependencies)
- Sufficient for current needs
- Easy to migrate if needed

### Local State (useState/useForm)

- Form inputs (react-hook-form)
- Component-specific UI state
- Modal/dialog state
- Loading indicators

### Client-Side Storage

**localStorage:**
- Refresh tokens (revocable)
- Device ID (UUID)
- User assets list (cache)
- UI preferences

**Memory only:**
- Access tokens (security)
- Sensitive user data

---

## API Integration

### API Client Architecture

**File:** `lib/api-client.ts`

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

class APIClient {
  private accessToken: string | null = null;

  // Store access token in memory only
  setAccessToken(token: string) {
    this.accessToken = token;
  }

  // Automatic header injection
  private async request(endpoint: string, options: RequestInit = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Token expired, trigger refresh
      // ... refresh logic
    }

    return response.json();
  }

  // Authentication methods
  async sendMagicLink(email: string) { ... }
  async verifyMagicLink(token: string) { ... }
  async setup2FA() { ... }
  async verify2FASetup(code: string) { ... }

  // Content protection methods
  async protectContent(data: ProtectContentRequest) { ... }
  async verifyContent(hash: string) { ... }

  // ... 17 total methods
}

export const apiClient = new APIClient();
```

### Why Native Fetch (Not Axios)?

**Security Reasons:**
1. Axios logs sensitive data by default (tokens, codes)
2. Native fetch has no logging overhead
3. No third-party dependency vulnerabilities
4. Smaller bundle size
5. Full control over request/response handling

---

## Security Considerations

### 1. Token Storage

**Access Tokens:**
- ✅ Memory only (class instance variable)
- ❌ Never in localStorage
- ❌ Never in cookies (CSRF risk)
- Reason: XSS attacks can't access memory across page loads

**Refresh Tokens:**
- ✅ localStorage (revocable server-side)
- ❌ Never in memory for long periods
- Reason: Server can invalidate if compromised

### 2. XSS Prevention

- React's built-in XSS protection (JSX escaping)
- No dangerouslySetInnerHTML usage
- Content Security Policy headers (via Next.js)
- Input sanitization on all forms

### 3. CSRF Protection

- Stateless JWT tokens (no session cookies)
- SameSite cookie attributes (if needed)
- Device fingerprinting adds extra layer

### 4. Data Privacy

- No analytics libraries (privacy-first)
- No third-party tracking
- Minimal data collection
- User-controlled data deletion

### 5. API Communication

- HTTPS only in production
- Token refresh on 401 responses
- Automatic logout on critical errors
- Rate limiting awareness

---

## Testing Strategy

### E2E Testing (Playwright)

**Test Coverage: 13/14 tests (92.9%)**

**Test Categories:**

1. **Authentication Flow (5 tests)**
   - Magic link request
   - Token verification
   - 2FA setup
   - 2FA verification
   - Device trust

2. **Content Protection (4 tests)**
   - File upload
   - Text paste
   - Metadata validation
   - Blockchain integration

3. **UI Interactions (4 tests)**
   - Form validation
   - Error states
   - Loading states
   - Navigation

**Example Test:**

```typescript
// e2e/complete-auth-flow.spec.ts
test('complete authentication flow', async ({ page }) => {
  // 1. Request magic link
  await page.goto('/auth/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.click('button[type="submit"]');

  // 2. Verify magic link (simulate)
  const token = await getLatestMagicLinkToken();
  await page.goto(`/auth/verify?token=${token}`);

  // 3. Setup 2FA
  await expect(page).toHaveURL('/auth/setup-2fa');
  const secret = await page.locator('[data-testid="totp-secret"]').textContent();
  const code = generateTOTPCode(secret);
  await page.fill('[data-testid="totp-input"]', code);
  await page.click('button[type="submit"]');

  // 4. Save backup codes
  await page.click('[data-testid="download-codes"]');
  const backupCode = await page.locator('[data-testid="backup-code-0"]').textContent();
  await page.fill('[data-testid="confirm-code"]', backupCode);
  await page.click('button[type="submit"]');

  // 5. Verify login complete
  await expect(page).toHaveURL('/dashboard');
});
```

### Unit Testing (Future)

Currently no unit tests. Future additions:
- Component testing with Vitest
- Hook testing with React Testing Library
- API client mocking with MSW

---

## Performance Optimizations

### 1. Next.js App Router Benefits

- Automatic code splitting
- Server components for static content
- Streaming for faster page loads
- Prefetching for instant navigation

### 2. Image Optimization

- Next.js Image component (when images added)
- Lazy loading for off-screen content
- Responsive images

### 3. Bundle Size

- Native fetch (no axios: ~4KB saved)
- Tailwind CSS purging (only used classes)
- Tree-shaking for all imports

### 4. Client-Side Caching

- localStorage for user assets
- React Context prevents prop drilling
- Memo components where beneficial

### 5. API Optimization

- Automatic token refresh (prevents re-login)
- Request deduplication
- Optimistic UI updates

---

## Design System

### Color Palette

**Gradients:**
- Primary: `from-blue-50 via-purple-50 to-pink-50`
- Cards: White with gradient background

**Text:**
- Primary: `text-gray-900`
- Secondary: `text-gray-600`
- Muted: `text-gray-400`

### Typography

**Scale:**
- Headings: `text-3xl`, `text-2xl`, `text-xl`
- Body: `text-base`
- Small: `text-sm`, `text-xs`

**Weight:**
- Bold: `font-bold` (headings)
- Semibold: `font-semibold` (subheadings)
- Normal: `font-normal` (body)

### Spacing

**Consistent Scale:**
- XS: `p-2`, `m-2` (8px)
- SM: `p-4`, `m-4` (16px)
- MD: `p-6`, `m-6` (24px)
- LG: `p-8`, `m-8` (32px)
- XL: `p-12`, `m-12` (48px)

### Component Patterns

**Cards:**
```tsx
<div className="bg-white rounded-2xl shadow-lg p-8">
  {/* Card content */}
</div>
```

**Buttons:**
```tsx
<Button className="bg-gradient-to-r from-blue-500 to-purple-600">
  Primary Action
</Button>
```

**Inputs:**
```tsx
<Input
  className="rounded-lg border-gray-300 focus:border-purple-500"
  placeholder="Enter value"
/>
```

### Accessibility

- WCAG 2.1 AA compliance goal
- Keyboard navigation support
- ARIA labels on interactive elements
- Focus indicators on all focusable elements
- Screen reader friendly

---

## Future Enhancements

### Short Term
- [ ] Complete settings page
- [ ] Device management UI
- [ ] Bulk registration
- [ ] Error boundaries
- [ ] Fix hardcoded URLs

### Medium Term
- [ ] OAuth providers (Discord, Google)
- [ ] Server-synced asset tracking
- [ ] Admin dashboard
- [ ] Broker dashboard
- [ ] Unit tests with Vitest

### Long Term
- [ ] PWA capabilities
- [ ] Offline mode
- [ ] Push notifications
- [ ] Advanced analytics dashboard
- [ ] Multi-language support

---

## Development Guidelines

### Code Style

- Use TypeScript strict mode
- Prefer functional components
- Use hooks over class components
- Extract reusable logic to custom hooks
- Keep components small (<300 lines)

### Naming Conventions

- Components: PascalCase (UserProfile.tsx)
- Hooks: camelCase with 'use' prefix (useAuth.ts)
- Utilities: camelCase (api-client.ts)
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces: PascalCase

### File Organization

- One component per file
- Co-locate tests with components
- Group related components in directories
- Keep utilities separate from components

---

## Troubleshooting

### Common Issues

**1. Token Refresh Failing**
- Check NEXT_PUBLIC_API_URL env variable
- Verify API server is running
- Check browser console for errors

**2. 2FA QR Code Not Displaying**
- Ensure speakeasy is in devDependencies
- Check server is generating valid TOTP secret
- Verify QR code SVG is rendering

**3. Multi-Tab Sync Not Working**
- BroadcastChannel not supported in Safari <15.4
- Fallback to localStorage events needed
- Check browser compatibility

### Debug Mode

Enable debug logging:
```typescript
// lib/api-client.ts
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true';

if (DEBUG) {
  console.log('API Request:', endpoint, options);
}
```

---

## Contributors

Built with ❤️ for creators everywhere by the DAON Network team.

For questions or contributions, see [README.md](./README.md).
