'use client';

/**
 * 2FA Verification Page
 * 
 * For existing users completing 2FA login
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TwoFactorVerify } from '../../../components/auth/TwoFactorVerify';

export default function TwoFactorPage() {
  const router = useRouter();
  const [tempSessionId, setTempSessionId] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = sessionStorage.getItem('temp_session_id');
    if (!sessionId) {
      router.push('/auth/login');
      return;
    }
    setTempSessionId(sessionId);
  }, [router]);

  const handleSuccess = (accessToken: string, refreshToken: string, user: any) => {
    sessionStorage.removeItem('temp_session_id');
    localStorage.setItem('daon_refresh_token', refreshToken);
    localStorage.setItem('daon_user', globalThis.JSON.stringify(user));
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
