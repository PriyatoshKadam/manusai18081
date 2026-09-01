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
    expect(helper).toContain("'openid'");
    expect(helper).toContain("'email'");
    expect(helper).toContain("process.env.GTM_CLIENT_SECRET");
    expect(helper).not.toContain('NEXT_PUBLIC_GTM_CLIENT_SECRET');
  });

  it('explains the one-time owner setup to customers in GTM Connect', () => {
    const page = read('app/dashboard/gtm-connect/page.tsx');
    expect(page).toContain('Approve access to your own Google account');
    expect(page).toContain('keeps the OAuth connection server-side');
    expect(page).toContain('customers do not need to change server settings');
  });
});
