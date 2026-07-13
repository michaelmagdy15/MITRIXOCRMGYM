// scripts/db-audit.js
// Simple DB performance audit script using pg client.
// It runs EXPLAIN ANALYZE on a set of representative queries and writes results to a markdown report.
import 'dotenv/config';

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

async function runExplain(client, query) {
  const res = await client.query(`EXPLAIN ANALYZE ${query}`);
  return res.rows.map(row => row['TEXT'] || Object.values(row)[0]).join('\n');
}

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable not set.');
    process.exit(1);
  }
  const client = new Client({ connectionString });
  await client.connect();

  const queries = [
    "SELECT * FROM clients WHERE status != 'Lead' LIMIT 100",
    "SELECT * FROM payments WHERE created_at::timestamptz > '2023-01-01'::timestamptz LIMIT 100",
    "SELECT * FROM coaches WHERE active = true LIMIT 50",
    "SELECT * FROM attendance WHERE date > '2023-01-01' LIMIT 100"
  ];

  let report = `# Database Performance Audit Report\n\nGenerated at ${new Date().toISOString()}\n\n`;

  for (const q of queries) {
    report += `## Query: ${q}\n\n`;
    try {
      const plan = await runExplain(client, q);
      report += '```sql\n' + q + '\n```\n\n';
      report += '```\n' + plan + '\n```\n\n';
    } catch (err) {
      report += `Error running EXPLAIN for query: ${err}\n\n`;
    }
  }

  const outPath = path.resolve('db-audit-report.md');
  fs.writeFileSync(outPath, report);
  console.log('DB audit report written to', outPath);
  await client.end();
}

main().catch(e => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
