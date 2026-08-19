import { Pool } from 'pg';
import { getPostgresOptions } from '../db/postgres-ssl.js';

let pool: Pool | null = null;


export function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  pool = new Pool({ ...getPostgresOptions(url), max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  return pool;
}

export async function query<T = any>(text: string, params?: any[]) {
  return getPool().query<T>(text, params);
}
