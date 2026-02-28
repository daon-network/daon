'use client';

/**
 * Content Verification Page
 * 
 * Public page to verify content registration on blockchain
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { LibIcon } from '@greenfieldoverride/liberation-ui';

interface VerificationResult {
  success: boolean;
  isValid: boolean;
  contentHash?: string;
  timestamp?: string;
  license?: string;
  creator?: string;
  metadata?: {
    title?: string;
    author?: string;
    type?: string;
    description?: string;
    license?: string;
  };
  blockchain?: {
    enabled: boolean;
    verified: boolean;
    source?: string;
  };
  error?: string;
}

export default function VerifyPage() {
  const params = useParams();
  let rawHash = params.hash as string;
  
  // Ensure URL decoding (handle both encoded and non-encoded URLs)
  if (rawHash && rawHash.includes('%')) {
    rawHash = decodeURIComponent(rawHash);
  }
  
  // Extract hash from "sha256:..." format if present
  const hash = rawHash?.startsWith('sha256:') ? rawHash.substring(7) : rawHash;
  
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('🔍 Verification Debug:', {
      rawParam: params.hash,
      processedHash: hash,
      hashLength: hash?.length,
      isValidFormat: hash ? /^[a-f0-9]{64}$/i.test(hash) : false
    });

    if (!hash) {
      setError('No hash provided');
      setLoading(false);
      return;
    }

    // Validate hash format (64 hex characters)
    if (!/^[a-f0-9]{64}$/i.test(hash)) {
      setError('Invalid hash format. Expected 64-character SHA-256 hash.');
      setLoading(false);
      return;
    }

    const verifyContent = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
        const response = await fetch(`${apiUrl}/verify/${hash}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Verification failed');
        }

        const data = await response.json();
        
        // Handle error responses from API
        if (!data.success && data.error) {
          setError(data.error);
          setLoading(false);
          return;
        }
        
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to verify content');
      } finally {
        setLoading(false);
      }
    };

    verifyContent();
  }, [hash]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
        <div className="text-center">
          <LibIcon icon="Loading" size="xl" className="text-blue-600 mx-auto mb-4" animation="spin" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Verifying Content...</h2>
          <p className="text-gray-600">Checking blockchain records</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <img 
            src="/logo.svg" 
            alt="DAON Logo" 
            className="w-20 h-20 mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Content Verification</h1>
          <p className="text-gray-600">
            Verify content registration on the DAON blockchain
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center">
                  <LibIcon icon="Error" size="xl" className="text-red-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Verification Failed</h2>
              <p className="text-gray-600">{error}</p>
              
              {hash && (
                <div className="bg-gray-50 rounded-lg p-4 mt-4">
                  <p className="text-xs font-medium text-gray-500 mb-1">Hash Provided</p>
                  <p className="text-sm font-mono text-gray-900 break-all">{hash}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Not Found State */}
        {!error && result && !result.isValid && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-yellow-100 rounded-2xl flex items-center justify-center">
                  <LibIcon icon="Error" size="xl" className="text-yellow-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Content Not Found</h2>
              <p className="text-gray-600">
                This content has not been registered on the DAON network.
              </p>
              
              <div className="bg-gray-50 rounded-lg p-4 mt-6">
                <p className="text-xs font-medium text-gray-500 mb-1">Hash Checked</p>
                <p className="text-sm font-mono text-gray-900 break-all">{hash}</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-6">
                <div className="flex items-start space-x-3">
                  <LibIcon icon="Privacy" size="lg" className="text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-left">
                    <p className="text-sm text-blue-900 font-medium mb-1">Want to protect your content?</p>
                    <p className="text-sm text-blue-700">
                      Register your creative works on the blockchain for permanent, tamper-proof protection.
                    </p>
                    <a 
                      href="/assets" 
                      className="inline-block mt-3 text-sm font-medium text-blue-600 hover:text-blue-700 underline"
                    >
                      Register Content →
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success State */}
        {!error && result && result.isValid && (
          <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
            {/* Success Header */}
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center">
                  <LibIcon icon="Success" size="xl" className="text-green-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Content Verified!</h2>
              <p className="text-gray-600">
                This content is registered and protected on the DAON blockchain
              </p>
            </div>

            {/* Blockchain Badge */}
            {result.blockchain?.verified && (
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center justify-center space-x-2">
                  <LibIcon icon="Success" size="sm" className="text-blue-600" />
                  <span className="text-sm font-semibold text-blue-900">
                    Verified on Blockchain
                  </span>
                </div>
              </div>
            )}

            {/* Details */}
            <div className="space-y-4">
              {/* Content Hash */}
              {result.contentHash && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">Content Hash (SHA-256)</p>
                  <p className="text-sm font-mono text-gray-900 break-all">{result.contentHash}</p>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Timestamp */}
                {result.timestamp && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 mb-2">Registration Date</p>
                    <p className="text-sm text-gray-900">
                      {new Date(result.timestamp).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZoneName: 'short'
                      })}
                    </p>
                  </div>
                )}

                {/* License */}
                {result.license && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 mb-2">License</p>
                    <p className="text-sm text-gray-900 font-medium uppercase">{result.license}</p>
                  </div>
                )}

                {/* Creator */}
                {result.creator && (
                  <div className="bg-gray-50 rounded-lg p-4 md:col-span-2">
                    <p className="text-xs font-medium text-gray-500 mb-2">Creator</p>
                    <p className="text-sm font-mono text-gray-900 break-all">{result.creator}</p>
                  </div>
                )}
              </div>

              {/* Metadata if available */}
              {result.metadata && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-medium text-gray-500 mb-3">Content Information</p>
                  <div className="space-y-2">
                    {result.metadata.title && (
                      <div>
                        <span className="text-xs text-gray-600">Title: </span>
                        <span className="text-sm text-gray-900">{result.metadata.title}</span>
                      </div>
                    )}
                    {result.metadata.author && (
                      <div>
                        <span className="text-xs text-gray-600">Author: </span>
                        <span className="text-sm text-gray-900">{result.metadata.author}</span>
                      </div>
                    )}
                    {result.metadata.type && (
                      <div>
                        <span className="text-xs text-gray-600">Type: </span>
                        <span className="text-sm text-gray-900 capitalize">{result.metadata.type}</span>
                      </div>
                    )}
                    {result.metadata.description && (
                      <div>
                        <span className="text-xs text-gray-600">Description: </span>
                        <span className="text-sm text-gray-900">{result.metadata.description}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Info Box */}
            {result.timestamp && result.license && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start space-x-3">
                  <LibIcon icon="Privacy" size="lg" className="text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-blue-900 font-medium mb-1">What does this mean?</p>
                    <p className="text-sm text-blue-700">
                      This cryptographic proof confirms that content matching this hash was registered on {new Date(result.timestamp).toLocaleDateString()} 
                      and is protected under the {result.license.toUpperCase()} license. This registration is permanent and cannot be altered.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button
                onClick={() => window.location.href = '/assets'}
                className="flex-1 py-3 px-4 rounded-xl font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Protect Your Content
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-600 hover:bg-gray-700 text-white transition-colors"
              >
                Print Certificate
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>Powered by DAON - Decentralized Author Ownership Network</p>
          <p className="mt-1">
            <a href="/" className="text-blue-600 hover:text-blue-700 underline">
              Learn More
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
