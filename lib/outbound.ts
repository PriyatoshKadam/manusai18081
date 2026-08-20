import dns from 'node:dns/promises';
import net from 'node:net';

function ipv4ToNumber(value: string) {
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function inIpv4Range(value: string, start: string, end: string) {
  const address = ipv4ToNumber(value);
  const first = ipv4ToNumber(start);
  const last = ipv4ToNumber(end);
  return address !== null && first !== null && last !== null && address >= first && address <= last;
}

function isPrivateAddress(value: string) {
  const address = value.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (net.isIPv4(address)) {
    return [
      ['0.0.0.0', '0.255.255.255'],
      ['10.0.0.0', '10.255.255.255'],
      ['100.64.0.0', '100.127.255.255'],
      ['127.0.0.0', '127.255.255.255'],
      ['169.254.0.0', '169.254.255.255'],
      ['172.16.0.0', '172.31.255.255'],
      ['192.0.0.0', '192.0.0.255'],
      ['192.168.0.0', '192.168.255.255'],
      ['198.18.0.0', '198.19.255.255'],
      ['224.0.0.0', '255.255.255.255'],
    ].some(([start, end]) => inIpv4Range(address, start, end));
  }
  if (!net.isIPv6(address)) return true;
  return address === '::' || address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe8') || address.startsWith('fe9') || address.startsWith('fea') || address.startsWith('feb') || address.startsWith('::ffff:10.') || address.startsWith('::ffff:192.168.') || address.startsWith('::ffff:127.');
}

export function isBlockedHostname(value: string) {
  const host = value.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === 'metadata' || host === 'metadata.google.internal') return true;
  return net.isIP(host) > 0 && isPrivateAddress(host);
}

export async function isSafeOutboundUrl(value: string, options: { allowHttp?: boolean } = {}) {
  let parsed: URL;
  try { parsed = new URL(value); } catch { return false; }
  if (!['https:', ...(options.allowHttp ? ['http:'] : [])].includes(parsed.protocol)) return false;
  if (parsed.username || parsed.password || parsed.hash) return false;
  const host = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (isBlockedHostname(host)) return false;
  if (net.isIP(host)) return true;
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    return records.length > 0 && records.every((record) => !isPrivateAddress(record.address));
  } catch { return false; }
}
