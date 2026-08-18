import { NextRequest, NextResponse } from 'next/server';

const TELEMETRY_PATHS = new Set(['/monitor.js', '/api/ingest', '/api/blocked', '/api/health']);

function hostname(value: string) {
  return value.toLowerCase().split(':')[0].replace(/\.$/, '');
}

function primaryHost() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return '';
  try {
    return hostname(new URL(configured).host);
  } catch {
    return '';
  }
}

export function middleware(req: NextRequest) {
  const requestHost = hostname(req.headers.get('host') || '');
  const configuredHost = primaryHost();
  const isLocal = requestHost === 'localhost' || requestHost === '127.0.0.1' || requestHost === '::1';
  const isPrimary = isLocal || (configuredHost && requestHost === configuredHost);

  if (!isPrimary) {
    if (!TELEMETRY_PATHS.has(req.nextUrl.pathname)) {
      return new NextResponse('Not found', {
        status: 404,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }

  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    const session = req.cookies.get('g4f_session')?.value;
    if (!session) {
      const login = new URL('/login', req.url);
      login.searchParams.set('next', `${req.nextUrl.pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
  }

  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
