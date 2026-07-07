/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep native + server-only modules out of the client/server bundlers.
  // better-sqlite3 is a native CJS addon; the workspace packages use Node
  // fs/path APIs we don't want Turbopack to over-trace.
  serverExternalPackages: [
    'better-sqlite3',
    '@livingcv/db',
    '@livingcv/crypto',
    '@livingcv/shared',
  ],
  // Content is runtime-editable from the DB; do not statically generate pages.
  experimental: {
    serverActions: { bodySizeLimit: '5mb' },
  },
  async rewrites() {
    return [
      {
        source: '/api/orchestrator/:path*',
        destination: `${process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:8100'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
