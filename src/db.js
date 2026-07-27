import pg from 'pg';
import 'dotenv/config';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada. Copie .env.example para .env.');

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !isLocal && process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
  throw new Error('DB_SSL_REJECT_UNAUTHORIZED=false não é permitido em produção. Corrija o certificado do banco.');
}
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: 20_000,
  // Em desenvolvimento é possível manter compatibilidade temporária com
  // poolers antigos; em produção a validação do certificado é obrigatória.
  ssl: isLocal ? false : { rejectUnauthorized: isProduction || process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
});

export const query = (text, values) => pool.query(text, values);
