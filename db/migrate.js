const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { getPostgresOptions } = require('./postgres-ssl');

const RETRYABLE_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', '57P03', '53300', '08001', '08004', '08006']);
const MAX_ATTEMPTS = 4;
const CONNECTION_TIMEOUT_MS = 20_000;

function retryable(error) {
  return Boolean(error && (RETRYABLE_CODES.has(error.code) || /connection terminated|timeout|temporarily unavailable/i.test(error.message || '')));
}

function delay(attempt) {
  return new Promise((resolve) => setTimeout(resolve, Math.min(2_000 * (2 ** (attempt - 1)), 10_000)));
}

function safeError(error) {
  const code = typeof error?.code === 'string' ? error.code : 'unknown';
  const message = typeof error?.message === 'string' ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url]').slice(0, 240) : 'unknown database error';
  return `${code}: ${message}`;
}

async function withRetry(operation) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!retryable(error) || attempt === MAX_ATTEMPTS) throw error;
      console.warn(`Migration database connection attempt ${attempt}/${MAX_ATTEMPTS} failed (${safeError(error)}); retrying.`);
      await delay(attempt);
    }
  }
  throw lastError;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('No DATABASE_URL set, skipping migration');
    process.exit(0);
  }

  const pool = new Pool({
    ...getPostgresOptions(url),
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    max: 1,
  });
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  try {
    console.log(`Applying schema with up to ${MAX_ATTEMPTS} database connection attempts...`);
    await withRetry(() => pool.query(sql));
    console.log('Schema applied successfully.');
    await withRetry(() => pool.query(`UPDATE events SET vendor = 'gtm', event_type = 'internal' WHERE vendor = 'ga4' AND LOWER(COALESCE(event_name, '')) LIKE 'gtm.%'`));
    console.log('Historical GTM lifecycle rows normalized.');
  } finally {
    await pool.end().catch((error) => console.warn(`Migration pool close warning (${safeError(error)}).`));
  }
}

main().catch((error) => {
  console.error('Migration failed:', safeError(error));
  process.exit(1);
});
