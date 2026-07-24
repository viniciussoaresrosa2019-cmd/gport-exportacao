import pg from 'pg';
import 'dotenv/config';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada. Copie .env.example para .env.');

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: 20_000,
  ssl: isLocal ? false : { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
});

export const query = (text, values) => pool.query(text, values);
