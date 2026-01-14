'use client';

/**
 * Account Settings Component
 *
 * Manage email and account information
 */

import React, { useState } from 'react';
import { useAuth } from '../../lib/hooks/useAuth';
import { apiClient } from '../../lib/api-client';
import type { User } from '../../lib/types';

interface AccountSettingsProps {
  user: User;
}

export default function AccountSettings({ user }: AccountSettingsProps) {
  const { accessToken } = useAuth();
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleEmailChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!accessToken) {
      setError('Not authenticated');
      return;
    }

    if (!newEmail || !totpCode) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await apiClient.requestEmailChange(accessToken, {
        new_email: newEmail,
        code: totpCode,
      });

      setSuccess(
        'Email change initiated! Check both your old and new email addresses for confirmation links.'
      );
      setNewEmail('');
      setTotpCode('');
      setIsChangingEmail(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request email change');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Email */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Current Email
        </label>
        <div className="flex items-center">
          <input
            type="email"
            value={user.email}
            disabled
            className="flex-1 bg-gray-50"
          />
        </div>
      </div>

      {/* Change Email Section */}
      {!isChangingEmail ? (
        <button
          onClick={() => setIsChangingEmail(true)}
         
          className="w-full sm:w-auto"
        >
          Change Email
        </button>
      ) : (
        <form onSubmit={handleEmailChangeRequest} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Email Address
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@example.com"
              required
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              2FA Code (Required for Email Change)
            </label>
            <input
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="000000"
              maxLength={6}
              pattern="[0-9]{6}"
              required
              className="w-full"
            />
            <p className="text-sm text-gray-500 mt-1">
              Enter your 6-digit 2FA code to authorize this change
            </p>
          </div>

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

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-initial"
            >
              {loading ? 'Requesting...' : 'Request Email Change'}
            </button>
            <button
              type="button"
             
              onClick={() => {
                setIsChangingEmail(false);
                setNewEmail('');
                setTotpCode('');
                setError(null);
                setSuccess(null);
              }}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Info Box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">
          How Email Change Works
        </h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• You'll receive a confirmation link at your current email</li>
          <li>• A verification link will be sent to your new email</li>
          <li>• Both links must be clicked to complete the change</li>
          <li>• 2FA is required for security</li>
        </ul>
      </div>
    </div>
  );
}
