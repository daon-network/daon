'use client';

/**
 * Dashboard Page
 * 
 * Protected example page showing authenticated user info
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LibIcon } from '@greenfieldoverride/liberation-ui';
import { useAuth } from '../../hooks/useAuth';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <LibIcon
            icon="Loading"
            size="xl"
            className="text-blue-600 mx-auto mb-4"
            animation="spin"
          />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* Header */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <img 
                src="/logo.svg" 
                alt="DAON Logo" 
                className="w-10 h-10"
              />
              <div>
                <h1 className="text-xl font-bold text-gray-900">DAON</h1>
                <p className="text-xs text-gray-500">Creator Protection Network</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/settings')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <LibIcon icon="Settings" size="lg" />
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Welcome Card */}
          <div className="bg-white rounded-2xl shadow-lg p-8 md:col-span-2 lg:col-span-3">
            <div className="flex items-start space-x-4">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                <LibIcon icon="Success" size="xl" className="text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Welcome to DAON!
                </h2>
                <p className="text-gray-600 mb-4">
                  You're successfully authenticated with email: <strong>{user.email}</strong>
                </p>
                <div className="flex items-center space-x-2 text-sm">
                  <LibIcon icon="Privacy" size="sm" className="text-green-600" />
                  <span className="text-green-700 font-medium">
                    {user.totp_enabled ? '2FA Enabled' : '2FA Disabled'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Content Protection */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <LibIcon icon="Privacy" size="lg" className="text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900">Content Protection</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Register your creative works on the blockchain
            </p>
            <button
              onClick={() => router.push('/assets')}
              className="w-full py-2 px-4 rounded-lg font-medium bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white transition-colors"
            >
              Protect Content
            </button>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <LibIcon icon="Settings" size="lg" className="text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Account Settings</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Manage your 2FA, devices, and security preferences
            </p>
            <button
              onClick={() => router.push('/settings')}
              className="w-full py-2 px-4 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Go to Settings
            </button>
          </div>

          {/* Privacy Info */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <LibIcon icon="Privacy" size="lg" className="text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900">Privacy First</h3>
            </div>
            <p className="text-sm text-gray-600">
              Your authentication data is encrypted and never shared. We use passwordless magic links and optional 2FA for maximum security.
            </p>
          </div>

          {/* Features */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <LibIcon icon="Freedom" size="lg" className="text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Content Protection</h3>
            </div>
            <p className="text-sm text-gray-600">
              Protect your creative work on the blockchain. Coming soon: content registration and provenance tracking.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
