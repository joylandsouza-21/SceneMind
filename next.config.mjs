/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['uuid', 'better-sqlite3', 'pg', 'pgvector'],
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), 'canvas', 'jsdom', 'better-sqlite3', 'pg-native', 'pg', 'pgvector'];
    return config;
  },
};

export default nextConfig;
