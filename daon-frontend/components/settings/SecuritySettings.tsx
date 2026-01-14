'use client';

/**
 * Security Settings Component
 *
 * Manage 2FA and security preferences
 */

import React, { useState } from 'react';
import { useAuth } from '../../lib/hooks/useAuth';
import { apiClient } from '../../lib/api-client';
import type { User } from '../../lib/types';

interface SecuritySettingsProps {
  user: User;
}

export default function SecuritySettings({ user }: SecuritySettingsProps) {
  const { accessToken, logout } = useAuth();
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showDisable2FA, setShowDisable2FA] = useState(false);

  const handleRegenerateBackupCodes = async () => {
    if (!accessToken) {
      setError('Not authenticated');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setBackupCodes([]);

    try {
      const result = await apiClient.regenerateBackupCodes(accessToken);

      if (result.success && result.backup_codes) {
        setBackupCodes(result.backup_codes);
        setSuccess('New backup codes generated! Save them now - they will only be shown once.');
      } else {
        setError('Failed to generate backup codes');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate backup codes');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!accessToken) {
      setError('Not authenticated');
      return;
    }

    if (!totpCode) {
      setError('Please enter your 2FA code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiClient.disable2FA(accessToken);
      setSuccess('2FA disabled successfully. You will be logged out.');

      // Logout after 2 seconds
      setTimeout(() => {
        logout();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const downloadBackupCodes = () => {
    const content = backupCodes.join('\n');
    const blob = new Blob([`DAON Backup Codes\n\nKeep these codes safe. Each can only be used once.\n\n${content}\n\nGenerated: ${new Date().toLocaleString()}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daon-backup-codes-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 2FA Status */}
      <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
        <div>
          <h4 className="font-semibold text-green-900">
            Two-Factor Authentication
          </h4>
          <p className="text-sm text-green-700 mt-1">
            {user.totp_enabled ? 'Enabled and protecting your account' : 'Not enabled'}
          </p>
        </div>
        <div className="flex items-center">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            ✓ Active
          </span>
        </div>
      </div>

      {/* Backup Codes */}
      <div>
        <h4 className="font-semibold text-gray-900 mb-2">Backup Codes</h4>
        <p className="text-sm text-gray-600 mb-4">
          Generate new backup codes if you've used all your current ones or lost them.
        </p>

        <button
          onClick={handleRegenerateBackupCodes}
          disabled={loading}
         
          className="w-full sm:w-auto"
        >
          {loading ? 'Generating...' : 'Regenerate Backup Codes'}
        </button>

        {backupCodes.length > 0 && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h5 className="font-semibold text-yellow-900">
                  Your New Backup Codes
                </h5>
                <p className="text-sm text-yellow-700 mt-1">
                  Save these codes now - they won't be shown again!
                </p>
              </div>
              <button
                onClick={downloadBackupCodes}
               
               
              >
                Download
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {backupCodes.map((code, index) => (
                <div
                  key={index}
                  className="p-2 bg-white border border-yellow-300 rounded text-center"
                >
                  {code}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Disable 2FA */}
      <div className="border-t border-gray-200 pt-6">
        <h4 className="font-semibold text-gray-900 mb-2 text-red-600">
          Danger Zone
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          Disabling 2FA will make your account less secure.
        </p>

        {!showDisable2FA ? (
          <button
            onClick={() => setShowDisable2FA(true)}
           
            className="border-red-300 text-red-600 hover:bg-red-50"
          >
            Disable Two-Factor Authentication
          </button>
        ) : (
          <form onSubmit={handleDisable2FA} className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800 font-medium">
                Are you sure? This will significantly reduce your account security.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter Your 2FA Code to Confirm
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
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="bg-red-600 hover:bg-red-700"
              >
                {loading ? 'Disabling...' : 'Yes, Disable 2FA'}
              </button>
              <button
                type="button"
               
                onClick={() => {
                  setShowDisable2FA(false);
                  setTotpCode('');
                  setError(null);
                }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
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
    </div>
  );
}
