'use client';

/**
 * TwoFactorVerify Component
 * 
 * Beautiful segmented 6-digit code input with:
 * - Individual boxes for each digit [1][2][3][4][5][6]
 * - Paste support (automatically distributes digits)
 * - Auto-focus on next input
 * - Backspace support
 * - Option to use backup code instead
 */

import React, { useState, useRef, useEffect } from 'react';
import { LibIcon } from '@greenfieldoverride/liberation-ui';
import { apiClient } from '../../lib/api-client';
import { getDeviceInfo } from '../../lib/device-fingerprint';
import type { AuthError, User } from '../../lib/types';

interface TwoFactorVerifyProps {
  tempSessionId: string;
  onSuccess?: (accessToken: string, refreshToken: string, user: User) => void;
  onError?: (error: AuthError) => void;
}

export function TwoFactorVerify({ tempSessionId, onSuccess, onError }: TwoFactorVerifyProps) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-submit when all 6 digits are entered
  useEffect(() => {
    if (!useBackupCode && code.every((digit) => digit !== '')) {
      handleSubmit();
    }
  }, [code, useBackupCode]);

  const handleChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!code[index] && index > 0) {
        // If current input is empty, focus previous
        inputRefs.current[index - 1]?.focus();
      } else {
        // Clear current input
        const newCode = [...code];
        newCode[index] = '';
        setCode(newCode);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '');
    
    if (pastedData.length === 6) {
      const newCode = pastedData.split('');
      setCode(newCode);
      inputRefs.current[5]?.focus();
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const deviceInfo = await getDeviceInfo();
      
      const response = await apiClient.complete2FA({
        session_id: tempSessionId,
        code: useBackupCode ? backupCode : code.join(''),
        is_backup_code: useBackupCode,
        trust_device: trustDevice,
        device_info: deviceInfo,
      });

      onSuccess?.(response.access_token, response.refresh_token, response.user);
    } catch (err) {
      const authError = err as AuthError;
      setError(authError.message || 'Verification failed');
      onError?.(authError);
      
      // Clear code on error
      if (!useBackupCode) {
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      } else {
        setBackupCode('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <img 
              src="/logo.svg" 
              alt="DAON Logo" 
              className="w-16 h-16"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Two-Factor Authentication</h1>
          <p className="text-gray-600">
            {useBackupCode
              ? 'Enter one of your backup codes'
              : 'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
            <LibIcon icon="Error" size="lg" className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Verification Failed</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Code Input */}
        {!useBackupCode ? (
          <div className="space-y-4">
            <div className="flex justify-center gap-2">
              {code.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  disabled={isLoading}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  className={`
                    w-12 h-14 text-center text-2xl font-bold
                    border-2 rounded-xl text-gray-900
                    transition-all duration-200
                    focus:outline-none focus:ring-2 focus:ring-offset-2
                    disabled:bg-gray-50 disabled:cursor-not-allowed
                    ${
                      digit
                        ? 'border-green-500 bg-green-50 focus:ring-green-500'
                        : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                    }
                  `}
                />
              ))}
            </div>
            <p className="text-xs text-center text-gray-500">
              Paste is supported - copy all 6 digits and paste into the first box
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="backupCode" className="block text-sm font-medium text-gray-700 mb-2">
              Backup Code
            </label>
            <input
              id="backupCode"
              type="text"
              value={backupCode}
              disabled={isLoading}
              onChange={(e) => setBackupCode(e.target.value)}
              placeholder="xxxx-xxxx-xxxx"
              className="block w-full px-4 py-3 text-center font-mono border border-gray-300 rounded-xl text-gray-900 bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
          </div>
        )}

        {/* Trust Device */}
        <div className="flex items-start space-x-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <input
            type="checkbox"
            id="trustDevice"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
            disabled={isLoading}
            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="trustDevice" className="text-sm text-blue-900 cursor-pointer">
            <span className="font-semibold">Trust this device</span>
            <p className="text-blue-700 mt-1">
              Skip 2FA on this device for 30 days. Only enable on devices you own.
            </p>
          </label>
        </div>

        {/* Submit Button (for backup code) */}
        {useBackupCode && (
          <button
            onClick={handleSubmit}
            disabled={isLoading || !backupCode}
            className="w-full py-3 px-4 rounded-xl font-medium bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center space-x-2">
                <LibIcon icon="Loading" size="sm" animation="spin" />
                <span>Verifying...</span>
              </span>
            ) : (
              <span>Verify</span>
            )}
          </button>
        )}

        {/* Toggle Backup Code */}
        <div className="text-center pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setError(null);
              setCode(['', '', '', '', '', '']);
              setBackupCode('');
            }}
            disabled={isLoading}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors disabled:opacity-50"
          >
            {useBackupCode ? 'Use authenticator app instead' : 'Use backup code instead'}
          </button>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
            <LibIcon icon="Privacy" size="xs" className="text-green-600" />
            <span>Your account is protected by 2FA</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TwoFactorVerify;
