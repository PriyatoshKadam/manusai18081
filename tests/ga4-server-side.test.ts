import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyDeliveryMode } from '../lib/delivery';

const monitor = readFileSync('public/monitor.js', 'utf8');

const sampleRequest = 'https://dev-app.gafix.ai/metrics/g/collect?v=2&tid=G-6LQSQZ7B5C&gcs=G111&en=view_sample_audit_app&dl=https%3A%2F%2Fclient.example.com%2F';

describe('server-side GA4 collection', () => {
  it('recognizes metrics/g/collect and extracts tid plus en from custom endpoints', () => {
    expect(monitor).toContain("var ga4Path = u && /\\/(?:metrics\\/|analytics\\/)?(?:g|mp)\\/collect$/i.test(u.pathname);");
    expect(monitor).toContain('var eventName = params.en || params.event_name || params.event;');
    expect(monitor).toContain('var measurement = params.tid || params.measurement_id;');
  });

  it('labels the supplied collection request as first-party without claiming server-side processing', () => {
    expect(classifyDeliveryMode(sampleRequest, 'https://client.example.com/', {
      domain: 'client.example.com',
      first_party_domain: 'dev-app.gafix.ai',
    })).toBe('first_party');
  });

  it('labels direct Google Analytics collection as a vendor destination', () => {
    expect(classifyDeliveryMode('https://www.google-analytics.com/g/collect?tid=G-6LQSQZ7B5C&en=view_sample_audit_app', 'https://client.example.com/', {
      domain: 'client.example.com',
      first_party_domain: 'dev-app.gafix.ai',
    })).toBe('third_party');
  });
});
