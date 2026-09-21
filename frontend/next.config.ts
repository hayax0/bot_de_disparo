import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return ['/plataforma.md', '/llms-full.txt'].map(source => ({
      source,
      headers: [
        { key: 'Content-Type', value: 'text/markdown; charset=utf-8' },
        { key: 'Content-Disposition', value: 'inline' },
      ],
    }));
  },
  async rewrites() {
    // Dentro do Docker, o backend é alcançável pelo nome do serviço (http://backend:3001).
    // Localmente (dev fora de container), cai para localhost:3001.
    const internalApiUrl = process.env.INTERNAL_API_URL || 'http://backend:3001';
    return [
      // Um único guia evita divergência entre o Markdown e o endereço legado para IAs.
      { source: '/llms-full.txt', destination: '/plataforma.md' },
      {
        source: '/api/:path*',
        destination: `${internalApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

