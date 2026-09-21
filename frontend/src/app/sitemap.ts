import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://botdisparo.cmpx.tec.br';
  const now = new Date();

  return [
    {
      url: `${baseUrl}/plataforma.md`,
      lastModified: new Date('2026-09-21T00:00:00Z'),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/termos`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacidade`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];
}
