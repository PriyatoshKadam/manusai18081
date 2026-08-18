import { NextRequest, NextResponse } from 'next/server';
import { createSession, findUserByEmail, verifyPassword } from '../../../../lib/auth';
import { rateLimit, requestKey } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password || email.length > 320 || password.length > 128) return NextResponse.json({ error: 'Invalid email or password' }, { status: 400 });
    const limited = rateLimit(requestKey(req, 'login', email), 8, 15 * 60_000);
    if (!limited.allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    await createSession(Number(user.id), user.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('login error:', error);
    return NextResponse.json({ error: 'Unable to log in. Please try again.' }, { status: 500 });
  }
}
