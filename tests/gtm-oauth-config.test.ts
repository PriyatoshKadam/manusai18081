import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('GTM OAuth configuration guidance', () => {
  it('keeps OAuth secrets server-side and handles missing deployment configuration safely', () => {
    const route = read('app/api/gtm/connect/route.ts');
    const helper = read('lib/gtm.ts');
    expect(route).toContain("redirect.searchParams.set('gtm', 'not_configured')");
    expect(route).toContain('const authorizationUrl = buildGtmAuthorizationUrl');
    expect(helper).toContain("process.env.GTM_CLIENT_ID");
    expect(helper).toContain("process.env.GTM_CLIENT_SECRET");
    expect(helper).not.toContain('NEXT_PUBLIC_GTM_CLIENT_SECRET');
  });

  it('explains the one-time owner setup to customers in GTM Connect', () => {
    const page = read('app/dashboard/gtm-connect/page.tsx');
    expect(page).toContain('each customer simply authorizes their own Google account');
    expect(page).toContain('do not add backend variables');
    expect(page).toContain('must never be entered into GTM or exposed in the browser');
  });
});
