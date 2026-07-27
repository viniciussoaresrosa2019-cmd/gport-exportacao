import pg from 'pg';
import 'dotenv/config';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada. Copie .env.example para .env.');

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
const isProduction = process.env.NODE_ENV === 'production';
// Exceção temporária apenas para poolers que não fornecem cadeia de confiança.
// Em produção ela precisa ser habilitada conscientemente no ambiente.
const allowUnverifiedTls = process.env.ALLOW_UNVERIFIED_DATABASE_TLS === 'true';
// Cole o certificado raiz do provedor em DB_SSL_CA (aceita quebras de linha
// reais ou o texto literal "\\n" das variáveis de ambiente do Render). Como
// alternativa mais confiável para painéis que alteram quebras de linha, use
// DB_SSL_CA_BASE64 com o arquivo do certificado codificado em Base64.
const encodedDatabaseCa = process.env.DB_SSL_CA_BASE64;
const databaseCaSource = encodedDatabaseCa
  ? Buffer.from(encodedDatabaseCa, 'base64').toString('utf8')
  : process.env.DB_SSL_CA;
const databaseCa = databaseCaSource?.trim().replace(/\\n/g, '\n');
if (encodedDatabaseCa && (!databaseCa || !databaseCa.includes('BEGIN CERTIFICATE'))) {
  throw new Error('DB_SSL_CA_BASE64 não contém um certificado PEM válido.');
}
if (isProduction && !isLocal && process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' && !allowUnverifiedTls) {
  throw new Error('DB_SSL_REJECT_UNAUTHORIZED=false não é permitido em produção. Corrija o certificado do banco.');
}
if (isProduction && allowUnverifiedTls) console.warn('ATENÇÃO: TLS do banco está criptografado, mas sem validação de certificado. Configure DB_SSL_CA ou conexão com certificado válido assim que possível.');
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: 20_000,
  // Em desenvolvimento é possível manter compatibilidade temporária com
  // poolers antigos; em produção a validação do certificado é obrigatória.
  ssl: isLocal ? false : {
    rejectUnauthorized: isProduction ? !allowUnverifiedTls : process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    ...(databaseCa ? { ca: databaseCa } : {})
  }
});

export const query = (text, values) => pool.query(text, values);
