import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

import 'dotenv/config';

const execFileAsync = promisify(execFile);

interface AuditEventPayload {
  eventType: 'system' | 'security';
  action: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  outcome: 'success' | 'failed';
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

interface PortalStatusPayload {
  uptimeSeconds: number;
  appVersion: string;
}

interface DbSnapshotPayload {
  engineName: string;
  engineVersion: string;
  spaceBytes: number;
  signature: string;
  uptimeSeconds: number;
}

async function checkEndpoint(url: string, timeoutMs = 8000) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    return { ok: res.ok, status: res.status, latencyMs };
  } catch (error: any) {
    return { ok: false, status: 0, latencyMs: Date.now() - startedAt, error: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

function parseVulnerabilitySummary(stdout: string): {
  total: number;
  info: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
} {
  try {
    const payload = JSON.parse(stdout || '{}');
    const summary = payload?.metadata?.vulnerabilities || payload?.vulnerabilities || {};
    const info = Number(summary.info || 0);
    const low = Number(summary.low || 0);
    const moderate = Number(summary.moderate || 0);
    const high = Number(summary.high || 0);
    const critical = Number(summary.critical || 0);
    return {
      total: info + low + moderate + high + critical,
      info,
      low,
      moderate,
      high,
      critical,
    };
  } catch {
    return { total: 0, info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  }
}

async function runNpmAudit() {
  try {
    const { stdout } = await execFileAsync('npm', ['audit', '--json'], { maxBuffer: 1024 * 1024 * 5 });
    const report = JSON.parse(stdout || '{}');
    return {
      ok: true,
      summary: parseVulnerabilitySummary(stdout),
      report,
    };
  } catch (error: any) {
    const stdout = String(error?.stdout || '');
    const summary = parseVulnerabilitySummary(stdout);
    const hasVulns = summary.total > 0;
    let report: any = null;
    try {
      report = stdout ? JSON.parse(stdout) : null;
    } catch {
      report = null;
    }
    return {
      ok: hasVulns,
      summary,
      error: hasVulns ? null : String(error?.message || 'npm audit failed'),
      report,
    };
  }
}

async function captureDatabaseSnapshot(): Promise<{ data: DbSnapshotPayload | null; error: string | null }> {
  const host = String(process.env.DB_HOST || '127.0.0.1').trim();
  const port = Number(process.env.DB_PORT || 3306);
  const user = String(process.env.DB_USER || '').trim();
  const password = String(process.env.DB_PASSWORD || '');
  const database = String(process.env.DB_NAME || '').trim();

  if (!user || !database) {
    return { data: null, error: 'DB_USER/DB_NAME not configured' };
  }

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({ host, port, user, password, database });

    const [versionRows]: any = await conn.query(
      `SELECT VERSION() AS version, @@version_comment AS version_comment`
    );
    const version = String(versionRows?.[0]?.version || '').trim();
    const versionComment = String(versionRows?.[0]?.version_comment || '').trim();

    const [spaceRows]: any = await conn.query(
      `SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes
       FROM information_schema.tables
       WHERE table_schema = ?`,
      [database]
    );
    const [uptimeRows]: any = await conn.query(
      `SHOW GLOBAL STATUS LIKE 'Uptime'`
    );

    const spaceBytes = Number(spaceRows?.[0]?.bytes || 0);
    const uptimeSeconds = Number(uptimeRows?.[0]?.Value || uptimeRows?.[0]?.value || 0);
    const engineName = 'MySQL';
    const engineVersion = versionComment ? `${version} (${versionComment})` : version || 'unknown';
    const signatureSource = `${engineName}|${engineVersion}|${host}|${port}|${database}|${spaceBytes}`;
    const signature = crypto.createHash('sha256').update(signatureSource).digest('hex').slice(0, 40);

    return {
      data: {
        engineName,
        engineVersion,
        spaceBytes,
        signature,
        uptimeSeconds,
      },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: String(error?.message || error || 'db snapshot failed') };
  } finally {
    if (conn) {
      try { await conn.end(); } catch { /* ignore close errors */ }
    }
  }
}

async function sendAuditEvent(baseUrl: string, monitorKey: string, event: AuditEventPayload) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (monitorKey) headers['x-portal-monitor-key'] = monitorKey;

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/portal-audit/system-event`, {
    method: 'POST',
    headers,
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to publish event (${res.status}): ${text}`);
  }
}

async function sendPortalSnapshot(baseUrl: string, monitorKey: string, payload: {
  frontendUrl: string;
  backendUrl: string;
  frontend: { ok: boolean; status: number; latencyMs: number; error?: string | null };
  backend: { ok: boolean; status: number; latencyMs: number; error?: string | null };
  portalUptimeSeconds: number | null;
  appVersion: string | null;
  dbEngineName: string | null;
  dbEngineVersion: string | null;
  dbSpaceBytes: number | null;
  dbSignature: string | null;
  dbUptimeSeconds: number | null;
  vulnerabilities: { total: number; info: number; low: number; moderate: number; high: number; critical: number };
  overallStatus: 'healthy' | 'degraded' | 'critical';
  highestSeverity: 'info' | 'warning' | 'critical';
  details?: Record<string, unknown>;
}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (monitorKey) headers['x-portal-monitor-key'] = monitorKey;

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/portal-audit/system-snapshot`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const error = new Error(`Failed to publish snapshot (${res.status}): ${text}`) as Error & { statusCode?: number };
    error.statusCode = res.status;
    throw error;
  }
}

async function fetchPortalStatus(baseUrl: string, monitorKey: string): Promise<PortalStatusPayload | null> {
  const headers: Record<string, string> = {};
  if (monitorKey) headers['x-portal-monitor-key'] = monitorKey;

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/system/portal-status`, {
    headers,
  });
  if (!res.ok) {
    return null;
  }

  const payload = await res.json().catch(() => ({}));
  return {
    uptimeSeconds: Number(payload?.uptimeSeconds || 0),
    appVersion: String(payload?.appVersion || ''),
  };
}

async function runCycle() {
  const frontendUrl = String(process.env.PORTAL_FRONTEND_URL || 'http://localhost:7145').trim();
  const backendBaseUrl = String(process.env.PORTAL_BACKEND_URL || 'http://localhost:5145').trim().replace(/\/$/, '');
  const monitorKey = String(process.env.PORTAL_MONITOR_KEY || '').trim();

  const frontend = await checkEndpoint(frontendUrl);
  const backend = await checkEndpoint(`${backendBaseUrl}/health`);
  const portalStatus = await fetchPortalStatus(backendBaseUrl, monitorKey);
  const npmAudit = await runNpmAudit();
  const dbSnapshot = await captureDatabaseSnapshot();
  const dbInfo = dbSnapshot.data;

  const events: AuditEventPayload[] = [];

  events.push({
    eventType: 'system',
    action: 'frontend-availability-check',
    message: frontend.ok ? `Frontend reachable (${frontend.status})` : 'Frontend unreachable',
    severity: frontend.ok ? 'info' : 'critical',
    outcome: frontend.ok ? 'success' : 'failed',
    targetType: 'frontend',
    targetId: frontendUrl,
    details: frontend,
  });

  events.push({
    eventType: 'system',
    action: 'backend-availability-check',
    message: backend.ok ? `Backend healthy (${backend.status})` : 'Backend unhealthy/unreachable',
    severity: backend.ok ? 'info' : 'critical',
    outcome: backend.ok ? 'success' : 'failed',
    targetType: 'backend',
    targetId: `${backendBaseUrl}/health`,
    details: backend,
  });

  const vuln = npmAudit.summary;
  const vulnerabilitySeverity: 'info' | 'warning' | 'critical' = vuln.critical > 0 ? 'critical' : (vuln.high > 0 ? 'warning' : 'info');
  const vulnerabilityOutcome: 'success' | 'failed' = vuln.high > 0 || vuln.critical > 0 ? 'failed' : 'success';

  events.push({
    eventType: 'security',
    action: 'npm-vulnerability-scan',
    message: npmAudit.ok ? `npm audit completed (${vuln.total} findings)` : 'npm audit failed to execute',
    severity: npmAudit.ok ? vulnerabilitySeverity : 'warning',
    outcome: npmAudit.ok ? vulnerabilityOutcome : 'failed',
    targetType: 'dependencies',
    targetId: 'package-lock',
    details: {
      vulnerabilities: vuln,
      runnerError: npmAudit.error || null,
      report: npmAudit.report || null,
    },
  });

  const overallStatus: 'healthy' | 'degraded' | 'critical' = (!frontend.ok || !backend.ok)
    ? 'critical'
    : (vuln.high > 0 || vuln.critical > 0)
      ? 'degraded'
      : 'healthy';
  const highestSeverity: 'info' | 'warning' | 'critical' = !frontend.ok || !backend.ok
    ? 'critical'
    : vulnerabilitySeverity;

  try {
    await sendPortalSnapshot(backendBaseUrl, monitorKey, {
      frontendUrl,
      backendUrl: `${backendBaseUrl}/health`,
      frontend,
      backend,
      portalUptimeSeconds: portalStatus?.uptimeSeconds ?? null,
      appVersion: portalStatus?.appVersion || null,
      dbEngineName: dbInfo?.engineName || null,
      dbEngineVersion: dbInfo?.engineVersion || null,
      dbSpaceBytes: dbInfo?.spaceBytes ?? null,
      dbSignature: dbInfo?.signature || null,
      dbUptimeSeconds: dbInfo?.uptimeSeconds ?? null,
      vulnerabilities: vuln,
      overallStatus,
      highestSeverity,
      details: {
        frontend,
        backend,
        portalStatus,
        vulnerabilities: vuln,
        vulnerabilityRunnerError: npmAudit.error || null,
        auditReport: npmAudit.report || null,
        dbMonitor: dbInfo,
        dbMonitorError: dbSnapshot.error || null,
      },
    });
    console.log('Published: portal-runtime-snapshot');
  } catch (error: any) {
    console.error(`Failed: portal-runtime-snapshot -> ${String(error?.message || error)}`);

    // Backward compatibility: if backend is old and endpoint is missing, still preserve cycle data in audit events.
    if (Number(error?.statusCode || 0) === 404) {
      events.push({
        eventType: 'system',
        action: 'portal-runtime-snapshot-unavailable',
        message: 'Snapshot endpoint unavailable on backend. Restart backend to load latest routes.',
        severity: 'warning',
        outcome: 'failed',
        targetType: 'backend',
        targetId: '/api/portal-audit/system-snapshot',
        details: {
          frontend,
          backend,
          portalStatus,
          vulnerabilities: vuln,
          dbMonitor: dbInfo,
          dbMonitorError: dbSnapshot.error || null,
        },
      });
    }
  }

  for (const event of events) {
    try {
      await sendAuditEvent(backendBaseUrl, monitorKey, event);
      console.log(`Published: ${event.action}`);
    } catch (error: any) {
      console.error(`Failed: ${event.action} -> ${String(error?.message || error)}`);
    }
  }
}

async function main() {
  const runOnce = String(process.env.PORTAL_MONITOR_RUN_ONCE || 'false').toLowerCase() === 'true';
  const runTimesRaw = String(process.env.PORTAL_MONITOR_RUN_TIMES || '00:00,12:00').trim();
  const runTimes = runTimesRaw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => /^\d{2}:\d{2}$/.test(v))
    .map((v) => {
      const [h, m] = v.split(':').map((x) => Number(x));
      return { h: Math.max(0, Math.min(23, h)), m: Math.max(0, Math.min(59, m)) };
    });
  const dailySchedule = runTimes.length ? runTimes : [{ h: 0, m: 0 }, { h: 12, m: 0 }];
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runCycle();
    } finally {
      running = false;
    }
  };

  if (runOnce) {
    await tick();
    return;
  }

  let timer: NodeJS.Timeout | null = null;
  const scheduleNext = () => {
    const now = new Date();
    const nextCandidates = dailySchedule.map(({ h, m }) => {
      const candidate = new Date(now);
      candidate.setHours(h, m, 0, 0);
      if (candidate.getTime() <= now.getTime()) {
        candidate.setDate(candidate.getDate() + 1);
      }
      return candidate;
    });

    const nextRun = nextCandidates.sort((a, b) => a.getTime() - b.getTime())[0];
    const waitMs = Math.max(1_000, nextRun.getTime() - now.getTime());
    timer = setTimeout(async () => {
      await tick();
      scheduleNext();
    }, waitMs);
  };

  scheduleNext();

  const shutdown = () => {
    if (timer) clearTimeout(timer);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('portal-monitor failed:', err);
  process.exitCode = 1;
});
