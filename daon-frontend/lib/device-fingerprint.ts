/**
 * Device Fingerprinting Utility
 * 
 * Combines FingerprintJS with localStorage fallback for stability.
 * Addresses the fingerprint stability issue from architecture review.
 */

import FingerprintJS, { type Agent } from '@fingerprintjs/fingerprintjs';
import type { DeviceInfo } from './types';

const DEVICE_ID_KEY = 'daon_device_id';
const FINGERPRINT_KEY = 'daon_device_fingerprint';

let fpAgent: Agent | null = null;

/**
 * Initialize FingerprintJS agent (should be called once on app load)
 */
export async function initFingerprintAgent(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    fpAgent = await FingerprintJS.load();
  } catch (error) {
    console.error('Failed to load FingerprintJS:', error);
  }
}

/**
 * Generate a simple UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or create persistent device ID from localStorage
 */
function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    
    if (!deviceId) {
      deviceId = generateUUID();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    
    return deviceId;
  } catch (error) {
    console.error('Failed to access localStorage:', error);
    return generateUUID();
  }
}

/**
 * Get or create device fingerprint
 * Uses FingerprintJS if available, otherwise falls back to localStorage
 */
async function getOrCreateFingerprint(): Promise<string> {
  if (typeof window === 'undefined') return '';
  
  try {
    // Try to get from localStorage first for stability
    const cachedFingerprint = localStorage.getItem(FINGERPRINT_KEY);
    if (cachedFingerprint) {
      return cachedFingerprint;
    }
    
    // Generate new fingerprint if not cached
    if (fpAgent) {
      const result = await fpAgent.get();
      const fingerprint = result.visitorId;
      localStorage.setItem(FINGERPRINT_KEY, fingerprint);
      return fingerprint;
    }
    
    // Fallback: use device_id as fingerprint
    const deviceId = getOrCreateDeviceId();
    localStorage.setItem(FINGERPRINT_KEY, deviceId);
    return deviceId;
  } catch (error) {
    console.error('Failed to get fingerprint:', error);
    // Ultimate fallback
    return getOrCreateDeviceId();
  }
}

/**
 * Get screen resolution info
 */
function getScreenInfo(): string {
  if (typeof window === 'undefined') return '';
  
  return `${window.screen.width}x${window.screen.height}`;
}

/**
 * Get timezone
 */
function getTimezone(): string {
  if (typeof window === 'undefined') return '';
  
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    return '';
  }
}

/**
 * Collect complete device information
 * This is the main function to use throughout the app
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  // Return empty object if running on server
  if (typeof window === 'undefined') {
    return {};
  }
  
  const [deviceId, fingerprint] = await Promise.all([
    Promise.resolve(getOrCreateDeviceId()),
    getOrCreateFingerprint(),
  ]);
  
  return {
    device_id: deviceId,
    device_fingerprint: fingerprint,
    screen: getScreenInfo(),
    timezone: getTimezone(),
  };
}

/**
 * Clear stored device info (useful for testing or explicit logout)
 */
export function clearDeviceInfo(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(FINGERPRINT_KEY);
  } catch (error) {
    console.error('Failed to clear device info:', error);
  }
}

/**
 * Check if running in browser (for Next.js SSR safety)
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}
