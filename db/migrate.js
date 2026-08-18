const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('No DATABASE_URL set, skipping migration');
    process.exit(0);
  }

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('render.com') || url.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : false,
  });

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Applying schema...');
  await pool.query(sql);
  console.log('Schema applied successfully.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
