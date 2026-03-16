import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Removed 'standalone' — it breaks API route handlers on Railway
  // (next start doesn't properly resolve Route Handlers in standalone mode)
};

export default nextConfig;
