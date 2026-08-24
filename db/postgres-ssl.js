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

function isSupabaseHost(url) {
  try {
    const hostname = new URL(url).hostname;
    return /(^|\.)supabase\.co$/i.test(hostname) || /(^|\.)pooler\.supabase\.com$/i.test(hostname);
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
  const wantsTls = isRenderHost(url) || isSupabaseHost(url) || url.includes('sslmode=require') || process.env.PG_SSL === 'true';
  if (!wantsTls) return { connectionString: url, ssl: false };

  const ca = readCa();
  const configured = process.env.PG_SSL_REJECT_UNAUTHORIZED;
  const explicitInsecureDev = configured === 'false' && process.env.ALLOW_INSECURE_DB_TLS === 'true' && process.env.NODE_ENV !== 'production';
  const explicitRenderCompatibility = configured === 'false' && process.env.ALLOW_RENDER_SELF_SIGNED_TLS === 'true' && process.env.NODE_ENV === 'production';
  const rejectUnauthorized = !(explicitInsecureDev || explicitRenderCompatibility);
  if (explicitInsecureDev && !ca) console.warn('[Postgres] TLS certificate verification is disabled for development only.');
  if (explicitRenderCompatibility && !ca) console.warn('[Postgres] Explicit self-signed TLS compatibility is enabled for this production deployment. Prefer PG_CA_CERT when available.');
  return {
    connectionString: withoutSslConnectionOptions(url),
    ssl: { rejectUnauthorized, ...(ca ? { ca } : {}) },
  };
}

module.exports = { getPostgresOptions };
