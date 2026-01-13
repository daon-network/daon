'use client';

import React from 'react';

export interface KofiButtonProps {
  size?: 'small' | 'medium' | 'large';
  variant?: 'button' | 'badge' | 'minimal';
  className?: string;
}

export type KofiButtonSize = 'small' | 'medium' | 'large';
export type KofiButtonVariant = 'button' | 'badge' | 'minimal';

export function KofiButton({ 
  size = 'medium', 
  variant = 'button', 
  className = '' 
}: KofiButtonProps) {
  
  const handleKofiClick = () => {
    window.open('https://ko-fi.com/greenfieldoverride', '_blank', 'noopener,noreferrer');
  };

  const sizeClasses = {
    small: 'px-3 py-2 text-xs',
    medium: 'px-4 py-2 text-sm',
    large: 'px-6 py-3 text-base'
  };

  if (variant === 'badge') {
    return (
      <a
        href="https://ko-fi.com/greenfieldoverride"
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 ${sizeClasses[size]} bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${className}`}
      >
        <span>☕</span>
        <span className="font-medium">Support on Ko-fi</span>
      </a>
    );
  }

  if (variant === 'minimal') {
    return (
      <button
        onClick={handleKofiClick}
        className={`inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors ${className}`}
      >
        <span>☕</span>
        <span className="text-sm underline">Ko-fi</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleKofiClick}
      className={`inline-flex items-center gap-2 ${sizeClasses[size]} bg-white border-2 border-blue-500 text-blue-500 rounded-lg hover:bg-blue-50 transition-all duration-200 font-medium shadow-md hover:shadow-lg ${className}`}
    >
      <svg 
        width="20" 
        height="20" 
        viewBox="0 0 24 24" 
        fill="currentColor"
        className="flex-shrink-0"
      >
        <path d="M4 19V7c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v4h1c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2h-1v2c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2zm2-2h10v-2h1v-2h-1V7H6v10zm2-8h2v2H8V9zm4 0h2v2h-2V9z"/>
      </svg>
      <span>Support on Ko-fi</span>
    </button>
  );
}