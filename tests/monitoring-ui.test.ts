import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('platform monitoring UI', () => {
  it('keeps the requested primary navigation', () => {
    const source = read('app/dashboard/shell.tsx');
    expect(source).toContain("label: 'Dashboard'");
    expect(source).toContain("label: 'Alerts'");
    expect(source).toContain("label: 'GTM Diagnostic'");
    expect(source).toContain("label: 'Settings'");
  });

  it('keeps all requested platform monitoring sections in the platform view', () => {
    const source = read('app/dashboard/vendor-view-pdf.tsx');
    for (const section of ["'Overview'", "'Events'", "'Parameters'", "'Pages'", "'Consent'", "'Ad blockers'"]) expect(source).toContain(section);
    expect(source).not.toContain("'AI / Bot detector'");
    expect(source).toContain('Event Name');
    expect(source).toContain('Reference Event');
    expect(source).toContain('Session Duration');
    expect(source).toContain('Events firing outside consent');
    expect(source).not.toContain('Events AI crawled');
  });

  it('keeps platform insights tenant-scoped', () => {
    const source = read('app/api/platform-insights/route.ts');
    expect(source).toContain("sites WHERE id = $1 AND user_id = $2");
    expect(source).toContain("received_at >= NOW() - INTERVAL '24 hours'");
  });
});
