import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/termos', '/privacidade'],
        disallow: [
          '/dashboard',
          '/dashboard/',
          '/api/',
          '/login',
          '/register',
          '/recuperar-senha',
        ],
      },
    ],
    sitemap: 'https://botdisparo.cmpx.tec.br/sitemap.xml',
  };
}
