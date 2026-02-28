'use client';

/**
 * Authenticator Guide Modal
 *
 * Provides step-by-step instructions for setting up 2FA with popular authenticator apps
 */

import React, { useState } from 'react';
import { LibIcon } from '@greenfieldoverride/liberation-ui';

interface AuthenticatorGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthApp = 'google' | 'authy' | '1password' | 'microsoft' | 'bitwarden';

interface AppGuide {
  name: string;
  icon: string;
  platforms: string[];
  steps: string[];
  downloadLinks: {
    ios?: string;
    android?: string;
    desktop?: string;
  };
}

const AUTHENTICATOR_APPS: Record<AuthApp, AppGuide> = {
  google: {
    name: 'Google Authenticator',
    icon: '🔵',
    platforms: ['iOS', 'Android'],
    steps: [
      'Download Google Authenticator from the App Store or Google Play',
      'Open the app and tap the "+" button',
      'Select "Scan a QR code"',
      'Point your camera at the QR code shown on this page',
      'Enter the 6-digit code from the app to complete setup'
    ],
    downloadLinks: {
      ios: 'https://apps.apple.com/app/google-authenticator/id388497605',
      android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2'
    }
  },
  authy: {
    name: 'Authy',
    icon: '🔴',
    platforms: ['iOS', 'Android', 'Desktop'],
    steps: [
      'Download Authy from the App Store, Google Play, or authy.com',
      'Create an Authy account if you haven\'t already',
      'Tap the "+" button to add a new account',
      'Select "Scan QR Code"',
      'Scan the QR code shown on this page',
      'Enter the 6-digit code from Authy to complete setup'
    ],
    downloadLinks: {
      ios: 'https://apps.apple.com/app/authy/id494168017',
      android: 'https://play.google.com/store/apps/details?id=com.authy.authy',
      desktop: 'https://authy.com/download/'
    }
  },
  '1password': {
    name: '1Password',
    icon: '🔵',
    platforms: ['iOS', 'Android', 'Desktop'],
    steps: [
      'Open 1Password and go to your vault',
      'Create a new item or edit your DAON login',
      'Click "Add One-Time Password"',
      'Click "Scan QR Code" or enter the setup key manually',
      'Scan the QR code shown on this page',
      'Enter the 6-digit code from 1Password to complete setup'
    ],
    downloadLinks: {
      ios: 'https://apps.apple.com/app/1password/id1511601750',
      android: 'https://play.google.com/store/apps/details?id=com.onepassword.android',
      desktop: 'https://1password.com/downloads/'
    }
  },
  microsoft: {
    name: 'Microsoft Authenticator',
    icon: '🟦',
    platforms: ['iOS', 'Android'],
    steps: [
      'Download Microsoft Authenticator from the App Store or Google Play',
      'Open the app and tap "Add account"',
      'Select "Other account (Google, Facebook, etc.)"',
      'Tap "Scan a QR code"',
      'Scan the QR code shown on this page',
      'Enter the 6-digit code from the app to complete setup'
    ],
    downloadLinks: {
      ios: 'https://apps.apple.com/app/microsoft-authenticator/id983156458',
      android: 'https://play.google.com/store/apps/details?id=com.azure.authenticator'
    }
  },
  bitwarden: {
    name: 'Bitwarden',
    icon: '🟦',
    platforms: ['iOS', 'Android', 'Desktop', 'Browser'],
    steps: [
      'Open Bitwarden and go to your vault',
      'Create a new item or edit your DAON login',
      'In the "Authenticator Key (TOTP)" field, click the camera icon',
      'Scan the QR code shown on this page',
      'Or manually enter the setup key provided',
      'Enter the 6-digit code from Bitwarden to complete setup'
    ],
    downloadLinks: {
      ios: 'https://apps.apple.com/app/bitwarden/id1137397744',
      android: 'https://play.google.com/store/apps/details?id=com.x8bit.bitwarden',
      desktop: 'https://bitwarden.com/download/'
    }
  }
};

export function AuthenticatorGuide({ isOpen, onClose }: AuthenticatorGuideProps) {
  const [selectedApp, setSelectedApp] = useState<AuthApp>('google');

  if (!isOpen) return null;

  const guide = AUTHENTICATOR_APPS[selectedApp];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Authenticator App Setup</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Choose your preferred authenticator app and follow the steps
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <LibIcon icon="Close" size="lg" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* App Selection */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Select Your Authenticator App</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(Object.keys(AUTHENTICATOR_APPS) as AuthApp[]).map((app) => (
                  <button
                    key={app}
                    onClick={() => setSelectedApp(app)}
                    className={`
                      p-4 rounded-xl border-2 transition-all duration-200
                      ${selectedApp === app
                        ? 'border-blue-600 bg-blue-50 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }
                    `}
                  >
                    <div className="text-3xl mb-2">{AUTHENTICATOR_APPS[app].icon}</div>
                    <div className="text-sm font-medium text-gray-900">
                      {AUTHENTICATOR_APPS[app].name}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Selected App Guide */}
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="text-4xl">{guide.icon}</div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{guide.name}</h3>
                  <p className="text-sm text-gray-600">
                    Available on: {guide.platforms.join(', ')}
                  </p>
                </div>
              </div>

              {/* Download Links */}
              <div className="flex flex-wrap gap-2">
                {guide.downloadLinks.ios && (
                  <a
                    href={guide.downloadLinks.ios}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-white rounded-lg border border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition-colors text-sm font-medium"
                  >
                    <span>📱</span>
                    <span>iOS</span>
                  </a>
                )}
                {guide.downloadLinks.android && (
                  <a
                    href={guide.downloadLinks.android}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-white rounded-lg border border-gray-300 hover:border-green-500 hover:bg-green-50 transition-colors text-sm font-medium"
                  >
                    <span>🤖</span>
                    <span>Android</span>
                  </a>
                )}
                {guide.downloadLinks.desktop && (
                  <a
                    href={guide.downloadLinks.desktop}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-white rounded-lg border border-gray-300 hover:border-purple-500 hover:bg-purple-50 transition-colors text-sm font-medium"
                  >
                    <span>💻</span>
                    <span>Desktop</span>
                  </a>
                )}
              </div>

              {/* Steps */}
              <div className="bg-white rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-gray-900 flex items-center space-x-2">
                  <LibIcon icon="List" size="sm" />
                  <span>Setup Steps</span>
                </h4>
                <ol className="space-y-3">
                  {guide.steps.map((step, index) => (
                    <li key={index} className="flex space-x-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </span>
                      <span className="text-sm text-gray-700 pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Tips */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-start space-x-3">
                <LibIcon icon="Alert" size="lg" className="text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h4 className="font-semibold text-yellow-900">Important Tips</h4>
                  <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                    <li>Save your backup codes in a secure location</li>
                    <li>Don't share your QR code or setup key with anyone</li>
                    <li>Keep your authenticator app updated</li>
                    <li>Consider setting up 2FA on multiple devices for backup</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Troubleshooting */}
            <details className="bg-gray-50 rounded-xl p-4">
              <summary className="font-semibold text-gray-900 cursor-pointer flex items-center space-x-2">
                <LibIcon icon="Help" size="sm" />
                <span>Troubleshooting</span>
              </summary>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                <p><strong>Code doesn't work?</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Make sure your phone's time is set to automatic</li>
                  <li>Wait for a new code to generate (codes refresh every 30 seconds)</li>
                  <li>Try scanning the QR code again</li>
                </ul>
                <p className="mt-3"><strong>Lost access to your authenticator app?</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Use one of your backup codes to sign in</li>
                  <li>Contact support if you've lost both your app and backup codes</li>
                </ul>
              </div>
            </details>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 rounded-b-2xl">
            <button
              onClick={onClose}
              className="w-full py-3 px-4 rounded-xl font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Got it, let's set up 2FA
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
