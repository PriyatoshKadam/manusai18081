import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  pool = new Pool({
    connectionString: url,
    ssl:
      url.includes('render.com') || url.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : false,
    max: 10,
  });
  return pool;
}

export async function query<T = any>(text: string, params?: any[]) {
  const p = getPool();
  return p.query<T>(text, params);
}
