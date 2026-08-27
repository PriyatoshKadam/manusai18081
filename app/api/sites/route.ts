import { NextRequest, NextResponse } from 'next/server';
import { getSession, generateApiKey } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { normalizeSiteInput } from '../../../lib/site-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const session = await getSession();
  if (!session) return errorResponse('Unauthorized', 401);

  const result = await query(
    `SELECT id, domain, gtm_container_id, ga4_measurement_id, gads_conversion_id,
            meta_pixel_id, tiktok_pixel_id, linkedin_partner_id, bing_uet_tag_id, snapchat_pixel_id, api_key, first_party_domain, previous_api_key_expires_at, created_at
     FROM sites WHERE user_id = $1 ORDER BY created_at DESC`,
    [session.uid]
  );
  return NextResponse.json({ sites: result.rows });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return errorResponse('Unauthorized', 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Request body must be valid JSON');
  }

  try {
    const input = normalizeSiteInput(body);
    const duplicate = await query(
      'SELECT id FROM sites WHERE user_id = $1 AND domain = $2 LIMIT 1',
      [session.uid, input.domain]
    );
    if (duplicate.rows[0]) return errorResponse('You are already monitoring this domain', 409);

    const apiKey = generateApiKey();
    const result = await query(
      `INSERT INTO sites
         (user_id, domain, gtm_container_id, ga4_measurement_id, gads_conversion_id,
          meta_pixel_id, tiktok_pixel_id, linkedin_partner_id, bing_uet_tag_id, snapchat_pixel_id, first_party_domain, slack_webhook_url, api_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, api_key, domain`,
      [
        session.uid,
        input.domain,
        input.gtm_container_id,
        input.ga4_measurement_id,
        input.gads_conversion_id,
        input.meta_pixel_id,
        input.tiktok_pixel_id,
        input.linkedin_partner_id,
        input.bing_uet_tag_id,
        input.snapchat_pixel_id,
        input.first_party_domain,
        input.slack_webhook_url,
        apiKey,
      ]
    );
    return NextResponse.json({ site: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('site create error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unable to create site');
  }
}
