import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  eventDisplayName,
  eventTypeDisplay,
  plainAlertCause,
  plainAlertMessage,
  plainFixSteps,
  plainStatus,
  vendorDisplayName,
} from '../app/dashboard/plain-language';

describe('plain-language dashboard copy', () => {
  it('uses friendly names while preserving the platform identity', () => {
    expect(vendorDisplayName('gads')).toBe('Google Ads');
    expect(eventDisplayName('gtm.js')).toBe('GTM started');
    expect(eventDisplayName('(unnamed)')).toBe('Event name not found');
    expect(eventTypeDisplay('custom')).toBe('Custom event');
  });

  it('explains transport status-zero alerts without calling them Google Ads statuses', () => {
    const alert = { vendor: 'gads', event_name: 'page_view', code: 'tag_transport_failure', message: 'gads page_view failed to deliver (http_0).' };
    expect(plainAlertMessage(alert)).toContain('could not confirm');
    expect(plainAlertMessage(alert)).not.toContain('http_0');
    expect(plainAlertCause(alert)).toContain('not automatically an ad blocker');
    expect(plainFixSteps(alert)).toHaveLength(3);
  });

  it('explains missing Google Ads details in customer language', () => {
    const alert = { vendor: 'gads', event_name: 'page_view', code: 'gads_missing_parameters' };
    expect(plainAlertMessage(alert)).toBe('Google Ads needs more information for page_view.');
    expect(plainAlertCause(alert)).toContain('conversion details');
    expect(plainFixSteps(alert)[0]).toContain('Google Ads tag');
  });

  it('describes repeats as possible repeats, not certainty', () => {
    const alert = { event_name: 'login', code: 'duplicate_event' };
    expect(plainAlertMessage(alert)).toBe('login may have been sent more than once.');
    expect(plainAlertCause(alert)).toContain('not proof');
  });

  it('keeps privacy state separate from delivery failure', () => {
    const alert = { vendor: 'ga4', event_name: 'login', code: 'ga4_consent_denied' };
    expect(plainAlertMessage(alert)).toContain('analytics storage was not allowed');
    expect(plainAlertCause(alert)).toContain('not proof that the event failed');
  });

  it('maps delivery statuses into customer-facing labels', () => {
    expect(plainStatus('delivered')).toBe('Working');
    expect(plainStatus('retrying')).toBe('Trying again');
    expect(plainStatus('ambiguous')).toBe('Several possible matches');
  });
});

describe('critical plain-language UI contracts', () => {
  it('keeps the dashboard routes and key customer phrases present', () => {
    const read = (path: string) => readFileSync(path, 'utf8');
    const shell = read('/home/ubuntu/manusai18081/app/dashboard/shell.tsx');
    const install = read('/home/ubuntu/manusai18081/app/dashboard/install/page.tsx');
    const adblock = read('/home/ubuntu/manusai18081/app/dashboard/adblock/page.tsx');
    expect(shell).toContain("label: 'Possible repeats'");
    expect(shell).toContain("label: 'Website speed'");
    expect(install).toContain('Never use both methods.');
    expect(adblock).toContain('not as proof of ad blocking');
  });
});
