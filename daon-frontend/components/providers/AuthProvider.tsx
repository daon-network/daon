/**
 * AuthProvider Component
 * 
 * Provides authentication state and methods to the entire app.
 * Features:
 * - Token management with automatic refresh
 * - BroadcastChannel for multi-tab synchronization
 * - Race condition prevention with mutex
 * - Secure in-memory token storage
 */

'use client';

import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import type { AuthContextType, AuthState, User } from '../../lib/types';
import { apiClient } from '../../lib/api-client';
import { getDeviceInfo, initFingerprintAgent } from '../../lib/device-fingerprint';

// Create context
export const AuthContext = createContext<AuthContextType | null>(null);

// BroadcastChannel for multi-tab sync
const AUTH_CHANNEL = 'daon_auth_channel';

// LocalStorage keys
const REFRESH_TOKEN_KEY = 'daon_refresh_token';
const USER_KEY = 'daon_user';

interface AuthMessage {
  type: 'login' | 'logout' | 'token_refresh';
  user?: User;
  accessToken?: string;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const broadcastChannel = useRef<BroadcastChannel | null>(null);
  const refreshPromise = useRef<Promise<void> | null>(null);

  /**
   * Initialize BroadcastChannel for multi-tab sync
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      broadcastChannel.current = new BroadcastChannel(AUTH_CHANNEL);

      broadcastChannel.current.onmessage = (event: MessageEvent<AuthMessage>) => {
        const { type, user, accessToken } = event.data;

        if (type === 'login' && user && accessToken) {
          setState((prev) => ({
            ...prev,
            user,
            accessToken,
            isAuthenticated: true,
          }));
        } else if (type === 'logout') {
          setState({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
        } else if (type === 'token_refresh' && accessToken) {
          setState((prev) => ({
            ...prev,
            accessToken,
          }));
        }
      };
    } catch (error) {
      console.error('BroadcastChannel not supported:', error);
    }

    return () => {
      broadcastChannel.current?.close();
    };
  }, []);

  /**
   * Initialize fingerprint agent on mount
   */
  useEffect(() => {
    initFingerprintAgent();
  }, []);

  /**
   * Restore session from localStorage on mount
   */
  useEffect(() => {
    const restoreSession = async () => {
      if (typeof window === 'undefined') {
        setState((prev) => ({ ...prev, isLoading: false }));
        return;
      }

      try {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        const userStr = localStorage.getItem(USER_KEY);

        console.log('🔄 AuthProvider: Restoring session...');
        console.log('🔄 Refresh Token from localStorage:', refreshToken);
        console.log('🔄 User from localStorage:', userStr);

        if (!refreshToken || !userStr) {
          console.log('❌ Missing token or user, skipping restore');
          setState((prev) => ({ ...prev, isLoading: false }));
          return;
        }

        const user = JSON.parse(userStr) as User;

        console.log('🔄 Attempting to refresh token...');
        // Attempt to refresh token
        const deviceInfo = await getDeviceInfo();
        const response = await apiClient.refreshToken({
          refresh_token: refreshToken,
          device_info: deviceInfo,
        });
        
        console.log('✅ Token refresh successful!');

        setState({
          user,
          accessToken: response.access_token,
          refreshToken: response.refresh_token || refreshToken, // Keep old token if not rotated
          isAuthenticated: true,
          isLoading: false,
        });

        // Save new refresh token only if rotated
        if (response.refresh_token) {
          localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
        }
      } catch (error) {
        // Failed to restore session - clear everything
        console.error('❌ Session restore failed:', error);
        console.log('🗑️ Clearing localStorage...');
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    restoreSession();
  }, []);

  /**
   * Refresh access token with race condition prevention
   */
  const refreshAuth = useCallback(async () => {
    // If already refreshing, return existing promise
    if (refreshPromise.current) {
      return refreshPromise.current;
    }

    const refresh = async () => {
      try {
        const refreshToken = state.refreshToken || localStorage.getItem(REFRESH_TOKEN_KEY);
        
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const deviceInfo = await getDeviceInfo();
        const response = await apiClient.refreshToken({
          refresh_token: refreshToken,
          device_info: deviceInfo,
        });

        setState((prev) => ({
          ...prev,
          accessToken: response.access_token,
          refreshToken: response.refresh_token || refreshToken, // Keep old token if not rotated
        }));

        // Save new refresh token only if rotated
        if (response.refresh_token) {
          localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
        }

        // Notify other tabs
        broadcastChannel.current?.postMessage({
          type: 'token_refresh',
          accessToken: response.access_token,
        });
      } catch (error) {
        // Refresh failed - logout
        await logout();
        throw error;
      } finally {
        refreshPromise.current = null;
      }
    };

    refreshPromise.current = refresh();
    return refreshPromise.current;
  }, [state.refreshToken]);

  /**
   * Login (placeholder - actual login flow happens in components)
   * This just updates state after successful authentication
   */
  const login = useCallback(
    async (email: string) => {
      // This is a placeholder - actual login logic is in auth components
      // which will call setAuthState directly
      throw new Error('Use authentication components for login flow');
    },
    []
  );

  /**
   * Logout
   */
  const logout = useCallback(async () => {
    try {
      if (state.accessToken && state.refreshToken) {
        // Revoke tokens on backend
        await apiClient.revokeAllTokens(state.accessToken);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear state regardless of API call success
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);

      setState({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
      });

      // Notify other tabs
      broadcastChannel.current?.postMessage({ type: 'logout' });
    }
  }, [state.accessToken, state.refreshToken]);

  /**
   * Set auth state (used by auth components after successful login)
   */
  const setAuthState = useCallback((user: User, accessToken: string, refreshToken: string) => {
    setState({
      user,
      accessToken,
      refreshToken,
      isAuthenticated: true,
      isLoading: false,
    });

    // Persist
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    // Notify other tabs
    broadcastChannel.current?.postMessage({
      type: 'login',
      user,
      accessToken,
    });
  }, []);

  const contextValue: AuthContextType & { setAuthState: typeof setAuthState } = {
    ...state,
    login,
    logout,
    refreshAuth,
    setAuthState,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
