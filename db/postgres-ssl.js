const fs = require('fs');

function readCa() {
  if (process.env.PG_CA_CERT) return process.env.PG_CA_CERT;
  if (process.env.PG_CA_CERT_PATH) return fs.readFileSync(process.env.PG_CA_CERT_PATH, 'utf8');
  return undefined;
}

function isRenderHost(url) {
  try {
    return /(^|\.)render\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function withoutSslConnectionOptions(url) {
  try {
    const parsed = new URL(url);
    for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    return url;
  }
}

function getPostgresOptions(url) {
  const wantsTls = url.includes('render.com') || url.includes('sslmode=require') || process.env.PG_SSL === 'true';
  if (!wantsTls) return { connectionString: url, ssl: false };

  const ca = readCa();
  const configured = process.env.PG_SSL_REJECT_UNAUTHORIZED;
  const selfSignedCompatibility = process.env.PG_SSL === 'true' || isRenderHost(url);
  const rejectUnauthorized = configured === 'true' || (configured !== 'false' && (Boolean(ca) || !selfSignedCompatibility));
  if (!rejectUnauthorized && !ca) console.warn('[Postgres] TLS certificate verification is disabled; set PG_CA_CERT/PG_CA_CERT_PATH or PG_SSL_REJECT_UNAUTHORIZED=true to enable it.');
  return {
    connectionString: withoutSslConnectionOptions(url),
    ssl: { rejectUnauthorized, ...(ca ? { ca } : {}) },
  };
}

module.exports = { getPostgresOptions };
