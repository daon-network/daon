'use client';

/**
 * 2FA Setup Page
 * 
 * For new users setting up 2FA for the first time
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TwoFactorSetup } from '../../../components/auth/TwoFactorSetup';

export default function Setup2FAPage() {
  const router = useRouter();
  const [tempSessionId, setTempSessionId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    // Get session from URL parameter first, fallback to sessionStorage
    const params = new URLSearchParams(window.location.search);
    setSearchParams(params);

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

  const handleSuccess = () => {
    sessionStorage.removeItem('temp_session_id');
    router.push('/dashboard');
  };

  if (!tempSessionId) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <TwoFactorSetup tempSessionId={tempSessionId} onSuccess={handleSuccess} />
    </div>
  );
}
