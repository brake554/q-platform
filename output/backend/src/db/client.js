import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// Connection pool — shared across all requests
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

/**
 * Execute a parameterized query.
 * @param {string} text - SQL query with $1, $2, ... placeholders
 * @param {any[]} params - Parameter values
 */
export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('[DB]', { query: text.slice(0, 80), duration, rows: res.rowCount });
  }
  return res;
}

/**
 * Acquire a client from the pool for transactions.
 * Always call client.release() in a finally block.
 */
export async function getClient() {
  return pool.connect();
}

/**
 * Run a callback inside a transaction. Rolls back on error.
 * @param {(client: pg.PoolClient) => Promise<T>} fn
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
