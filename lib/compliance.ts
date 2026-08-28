import { query } from './db';
import type { ParsedEvent } from './detection';

function safeUrl(value: unknown) { try { const url = new URL(String(value)); url.username = ''; url.password = ''; url.hash = ''; for (const key of ['email','phone','token','auth','authorization','user_id','client_id']) url.searchParams.delete(key); return url; } catch { return null; } }
function matches(host: string, candidate: string) { const value = candidate.replace(/^https?:\/\//, '').split('/')[0].toLowerCase(); return host === value || host.endsWith(`.${value}`); }

export async function recordComplianceEvidence(event: ParsedEvent, site: { domain: string; firstPartyDomain?: string | null }) {
  if (event.observationKind !== 'diagnostic') return;
  const diagnostic = event.eventName || '';
  if (!['script_injected', 'resource_blocked', 'csp_violation'].includes(diagnostic)) return;
  const params = event.params || {};
  const url = safeUrl(params.url || params.blockedUrl || params.resourceUrl || event.rawUrl);
  if (!url) return;
  const allowlist = await query(`SELECT hostname, path_prefix, sha256 FROM script_allowlist WHERE site_id = $1 AND enabled = true`, [event.siteId]);
  const known = [site.domain, site.firstPartyDomain].filter(Boolean).some((candidate) => matches(url.hostname, String(candidate))) || allowlist.rows.some((row) => matches(url.hostname, row.hostname) && (!row.path_prefix || url.pathname.startsWith(row.path_prefix)));
  const category = diagnostic === 'script_injected' && !known ? 'unknown_script' : diagnostic === 'csp_violation' ? 'csp_violation' : 'supply_chain';
  if (known && category !== 'csp_violation') return;
  await query(`INSERT INTO compliance_findings (site_id, category, severity, page_url, resource_url, evidence) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [event.siteId, category, category === 'unknown_script' ? 'critical' : 'warning', event.pageUrl || null, url.toString().slice(0, 2048), JSON.stringify({ diagnostic, params: { vendor: params.vendor || null, target: params.target || null }, eventId: event.eventId })]);
}
