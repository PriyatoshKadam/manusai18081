import { describe, expect, it } from 'vitest';
import { hostnameMatches, normalizeOriginHost } from '../lib/origin';

describe('telemetry origin matching', () => {
  it('normalizes hostnames and URL origins', () => {
    expect(normalizeOriginHost('https://WWW.Example.com/path')).toBe('www.example.com');
    expect(normalizeOriginHost('example.com')).toBe('example.com');
  });

  it('accepts apex and www variants for the same monitored domain', () => {
    expect(hostnameMatches('www.example.com', 'example.com')).toBe(true);
    expect(hostnameMatches('example.com', 'www.example.com')).toBe(true);
    expect(hostnameMatches('checkout.example.com', 'example.com')).toBe(true);
  });

  it('does not accept unrelated domains or suffix lookalikes', () => {
    expect(hostnameMatches('evil-example.com', 'example.com')).toBe(false);
    expect(hostnameMatches('example.net', 'example.com')).toBe(false);
  });
});
