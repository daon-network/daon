'use client';

/**
 * Register Content Form
 * 
 * Upload and register creative content on the blockchain
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { LibIcon } from '@greenfieldoverride/liberation-ui';

interface RegisterContentFormProps {
  onSuccess?: () => void;
}

interface RegisterFormData {
  title: string;
  author: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'other';
  license: 'all-rights-reserved' | 'copyright' | 'liberation_v1' | 'cc0' | 'cc-by' | 'cc-by-sa' | 'cc-by-nc' | 'cc-by-nc-sa' | 'cc-by-nd';
  description?: string;
  copyrightYear?: string;
}

interface ProtectionResult {
  success: boolean;
  contentHash: string;
  verificationUrl: string;
  timestamp: string;
  license: string;
  blockchain?: {
    enabled: boolean;
    creator?: string;
  };
  existing?: boolean;
}

export function RegisterContentForm() {
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState('');
  const [inputMode, setInputMode] = useState<'file' | 'text' | 'restricted'>('file');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ProtectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localHash, setLocalHash] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors }, watch } = useForm<RegisterFormData>({
    defaultValues: {
      type: 'text',
      license: 'all-rights-reserved',
      copyrightYear: new Date().getFullYear().toString(),
    }
  });

  const selectedType = watch('type');
  const selectedLicense = watch('license');
  const isCopyrighted = selectedLicense === 'all-rights-reserved' || selectedLicense === 'copyright';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setError(null);

      // If in restricted mode, hash the file locally
      if (inputMode === 'restricted') {
        try {
          const hash = await hashFile(selectedFile);
          setLocalHash(hash);
          console.log('🔒 Local hash generated:', hash);
        } catch (err) {
          setError('Failed to generate hash: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
      }
    }
  };

  const hashFile = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  };

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      let content: string;
      let isRestrictedMode = false;

      if (inputMode === 'restricted') {
        // Restricted mode: Use local hash only, don't send content
        if (!file || !localHash) {
          setError('Please select a file to hash');
          setIsLoading(false);
          return;
        }
        content = `RESTRICTED_HASH:${localHash}`;
        isRestrictedMode = true;
      } else if (inputMode === 'file') {
        if (!file) {
          setError('Please select a file to upload');
          setIsLoading(false);
          return;
        }

        // Read file as text/base64
        const fileContent = await readFileAsText(file);
        content = fileContent;
      } else {
        if (!textContent.trim()) {
          setError('Please enter some content');
          setIsLoading(false);
          return;
        }
        content = textContent;
      }

      // Call API
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      const response = await fetch(`${apiUrl}/protect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          metadata: {
            title: data.title,
            author: data.author,
            type: data.type,
            description: data.description,
            fileName: file?.name,
            fileSize: file?.size,
          },
          license: data.license,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Registration failed');
      }

      const responseData = await response.json();
      console.log('🔍 Registration response:', responseData);
      setResult(responseData);

      // Save to localStorage for "My Assets" list
      try {
        const asset = {
          contentHash: responseData.contentHash,
          title: data.title,
          author: data.author,
          type: data.type,
          license: responseData.license,
          timestamp: responseData.timestamp,
          verificationUrl: responseData.verificationUrl,
          blockchain: responseData.blockchain?.enabled || false,
        };

        console.log('💾 Saving asset to localStorage:', asset);

        const existingAssets = localStorage.getItem('daon_registered_assets');
        const assets = existingAssets ? JSON.parse(existingAssets) : [];
        
        console.log('📋 Existing assets:', assets);
        
        // Don't add duplicates
        if (!assets.find((a: any) => a.contentHash === asset.contentHash)) {
          assets.push(asset);
          localStorage.setItem('daon_registered_assets', JSON.stringify(assets));
          console.log('✅ Asset saved! Total assets:', assets.length);
          
          // Trigger storage event for AssetsList
          window.dispatchEvent(new Event('daon-asset-registered'));
          console.log('📡 Dispatched daon-asset-registered event');
        } else {
          console.log('⚠️ Asset already exists, skipping save');
        }
      } catch (storageError) {
        console.error('❌ Failed to save asset to localStorage:', storageError);
      }

      // Clear form
      setFile(null);
      setTextContent('');
      if (inputMode === 'file') {
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  if (result) {
    return (
      <div className="space-y-6">
        {/* Success Message */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <div className="flex items-start space-x-3">
            <LibIcon icon="Success" size="lg" className="text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-green-900 mb-2">
                {result.existing ? 'Content Already Protected' : 'Content Successfully Protected!'}
              </h3>
              <p className="text-sm text-green-700 mb-4">
                {result.existing 
                  ? 'This content was already registered on the blockchain.'
                  : 'Your content has been registered on the blockchain and is now permanently protected.'}
              </p>

              {/* Protection Details */}
              <div className="bg-white rounded-lg p-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Content Hash</p>
                  <p className="text-sm font-mono text-gray-900 break-all">{result.contentHash}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Timestamp</p>
                  <p className="text-sm text-gray-900">{new Date(result.timestamp).toLocaleString()}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">License</p>
                  <p className="text-sm text-gray-900">{result.license.toUpperCase()}</p>
                </div>

                {result.blockchain?.enabled && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Blockchain Status</p>
                    <p className="text-sm text-green-600 font-medium">✓ Registered on Blockchain</p>
                    {result.blockchain.creator && (
                      <p className="text-xs text-gray-600 mt-1">Creator: {result.blockchain.creator}</p>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Verification URL</p>
                  <a 
                    href={result.verificationUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 underline break-all"
                  >
                    {result.verificationUrl}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-4">
          <button
            onClick={() => setResult(null)}
            className="flex-1 py-3 px-4 rounded-xl font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Register Another
          </button>
          <button
            onClick={() => window.open(result.verificationUrl, '_blank')}
            className="flex-1 py-3 px-4 rounded-xl font-medium bg-gray-600 hover:bg-gray-700 text-white transition-colors"
          >
            View Verification
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Input Mode Toggle */}
      <div className="flex bg-gray-100 p-1 rounded-lg">
        <button
          type="button"
          onClick={() => { setInputMode('file'); setLocalHash(null); }}
          className={`flex-1 py-2 px-3 rounded-md font-medium transition-colors text-sm ${
            inputMode === 'file'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Upload File
        </button>
        <button
          type="button"
          onClick={() => { setInputMode('text'); setLocalHash(null); }}
          className={`flex-1 py-2 px-3 rounded-md font-medium transition-colors text-sm ${
            inputMode === 'text'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Paste Text
        </button>
        <button
          type="button"
          onClick={() => { setInputMode('restricted'); setTextContent(''); }}
          className={`flex-1 py-2 px-3 rounded-md font-medium transition-colors text-sm ${
            inputMode === 'restricted'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          🔒 Restricted
        </button>
      </div>

      {/* File Upload or Text Input */}
      {inputMode === 'restricted' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload File for Local Hashing
          </label>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
            <div className="flex items-start space-x-3">
              <LibIcon icon="Privacy" size="lg" className="text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-yellow-900 font-medium mb-1">🔒 Restricted Mode</p>
                <p className="text-sm text-yellow-700">
                  Your file will be hashed <strong>locally in your browser</strong>. The actual content will <strong>never be uploaded</strong> to the server. 
                  Only the hash and metadata will be registered on the blockchain.
                </p>
              </div>
            </div>
          </div>
          <div className="relative">
            <input
              id="file-upload-restricted"
              type="file"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-xl cursor-pointer bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 file:mr-4 file:py-3 file:px-4 file:rounded-l-xl file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
            />
          </div>
          {file && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-gray-600">
                Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
              {localHash && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Local SHA-256 Hash</p>
                  <p className="text-xs font-mono text-gray-900 break-all">{localHash}</p>
                  <p className="text-xs text-green-600 mt-2">✓ Hash generated locally - file content never uploaded</p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : inputMode === 'file' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Content
          </label>
          <div className="relative">
            <input
              id="file-upload"
              type="file"
              onChange={handleFileChange}
              accept=".txt,.md,.html,.json,.js,.ts,.jsx,.tsx,.css,.py,.rb,.java,.c,.cpp,.go,.rs,.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.svg,.webp,.bmp,.ico,.tiff,.mp3,.wav,.ogg,.mp4,.webm,.avi,.mov"
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-xl cursor-pointer bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 file:mr-4 file:py-3 file:px-4 file:rounded-l-xl file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          {file && (
            <p className="mt-2 text-sm text-gray-600">
              Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
            </p>
          )}
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Content
          </label>
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            rows={8}
            placeholder="Paste your text content here..."
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
          />
        </div>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            {...register('title', { required: 'Title is required' })}
            type="text"
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="My Creative Work"
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Author <span className="text-red-500">*</span>
          </label>
          <input
            {...register('author', { required: 'Author is required' })}
            type="text"
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Your Name"
          />
          {errors.author && (
            <p className="mt-1 text-sm text-red-600">{errors.author.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Content Type
          </label>
          <div className="relative">
            <select
              {...register('type')}
              className="block w-full px-4 py-3 pr-10 border border-gray-300 rounded-xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer"
            >
              <option value="text">Text</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="document">Document</option>
              <option value="other">Other</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            License / Rights
          </label>
          <div className="relative">
            <select
              {...register('license')}
              className="block w-full px-4 py-3 pr-10 border border-gray-300 rounded-xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer"
            >
              <optgroup label="Traditional Copyright">
                <option value="all-rights-reserved">© All Rights Reserved (Full Copyright)</option>
                <option value="copyright">© Copyright (Standard Protection)</option>
              </optgroup>
              
              <optgroup label="Open Licenses">
                <option value="liberation_v1">Liberation V1 (Attribution + Freedom)</option>
              </optgroup>
              
              <optgroup label="Creative Commons - Attribution">
                <option value="cc-by">CC BY (Attribution)</option>
                <option value="cc-by-sa">CC BY-SA (Attribution-ShareAlike)</option>
                <option value="cc-by-nd">CC BY-ND (Attribution-NoDerivatives)</option>
              </optgroup>
            
            <optgroup label="Creative Commons - Non-Commercial">
              <option value="cc-by-nc">CC BY-NC (Attribution-NonCommercial)</option>
              <option value="cc-by-nc-sa">CC BY-NC-SA (Attribution-NonCommercial-ShareAlike)</option>
            </optgroup>
            
            <optgroup label="Public Domain">
              <option value="cc0">CC0 (Public Domain Dedication)</option>
            </optgroup>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
          <p className="mt-1 text-xs text-gray-500">
            Choose how others can use your work
          </p>
        </div>
      </div>

      {/* Copyright Year (only for copyrighted works) */}
      {isCopyrighted && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Copyright Year
          </label>
          <input
            {...register('copyrightYear')}
            type="text"
            placeholder={new Date().getFullYear().toString()}
            className="block w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Year of first publication or creation
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description (Optional)
        </label>
        <textarea
          {...register('description')}
          rows={3}
          placeholder="Brief description of your work..."
          className="block w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start space-x-3">
            <LibIcon icon="Error" size="lg" className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Registration Failed</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3 px-4 rounded-xl font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center justify-center space-x-2">
            <LibIcon icon="Loading" size="sm" animation="spin" />
            <span>Registering on Blockchain...</span>
          </span>
        ) : (
          'Protect Content'
        )}
      </button>

      {/* Info */}
      {isCopyrighted ? (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-start space-x-3">
            <LibIcon icon="Privacy" size="lg" className="text-purple-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-purple-900 font-medium mb-2">
                <strong>© All Rights Reserved Protection</strong>
              </p>
              <p className="text-sm text-purple-800">
                This registration creates a permanent, timestamped blockchain record proving you created this work. 
                <strong> No one can use, copy, distribute, or modify your work without your explicit permission.</strong> 
                This is traditional copyright protection - like Disney, publishers, and authors use.
              </p>
              <p className="text-sm text-purple-800 mt-2">
                💡 <strong>Tip:</strong> Use <strong>🔒 Restricted mode</strong> above to register your novel without uploading the content itself.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start space-x-3">
            <LibIcon icon="Privacy" size="lg" className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-900">
                <strong>How it works:</strong> We generate a cryptographic hash of your content and register it on the blockchain. 
                This creates permanent, tamper-proof proof of creation and ownership. Your actual content is never stored.
              </p>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
