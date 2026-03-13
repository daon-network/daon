'use client';

/**
 * Home Page
 * 
 * Redirects to login or dashboard based on auth state
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { LibIcon } from '@greenfieldoverride/liberation-ui';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.push('/dashboard');
      } else {
        router.push('/auth/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

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
