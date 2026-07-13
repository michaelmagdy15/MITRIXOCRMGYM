// scripts/list-tables.js
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const client = new Client({ connectionString });
  await client.connect();

  console.log('--- TABLES ---');
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  console.log(tablesRes.rows.map(r => r.table_name));

  for (const table of tablesRes.rows.map(r => r.table_name)) {
    console.log(`\n--- COLUMNS FOR ${table} ---`);
    const colsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [table]);
    console.log(colsRes.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
  }

  await client.end();
}

main().catch(console.error);
