/**
 * start.ts — Beacyn Platform Launcher
 *
 * Starts the backend API, Vite dev server, and portal security monitor
 * concurrently with structured enterprise-grade console output.
 *
 * Docker-compatible: works without a TTY.
 *   NO_COLOR=1              Disable ANSI colours (e.g. in log-aggregation pipelines)
 *   FORCE_COLOR=1           Force ANSI colours in non-TTY environments (Docker / CI)
 *   PORT                    Backend port (default: 5145)
 *   VITE_APP_URL            Frontend URL shown in banner (default: http://localhost:7145)
 *   PORTAL_MONITOR_RUN_ONCE=true  Run security scan once at startup then continue
 *   EULA_ACCEPTED=true      Skip interactive EULA prompt (CI / Docker / automated deployments)
 *
 * EULA acceptance is persisted in <root>/.eula-accepted so you are only
 * prompted once per installation. Delete that file to re-trigger the prompt.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { createInterface }     from 'node:readline';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path                    from 'node:path';
import { fileURLToPath }       from 'node:url';
import 'dotenv/config';

// ─── Paths ─────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Resolves a binary inside the local node_modules — Docker-safe, no PATH dependency. */
const bin = (name: string) => path.join(ROOT, 'node_modules', '.bin', name);
const TSX  = bin('tsx');
const VITE = bin('vite');

// ─── Version ───────────────────────────────────────────────────────────────────

const VERSION = (() => {
  try {
    return String(
      JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version ?? '0.0.0'
    );
  } catch { return '0.0.0'; }
})();

// Path where EULA acceptance is persisted between runs
const EULA_MARKER = path.join(ROOT, '.eula-accepted');

// ─── ANSI colour helpers (Docker / NO_COLOR aware) ────────────────────────────

const COLOUR =
  !process.env.NO_COLOR &&
  (process.stdout.isTTY === true || process.env.FORCE_COLOR === '1');

const A = COLOUR ? {
  rst: '\x1b[0m',  bold: '\x1b[1m', dim: '\x1b[2m',
  grn: '\x1b[32m', yel: '\x1b[33m', cyn: '\x1b[36m',
  blu: '\x1b[34m', red: '\x1b[31m', gry: '\x1b[90m', wht: '\x1b[97m',
} : Object.fromEntries(
  ['rst','bold','dim','grn','yel','cyn','blu','red','gry','wht'].map(k => [k, ''])
) as Record<string, string>;

// ─── Runtime config ────────────────────────────────────────────────────────────

const FRONTEND_URL = (process.env.VITE_APP_URL || 'http://localhost:7145').replace(/\/$/, '');
const BACKEND_PORT = process.env.PORT || '5145';
const BACKEND_URL  = `http://localhost:${BACKEND_PORT}`;

// ─── Noise suppression ─────────────────────────────────────────────────────────
//
// Lines matching ANY of these patterns are silently dropped so the console
// only surfaces meaningful signals.

const NOISE: RegExp[] = [
  // Listener port conflicts on hot-reload (expected; SNMP/Syslog rebind)
  /EADDRINUSE/i,
  // Periodic asset heartbeat results — "[ISO] hostname: Up (44ms)"
  /\[\d{4}-\d{2}-\d{2}T[^\]]+\]\s+\S+:\s+(?:Up|Down)\s+\(\d+ms\)/,
  // Vite HMR update chatter
  /\[vite\]\s+\((?:client|ssr)\)\s+hmr\s+update/i,
  /^\s*\d{1,2}:\d{2}:\d{2}\s+[AP]M\s+\[vite\]\s+\((?:client|ssr)\)/i,
  // Portal-monitor routine publish receipts
  /^Published:\s+(?:portal-runtime-snapshot|frontend-availability-check|backend-availability-check|npm-vulnerability-scan)$/i,
  // Banner-level lines (shown once in printBanner)
  /^PulseIQ Backend running/i,
  /^Monitoring engine started/i,
  // Empty / whitespace-only lines
  /^\s*$/,
];

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const stripAnsi = (s: string) => s.replace(ANSI_RE, '').trim();

const isSuppressed = (line: string): boolean => {
  const s = stripAnsi(line);
  return !s || NOISE.some(re => re.test(s));
};

// ─── Log level classifier ──────────────────────────────────────────────────────

type Level = 'ready' | 'warn' | 'error' | 'info';

const classify = (line: string): Level => {
  const s = stripAnsi(line);
  if (/\b(?:error|exception|fatal|failed|uncaught)\b/i.test(s)) return 'error';
  if (/\b(?:warn(?:ing)?|deprecated?)\b/i.test(s))               return 'warn';
  if (/\b(?:ready|running on|listening|started|compiled|connected)\b/i.test(s)) return 'ready';
  return 'info';
};

// ─── Services ──────────────────────────────────────────────────────────────────

const SVC = {
  backend:  { label: 'Backend ', col: A.cyn },
  frontend: { label: 'Frontend', col: A.blu },
  security: { label: 'Security', col: A.yel },
} as const;

type SvcKey = keyof typeof SVC;

// ─── Structured line printer ───────────────────────────────────────────────────

const hhmmss = () => new Date().toTimeString().slice(0, 8);

function emit(svc: SvcKey, text: string) {
  const { label, col } = SVC[svc];
  const lvl = classify(text);

  const sym = lvl === 'ready' ? `${A.grn}✓${A.rst}`
            : lvl === 'warn'  ? `${A.yel}⚠${A.rst}`
            : lvl === 'error' ? `${A.red}✖${A.rst}`
            :                   `${A.gry}·${A.rst}`;

  const body = lvl === 'error' ? `${A.red}${text}${A.rst}`
             : lvl === 'warn'  ? `${A.yel}${text}${A.rst}`
             : lvl === 'ready' ? `${A.wht}${text}${A.rst}`
             :                   `${A.dim}${text}${A.rst}`;

  process.stdout.write(
    `  ${A.gry}${hhmmss()}${A.rst}  ${col}${label}${A.rst}  ${sym}  ${body}\n`
  );
}

// ─── EULA acceptance ─────────────────────────────────────────────────────────

/**
 * Prompts the user to accept the EULA before any service starts.
 * Acceptance is persisted to .eula-accepted so only required once per install.
 * Non-interactive override: EULA_ACCEPTED=true  (CI / Docker)
 */
async function promptEulaAcceptance(): Promise<void> {
  // BW = inner box width → total line = BW + 4 = 80 chars (fits standard terminal)
  const BW = 76;
  const BC = BW - 4; // visible content area per row: 72 chars

  // Strip ANSI escape codes to measure visible string length
  // eslint-disable-next-line no-control-regex
  const vl = (s: string) => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').length;

  // Word-wrap plain text (no ANSI codes) to at most maxW visible chars per line
  const wrap = (text: string, maxW = BC): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (cand.length <= maxW) { cur = cand; }
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const ln = (s = '') => process.stdout.write(`${s}\n`);

  // ── Double-line box (product identity) ───────────────────────────────────
  const db = {
    top:   `  ${A.gry}╔${'═'.repeat(BW)}╗${A.rst}`,
    btm:   `  ${A.gry}╚${'═'.repeat(BW)}╝${A.rst}`,
    div:   `  ${A.gry}╠${'═'.repeat(BW)}╣${A.rst}`,
    empty: `  ${A.gry}║${' '.repeat(BW)}║${A.rst}`,
    row: (c: string) => {
      const pad = Math.max(0, BC - vl(c));
      return `  ${A.gry}║${A.rst}  ${c}${' '.repeat(pad)}  ${A.gry}║${A.rst}`;
    },
  };

  // ── Single-line box (EULA content) ───────────────────────────────────────
  // Header dashes formula:  n = 73 - title.length  →  total visible = 80
  const sb = {
    top: (title: string) => {
      const n = Math.max(1, 73 - title.length);
      return `  ${A.gry}┌─ ${A.bold}${A.yel}${title}${A.rst}${A.gry} ${'─'.repeat(n)}┐${A.rst}`;
    },
    btm:   `  ${A.gry}└${'─'.repeat(BW)}┘${A.rst}`,
    div: (title = '') => {
      if (!title) return `  ${A.gry}├${'─'.repeat(BW)}┤${A.rst}`;
      const n = Math.max(1, 73 - title.length);
      return `  ${A.gry}├─ ${A.yel}${title}${A.rst}${A.gry} ${'─'.repeat(n)}┤${A.rst}`;
    },
    empty: `  ${A.gry}│${' '.repeat(BW)}│${A.rst}`,
    row: (c: string) => {
      const pad = Math.max(0, BC - vl(c));
      return `  ${A.gry}│${A.rst}  ${c}${' '.repeat(pad)}  ${A.gry}│${A.rst}`;
    },
  };

  // ── Already accepted ──────────────────────────────────────────────────────
  if (existsSync(EULA_MARKER)) {
    const stamp = (() => {
      try { return readFileSync(EULA_MARKER, 'utf8').split('\n')[0] ?? ''; }
      catch { return ''; }
    })();
    ln();
    ln(db.top);
    ln(db.row(`${A.grn}✓${A.rst}  ${A.dim}EULA previously accepted${stamp ? `  ·  ${stamp}` : ''}.${A.rst}`));
    ln(db.btm);
    ln();
    return;
  }

  // ── CI / Docker — non-interactive env override ────────────────────────────
  const envAccepted = (process.env.EULA_ACCEPTED ?? '').toLowerCase();
  if (envAccepted === 'true' || envAccepted === '1' || envAccepted === 'yes') {
    const stamp = `${new Date().toISOString()} via EULA_ACCEPTED env var`;
    writeFileSync(EULA_MARKER, `${stamp}\nVersion: ${VERSION}\n`, 'utf8');
    ln();
    ln(db.top);
    ln(db.row(`${A.grn}✓${A.rst}  ${A.dim}EULA accepted automatically via EULA_ACCEPTED environment variable.${A.rst}`));
    ln(db.btm);
    ln();
    return;
  }

  // ── Non-TTY without override — abort ─────────────────────────────────────
  if (!process.stdin.isTTY) {
    ln();
    ln(db.top);
    ln(db.row(`${A.red}✖  Non-interactive terminal — EULA acceptance is required.${A.rst}`));
    ln(db.row(`${A.dim}   Set EULA_ACCEPTED=true to accept non-interactively (CI / Docker).${A.rst}`));
    ln(db.btm);
    ln();
    process.exit(1);
  }

  // ── Product identity banner ───────────────────────────────────────────────
  ln();
  ln(db.top);
  ln(db.empty);
  ln(db.row(`${A.bold}${A.wht}BEACYN${A.rst}  ${A.dim}Enterprise Infrastructure Monitoring & Observability${A.rst}`));
  ln(db.row(`${A.dim}Community Edition${A.rst}  ${A.cyn}v${VERSION}${A.rst}`));
  ln(db.empty);
  ln(db.div);
  ln(db.empty);
  ln(db.row(`${A.gry}License   ${A.rst}${A.dim}Lifetime Free Community${A.rst}`));
  ln(db.row(`${A.gry}Developer ${A.rst}${A.dim}Beacyn Labs by Atanu Kumar Paul${A.rst}`));
  ln(db.empty);
  ln(db.btm);
  ln();

  // ── EULA content box ──────────────────────────────────────────────────────
  ln(sb.top('END-USER LICENSE AGREEMENT (EULA)'));
  ln(sb.empty);

  for (const l of wrap(
    'IMPORTANT \u2014 READ CAREFULLY: This End-User License Agreement ("Agreement") is a ' +
    'legally binding contract between you ("Licensee") and Beacyn Labs ("Licensor") ' +
    'governing your use of the Beacyn software platform. By downloading, installing, ' +
    'accessing, or using Beacyn in any form, you acknowledge that you have read, ' +
    'understood, and agree to be bound by all terms of this Agreement. If you do not ' +
    'agree, do not install or use the Software.'
  )) {
    ln(sb.row(`${A.dim}${l}${A.rst}`));
  }

  // ── Key Terms ─────────────────────────────────────────────────────────────
  ln(sb.empty);
  ln(sb.div('Key Terms'));
  ln(sb.empty);

  for (const term of [
    'Free for individuals and SMBs (< 250 employees / < USD 50M revenue) via Git, Docker, or Podman self-hosted deployments.',
    'Large enterprises (\u2265 250 employees or \u2265 USD 50M revenue) require a paid Enterprise License.',
    'SaaS usage is subject to a separate paid Subscription Agreement.',
    'Modification, rebranding, reselling, or repurposing the Software is prohibited.',
    'All intellectual property rights remain with Beacyn Labs.',
  ]) {
    const tLines = wrap(term, BC - 4); // 4 chars reserved for "✦  " prefix + indent
    for (let i = 0; i < tLines.length; i++) {
      if (i === 0) {
        ln(sb.row(`${A.grn}✦${A.rst}  ${A.dim}${tLines[i]}${A.rst}`));
      } else {
        ln(sb.row(`   ${A.dim}${tLines[i]}${A.rst}`));
      }
    }
  }

  // ── References ────────────────────────────────────────────────────────────
  ln(sb.empty);
  ln(sb.div('References'));
  ln(sb.empty);
  ln(sb.row(`${A.gry}Full EULA   ${A.rst}${A.cyn}https://beacyn.io/legal/eula${A.rst}`));
  ln(sb.row(`${A.gry}Support     ${A.rst}${A.cyn}support@beacyn.io${A.rst}`));
  ln(sb.row(`${A.gry}Legal       ${A.rst}${A.cyn}legal@beacyn.io${A.rst}`));
  ln(sb.empty);
  ln(sb.btm);
  ln();

  // ── Acceptance prompt ─────────────────────────────────────────────────────
  await new Promise<void>((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    const ask = () => {
      rl.question(
        `  ${A.bold}${A.wht}Do you agree to the End-User License Agreement?${A.rst}  ${A.gry}[yes / no]${A.rst}  `,
        (answer) => {
          const a = answer.trim().toLowerCase();

          if (a === 'yes' || a === 'y') {
            rl.close();
            const stamp = `Accepted interactively on ${new Date().toISOString()}`;
            writeFileSync(EULA_MARKER, `${stamp}\nVersion: ${VERSION}\n`, 'utf8');
            ln();
            ln(`  ${A.grn}✓${A.rst}  ${A.wht}EULA accepted. Starting Beacyn\u2026${A.rst}`);
            ln();
            resolve();
          } else if (a === 'no' || a === 'n') {
            rl.close();
            ln();
            ln(`  ${A.red}✖${A.rst}  ${A.dim}You declined the EULA. Beacyn will not start.${A.rst}`);
            ln(`     ${A.dim}To review the full agreement: ${A.cyn}https://beacyn.io/legal/eula${A.rst}`);
            ln();
            process.exit(0);
          } else {
            ln(`  ${A.yel}\u26a0${A.rst}  ${A.dim}Please type  ${A.wht}yes${A.rst}  ${A.dim}or  ${A.wht}no${A.rst}  ${A.dim}and press Enter.${A.rst}`);
            ask();
          }
        }
      );
    };

    ask();
  });
}

// ─── Banner ────────────────────────────────────────────────────────────────────

function printBanner() {
  const W   = 66;
  const SEP = `${A.gry}  ${'─'.repeat(W)}${A.rst}`;

  const row = (indicator: string, name: string, endpoint: string) =>
    `  ${indicator}  ${A.wht}${name.padEnd(12)}${A.rst}  ${A.dim}${endpoint}${A.rst}`;

  process.stdout.write('\n');
  process.stdout.write(`${SEP}\n`);
  process.stdout.write(`${A.gry}  ║${A.rst}  ${A.bold}${A.wht}Beacyn  v${VERSION}${A.rst}\n`);
  process.stdout.write(`${A.gry}  ║${A.rst}  ${A.dim}Enterprise Infrastructure Monitor${A.rst}\n`);
  process.stdout.write(`${SEP}\n\n`);

  process.stdout.write(`${A.dim}  Service         Endpoint${A.rst}\n`);
  process.stdout.write(`${A.dim}  ${'─'.repeat(W - 2)}${A.rst}\n`);
  process.stdout.write(`${row(`${A.yel}◌${A.rst}`, 'Frontend',    FRONTEND_URL)}\n`);
  process.stdout.write(`${row(`${A.yel}◌${A.rst}`, 'Backend API', BACKEND_URL)}\n`);
  process.stdout.write(`${row(`${A.yel}◌${A.rst}`, 'Security',    'Portal health monitor — scheduled')}\n`);
  process.stdout.write(`${A.dim}  ${'─'.repeat(W - 2)}${A.rst}\n\n`);
}

// ─── Process management ────────────────────────────────────────────────────────

const children: ChildProcess[] = [];
let exiting = false;

function launch(svc: SvcKey, cmd: string, args: string[], extraEnv?: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...extraEnv },
  });

  const onLine = (line: string) => {
    if (!isSuppressed(line)) emit(svc, stripAnsi(line));
  };

  createInterface({ input: child.stdout! }).on('line', onLine);
  createInterface({ input: child.stderr! }).on('line', onLine);

  child.on('exit', (code, signal) => {
    if (exiting) return;
    if (signal)                        emit(svc, `Terminated by signal ${signal}`);
    else if (code != null && code !== 0) emit(svc, `Exited with code ${code}`);
  });

  children.push(child);
  return child;
}

function shutdown(sig: string) {
  if (exiting) return;
  exiting = true;
  process.stdout.write(
    `\n  ${A.yel}⬛  Received ${sig} — shutting down all services…${A.rst}\n\n`
  );
  for (const c of children) {
    try { if (!c.killed) c.kill('SIGTERM'); } catch { /* ignore */ }
  }
  // Give processes 3 s to exit cleanly before hard exit.
  setTimeout(() => process.exit(0), 3_000).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP',  () => shutdown('SIGHUP'));

// ─── Start all services ────────────────────────────────────────────────────────

// ─── Entry point ──────────────────────────────────────────────────────────────

(async () => {
  await promptEulaAcceptance();

  printBanner();

  // In Docker / production (NODE_ENV=production) use `vite preview` which serves
  // the pre-built dist/ folder.  --host binds to 0.0.0.0 so the port is reachable
  // from outside the container.  In development the standard Vite HMR dev server
  // is started instead.
  const isProduction = process.env.NODE_ENV === 'production';
  const viteArgs = isProduction ? ['preview', '--host'] : [];

  launch('backend',  TSX,  ['src/scripts/api/server.ts']);
  launch('frontend', VITE, viteArgs);
  launch('security', TSX,  ['src/scripts/monitoring/portal-monitor.ts'], {
    PORTAL_MONITOR_RUN_ONCE: process.env.PORTAL_MONITOR_RUN_ONCE ?? 'false',
  });
})();
