import { NextRequest, NextResponse } from 'next/server';
import { APP_URL } from './lib/appUrl';

const APP_HOST = new URL(APP_URL).hostname;
const APP_PATHS = ['/dashboard', '/login', '/register', '/recuperar-senha'];

export function proxy(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase();
  const pathname = request.nextUrl.pathname;
  const isAppHost = host === APP_HOST;

  if (isAppHost && pathname === '/') {
    const destination = request.nextUrl.clone();
    destination.pathname = '/dashboard';
    return NextResponse.redirect(destination);
  }

  const isAppPath = APP_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
  if (isAppPath && !isAppHost) {
    const destination = new URL(`${pathname}${request.nextUrl.search}`, APP_URL);
    return NextResponse.redirect(destination);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/login', '/register/:path*', '/recuperar-senha'],
};
