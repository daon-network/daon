/**
 * DAON Authentication API Client
 * 
 * Privacy-focused API client using native fetch (no axios - prevents data leaks in logs)
 */

import type {
  ApiResponse,
  MagicLinkRequest,
  MagicLinkResponse,
  VerifyMagicLinkRequest,
  VerifyMagicLinkResponse,
  TwoFactorSetupRequest,
  TwoFactorSetupResponse,
  TwoFactorVerifySetupRequest,
  TwoFactorVerifySetupResponse,
  TwoFactorCompleteRequest,
  TwoFactorCompleteResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  RevokeTokenRequest,
  DeviceListResponse,
  UpdateDeviceRequest,
  BackupCodesResponse,
  EmailChangeRequest,
  EmailChangeRequestResponse,
  EmailChangeConfirmResponse,
  AuthError,
} from './types';

// ============================================================================
// Configuration
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const API_VERSION = 'v1';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = `${baseUrl}/api/${API_VERSION}`;
  }

  /**
   * Make a fetch request with error handling
   * No logging to prevent sensitive data leaks
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw {
          code: data.error || 'server_error',
          message: data.message || 'An error occurred',
        } as AuthError;
      }

      return data as T;
    } catch (error) {
      // Network error or JSON parse error
      if (error instanceof TypeError) {
        throw {
          code: 'network_error',
          message: 'Network request failed. Please check your connection.',
        } as AuthError;
      }
      
      // Re-throw API errors
      throw error;
    }
  }

  /**
   * Make an authenticated request with access token
   */
  private async authenticatedRequest<T>(
    endpoint: string,
    accessToken: string,
    options: RequestInit = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  // ==========================================================================
  // Authentication Endpoints
  // ==========================================================================

  /**
   * Send magic link to email
   */
  async sendMagicLink(data: MagicLinkRequest): Promise<MagicLinkResponse> {
    return this.request<MagicLinkResponse>('/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Verify magic link token
   */
  async verifyMagicLink(
    token: string,
    deviceInfo: VerifyMagicLinkRequest['device_info']
  ): Promise<VerifyMagicLinkResponse> {
    return this.request<VerifyMagicLinkResponse>(
      `/auth/verify`,
      {
        method: 'POST',
        body: JSON.stringify({ token, device_info: deviceInfo }),
      }
    );
  }

  /**
   * Setup two-factor authentication
   */
  async setup2FA(data: TwoFactorSetupRequest): Promise<TwoFactorSetupResponse> {
    return this.request<TwoFactorSetupResponse>('/auth/2fa/setup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Verify two-factor setup with TOTP code and backup code
   */
  async verify2FASetup(
    data: TwoFactorVerifySetupRequest
  ): Promise<TwoFactorVerifySetupResponse> {
    return this.request<TwoFactorVerifySetupResponse>('/auth/2fa/verify-setup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Complete two-factor authentication
   */
  async complete2FA(
    data: TwoFactorCompleteRequest
  ): Promise<TwoFactorCompleteResponse> {
    return this.request<TwoFactorCompleteResponse>('/auth/2fa/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Refresh access token
   */
  async refreshToken(data: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    return this.request<RefreshTokenResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Revoke a specific refresh token
   */
  async revokeToken(
    accessToken: string,
    data: RevokeTokenRequest
  ): Promise<ApiResponse> {
    return this.authenticatedRequest<ApiResponse>('/auth/revoke', accessToken, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Revoke all refresh tokens (logout from all devices)
   */
  async revokeAllTokens(accessToken: string): Promise<ApiResponse> {
    return this.authenticatedRequest<ApiResponse>(
      '/auth/revoke-all',
      accessToken,
      {
        method: 'POST',
      }
    );
  }

  /**
   * Disable two-factor authentication
   */
  async disable2FA(accessToken: string): Promise<ApiResponse> {
    return this.authenticatedRequest<ApiResponse>(
      '/auth/2fa/disable',
      accessToken,
      {
        method: 'POST',
      }
    );
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(
    accessToken: string
  ): Promise<BackupCodesResponse> {
    return this.authenticatedRequest<BackupCodesResponse>(
      '/auth/2fa/backup-codes/regenerate',
      accessToken,
      {
        method: 'POST',
      }
    );
  }

  // ==========================================================================
  // Device Management Endpoints
  // ==========================================================================

  /**
   * Get list of trusted devices
   */
  async getDevices(accessToken: string): Promise<DeviceListResponse> {
    return this.authenticatedRequest<DeviceListResponse>(
      '/auth/devices',
      accessToken
    );
  }

  /**
   * Update device name
   */
  async updateDevice(
    accessToken: string,
    deviceId: string,
    data: UpdateDeviceRequest
  ): Promise<ApiResponse> {
    return this.authenticatedRequest<ApiResponse>(
      `/auth/devices/${deviceId}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * Delete a trusted device
   */
  async deleteDevice(
    accessToken: string,
    deviceId: string
  ): Promise<ApiResponse> {
    return this.authenticatedRequest<ApiResponse>(
      `/auth/devices/${deviceId}`,
      accessToken,
      {
        method: 'DELETE',
      }
    );
  }

  // ==========================================================================
  // User Management Endpoints
  // ==========================================================================

  /**
   * Request email change
   */
  async requestEmailChange(
    accessToken: string,
    data: EmailChangeRequest
  ): Promise<EmailChangeRequestResponse> {
    return this.authenticatedRequest<EmailChangeRequestResponse>(
      '/user/email/request-change',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * Confirm email change (old email)
   */
  async confirmEmailChange(token: string): Promise<EmailChangeConfirmResponse> {
    return this.request<EmailChangeConfirmResponse>(
      `/user/email/confirm-change?token=${encodeURIComponent(token)}`
    );
  }

  /**
   * Verify new email
   */
  async verifyNewEmail(token: string): Promise<EmailChangeConfirmResponse> {
    return this.request<EmailChangeConfirmResponse>(
      `/user/email/verify-new?token=${encodeURIComponent(token)}`
    );
  }

  /**
   * Cancel pending email change
   */
  async cancelEmailChange(accessToken: string): Promise<ApiResponse> {
    return this.authenticatedRequest<ApiResponse>(
      '/user/email/cancel-change',
      accessToken,
      {
        method: 'POST',
      }
    );
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
export default apiClient;
