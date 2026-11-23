const defaultAppUrl = process.env.NODE_ENV === 'development'
  ? 'http://app.localhost:3000'
  : 'https://app.abordai.cmpx.tec.br';

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || defaultAppUrl).replace(/\/$/, '');

export function appHref(path: string): string {
  return `${APP_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
