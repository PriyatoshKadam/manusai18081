import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { buildGtmAuthorizationUrl } from '../../../../lib/gtm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const state = crypto.randomBytes(32).toString('base64url');
    const cookieStore = await cookies();
    cookieStore.set('g4f_gtm_oauth_state', `${session.uid}.${state}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
    });
    return NextResponse.redirect(buildGtmAuthorizationUrl(state, req.url));
  } catch (error) {
    console.error('GTM OAuth start error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'GTM OAuth is not configured' }, { status: 503 });
  }
}
