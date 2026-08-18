import { Pool } from 'pg';
import fs from 'fs';

let pool: Pool | null = null;

function postgresSsl(url: string) {
  const wantsTls = url.includes('render.com') || url.includes('sslmode=require') || process.env.PG_SSL === 'true';
  if (!wantsTls) return false;
  const ca = process.env.PG_CA_CERT || (process.env.PG_CA_CERT_PATH ? fs.readFileSync(process.env.PG_CA_CERT_PATH, 'utf8') : undefined);
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}

export function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  pool = new Pool({ connectionString: url, ssl: postgresSsl(url), max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  return pool;
}

export async function query<T = any>(text: string, params?: any[]) {
  return getPool().query<T>(text, params);
}
