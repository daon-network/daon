import { useState, useEffect } from 'react';
import { verify } from '@daon/sdk';

interface ProtectionBadgeProps {
  content: string;
  title?: string;
  className?: string;
}

interface ProtectionStatus {
  verified: boolean;
  license?: string;
  verificationUrl?: string;
  loading: boolean;
  error?: string;
}

export default function ProtectionBadge({ content, title, className = '' }: ProtectionBadgeProps) {
  const [status, setStatus] = useState<ProtectionStatus>({
    verified: false,
    loading: true
  });

  useEffect(() => {
    checkProtection();
  }, [content]);

  const checkProtection = async () => {
    try {
      setStatus(prev => ({ ...prev, loading: true, error: undefined }));
      
      const result = await verify(content);
      
      setStatus({
        verified: result.verified,
        license: result.license,
        verificationUrl: result.verificationUrl,
        loading: false
      });
      
    } catch (error) {
      setStatus({
        verified: false,
        loading: false,
        error: 'Failed to check protection status'
      });
    }
  };

  const getBadgeContent = () => {
    if (status.loading) {
      return (
        <div className="flex items-center space-x-2">
          <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
          <span>Checking protection...</span>
        </div>
      );
    }

    if (status.error) {
      return (
        <div className="flex items-center space-x-2 text-yellow-600">
          <span>⚠️</span>
          <span>Cannot verify protection</span>
        </div>
      );
    }

    if (status.verified) {
      return (
        <div className="flex items-center space-x-2 text-green-600">
          <span>🛡️</span>
          <span>Protected by DAON</span>
          {status.license && (
            <span className="text-sm opacity-75">
              ({status.license.replace('_', ' ').replace('v1', 'v1.0')})
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="flex items-center space-x-2 text-orange-600">
        <span>⚠️</span>
        <span>Not protected</span>
      </div>
    );
  };

  const handleClick = () => {
    if (status.verificationUrl) {
      window.open(status.verificationUrl, '_blank');
    }
  };

  return (
    <div 
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border cursor-pointer transition-colors ${
        status.verified 
          ? 'bg-green-50 border-green-200 hover:bg-green-100' 
          : status.loading 
          ? 'bg-gray-50 border-gray-200'
          : 'bg-orange-50 border-orange-200 hover:bg-orange-100'
      } ${className}`}
      onClick={handleClick}
      title={status.verificationUrl ? 'Click to verify on blockchain' : undefined}
    >
      {getBadgeContent()}
    </div>
  );
}

// Simplified version for static use
export function StaticProtectionBadge({ 
  verified, 
  license, 
  verificationUrl, 
  className = '' 
}: {
  verified: boolean;
  license?: string;
  verificationUrl?: string;
  className?: string;
}) {
  return (
    <div 
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${
        verified 
          ? 'bg-green-50 border-green-200 text-green-800' 
          : 'bg-orange-50 border-orange-200 text-orange-800'
      } ${className}`}
    >
      <span className="mr-2">{verified ? '🛡️' : '⚠️'}</span>
      <span>
        {verified ? 'Protected by DAON' : 'Not protected'}
      </span>
      {license && verified && (
        <span className="ml-1 text-xs opacity-75">
          ({license.replace('_', ' ')})
        </span>
      )}
      {verificationUrl && verified && (
        <a 
          href={verificationUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="ml-2 text-xs underline hover:no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          Verify
        </a>
      )}
    </div>
  );
}