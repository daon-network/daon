'use client';

/**
 * Assets Page
 * 
 * Manage protected content and view registration status
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LibIcon } from '@greenfieldoverride/liberation-ui';
import { useAuth } from '../../hooks/useAuth';
import { RegisterContentForm } from '../../components/assets/RegisterContentForm';
import { AssetsList } from '../../components/assets/AssetsList';
import BulkRegisterForm from '../../components/assets/BulkRegisterForm';

type Tab = 'register' | 'my-assets' | 'bulk';

export default function AssetsPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('register');

  // Redirect if not authenticated
  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isAuthenticated, isLoading, router]);

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
                onClick={() => router.push('/dashboard')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <LibIcon icon="Settings" size="lg" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Page Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Content Protection</h2>
          <p className="text-gray-600">
            Register your creative works on the blockchain and manage your protected assets
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('register')}
                className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                  activeTab === 'register'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <LibIcon icon="Privacy" size="sm" />
                  <span>Register Content</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('my-assets')}
                className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                  activeTab === 'my-assets'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <LibIcon icon="Success" size="sm" />
                  <span>My Assets</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('bulk')}
                className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                  activeTab === 'bulk'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <LibIcon icon="Freedom" size="sm" />
                  <span>Bulk Register</span>
                </div>
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-8">
            {activeTab === 'register' && <RegisterContentForm />}
            {activeTab === 'my-assets' && <AssetsList />}
            {activeTab === 'bulk' && <BulkRegisterForm />}
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid gap-6 md:grid-cols-3 mt-8">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <LibIcon icon="Privacy" size="lg" className="text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Blockchain Protected</h3>
            </div>
            <p className="text-sm text-gray-600">
              Your content is cryptographically hashed and registered on an immutable blockchain ledger
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <LibIcon icon="Success" size="lg" className="text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Instant Proof</h3>
            </div>
            <p className="text-sm text-gray-600">
              Get immediate timestamped proof of creation and ownership that can be verified by anyone
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <LibIcon icon="Freedom" size="lg" className="text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900">Free & Open</h3>
            </div>
            <p className="text-sm text-gray-600">
              No fees for registration. Your content protection is permanent and free to verify
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
