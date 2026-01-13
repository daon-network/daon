/**
 * TypeScript types for DAON Authentication API
 */

// ============================================================================
// Device Info Types
// ============================================================================

export interface DeviceInfo {
  screen?: string;
  timezone?: string;
  device_id?: string;
  device_fingerprint?: string;
}

export interface TrustedDevice {
  id: string;
  name: string;
  device_info: any;
  trusted_at: string;
  trusted_until: string;
  last_used_at: string;
  is_current?: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = void> {
  success: boolean;
  error?: string;
  message?: string;
  data?: T;
}

export interface MagicLinkResponse {
  success: true;
  message: string;
  temp_session_id: string;
}

export interface VerifyMagicLinkResponse {
  success?: true;
  requires_2fa: boolean;
  session_id?: string;
  temp_session_id?: string;
  user?: {
    id: number;
    email: string;
    username: string;
    totp_enabled: boolean;
  };
  access_token?: string;
  refresh_token?: string;
  device_trusted?: boolean;
}

export interface TwoFactorSetupResponse {
  secret: string;
  qr_code: string;
  manual_entry_key: string;
  issuer: string;
  account_name: string;
}

export interface TwoFactorVerifySetupResponse {
  requires_2fa: boolean;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  backup_codes: string[];
  user: {
    id: number;
    email: string;
    username: string;
    totp_enabled: boolean;
  };
}

export interface TwoFactorCompleteResponse {
  requires_2fa: false;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: number;
    email: string;
    username: string;
    totp_enabled: boolean;
  };
}

export interface RefreshTokenResponse {
  success: true;
  access_token: string;
  refresh_token: string;
}

export interface DeviceListResponse {
  success: true;
  devices: TrustedDevice[];
}

export interface BackupCodesResponse {
  success: true;
  backup_codes: string[];
  message: string;
}

export interface EmailChangeRequestResponse {
  success: true;
  message: string;
}

export interface EmailChangeConfirmResponse {
  success: true;
  message: string;
}

// ============================================================================
// Request Payload Types
// ============================================================================

export interface MagicLinkRequest {
  email: string;
}

export interface VerifyMagicLinkRequest {
  token: string;
  device_info: DeviceInfo;
}

export interface TwoFactorSetupRequest {
  session_id: string;
}

export interface TwoFactorVerifySetupRequest {
  session_id: string;
  code: string;
  device_info?: {
    device_id?: string;
    device_fingerprint?: string;
    screen?: string;
    timezone?: string;
  };
  trust_device?: boolean;
}

export interface TwoFactorCompleteRequest {
  session_id: string;
  code: string;
  is_backup_code: boolean;
  trust_device: boolean;
  device_info: DeviceInfo;
}

export interface RefreshTokenRequest {
  refresh_token: string;
  device_info: DeviceInfo;
}

export interface RevokeTokenRequest {
  refresh_token: string;
}

export interface UpdateDeviceRequest {
  name: string;
}

export interface EmailChangeRequest {
  new_email: string;
  code: string;
}

// ============================================================================
// Authentication State Types
// ============================================================================

export interface User {
  id: number;
  email: string;
  username: string | null;
  totp_enabled: boolean;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthContextType extends AuthState {
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

// ============================================================================
// Error Types
// ============================================================================

export type AuthErrorCode =
  | 'invalid_request'
  | 'invalid_token'
  | 'token_expired'
  | 'unauthorized'
  | 'server_error'
  | 'user_not_found'
  | 'invalid_code'
  | 'setup_not_found'
  | 'device_not_found'
  | 'network_error';

export interface AuthError {
  code: AuthErrorCode;
  message: string;
}
