/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,

  // Optimize for minimal bundle size
  experimental: {
    optimizePackageImports: ['@greenfieldoverride/liberation-ui'],
  },

  // API URL from environment
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://api.daon.network',
  },
};

module.exports = nextConfig;
