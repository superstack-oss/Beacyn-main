import mysql from 'mysql2/promise';

import 'dotenv/config';

const host = process.env.DB_HOST || 'localhost';
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME || 'pulseiq';
const port = Number(process.env.DB_PORT || 3306);
const isLocalHost = host === 'localhost' || host === '127.0.0.1';
const useSsl = (process.env.DB_SSL || '').toLowerCase() === 'true' || !isLocalHost;
const rejectUnauthorized = (process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() === 'true';

if (!Number.isFinite(port) || port <= 0) {
  throw new Error('Invalid DB_PORT value in environment.');
}

const pool = mysql.createPool({
  host,
  user,
  password,
  database,
  port,
  ...(useSsl ? { ssl: { rejectUnauthorized } } : {}),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default pool;
