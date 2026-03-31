import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE, LOGIN_PATH, isAuthConfigured, isValidSessionValue } from '@/lib/auth';

const PUBLIC_PATHS = new Set([
  LOGIN_PATH,
  '/api/auth/login',
]);

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname === '/favicon.ico') return true;
  return false;
}

export function proxy(request: NextRequest) {
  if (!isAuthConfigured() || isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const session = request.cookies.get(AUTH_COOKIE)?.value;
  if (isValidSessionValue(session)) {
    return NextResponse.next();
  }

  const loginUrl = new URL(LOGIN_PATH, request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: '/:path*',
};
