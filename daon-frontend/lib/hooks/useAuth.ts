/**
 * useAuth Hook
 *
 * Provides access to authentication context
 */

import { useContext } from 'react';
import { AuthContext } from '../../components/providers/AuthProvider';

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export default useAuth;
