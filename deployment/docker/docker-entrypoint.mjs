// Beacyn container bootstrap for the shell-less hardened runtime.
// 1. Validate configuration
// 2. Wait until MySQL accepts connections
// 3. Apply the idempotent schema
// 4. Run the platform launcher and forward SIGTERM/SIGINT to it
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { setTimeout as delay } from 'node:timers/promises';

const CYAN = '\x1b[36m';
const GRN = '\x1b[32m';
const YEL = '\x1b[33m';
const RED = '\x1b[31m';
const RST = '\x1b[0m';

const log = (msg) => process.stdout.write(`${CYAN}[beacyn]${RST} ${msg}\n`);
const ok = (msg) => process.stdout.write(`${GRN}[beacyn]${RST} ${msg}\n`);
const warn = (msg) => process.stdout.write(`${YEL}[beacyn]${RST} ${msg}\n`);
const err = (msg) => process.stderr.write(`${RED}[beacyn]${RST} ${msg}\n`);

process.chdir('/app');

const dbHost = process.env.DB_HOST;
const dbName = process.env.DB_NAME;
if (!dbHost) {
  err('DB_HOST is required');
  process.exit(1);
}
if (!dbName) {
  err('DB_NAME is required');
  process.exit(1);
}

const dbPort = process.env.DB_PORT || '3306';
if (!/^[0-9]+$/.test(dbPort)) {
  err('DB_PORT must be a number.');
  process.exit(1);
}

process.env.DB_PORT = dbPort;
if (!process.env.DB_USER) process.env.DB_USER = 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || 'Password@123';

if (process.env.DB_PASSWORD === 'Password@123') {
  warn('MySQL is using the default password. Set MYSQL_ROOT_PASSWORD before production use.');
}

if (!existsSync('/app/dist/index.html')) {
  err('Frontend build artefacts not found at /app/dist.');
  err('Rebuild with: docker compose build   or   podman compose build');
  process.exit(1);
}

let child = null;
let stopping = false;

function forward(signal) {
  if (child && child.exitCode === null && !child.killed) child.kill(signal);
}

process.on('SIGTERM', () => {
  stopping = true;
  forward('SIGTERM');
});
process.on('SIGINT', () => {
  stopping = true;
  forward('SIGINT');
});

function run(args) {
  return new Promise((resolve) => {
    child = spawn(process.execPath, args, {
      cwd: '/app',
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code, signal) => {
      child = null;
      if (stopping) resolve(0);
      else resolve(signal ? 1 : (code ?? 1));
    });
  });
}

log(`Waiting for MySQL at ${dbHost}:${dbPort}…`);

const maxTries = 40;
let ready = false;
let lastErr = '';

for (let attempt = 1; attempt <= maxTries; attempt += 1) {
  if (stopping) process.exit(0);
  try {
    const conn = await mysql.createConnection({
      host: dbHost,
      port: Number(dbPort),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectTimeout: 5000,
    });
    await conn.end();
    ready = true;
    break;
  } catch (error) {
    lastErr = error instanceof Error ? error.message : String(error);
    if (attempt >= maxTries) break;
    warn(`MySQL not ready (attempt ${attempt}/${maxTries}). Retrying in 3s…`);
    await delay(3000);
  }
}

if (stopping) process.exit(0);

if (!ready) {
  err(`MySQL did not become ready after ${maxTries} attempts.`);
  if (lastErr) err(lastErr);
  process.exit(1);
}

ok('MySQL is ready.');

log('Applying database schema (idempotent)…');
const initCode = await run(['node_modules/tsx/dist/cli.mjs', 'db/initDb.ts']);
if (initCode !== 0) {
  err('Database initialisation failed.');
  process.exit(initCode);
}
ok('Database schema is up to date.');

ok(`Starting Beacyn (NODE_ENV=${process.env.NODE_ENV || 'production'})…`);
const code = await run(['node_modules/tsx/dist/cli.mjs', 'src/scripts/start.ts']);
process.exit(code);
