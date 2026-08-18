const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function postgresSsl(url) {
  const wantsTls = url.includes('render.com') || url.includes('sslmode=require') || process.env.PG_SSL === 'true';
  if (!wantsTls) return false;
  const ca = process.env.PG_CA_CERT || (process.env.PG_CA_CERT_PATH ? fs.readFileSync(process.env.PG_CA_CERT_PATH, 'utf8') : undefined);
  return Object.assign({ rejectUnauthorized: true }, ca ? { ca } : {});
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('No DATABASE_URL set, skipping migration');
    process.exit(0);
  }

  const pool = new Pool({
    connectionString: url,
    ssl: postgresSsl(url),
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
