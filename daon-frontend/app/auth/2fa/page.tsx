'use client';

/**
 * 2FA Verification Page
 * 
 * For existing users completing 2FA login
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TwoFactorVerify } from '../../../components/auth/TwoFactorVerify';
import { useAuth } from '../../../hooks/useAuth';

export default function TwoFactorPage() {
  const router = useRouter();
  const auth = useAuth();
  const [tempSessionId, setTempSessionId] = useState<string | null>(null);

  useEffect(() => {
    // Get session from URL parameter first, fallback to sessionStorage
    const params = new URLSearchParams(window.location.search);
    const sessionFromUrl = params.get('session');
    const sessionFromStorage = sessionStorage.getItem('temp_session_id');
    const sessionId = sessionFromUrl || sessionFromStorage;

    if (!sessionId) {
      router.push('/auth/login');
      return;
    }

    // Store in sessionStorage for future use
    if (sessionFromUrl) {
      sessionStorage.setItem('temp_session_id', sessionFromUrl);
    }

    setTempSessionId(sessionId);
  }, [router]);

  const handleSuccess = (accessToken: string, refreshToken: string, user: any) => {
    sessionStorage.removeItem('temp_session_id');

    // Update AuthProvider state immediately
    if (auth && (auth as any).setAuthState) {
      (auth as any).setAuthState(user, accessToken, refreshToken);
    }

    router.push('/dashboard');
  };

  if (!tempSessionId) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <TwoFactorVerify tempSessionId={tempSessionId} onSuccess={handleSuccess} />
    </div>
  );
}
