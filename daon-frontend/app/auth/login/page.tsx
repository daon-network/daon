'use client';

/**
 * Login Page
 * 
 * Magic link authentication entry point
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { MagicLinkForm } from '../../../components/auth/MagicLinkForm';

export default function LoginPage() {
  const router = useRouter();

  const handleSuccess = (tempSessionId: string) => {
    // Store temp session ID for later use if needed
    sessionStorage.setItem('temp_session_id', tempSessionId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <MagicLinkForm onSuccess={handleSuccess} />
    </div>
  );
}
