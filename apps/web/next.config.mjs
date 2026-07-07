/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep native + server-only modules out of the client/server bundlers.
  // better-sqlite3 is a native CJS addon; the workspace packages use Node
  // fs/path APIs we don't want Turbopack to over-trace.
  serverExternalPackages: [
    'better-sqlite3',
    '@mohith-das/portfolio-db',
    '@mohith-das/portfolio-crypto',
    '@mohith-das/portfolio-shared',
  ],
  // Content is runtime-editable from the DB; do not statically generate pages.
  experimental: {
    serverActions: { bodySizeLimit: '5mb' },
  },
};

export default nextConfig;
