'use client';

/**
 * Assets List Component
 * 
 * Display user's protected content
 */

import React, { useState, useEffect } from 'react';
import { LibIcon } from '@greenfieldoverride/liberation-ui';

interface Asset {
  contentHash: string;
  title: string;
  author: string;
  type: string;
  license: string;
  timestamp: string;
  verificationUrl: string;
  blockchain?: boolean;
}

export function AssetsList() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load assets from localStorage
    const loadAssets = () => {
      try {
        const stored = localStorage.getItem('daon_registered_assets');
        if (stored) {
          const parsed = JSON.parse(stored);
          // Sort by timestamp, newest first
          parsed.sort((a: Asset, b: Asset) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setAssets(parsed);
        }
      } catch (error) {
        console.error('Failed to load assets:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAssets();

    // Listen for new registrations
    const handleStorageChange = () => {
      loadAssets();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('daon-asset-registered', handleStorageChange as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('daon-asset-registered', handleStorageChange as EventListener);
    };
  }, []);

  const deleteAsset = (contentHash: string) => {
    if (!confirm('Remove this asset from your list? (This will not remove it from the blockchain)')) {
      return;
    }

    const updated = assets.filter(a => a.contentHash !== contentHash);
    setAssets(updated);
    localStorage.setItem('daon_registered_assets', JSON.stringify(updated));
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    alert('Hash copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <LibIcon icon="Loading" size="xl" className="text-blue-600 mx-auto mb-4" animation="spin" />
        <p className="text-gray-600">Loading your assets...</p>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="text-center py-12">
        <LibIcon icon="Privacy" size="xl" className="text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Protected Content Yet</h3>
        <p className="text-gray-600 mb-6">
          You haven't registered any content yet. Start protecting your creative works!
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 max-w-md mx-auto">
          <div className="flex items-start space-x-3">
            <LibIcon icon="Privacy" size="lg" className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-left">
              <p className="text-sm text-blue-900 font-medium mb-1">How to get started:</p>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                <li>Click the "Register Content" tab above</li>
                <li>Upload a file or paste text</li>
                <li>Fill in the metadata</li>
                <li>Click "Protect Content"</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">My Protected Assets</h3>
          <p className="text-sm text-gray-600">{assets.length} {assets.length === 1 ? 'item' : 'items'} registered</p>
        </div>
      </div>

      {/* Assets List */}
      <div className="space-y-4">
        {assets.map((asset) => (
          <div 
            key={asset.contentHash} 
            className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                {/* Title and Type */}
                <div className="flex items-center space-x-3 mb-2">
                  <h4 className="text-lg font-semibold text-gray-900 truncate">
                    {asset.title}
                  </h4>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                    {asset.type}
                  </span>
                  {asset.blockchain && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <LibIcon icon="Success" size="xs" className="mr-1" />
                      Blockchain
                    </span>
                  )}
                </div>

                {/* Author */}
                <p className="text-sm text-gray-600 mb-3">
                  by {asset.author}
                </p>

                {/* Metadata Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  {/* License */}
                  <div>
                    <p className="text-xs text-gray-500">License</p>
                    <p className="text-sm font-medium text-gray-900 uppercase">{asset.license}</p>
                  </div>

                  {/* Registration Date */}
                  <div>
                    <p className="text-xs text-gray-500">Registered</p>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(asset.timestamp).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Time */}
                  <div>
                    <p className="text-xs text-gray-500">Time</p>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(asset.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                {/* Content Hash */}
                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 mr-4">
                      <p className="text-xs text-gray-500 mb-1">Content Hash (SHA-256)</p>
                      <p className="text-xs font-mono text-gray-900 truncate">
                        {asset.contentHash}
                      </p>
                    </div>
                    <button
                      onClick={() => copyHash(asset.contentHash)}
                      className="flex-shrink-0 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
                      title="Copy hash"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      console.log('🔗 Opening verification URL:', asset.verificationUrl);
                      window.location.href = asset.verificationUrl;
                    }}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    <LibIcon icon="Success" size="sm" className="mr-1.5" />
                    View Certificate
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      console.log('🔗 Opening in new tab:', asset.verificationUrl);
                      const win = window.open(asset.verificationUrl, '_blank');
                      if (win) win.focus();
                    }}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open Verification
                  </button>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      console.log('📋 Copying URL:', asset.verificationUrl);
                      navigator.clipboard.writeText(asset.verificationUrl);
                      alert('Verification URL copied to clipboard!');
                    }}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy URL
                  </button>

                  <button
                    onClick={() => deleteAsset(asset.contentHash)}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border border-red-300 text-red-700 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info Footer */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-6">
        <div className="flex items-start space-x-3">
          <LibIcon icon="Privacy" size="lg" className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-blue-900 font-medium mb-1">About Your Assets</p>
            <p className="text-sm text-blue-700">
              These are content items you've registered on the DAON blockchain. Each has a permanent, timestamped record 
              that proves ownership and creation date. Removing an item from this list does not affect the blockchain record.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
