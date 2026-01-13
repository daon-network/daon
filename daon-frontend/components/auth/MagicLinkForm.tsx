'use client';

/**
 * MagicLinkForm Component
 * 
 * Email input form that sends magic link for passwordless authentication.
 * Clean, accessible, beautiful design.
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { LibIcon } from '@greenfieldoverride/liberation-ui';
import { apiClient } from '../../lib/api-client';
import type { MagicLinkRequest, AuthError } from '../../lib/types';

interface MagicLinkFormProps {
  onSuccess?: (tempSessionId: string) => void;
  onError?: (error: AuthError) => void;
}

interface FormData {
  email: string;
}

export function MagicLinkForm({ onSuccess, onError }: MagicLinkFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await apiClient.sendMagicLink({ email: data.email });
      setSuccess(true);
      onSuccess?.(response.temp_session_id);
    } catch (err) {
      const authError = err as AuthError;
      setError(authError.message || 'Failed to send magic link');
      onError?.(authError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <img 
              src="/logo.svg" 
              alt="DAON Logo" 
              className="w-16 h-16"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to DAON</h1>
          <p className="text-gray-600">
            Enter your email to receive a secure magic link
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start space-x-3">
            <LibIcon icon="Success" size="lg" className="text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-green-900">Check your email</h3>
              <p className="text-sm text-green-700 mt-1">
                We've sent you a magic link. Click it to sign in securely.
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
            <LibIcon icon="Error" size="lg" className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Email address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <LibIcon icon="Contact" size="sm" className="text-gray-400" />
              </div>
              <input
                id="email"
                type="email"
                autoComplete="email"
                disabled={isLoading || success}
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                })}
                className={`
                  block w-full pl-10 pr-3 py-3 
                  border rounded-xl
                  text-gray-900 bg-white
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-offset-2
                  disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
                  ${
                    errors.email
                      ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                      : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                  }
                `}
                placeholder="you@example.com"
              />
            </div>
            {errors.email && (
              <p className="mt-2 text-sm text-red-600 flex items-center space-x-1">
                <LibIcon icon="Alert" size="xs" />
                <span>{errors.email.message}</span>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || success}
            className={`
              w-full py-3 px-4 rounded-xl font-medium
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
              disabled:opacity-50 disabled:cursor-not-allowed
              ${
                success
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl'
              }
            `}
          >
            {isLoading ? (
              <span className="flex items-center justify-center space-x-2">
                <LibIcon icon="Loading" size="sm" animation="spin" />
                <span>Sending...</span>
              </span>
            ) : success ? (
              <span className="flex items-center justify-center space-x-2">
                <LibIcon icon="Success" size="sm" />
                <span>Sent!</span>
              </span>
            ) : (
              <span className="flex items-center justify-center space-x-2">
                <span>Send Magic Link</span>
                <LibIcon icon="Arrow" size="sm" />
              </span>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
            <LibIcon icon="Privacy" size="xs" className="text-blue-600" />
            <span>Passwordless authentication • Privacy-first</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MagicLinkForm;
