const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { getPostgresOptions } = require('./postgres-ssl');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('No DATABASE_URL set, skipping migration');
    process.exit(0);
  }

  const pool = new Pool({
    ...getPostgresOptions(url),
    connectionTimeoutMillis: 10000,
  });

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Applying schema...');
  await pool.query(sql);
  console.log('Schema applied successfully.');
  await pool.query(`UPDATE events SET vendor = 'gtm', event_type = 'internal' WHERE vendor = 'ga4' AND LOWER(COALESCE(event_name, '')) LIKE 'gtm.%'`);
  console.log('Historical GTM lifecycle rows normalized.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
