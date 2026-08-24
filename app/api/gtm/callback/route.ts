import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { encryptSecret, exchangeCode, googleUserInfo, GTM_SCOPES } from '../../../../lib/gtm';
import { query } from '../../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function redirect(req: NextRequest, status: string, reason?: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.url;
  const url = new URL('/dashboard/gtm-connect', base);
  url.searchParams.set('gtm', status);
  if (reason) url.searchParams.set('gtm_reason', reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return redirect(req, 'login_required');
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get('g4f_gtm_oauth_state')?.value || '';
  cookieStore.set('g4f_gtm_oauth_state', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });

  if (oauthError) return redirect(req, 'denied');
  if (!code || !returnedState || !stateCookie) return redirect(req, 'invalid_state');
  const [uidText, expectedState] = stateCookie.split('.', 2);
  const validUid = Number(uidText) === session.uid;
  const validState = expectedState && returnedState.length === expectedState.length && crypto.timingSafeEqual(Buffer.from(returnedState), Buffer.from(expectedState));
  if (!validUid || !validState) return redirect(req, 'invalid_state');

  try {
    const tokenResponse = await exchangeCode(code, req.url);
    const accessToken = tokenResponse.access_token;
    if (!accessToken) throw new Error('Google did not return an access token');
    const identity = await googleUserInfo(accessToken);
    const existing = await query('SELECT refresh_token_encrypted FROM gtm_connections WHERE user_id = $1 LIMIT 1', [session.uid]);
    const encryptedRefreshToken = tokenResponse.refresh_token
      ? encryptSecret(tokenResponse.refresh_token)
      : existing.rows[0]?.refresh_token_encrypted;
    if (!encryptedRefreshToken) throw new Error('Google did not return a refresh token. Revoke the existing GAfix permission and connect again.');
    await query(
      `INSERT INTO gtm_connections (user_id, google_email, refresh_token_encrypted, scope)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET google_email = EXCLUDED.google_email,
         refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
         scope = EXCLUDED.scope, updated_at = NOW()`,
      [session.uid, identity.email || session.email, encryptedRefreshToken, GTM_SCOPES.join(' ')],
    );
    return redirect(req, 'connected');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google OAuth callback failed';
    const reason = /redirect_uri_mismatch|redirect URI/i.test(message) ? 'redirect_uri_mismatch'
      : /invalid_client|unauthorized_client|client authentication/i.test(message) ? 'invalid_client'
        : /invalid_grant|expired|revoked/i.test(message) ? 'invalid_grant'
          : /refresh token/i.test(message) ? 'refresh_token'
            : 'token_exchange';
    console.error('GTM OAuth callback error:', reason);
    return redirect(req, 'error', reason);
  }
}
