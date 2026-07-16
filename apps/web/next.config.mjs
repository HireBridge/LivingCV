/** @type {import('next').NextConfig} */
const nextConfig = {
  // Local development is commonly opened through 127.0.0.1 while Next advertises
  // localhost. Allow both so the setup wizard's client bundle/HMR can initialize.
  allowedDevOrigins: ['127.0.0.1'],
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
        source: '/mcp-admin/:path*',
        destination: `${process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:8100'}/api/mcp/:path*`,
      },
      {
        source: '/api/orchestrator/:path*',
        destination: `${process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:8100'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
