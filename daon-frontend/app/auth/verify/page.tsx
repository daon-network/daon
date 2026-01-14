'use client';

/**
 * Magic Link Verification Page
 * 
 * Handles magic link token verification from email
 */

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LibIcon } from '@greenfieldoverride/liberation-ui';
import { apiClient } from '../../../lib/api-client';
import { getDeviceInfo } from '../../../lib/device-fingerprint';
import type { AuthError } from '../../../lib/types';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [error, setError] = useState<string | null>(null);
  const [requires2FA, setRequires2FA] = useState(false);

  useEffect(() => {
    const verifyToken = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setError('No verification token provided');
        return;
      }

      try {
        const deviceInfo = await getDeviceInfo();
        const response = await apiClient.verifyMagicLink(token, deviceInfo);

        if (response.requires_2fa) {
          // User needs 2FA verification
          setRequires2FA(true);
          setStatus('success');
          const sessionId = response.session_id || response.temp_session_id;
          if (sessionId) {
            sessionStorage.setItem('temp_session_id', sessionId);
          }
          
          // Route based on whether user has 2FA enabled already
          const hasTotp = response.user?.totp_enabled === true;
          setTimeout(() => {
            if (hasTotp) {
              // Existing 2FA user - go to verification page
              router.push('/auth/2fa');
            } else {
              // New user - go to setup page
              router.push('/auth/setup-2fa');
            }
          }, 2000);
        } else {
          // No 2FA required - user is logged in
          setStatus('success');
          
          // Store tokens (AuthProvider will pick them up)
          if (response.access_token && response.refresh_token) {
            // TODO: Update AuthProvider state
            localStorage.setItem('daon_refresh_token', response.refresh_token);
          }

          setTimeout(() => {
            router.push('/dashboard');
          }, 2000);
        }
      } catch (err) {
        const authError = err as AuthError;
        setStatus('error');
        setError(authError.message || 'Verification failed');
      }
    };

    verifyToken();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
          {status === 'verifying' && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
                  <LibIcon
                    icon="Loading"
                    size="xl"
                    className="text-white"
                    animation="spin"
                  />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Verifying...</h1>
              <p className="text-gray-600">
                Please wait while we verify your magic link
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center">
                  <LibIcon icon="Success" size="xl" className="text-white" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                {requires2FA ? 'Verification Complete' : 'Success!'}
              </h1>
              <p className="text-gray-600">
                {requires2FA
                  ? 'Redirecting to two-factor authentication...'
                  : 'Redirecting to your dashboard...'}
              </p>
              <div className="flex justify-center">
                <div className="animate-pulse flex space-x-2">
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                  <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                  <div className="w-2 h-2 bg-pink-600 rounded-full"></div>
                </div>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl flex items-center justify-center">
                  <LibIcon icon="Error" size="xl" className="text-white" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                Verification Failed
              </h1>
              <p className="text-gray-600">
                {error || 'The verification link is invalid or has expired.'}
              </p>
              <button
                onClick={() => router.push('/auth/login')}
                className="w-full py-3 px-4 rounded-xl font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Back to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <LibIcon icon="Loading" size="xl" className="text-blue-600 mx-auto mb-4" animation="spin" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
