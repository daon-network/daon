/**
 * useAuth Hook
 * 
 * Core authentication hook with:
 * - Token management (access + refresh)
 * - BroadcastChannel for multi-tab synchronization
 * - Automatic token refresh with race condition prevention
 * - Secure token storage in memory + httpOnly cookies
 */

'use client';

import { useContext } from 'react';
import { AuthContext } from '../components/providers/AuthProvider';
import type { AuthContextType } from '../lib/types';

/**
 * Hook to access authentication context
 * Must be used within AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  
  return context;
}

export default useAuth;
