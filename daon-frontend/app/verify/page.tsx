'use client';

/**
 * Verify by Content Page
 *
 * Lets readers paste content (or upload a file) to verify it against the
 * DAON registry. This inverts the normal hash-lookup flow: instead of
 * "does this hash exist?", it asks "who registered THIS content?"
 *
 * This closes the token-transplanting gap: a reader verifying what they're
 * actually reading will get the registered creator for that content, not
 * whatever token someone placed next to it.
 */

import React, { useState, useRef } from 'react';
import { LibIcon } from '@greenfieldoverride/liberation-ui';

interface VerifyContentResult {
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
  };
  blockchain?: {
    enabled: boolean;
    verified: boolean;
    source?: string;
  };
  verificationUrl?: string;
  error?: string;
}

export default function VerifyContentPage() {
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyContentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFileAsText = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(f);
    });

  const handleVerify = async () => {
    setError(null);
    setResult(null);

    let content = '';

    if (mode === 'file') {
      if (!file) {
        setError('Please select a file to verify.');
        return;
      }
      try {
        content = await readFileAsText(file);
      } catch {
        setError('Could not read file. Make sure it is a plain text file.');
        return;
      }
    } else {
      content = text.trim();
      if (!content) {
        setError('Please paste some content to verify.');
        return;
      }
    }

    setLoading(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const apiUrl = baseUrl.includes('/api/v1') ? baseUrl : `${baseUrl}/api/v1`;

      const response = await fetch(`${apiUrl}/verify-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      const data = await response.json();

      if (response.status === 404) {
        setResult({ success: false, isValid: false, contentHash: data.contentHash, error: data.error });
      } else if (!response.ok) {
        setError(data.message || data.error || 'Verification failed');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to contact verification server');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setText('');
    setFile(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="DAON Logo" className="w-20 h-20 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Verify by Content</h1>
          <p className="text-gray-600 max-w-xl mx-auto">
            Paste the content you're reading or upload the file — DAON will hash it and check whether it matches a registered work.
            This confirms the content itself is genuine, not just that a token exists nearby.
          </p>
        </div>

        {/* Explainer */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex items-start space-x-3">
            <LibIcon icon="Privacy" size="lg" className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-900 font-medium mb-1">How this works</p>
              <p className="text-sm text-blue-800">
                Your content is hashed in your browser, then the hash is sent to the DAON registry.
                The actual content never leaves your device. If the hash matches a registered work,
                you'll see the creator's details — proving what you're reading IS the registered version.
              </p>
            </div>
          </div>
        </div>

        {!result ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
            {/* Mode toggle */}
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => { setMode('text'); setFile(null); }}
                className={`flex-1 py-2 px-3 rounded-md font-medium transition-colors text-sm ${
                  mode === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Paste Text
              </button>
              <button
                onClick={() => { setMode('file'); setText(''); }}
                className={`flex-1 py-2 px-3 rounded-md font-medium transition-colors text-sm ${
                  mode === 'file' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Upload File
              </button>
            </div>

            {mode === 'text' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Content to verify
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={10}
                  placeholder="Paste the full text of the work you want to verify..."
                  className="block w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Paste the complete, unmodified text for an accurate match.
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload file to verify
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.html,.json,.js,.ts,.jsx,.tsx,.css,.py,.rb,.java,.c,.cpp,.go,.rs"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-900 border border-gray-300 rounded-xl cursor-pointer bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-4 file:py-3 file:px-4 file:rounded-l-xl file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {file && (
                  <p className="mt-2 text-sm text-gray-600">
                    Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start space-x-3">
                  <LibIcon icon="Error" size="lg" className="text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleVerify}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center space-x-2">
                  <LibIcon icon="Loading" size="sm" animation="spin" />
                  <span>Verifying...</span>
                </span>
              ) : (
                'Verify Content'
              )}
            </button>

            <p className="text-center text-sm text-gray-500">
              Have a verification URL or hash?{' '}
              <a href="/verify/sha256:" className="text-blue-600 hover:text-blue-700 underline">
                Verify by hash →
              </a>
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
            {result.isValid ? (
              <>
                {/* Verified */}
                <div className="text-center space-y-3">
                  <div className="flex justify-center">
                    <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center">
                      <LibIcon icon="Success" size="xl" className="text-green-600" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">Content Verified!</h2>
                  <p className="text-gray-600">
                    The content you submitted matches a registered work in the DAON registry.
                  </p>
                </div>

                {result.blockchain?.verified && (
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center justify-center space-x-2">
                      <LibIcon icon="Success" size="sm" className="text-blue-600" />
                      <span className="text-sm font-semibold text-blue-900">Verified on Blockchain</span>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {result.contentHash && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 mb-2">Content Hash (SHA-256)</p>
                      <p className="text-sm font-mono text-gray-900 break-all">{result.contentHash}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {result.timestamp && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs font-medium text-gray-500 mb-2">Registration Date</p>
                        <p className="text-sm text-gray-900">
                          {new Date(result.timestamp).toLocaleString('en-US', {
                            year: 'numeric', month: 'long', day: 'numeric',
                            hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
                          })}
                        </p>
                      </div>
                    )}
                    {result.license && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs font-medium text-gray-500 mb-2">License</p>
                        <p className="text-sm text-gray-900 font-medium uppercase">{result.license}</p>
                      </div>
                    )}
                    {result.creator && (
                      <div className="bg-gray-50 rounded-lg p-4 md:col-span-2">
                        <p className="text-xs font-medium text-gray-500 mb-2">Creator</p>
                        <p className="text-sm font-mono text-gray-900 break-all">{result.creator}</p>
                      </div>
                    )}
                  </div>

                  {result.metadata && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 mb-3">Content Information</p>
                      <div className="space-y-2">
                        {result.metadata.title && (
                          <div><span className="text-xs text-gray-600">Title: </span><span className="text-sm text-gray-900">{result.metadata.title}</span></div>
                        )}
                        {result.metadata.author && (
                          <div><span className="text-xs text-gray-600">Author: </span><span className="text-sm text-gray-900">{result.metadata.author}</span></div>
                        )}
                        {result.metadata.type && (
                          <div><span className="text-xs text-gray-600">Type: </span><span className="text-sm text-gray-900 capitalize">{result.metadata.type}</span></div>
                        )}
                        {result.metadata.description && (
                          <div><span className="text-xs text-gray-600">Description: </span><span className="text-sm text-gray-900">{result.metadata.description}</span></div>
                        )}
                      </div>
                    </div>
                  )}

                  {result.verificationUrl && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 mb-2">Verification URL</p>
                      <a
                        href={result.verificationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 underline break-all"
                      >
                        {result.verificationUrl}
                      </a>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Not found */}
                <div className="text-center space-y-3">
                  <div className="flex justify-center">
                    <div className="w-16 h-16 bg-yellow-100 rounded-2xl flex items-center justify-center">
                      <LibIcon icon="Error" size="xl" className="text-yellow-600" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">Content Not Found</h2>
                  <p className="text-gray-600">
                    No registration found for this content. It may not be registered, or the content may have been modified.
                  </p>
                </div>

                {result.contentHash && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 mb-1">Hash of submitted content</p>
                    <p className="text-sm font-mono text-gray-900 break-all">{result.contentHash}</p>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-start space-x-3">
                    <LibIcon icon="Privacy" size="lg" className="text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
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
              </>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={reset}
                className="flex-1 py-3 px-4 rounded-xl font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Verify Another
              </button>
              <button
                onClick={() => window.location.href = '/assets'}
                className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-600 hover:bg-gray-700 text-white transition-colors"
              >
                Protect Your Content
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>Powered by DAON - Digital Asset Ownership Network</p>
          <p className="mt-1">
            <a href="/" className="text-blue-600 hover:text-blue-700 underline">Learn More</a>
          </p>
        </div>
      </div>
    </div>
  );
}
