'use client';

/**
 * Devices Management Page
 *
 * View and manage trusted devices
 */

import React from 'react';
import { useAuth } from '../../../lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import DeviceManager from '../../../components/settings/DeviceManager';

export default function DevicesPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  // Redirect if not authenticated
  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading devices...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/settings')}
            className="text-purple-600 hover:text-purple-700 mb-4 flex items-center gap-2"
          >
            ← Back to Settings
          </button>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Trusted Devices
          </h1>
          <p className="text-gray-600">
            Manage devices that can skip 2FA for 30 days
          </p>
        </div>

        {/* Device Manager */}
        <DeviceManager />
      </div>
    </div>
  );
}
