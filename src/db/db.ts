import pg from 'pg';
import path from 'path';
import fs from 'fs';

// Parse CockroachDB NUMERIC (OID 1700) as float to avoid trailing .00 strings in UI
pg.types.setTypeParser(1700, (val) => val === null ? null : parseFloat(val));

const connectionString = process.env.COCKROACH_DB_URL || process.env.DATABASE_URL;

const sslConfig: any = {
  rejectUnauthorized: true,
};

// Resolve local certificate on Windows
const appDataPath = process.env.APPDATA;
const localCertPath = appDataPath ? path.join(appDataPath, 'postgresql', 'root.crt') : null;

if (localCertPath && fs.existsSync(localCertPath)) {
  console.log(`[DB] Found CA root.crt locally at: ${localCertPath}`);
  try {
    sslConfig.ca = fs.readFileSync(localCertPath).toString();
  } catch (err: any) {
    console.error(`[DB] Failed to read CA root.crt: ${err.message}`);
    sslConfig.rejectUnauthorized = false;
  }
} else {
  // Fallback: check project root
  const projectCertPath = path.join(process.cwd(), 'root.crt');
  if (fs.existsSync(projectCertPath)) {
    console.log(`[DB] Found CA root.crt at project root.`);
    try {
      sslConfig.ca = fs.readFileSync(projectCertPath).toString();
    } catch (err: any) {
      console.error(`[DB] Failed to read project root.crt: ${err.message}`);
      sslConfig.rejectUnauthorized = false;
    }
  } else {
    // If verify-full is desired but no cert file exists, print warning and connect with loose SSL check
    console.warn('[DB] CockroachDB root.crt certificate not found. Fallback to loose SSL check.');
    sslConfig.rejectUnauthorized = false;
  }
}

export const pool = new pg.Pool({
  connectionString,
  ssl: connectionString ? sslConfig : undefined,
  max: 20, // limit connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected database pool client error:', err);
});

/**
 * Execute a SQL query with parameter binding.
 */
export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production' && duration > 100) {
      console.log(`[DB Query] Executed slow query (${duration}ms):`, text.split('\n')[0]);
    }
    return res;
  } catch (err: any) {
    console.error(`[DB Error] Query failed: ${err.message}`, { text, params });
    throw err;
  }
}

/**
 * Check if the CockroachDB connection is working.
 */
export async function checkConnection(): Promise<boolean> {
  if (!connectionString) {
    console.warn('[DB] COCKROACH_DB_URL or DATABASE_URL not set.');
    return false;
  }
  try {
    const res = await query('SELECT 1 as connected');
    return Number(res.rows[0]?.connected) === 1;
  } catch (err: any) {
    console.error('[DB] Connection check failed:', err.message);
    return false;
  }
}
