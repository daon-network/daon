'use client';

/**
 * Delete Account
 *
 * GDPR Art. 17, self-service. The consequences are stated before the button is
 * pressed rather than in a policy page afterwards — in particular that ledger
 * records cannot be withdrawn by anyone, DAON included. Somebody deciding
 * whether to delete needs that fact while they are deciding.
 */

import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { apiClient } from '../../lib/api-client';
import type { User } from '../../lib/types';

interface DeleteAccountProps {
  user: User;
}

const CONFIRM_PHRASE = 'DELETE MY ACCOUNT';

export default function DeleteAccount({ user }: DeleteAccountProps) {
  const { accessToken, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orphaned: number; note?: string } | null>(null);

  const phraseMatches = confirmText === CONFIRM_PHRASE;
  const codeSatisfied = !user.totp_enabled || totpCode.length > 0;
  const canSubmit = phraseMatches && codeSatisfied && !loading;

  const reset = () => {
    setIsOpen(false);
    setConfirmText('');
    setTotpCode('');
    setError(null);
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!accessToken) {
      setError('Not authenticated');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await apiClient.deleteAccount(accessToken, {
        confirm: confirmText,
        // Omitted entirely rather than sent empty, so the server sees the same
        // thing a client without 2FA would send.
        ...(user.totp_enabled ? { code: totpCode } : {}),
      });

      if (!result.success) {
        setError(result.message || 'Could not delete account');
        setLoading(false);
        return;
      }

      // The session is dead server-side either way. Showing the outcome before
      // logging out is the only chance the person gets to read it.
      setDone({
        orphaned: result.deleted?.registrations_orphaned ?? 0,
        note: result.note,
      });
    } catch (err: any) {
      setError(err?.message || 'Could not delete account');
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg">
        <h4 className="font-semibold text-gray-900 mb-2">Your account has been deleted</h4>
        <p className="text-sm text-gray-700 mb-3">
          Your email address, sessions, devices and activity history have been removed.
        </p>
        {done.orphaned > 0 && (
          <p className="text-sm text-gray-700 mb-4">
            {done.note ??
              `Your ${done.orphaned} registration(s) remain on the public ledger, no longer linked to any account.`}
          </p>
        )}
        <button
          type="button"
          onClick={() => logout()}
          className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="border border-red-200 rounded-lg p-6">
      <h4 className="font-semibold text-red-900 mb-1">Delete account</h4>
      <p className="text-sm text-gray-700 mb-4">
        Permanently deletes your account and the personal data attached to it. This cannot be
        undone.
      </p>

      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
        >
          Delete my account
        </button>
      ) : (
        <form onSubmit={handleDelete} className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
            <p className="font-semibold mb-2">Before you continue</p>
            <ul className="space-y-1">
              <li>• Your email, sessions, trusted devices and activity history are erased.</li>
              <li>
                • Your content registrations stay on the public ledger, no longer linked to you.
                Blockchain records are append-only and <strong>nobody can withdraw them</strong>,
                including us.
              </li>
              <li>
                • Titles and descriptions you wrote are kept in our registry as you wrote them (they
                are never put on the blockchain). If any contain your name or personal details,{' '}
                <strong>edit them before deleting</strong> — afterwards there is no account that can.
              </li>
              <li>• You will not be able to sign in again, or recover this account.</li>
            </ul>
          </div>

          <div>
            <label htmlFor="confirm-phrase" className="block text-sm font-medium text-gray-700 mb-1">
              Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> to confirm
            </label>
            <input
              id="confirm-phrase"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono focus:ring-2 focus:ring-red-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {user.totp_enabled && (
            <div>
              <label htmlFor="delete-totp" className="block text-sm font-medium text-gray-700 mb-1">
                Authentication code
              </label>
              <input
                id="delete-totp"
                type="text"
                inputMode="numeric"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="000000"
                autoComplete="one-time-code"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Deleting…' : 'Permanently delete my account'}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
