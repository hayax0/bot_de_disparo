import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    // Dentro do Docker, o backend é alcançável pelo nome do serviço (http://backend:3001).
    // Localmente (dev fora de container), cai para localhost:3001.
    const internalApiUrl = process.env.INTERNAL_API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

