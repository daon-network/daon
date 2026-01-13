'use client';

/**
 * TwoFactorSetup Component
 * 
 * Correct flow matching backend:
 * 1. Show QR code
 * 2. User enters TOTP code
 * 3. Backend verifies and returns backup codes
 * 4. Show backup codes for download
 * 5. User confirms and completes setup
 */

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { LibIcon } from '@greenfieldoverride/liberation-ui';
import { apiClient } from '../../lib/api-client';
import { getDeviceInfo } from '../../lib/device-fingerprint';
import type { AuthError } from '../../lib/types';

interface TwoFactorSetupProps {
  tempSessionId: string;
  onSuccess?: () => void;
  onError?: (error: AuthError) => void;
}

interface VerifyFormData {
  totpCode: string;
}

export function TwoFactorSetup({ tempSessionId, onSuccess, onError }: TwoFactorSetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [setupData, setSetupData] = useState<{
    secret: string;
    qrCodeUrl: string;
  } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerifyFormData>();

  // Fetch 2FA setup data (QR code)
  useEffect(() => {
    const setup2FA = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiClient.setup2FA({ session_id: tempSessionId });
        setSetupData({
          secret: response.secret,
          qrCodeUrl: response.qr_code,
        });
      } catch (err) {
        const authError = err as AuthError;
        setError(authError.message || 'Failed to setup 2FA');
        onError?.(authError);
      } finally {
        setIsLoading(false);
      }
    };

    setup2FA();
  }, [tempSessionId, onError]);

  const onSubmit = async (data: VerifyFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const deviceInfo = await getDeviceInfo();
      const response = await apiClient.verify2FASetup({
        session_id: tempSessionId,
        code: data.totpCode,
        device_info: deviceInfo,
        trust_device: true,
      });

      // DEBUG: Log the response
      console.log('🔍 2FA Setup Response:', response);
      console.log('🔍 Refresh Token:', response.refresh_token);
      console.log('🔍 Access Token:', response.access_token);

      // Store tokens and user data for AuthProvider
      if (response.access_token && response.refresh_token) {
        console.log('✅ Storing tokens in localStorage');
        localStorage.setItem('daon_refresh_token', response.refresh_token);
        
        // Store user data from response (AuthProvider needs this on reload)
        if (response.user) {
          localStorage.setItem('daon_user', JSON.stringify(response.user));
        }
      }

      // Backend returns backup codes after successful verification
      if (response.backup_codes && response.backup_codes.length > 0) {
        setBackupCodes(response.backup_codes);
        setShowBackupCodes(true);
      } else {
        // No backup codes returned, complete setup
        onSuccess?.();
      }
    } catch (err) {
      const authError = err as AuthError;
      setError(authError.message || 'Verification failed');
      onError?.(authError);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadBackupCodes = () => {
    if (!backupCodes) return;

    const text = `DAON Backup Codes\nGenerated: ${new Date().toISOString()}\n\n${backupCodes.join('\n')}\n\nKeep these codes in a safe place. Each can only be used once.`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daon-backup-codes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyBackupCodes = async () => {
    if (!backupCodes) return;
    await navigator.clipboard.writeText(backupCodes.join('\n'));
  };

  const completeSetup = () => {
    // Clear temp session
    sessionStorage.removeItem('temp_session_id');
    
    // Redirect to dashboard - AuthProvider will load tokens from localStorage
    window.location.href = '/dashboard';
  };

  // Loading state
  if (isLoading && !setupData) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center space-y-4">
            <LibIcon
              icon="Loading"
              size="xl"
              className="mx-auto text-blue-600"
              animation="spin"
            />
            <p className="text-gray-600">Setting up two-factor authentication...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (!setupData) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center space-y-4">
            <LibIcon icon="Error" size="xl" className="mx-auto text-red-600" />
            <h2 className="text-xl font-bold text-gray-900">Setup Failed</h2>
            <p className="text-gray-600">{error || 'Failed to setup 2FA'}</p>
          </div>
        </div>
      </div>
    );
  }

  // Show backup codes after successful TOTP verification
  if (showBackupCodes && backupCodes) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center">
                <LibIcon icon="Success" size="xl" className="text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">2FA Enabled Successfully!</h1>
            <p className="text-gray-600">
              Save your backup codes before continuing
            </p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="flex items-start space-x-2">
              <LibIcon icon="Warning" size="sm" className="text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-900">
                <strong>Critical:</strong> Save these backup codes in a secure location. They're your only way to recover access if you lose your authenticator device.
              </p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <div className="grid grid-cols-2 gap-3 font-mono text-sm">
              {backupCodes.map((code, index) => (
                <div
                  key={index}
                  className="bg-white border border-gray-300 rounded-lg px-4 py-2 text-center text-gray-900"
                >
                  {code}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={downloadBackupCodes}
              className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-600 hover:bg-gray-700 text-white transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              <LibIcon icon="ExternalLink" size="sm" />
              <span>Download</span>
            </button>
            <button
              type="button"
              onClick={copyBackupCodes}
              className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-600 hover:bg-gray-700 text-white transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              <LibIcon icon="ExternalLink" size="sm" />
              <span>Copy</span>
            </button>
          </div>

          <button
            onClick={completeSetup}
            className="w-full py-3 px-4 rounded-xl font-medium bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            Continue to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Initial setup: Show QR code and TOTP verification
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-lg p-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <img 
              src="/logo.svg" 
              alt="DAON Logo" 
              className="w-16 h-16"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Enable Two-Factor Authentication</h1>
          <p className="text-gray-600">
            Secure your account with an extra layer of protection
          </p>
        </div>

        {/* Step 1: QR Code */}
        <div className="border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
              1
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Scan with Your Authenticator App
            </h2>
          </div>
          
          <div className="bg-gray-50 rounded-xl p-6 flex flex-col items-center space-y-4">
            <img
              src={setupData.qrCodeUrl}
              alt="2FA QR Code"
              className="w-64 h-64 border-4 border-white shadow-lg rounded-xl"
            />
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Or enter this code manually:</p>
              <code className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-mono">
                {setupData.secret}
              </code>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>Recommended apps:</strong> Google Authenticator, Authy, 1Password, or any TOTP-compatible app
            </p>
          </div>
        </div>

        {/* Step 2: Verify */}
        <div className="border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold">
              2
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Enter Verification Code</h2>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
              <LibIcon icon="Error" size="lg" className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900">Verification Failed</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="totpCode" className="block text-sm font-medium text-gray-700 mb-2">
                Enter 6-digit code from your authenticator app
              </label>
              <input
                id="totpCode"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                disabled={isLoading}
                {...register('totpCode', {
                  required: 'TOTP code is required',
                  pattern: {
                    value: /^\d{6}$/,
                    message: 'Code must be 6 digits',
                  },
                })}
                className={`
                  block w-full px-4 py-3 text-center text-2xl font-mono tracking-widest
                  border rounded-xl bg-white
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-offset-2
                  disabled:bg-gray-50 disabled:cursor-not-allowed
                  ${
                    errors.totpCode
                      ? 'border-red-300 text-red-900 focus:ring-red-500 focus:border-red-500 disabled:text-red-400'
                      : 'border-gray-300 text-gray-900 focus:ring-green-500 focus:border-green-500 disabled:text-gray-500'
                  }
                `}
                placeholder="000000"
              />
              {errors.totpCode && (
                <p className="mt-2 text-sm text-red-600">{errors.totpCode.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl font-medium bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center space-x-2">
                  <LibIcon icon="Loading" size="sm" animation="spin" />
                  <span>Verifying...</span>
                </span>
              ) : (
                <span>Verify and Enable 2FA</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default TwoFactorSetup;
