/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['uuid', 'better-sqlite3', 'pg', 'pgvector'],
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), 'canvas', 'jsdom', 'better-sqlite3', 'pg-native'];
    return config;
  },
};

export default nextConfig;
