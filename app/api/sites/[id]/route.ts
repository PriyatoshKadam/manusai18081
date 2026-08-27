import { NextRequest, NextResponse } from 'next/server';
import { generateApiKey, getSession } from '../../../../lib/auth';
import { query } from '../../../../lib/db';
import { normalizeSiteInput } from '../../../../lib/site-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return errorResponse('Unauthorized', 401);
  const { id } = await params; const siteId = parseId(id); if (!siteId) return errorResponse('Invalid site ID');
  const result = await query(`SELECT id, domain, gtm_container_id, ga4_measurement_id, gads_conversion_id, meta_pixel_id, tiktok_pixel_id, linkedin_partner_id, bing_uet_tag_id, snapchat_pixel_id, first_party_domain, previous_api_key_expires_at, CASE WHEN slack_webhook_url IS NOT NULL AND slack_webhook_url <> '' THEN true ELSE false END AS site_slack_configured FROM sites WHERE id=$1 AND user_id=$2`, [siteId, session.uid]);
  if (!result.rows[0]) return errorResponse('Site not found', 404);
  return NextResponse.json({ site: { ...result.rows[0], global_slack_configured: Boolean(process.env.SLACK_WEBHOOK_URL?.trim()) } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return errorResponse('Unauthorized', 401);
  const { id } = await params;
  const siteId = parseId(id);
  if (!siteId) return errorResponse('Invalid site ID');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Request body must be valid JSON');
  }

  try {
    const input = normalizeSiteInput(body, true);
    const keys = Object.keys(input) as Array<keyof typeof input>;
    if (!keys.length) return errorResponse('No editable fields supplied');

    const duplicateDomain = input.domain
      ? await query('SELECT id FROM sites WHERE user_id = $1 AND domain = $2 AND id <> $3 LIMIT 1', [session.uid, input.domain, siteId])
      : { rows: [] };
    if (duplicateDomain.rows[0]) return errorResponse('You are already monitoring this domain', 409);

    const values: unknown[] = [];
    const updates = keys.map((key) => {
      values.push(input[key]);
      return `${String(key)} = $${values.length}`;
    });
    values.push(siteId, session.uid);

    const result = await query(
      `UPDATE sites SET ${updates.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length} RETURNING id`,
      values
    );
    if (!result.rows[0]) return errorResponse('Site not found', 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('site update error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unable to update site');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return errorResponse('Unauthorized', 401);
  const { id } = await params;
  const siteId = parseId(id);
  if (!siteId) return errorResponse('Invalid site ID');
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}
  if (body?.action !== 'rotate_api_key') return errorResponse('Unsupported site action');
  const newApiKey = generateApiKey();
  const result = await query(
    `UPDATE sites
        SET previous_api_key = api_key,
            previous_api_key_expires_at = NOW() + INTERVAL '48 hours',
            api_key = $1
      WHERE id = $2 AND user_id = $3
      RETURNING id, previous_api_key_expires_at`,
    [newApiKey, siteId, session.uid],
  );
  if (!result.rows[0]) return errorResponse('Site not found', 404);
  return NextResponse.json({ ok: true, apiKey: newApiKey, oldKeyExpiresAt: result.rows[0].previous_api_key_expires_at, gracePeriodHours: 48 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return errorResponse('Unauthorized', 401);
  const { id } = await params;
  const siteId = parseId(id);
  if (!siteId) return errorResponse('Invalid site ID');

  const result = await query('DELETE FROM sites WHERE id = $1 AND user_id = $2 RETURNING id', [siteId, session.uid]);
  if (!result.rows[0]) return errorResponse('Site not found', 404);
  return NextResponse.json({ ok: true });
}
