import { NextRequest, NextResponse } from 'next/server';
import { createSession, createUser, findUserByEmail } from '../../../../lib/auth';
import { rateLimit, requestKey } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';

function errorResponse(error: string, status = 400) { return NextResponse.json({ error }, { status }); }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return errorResponse('Enter a valid email address');
    if (password.length < 12 || password.length > 128) return errorResponse('Password must be between 12 and 128 characters');
    const limited = rateLimit(requestKey(req, 'signup', email), 3, 60 * 60_000);
    if (!limited.allowed) return NextResponse.json({ error: 'Too many signup attempts. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
    if (await findUserByEmail(email)) return errorResponse('Unable to create account with these details', 400);
    const userId = await createUser(email, password, name || undefined);
    await createSession(userId, email);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error: any) {
    if (error?.code === '23505') return errorResponse('Unable to create account with these details', 400);
    console.error('signup error:', error);
    return errorResponse('Signup failed. Please try again.', 500);
  }
}
