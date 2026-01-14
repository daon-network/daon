'use client';

/**
 * Session Settings Component
 *
 * Manage active sessions
 */

import React, { useState } from 'react';
import { useAuth } from '../../lib/hooks/useAuth';
import { apiClient } from '../../lib/api-client';

export default function SessionSettings() {
  const { accessToken, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSignOutEverywhere = async () => {
    if (!accessToken) {
      setError('Not authenticated');
      return;
    }

    if (!confirm('Are you sure you want to sign out from all devices? You will need to log in again on all your devices.')) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Call the revoke-all endpoint (requires 2FA)
      await apiClient.revokeAllTokens(accessToken);

      setSuccess('Signed out from all devices. Logging out...');

      // Logout after 2 seconds
      setTimeout(() => {
        logout();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out from all devices');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Session Info */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">
          Current Session
        </h4>
        <p className="text-sm text-blue-800">
          You are currently signed in on this device. Your session is active and secure.
        </p>
      </div>

      {/* Sign Out Everywhere */}
      <div>
        <h4 className="font-semibold text-gray-900 mb-2">
          Sign Out From All Devices
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          This will immediately sign you out from all devices and browsers where you're currently logged in.
          Useful if you think your account may have been compromised.
        </p>

        <button
          onClick={handleSignOutEverywhere}
          disabled={loading}
         
          className="border-red-300 text-red-600 hover:bg-red-50"
        >
          {loading ? 'Signing Out...' : 'Sign Out Everywhere'}
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
        </div>
      )}

      {/* Info Box */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h4 className="font-semibold text-gray-900 mb-2">
          About Sessions
        </h4>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>• Your session automatically expires after 30 days of inactivity</li>
          <li>• Tokens are refreshed automatically while you're active</li>
          <li>• Device trust lasts for 30 days before requiring 2FA again</li>
          <li>• You can manage trusted devices in the Devices page</li>
        </ul>
      </div>
    </div>
  );
}
