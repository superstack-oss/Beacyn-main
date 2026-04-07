import express from 'express';
import cors from 'cors';
import * as dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  monitorAsset,
  monitorDockerTarget,
  monitorPageSpeedTarget,
  monitorPingTarget,
  monitorPortTarget,
  monitorSSLTarget,
  monitorWebsiteTarget,
} from './monitorProbe';
import pool from '../lib/db';

const app = express();
const PORT = process.env.PORT || 3001;
const execFileAsync = promisify(execFile);

const DIAG_TTL_MS = 120_000;
const DIAG_TIMEOUT_MS = 4_500;
const diagnosticsCache = new Map<string, { expiresAt: number; payload: any }>();

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.status(200).json({ service: 'PulseIQ Backend', status: 'ok' });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Capture agent heartbeat ingestion (API-first; no DB creds on agent)
app.post('/api/agents/heartbeat', async (req, res) => {
  try {
    const body = req.body || {};
    const agentId = String(body.agentId || body.id || '').trim();
    if (!agentId) return res.status(400).json({ error: 'agentId is required' });

    const hostname = String(body.hostname || agentId).trim();
    const osName = String(body.os || body.platform || 'unknown').trim();
    const osVersion = String(body.osVersion || body.version || 'unknown').trim();
    const agentVersion = String(body.agentVersion || 'v1.0.0').trim();
    const status = String(body.status || 'Actively Syncing').trim();

    await pool.query(
      `INSERT INTO agents (id, hostname, os, os_version, agent_version, status, started_at, last_heartbeat_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         hostname = VALUES(hostname),
         os = VALUES(os),
         os_version = VALUES(os_version),
         agent_version = VALUES(agent_version),
         status = VALUES(status),
         last_heartbeat_at = NOW()`,
      [agentId, hostname, osName, osVersion, agentVersion, status]
    );

    res.json({ success: true });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(404).json({ error: 'agents table not found' });
    }
    res.status(500).json({ error: err.message || 'Failed to ingest heartbeat' });
  }
});

// Capture agent metrics ingestion (API-first; no DB creds on agent)
app.post('/api/agents/metrics', async (req, res) => {
  try {
    const body = req.body || {};
    const agentId = String(body.agentId || '').trim();
    if (!agentId) return res.status(400).json({ error: 'agentId is required' });

    const payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
    const host = String(body.hostname || payload?.hostname || agentId).trim();
    const platformName = String(body.platform || payload?.os?.platform || 'unknown').trim();
    const distro = String(body.distro || payload?.os?.distro || platformName).trim();
    const osVersion = String(body.osVersion || payload?.os?.version || 'unknown').trim();
    const timestampValue = body.timestamp || payload?.timestamp;
    const collectedAt = timestampValue ? new Date(timestampValue) : new Date();

    await pool.query(
      `INSERT INTO agent_metrics (agent_id, hostname, platform, distro, os_version, payload_json, collected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [agentId, host, platformName, distro, osVersion, JSON.stringify(payload), collectedAt]
    );

    res.json({ success: true });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(404).json({ error: 'agent_metrics table not found' });
    }
    res.status(500).json({ error: err.message || 'Failed to ingest metrics' });
  }
});

type TicketSeverity = 'P1' | 'P2' | 'P3';

type IncidentTriggerKind = 'down-or-unreachable' | 'failed-hardware' | 'critical-service' | 'data-disk-90';
type DiagnosticsSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type RootCauseCategory = 'DNS' | 'Network' | 'TLS' | 'App' | 'Policy';

const SNOW_INSTANCE_URL = String(process.env.SNOW_INSTANCE_URL || '').trim().replace(/\/$/, '');
const SNOW_USERNAME = String(process.env.SNOW_USERNAME || '').trim();
const SNOW_PASSWORD = String(process.env.SNOW_PASSWORD || process.env.SNOW_TOKEN || '').trim();
const SNOW_ASSIGNMENT_GROUP = String(process.env.SNOW_ASSIGNMENT_GROUP || '').trim();
const SNOW_ENABLED = Boolean(SNOW_INSTANCE_URL && SNOW_USERNAME && SNOW_PASSWORD);

function incidentPriorityFromSeverity(severity: TicketSeverity) {
  if (severity === 'P1') return '1';
  if (severity === 'P2') return '2';
  return '3';
}

function isDataDiskMount(mountpoint: string, filesystem: string) {
  const m = String(mountpoint || '').toLowerCase();
  const fs = String(filesystem || '').toLowerCase();
  if (!m || m === '/' || m.startsWith('/boot') || m.startsWith('/proc') || m.startsWith('/sys') || m.startsWith('/dev')) return false;
  if (fs.includes('tmpfs') || fs.includes('overlay')) return false;
  return m.includes('/data') || m.includes('/mnt') || m.includes('/u0') || m.includes('/var/lib') || m.includes('/opt') || m.includes('/srv');
}

async function ensureSnowIncidentTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS servicenow_incidents (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      investigate_ticket_id VARCHAR(64) NOT NULL UNIQUE,
      incident_number VARCHAR(64) NULL,
      sys_id VARCHAR(64) NULL,
      state VARCHAR(64) NULL,
      status ENUM('Created', 'Failed') NOT NULL DEFAULT 'Created',
      last_error VARCHAR(512) NULL,
      payload_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );
}

async function ensureDiagnosticsSnapshotTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS diagnostics_snapshots (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      asset_id VARCHAR(50) NOT NULL,
      trigger_source VARCHAR(20) NOT NULL DEFAULT 'auto',
      monitor_status VARCHAR(20) NULL,
      severity VARCHAR(20) NOT NULL,
      probable_cause VARCHAR(512) NOT NULL,
      payload_json JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_diag_asset_time (asset_id, created_at),
      INDEX idx_diag_asset_severity (asset_id, severity)
    )`
  );

  const [colRows]: any = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'diagnostics_snapshots'
       AND column_name = 'root_cause_category'`
  );

  if (!Number(colRows?.[0]?.cnt || 0)) {
    await pool.query(
      `ALTER TABLE diagnostics_snapshots
       ADD COLUMN root_cause_category VARCHAR(20) NOT NULL DEFAULT 'App'`
    );
  }
}

async function ensureDiagnosticsAlertTables() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS diagnostics_alert_rules (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      asset_id VARCHAR(50) NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      severity_threshold VARCHAR(20) NOT NULL DEFAULT 'high',
      consecutive_runs INT NOT NULL DEFAULT 3,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_diag_rule_asset_enabled (asset_id, enabled)
    )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS diagnostics_alert_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      rule_id BIGINT NOT NULL,
      asset_id VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Open',
      current_streak INT NOT NULL,
      severity_at_trigger VARCHAR(20) NOT NULL,
      summary VARCHAR(512) NOT NULL,
      triggered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_diag_events_asset_status (asset_id, status),
      INDEX idx_diag_events_rule_status (rule_id, status)
    )`
  );

  const [rows]: any = await pool.query(
    `SELECT COUNT(*) AS cnt FROM diagnostics_alert_rules WHERE asset_id IS NULL`
  );
  if (!Number(rows?.[0]?.cnt || 0)) {
    await pool.query(
      `INSERT INTO diagnostics_alert_rules (asset_id, enabled, severity_threshold, consecutive_runs)
       VALUES (NULL, 1, 'high', 3)`
    );
  }
}

function parsePayload(value: any) {
  if (!value) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value;
}

function shortError(err: any) {
  return String(err?.message || err || 'Unknown error').slice(0, 180);
}

function severityRank(severity: string) {
  const s = String(severity || 'info').toLowerCase();
  if (s === 'critical') return 5;
  if (s === 'high') return 4;
  if (s === 'medium') return 3;
  if (s === 'low') return 2;
  return 1;
}

function isIpAddress(host: string) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':');
}

function detectAssetCategory(asset: any) {
  const parent = String(asset?.parent_type || '').toLowerCase();
  const sub = String(asset?.sub_type || '').toLowerCase();
  if (parent.includes('website') || parent.includes('api')) return 'website';
  if (parent.includes('docker')) return 'docker';
  if (parent.includes('network port') || sub.includes('port')) return 'port';
  if (parent.includes('device') || parent.includes('server') || parent.includes('infrastructure')) return 'device';
  return 'generic';
}

function normalizeTargetEndpoint(target: string) {
  const raw = String(target || '').trim();
  if (!raw) return null;
  if (/^[^\s:]+:\d+$/.test(raw) && !/^https?:\/\//i.test(raw)) {
    const [host, portStr] = raw.split(':');
    return {
      raw,
      url: null,
      host,
      port: Number(portStr),
      protocol: null,
    };
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    return {
      raw,
      url: url.toString(),
      host: url.hostname,
      port: url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80),
      protocol: url.protocol,
    };
  } catch {
    if (/^[^\s]+$/.test(raw)) {
      return {
        raw,
        url: null,
        host: raw,
        port: null,
        protocol: null,
      };
    }
    return null;
  }
}

async function connectTcp(host: string, port: number, timeoutMs = 1800) {
  return new Promise<{ ok: boolean; latencyMs: number | null; error: string | null }>((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host, port });
    let done = false;

    const finish = (ok: boolean, error: string | null = null) => {
      if (done) return;
      done = true;
      const latencyMs = ok ? Date.now() - start : null;
      socket.destroy();
      resolve({ ok, latencyMs, error });
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false, 'Connection timed out'));
    socket.on('error', (err: any) => finish(false, shortError(err)));
  });
}

function parseDmarcRecord(record: string | null) {
  if (!record) return { valid: false, policy: null, pct: null, rua: null, ruf: null };
  const entries = record
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .reduce((acc: Record<string, string>, p) => {
      const [k, ...rest] = p.split('=');
      if (k && rest.length) acc[k.toLowerCase()] = rest.join('=').trim();
      return acc;
    }, {});

  return {
    valid: String(entries.v || '').toUpperCase() === 'DMARC1',
    policy: entries.p || null,
    pct: entries.pct || null,
    rua: entries.rua || null,
    ruf: entries.ruf || null,
  };
}

async function runTraceroute(host: string) {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'tracert' : 'traceroute';
  const args = isWin ? ['-h', '8', '-w', '1000', host] : ['-m', '8', '-q', '1', '-w', '1', host];

  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: DIAG_TIMEOUT_MS, maxBuffer: 150 * 1024 });
    const lines = String(stdout || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^\d+\s/.test(line))
      .slice(0, 8);

    return {
      available: true,
      hops: lines,
      summary: lines.length ? `${lines.length} hops sampled` : 'No hops returned',
      error: null,
      notice: null,
    };
  } catch (err: any) {
    const e = shortError(err);
    const l = e.toLowerCase();
    let notice = 'Traceroute could not be completed from this probe environment.';
    if (l.includes('enoent') || l.includes('not found')) {
      notice = 'Traceroute utility is not installed on this probe host. Install traceroute/tracert to enable hop-path visibility.';
    } else if (l.includes('operation not permitted') || l.includes('permission denied')) {
      notice = 'Traceroute requires elevated network permissions in this environment. This is expected on some managed/container platforms.';
    }

    return {
      available: false,
      hops: [],
      summary: null,
      error: e,
      notice,
    };
  }
}

async function collectHttpInsights(urlString: string) {
  return new Promise<any>((resolve) => {
    const url = new URL(urlString);
    const client = url.protocol === 'https:' ? https : http;

    const start = Date.now();
    let lookupAt = 0;
    let connectAt = 0;
    let secureAt = 0;
    let firstByteAt = 0;

    const req = client.request(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'PulseIQ-Diagnostics/1.0',
          Accept: '*/*',
        },
      },
      (res) => {
        firstByteAt = Date.now();
        let bytes = 0;

        res.on('data', (chunk) => {
          bytes += Buffer.byteLength(chunk);
        });

        res.on('end', () => {
          const end = Date.now();
          const headers = res.headers || {};
          const socket: any = res.socket;
          const cert = typeof socket?.getPeerCertificate === 'function' ? socket.getPeerCertificate() : null;
          const tlsValidTo = cert?.valid_to ? new Date(cert.valid_to) : null;
          const tlsDaysRemaining = tlsValidTo
            ? Math.max(0, Math.floor((tlsValidTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            : null;

          const requiredHeaders = [
            'strict-transport-security',
            'content-security-policy',
            'x-frame-options',
            'x-content-type-options',
            'referrer-policy',
            'permissions-policy',
          ];
          const missingSecurityHeaders = requiredHeaders.filter((h) => !headers[h]);

          let securityScore = 100;
          if (url.protocol !== 'https:') securityScore -= 30;
          securityScore -= missingSecurityHeaders.length * 8;
          if (tlsDaysRemaining != null && tlsDaysRemaining < 15) securityScore -= 20;
          securityScore = Math.max(0, securityScore);

          resolve({
            performance: {
              dnsMs: lookupAt ? lookupAt - start : null,
              tcpMs: connectAt ? connectAt - (lookupAt || start) : null,
              tlsMs: secureAt ? secureAt - (connectAt || start) : null,
              ttfbMs: firstByteAt ? firstByteAt - start : null,
              totalMs: end - start,
              bytes,
            },
            security: {
              https: url.protocol === 'https:',
              statusCode: res.statusCode || null,
              missingHeaders: missingSecurityHeaders,
              headers: {
                hsts: headers['strict-transport-security'] || null,
                csp: headers['content-security-policy'] || null,
                xFrameOptions: headers['x-frame-options'] || null,
                xContentTypeOptions: headers['x-content-type-options'] || null,
                referrerPolicy: headers['referrer-policy'] || null,
                permissionsPolicy: headers['permissions-policy'] || null,
              },
              tls: {
                validTo: tlsValidTo ? tlsValidTo.toISOString() : null,
                daysRemaining: tlsDaysRemaining,
              },
              score: securityScore,
            },
          });
        });
      }
    );

    req.setTimeout(DIAG_TIMEOUT_MS, () => {
      req.destroy(new Error('Request timed out'));
    });

    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        lookupAt = Date.now();
      });
      socket.on('connect', () => {
        connectAt = Date.now();
      });
      socket.on('secureConnect', () => {
        secureAt = Date.now();
      });
    });

    req.on('error', (err: any) => {
      resolve({
        performance: {
          dnsMs: null,
          tcpMs: null,
          tlsMs: null,
          ttfbMs: null,
          totalMs: null,
          bytes: 0,
        },
        security: {
          https: url.protocol === 'https:',
          statusCode: null,
          missingHeaders: [],
          headers: {},
          tls: { validTo: null, daysRemaining: null },
          score: null,
          error: shortError(err),
        },
      });
    });

    req.end();
  });
}

function deriveSeverityAndCause(asset: any, diagnostics: any): { severity: DiagnosticsSeverity; probableCause: string; category: RootCauseCategory } {
  const category = detectAssetCategory(asset);
  const availability = diagnostics?.availability || {};
  const monitorStatus = String(availability?.status || '').toLowerCase();
  const errorCode = String(availability?.errorCode || '').toUpperCase();

  if (monitorStatus === 'down') {
    if (errorCode.includes('DNS')) return { severity: 'high', probableCause: 'DNS resolution failed for target from probe node.', category: 'DNS' };
    if (errorCode.includes('TLS') || errorCode.includes('SSL')) return { severity: 'high', probableCause: 'TLS handshake or certificate validation failed during probe.', category: 'TLS' };
    if (errorCode.includes('TIMEOUT') || errorCode.includes('NETWORK')) return { severity: 'critical', probableCause: 'Network timeout observed. Possible routing, firewall drop, or overloaded target.', category: 'Network' };
    if (errorCode.includes('REFUSED')) return { severity: 'high', probableCause: 'Target host reachable, but service is not accepting connections on expected port.', category: 'App' };
    if (category === 'docker') return { severity: 'high', probableCause: 'Docker target check failed. Container may be stopped, unhealthy, or inaccessible from probe host.', category: 'App' };
    if (category === 'port') return { severity: 'high', probableCause: 'Port-level probe failed. Verify ACL/firewall rules and process listener state.', category: 'Network' };
    return { severity: 'high', probableCause: 'Availability probe failed for this target.', category: 'App' };
  }

  if (!diagnostics?.dns?.valid) return { severity: 'medium', probableCause: 'DNS configuration inconsistency detected.', category: 'DNS' };
  if (diagnostics?.security?.score != null && diagnostics.security.score < 60) return { severity: 'medium', probableCause: 'Security posture is weak due to missing headers and/or TLS concerns.', category: 'Policy' };
  if ((diagnostics?.performance?.totalMs || 0) > 1800) return { severity: 'low', probableCause: 'Target is reachable but response performance is degraded.', category: 'App' };
  return { severity: 'info', probableCause: 'No critical diagnostics anomalies detected.', category: 'App' };
}

async function evaluateDiagnosticsAlerts(assetId: string, summary: { severity: DiagnosticsSeverity; probableCause: string; category: RootCauseCategory }) {
  const [rules]: any = await pool.query(
    `SELECT * FROM diagnostics_alert_rules
     WHERE enabled = 1 AND (asset_id = ? OR asset_id IS NULL)
     ORDER BY CASE WHEN asset_id IS NULL THEN 1 ELSE 0 END, id ASC`,
    [assetId]
  );

  for (const rule of rules || []) {
    const needed = Math.max(1, Number(rule.consecutive_runs || 1));
    const threshold = String(rule.severity_threshold || 'high').toLowerCase();
    const [recentRows]: any = await pool.query(
      `SELECT severity FROM diagnostics_snapshots WHERE asset_id = ? ORDER BY id DESC LIMIT ?`,
      [assetId, needed]
    );

    const streakRows = recentRows || [];
    const qualifies =
      streakRows.length >= needed &&
      streakRows.every((r: any) => severityRank(r.severity) >= severityRank(threshold));

    const [openEvents]: any = await pool.query(
      `SELECT id FROM diagnostics_alert_events WHERE asset_id = ? AND rule_id = ? AND status = 'Open' LIMIT 1`,
      [assetId, rule.id]
    );

    if (qualifies) {
      if (!openEvents.length) {
        const summaryText = `Severity threshold ${threshold} met for ${needed} consecutive diagnostics runs. Latest cause: ${summary.probableCause}`.slice(0, 512);
        await pool.query(
          `INSERT INTO diagnostics_alert_events (rule_id, asset_id, status, current_streak, severity_at_trigger, summary)
           VALUES (?, ?, 'Open', ?, ?, ?)`,
          [rule.id, assetId, needed, summary.severity, summaryText]
        );
      }
    } else if (openEvents.length) {
      await pool.query(
        `UPDATE diagnostics_alert_events
         SET status = 'Resolved', resolved_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [openEvents[0].id]
      );
    }
  }
}

async function saveDiagnosticsSnapshot(assetId: string, diagnostics: any, triggerSource: 'auto' | 'manual') {
  const summary = diagnostics?.summary || { severity: 'info', probableCause: 'No summary available', category: 'App' };
  await pool.query(
    `INSERT INTO diagnostics_snapshots (asset_id, trigger_source, monitor_status, severity, probable_cause, root_cause_category, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [assetId, triggerSource, diagnostics?.availability?.status || null, summary.severity, summary.probableCause, summary.category || 'App', JSON.stringify(diagnostics)]
  );

  await evaluateDiagnosticsAlerts(assetId, summary);
}

async function getSnapshotComparison(assetId: string) {
  const [latestRows]: any = await pool.query(
    `SELECT id, monitor_status, severity, probable_cause, created_at
     FROM diagnostics_snapshots
     WHERE asset_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [assetId]
  );

  const [lastGoodRows]: any = await pool.query(
    `SELECT id, monitor_status, severity, probable_cause, created_at
     FROM diagnostics_snapshots
     WHERE asset_id = ?
       AND monitor_status = 'Up'
       AND severity IN ('info', 'low')
     ORDER BY id DESC
     LIMIT 1`,
    [assetId]
  );

  return {
    latest: latestRows[0] || null,
    lastGood: lastGoodRows[0] || null,
  };
}

function buildDiagnosticsDiff(current: any, previous: any) {
  if (!current || !previous) return ['No previous snapshot available for comparison.'];

  const diff: string[] = [];
  if (String(current.severity || '').toLowerCase() !== String(previous.severity || '').toLowerCase()) {
    diff.push(`Severity changed from ${previous.severity || 'unknown'} to ${current.severity || 'unknown'}.`);
  }
  if (String(current.monitor_status || '') !== String(previous.monitor_status || '')) {
    diff.push(`Monitor status changed from ${previous.monitor_status || 'Unknown'} to ${current.monitor_status || 'Unknown'}.`);
  }

  const c = parsePayload(current.payload_json) || {};
  const p = parsePayload(previous.payload_json) || {};

  const cDns = c?.dns?.valid;
  const pDns = p?.dns?.valid;
  if (cDns !== pDns) {
    diff.push(`DNS validity changed from ${pDns ? 'valid' : 'invalid'} to ${cDns ? 'valid' : 'invalid'}.`);
  }

  const cTls = c?.security?.tls?.daysRemaining;
  const pTls = p?.security?.tls?.daysRemaining;
  if (typeof cTls === 'number' && typeof pTls === 'number' && Math.abs(cTls - pTls) >= 2) {
    diff.push(`TLS certificate remaining days moved from ${pTls} to ${cTls}.`);
  }

  const cPerf = c?.performance?.totalMs;
  const pPerf = p?.performance?.totalMs;
  if (typeof cPerf === 'number' && typeof pPerf === 'number' && Math.abs(cPerf - pPerf) >= 150) {
    diff.push(`Total response time changed from ${pPerf}ms to ${cPerf}ms.`);
  }

  if (diff.length === 0) {
    diff.push('No major diagnostic deltas were detected compared to previous snapshot.');
  }

  return diff.slice(0, 6);
}

async function getActiveDiagnosticsAlerts(assetId: string) {
  const [rows]: any = await pool.query(
    `SELECT e.id, e.status, e.current_streak, e.severity_at_trigger, e.summary, e.triggered_at,
            r.severity_threshold, r.consecutive_runs
     FROM diagnostics_alert_events e
     LEFT JOIN diagnostics_alert_rules r ON r.id = e.rule_id
     WHERE e.asset_id = ? AND e.status = 'Open'
     ORDER BY e.id DESC
     LIMIT 10`,
    [assetId]
  );
  return rows || [];
}

async function collectDiagnostics(asset: any) {
  const targetEndpoint = String(asset?.target_endpoint || '');
  const normalized = normalizeTargetEndpoint(targetEndpoint);
  const category = detectAssetCategory(asset);
  if (!normalized) {
    return {
      target: { raw: targetEndpoint, host: null, protocol: null, category },
      availability: { ok: false, status: 'Down', kind: 'unknown', errorCode: 'MON_INVALID_TARGET', message: 'Invalid target endpoint' },
      traceroute: { available: false, hops: [], summary: null, error: 'Invalid target endpoint', notice: null },
      dns: { valid: false, issues: ['Invalid target endpoint'], records: {} },
      mx: { records: [], connectivity: [] },
      ns: { records: [] },
      dmarc: { record: null, valid: false, policy: null, pct: null, rua: null, ruf: null },
      security: { score: null, missingHeaders: [], headers: {}, tls: { validTo: null, daysRemaining: null } },
      performance: { dnsMs: null, tcpMs: null, tlsMs: null, ttfbMs: null, totalMs: null, bytes: 0 },
      summary: { severity: 'high', probableCause: 'Target endpoint format is invalid.' },
    };
  }

  const { host, protocol, url, raw, port } = normalized;

  const baseCheck: any = await monitorAsset(asset).catch((err: any) => ({
    ok: false,
    status: 'Down',
    kind: 'unknown',
    latencyMs: null,
    statusCode: null,
    message: shortError(err),
    error: { code: 'MON_DIAG_BASE_CHECK_FAILED', explanation: shortError(err) },
  }));

  const shouldResolveDns = host && !isIpAddress(host);

  const [aRec, aaaaRec, cnameRec, txtRec, caaRec, soaRec, nsRec, mxRec, dmarcTxtRec, traceroute, httpInsights] = await Promise.all([
    shouldResolveDns ? dns.resolve4(host).catch(() => []) : Promise.resolve([]),
    shouldResolveDns ? dns.resolve6(host).catch(() => []) : Promise.resolve([]),
    shouldResolveDns ? dns.resolveCname(host).catch(() => []) : Promise.resolve([]),
    shouldResolveDns ? dns.resolveTxt(host).catch(() => []) : Promise.resolve([]),
    shouldResolveDns ? dns.resolveCaa(host).catch(() => []) : Promise.resolve([]),
    shouldResolveDns ? dns.resolveSoa(host).catch(() => null) : Promise.resolve(null),
    shouldResolveDns ? dns.resolveNs(host).catch(() => []) : Promise.resolve([]),
    shouldResolveDns ? dns.resolveMx(host).catch(() => []) : Promise.resolve([]),
    shouldResolveDns ? dns.resolveTxt(`_dmarc.${host}`).catch(() => []) : Promise.resolve([]),
    host ? runTraceroute(host) : Promise.resolve({ available: false, hops: [], summary: null, error: 'Missing host', notice: null }),
    url && (category === 'website' || category === 'generic')
      ? collectHttpInsights(url)
      : Promise.resolve({
          performance: {
            dnsMs: null,
            tcpMs: null,
            tlsMs: null,
            ttfbMs: null,
            totalMs: baseCheck?.latencyMs ?? null,
            bytes: 0,
          },
          security: {
            https: protocol === 'https:',
            statusCode: baseCheck?.statusCode ?? null,
            missingHeaders: [],
            headers: {},
            tls: { validTo: null, daysRemaining: null },
            score: null,
          },
        }),
  ]);

  const txtFlat = (txtRec || []).map((entry: string[]) => entry.join(''));
  const dmarcRecord = (dmarcTxtRec || []).map((entry: string[]) => entry.join('')).find((v: string) => /v\s*=\s*DMARC1/i.test(v)) || null;
  const dmarc = parseDmarcRecord(dmarcRecord);

  const dnsIssues = [] as string[];
  if (shouldResolveDns) {
    if (!aRec.length && !aaaaRec.length && !cnameRec.length) dnsIssues.push('No A/AAAA/CNAME records resolved');
    if (!nsRec.length) dnsIssues.push('No NS records resolved');
    if (!soaRec) dnsIssues.push('SOA record not resolved');
  }

  const mxConnectivity: any[] = [];
  for (const rec of (mxRec || []).slice(0, 3)) {
    const check = await connectTcp(rec.exchange, 25);
    mxConnectivity.push({
      host: rec.exchange,
      priority: rec.priority,
      ok: check.ok,
      latencyMs: check.latencyMs,
      error: check.error,
    });
  }

  const mxFailedCount = mxConnectivity.filter((c) => !c.ok).length;
  const mxNotice = mxFailedCount > 0
    ? 'Some SMTP port 25 checks were unreachable from this probe. This can be expected when network policy blocks outbound SMTP and does not always indicate a mailbox outage.'
    : null;

  const portCheck = host
    ? await connectTcp(host, Number(port || 443), 2500)
    : { ok: false, latencyMs: null, error: 'Missing host' };

  const diagnostics: any = {
    target: { raw, host, protocol, port, category },
    availability: {
      ok: Boolean(baseCheck?.ok),
      status: baseCheck?.status || 'Down',
      kind: baseCheck?.kind || 'unknown',
      latencyMs: baseCheck?.latencyMs ?? null,
      statusCode: baseCheck?.statusCode ?? null,
      errorCode: baseCheck?.error?.code || null,
      errorMessage: baseCheck?.error?.explanation || null,
      message: baseCheck?.message || null,
    },
    traceroute,
    dns: {
      valid: shouldResolveDns ? dnsIssues.length === 0 : true,
      issues: dnsIssues,
      records: {
        a: aRec,
        aaaa: aaaaRec,
        cname: cnameRec,
        ns: nsRec,
        soa: soaRec,
        txt: txtFlat,
        caa: caaRec,
      },
    },
    mx: {
      records: mxRec,
      connectivity: mxConnectivity,
      notice: mxNotice,
    },
    ns: {
      records: nsRec,
    },
    dmarc: {
      record: dmarcRecord,
      ...dmarc,
    },
    security: httpInsights.security,
    performance: {
      ...httpInsights.performance,
      reachabilityPortMs: portCheck.latencyMs,
      reachabilityPortOk: portCheck.ok,
      reachabilityPortError: portCheck.error,
    },
  };

  diagnostics.summary = deriveSeverityAndCause(asset, diagnostics);
  return diagnostics;
}

async function getCachedDiagnostics(asset: any, options?: { force?: boolean; source?: 'auto' | 'manual' }) {
  const force = Boolean(options?.force);
  const source = options?.source || 'auto';
  const cacheKey = `${asset.id}:${asset.target_endpoint}`;
  const cached = diagnosticsCache.get(cacheKey);
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const diagnostics = await Promise.race([
    collectDiagnostics(asset),
    new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          target: { raw: asset.target_endpoint, host: null, protocol: null },
          availability: { ok: false, status: 'Down', kind: 'unknown', errorCode: 'MON_DIAGNOSTICS_TIMEOUT', message: 'Diagnostics timed out' },
          traceroute: { available: false, hops: [], summary: null, error: 'Diagnostics timed out', notice: null },
          dns: { valid: false, issues: ['Diagnostics timed out'], records: {} },
          mx: { records: [], connectivity: [], notice: null },
          ns: { records: [] },
          dmarc: { record: null, valid: false, policy: null, pct: null, rua: null, ruf: null },
          security: { score: null, missingHeaders: [], headers: {}, tls: { validTo: null, daysRemaining: null } },
          performance: { dnsMs: null, tcpMs: null, tlsMs: null, ttfbMs: null, totalMs: null, bytes: 0 },
          summary: { severity: 'high', probableCause: 'Diagnostics execution timed out before full evidence could be collected.' },
        });
      }, DIAG_TIMEOUT_MS + 500);
    }),
  ]);

  await saveDiagnosticsSnapshot(asset.id, diagnostics, source);
  diagnosticsCache.set(cacheKey, { expiresAt: Date.now() + DIAG_TTL_MS, payload: diagnostics });
  return diagnostics;
}

function parsePct(value: any): number {
  if (typeof value === 'number') return Number(value.toFixed(2));
  if (typeof value !== 'string') return 0;
  const n = Number(value.replace('%', '').trim());
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function severityFromUtilization(value: number): TicketSeverity | null {
  if (value >= 90) return 'P1';
  if (value >= 80) return 'P2';
  if (value >= 70) return 'P3';
  return null;
}

function thresholdForSeverity(severity: TicketSeverity): number {
  if (severity === 'P1') return 90;
  if (severity === 'P2') return 80;
  return 70;
}

function ticketDescription(metric: string, severity: TicketSeverity, value: number, hostname: string, resourceKey: string) {
  return `${metric.toUpperCase()} utilization ${value.toFixed(1)}% on ${hostname} (${resourceKey}) crossed ${severity} threshold. Investigate.`;
}

async function createServiceNowIncidentForTicket(params: {
  ticketId: string;
  severity: TicketSeverity;
  hostname: string;
  metricType: string;
  resourceKey: string;
  description: string;
  triggerKind: IncidentTriggerKind;
}) {
  if (!SNOW_ENABLED) return;

  try {
    const [existing]: any = await pool.query(
      `SELECT id, incident_number
       FROM servicenow_incidents
       WHERE investigate_ticket_id = ?
       LIMIT 1`,
      [params.ticketId]
    );
    if (existing.length && existing[0].incident_number) return;

    const url = `${SNOW_INSTANCE_URL}/api/now/table/incident`;
    const auth = Buffer.from(`${SNOW_USERNAME}:${SNOW_PASSWORD}`).toString('base64');
    const priority = incidentPriorityFromSeverity(params.severity);

    const payload = {
      short_description: `[PulseIQ][${params.severity}] ${params.hostname} - ${params.metricType}`,
      description: `${params.description}\n\nInvestigation Ticket: ${params.ticketId}\nTrigger: ${params.triggerKind}\nResource: ${params.resourceKey}`,
      category: 'inquiry',
      subcategory: 'performance',
      impact: priority,
      urgency: priority,
      assignment_group: SNOW_ASSIGNMENT_GROUP || undefined,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = String(body?.error?.message || `HTTP ${res.status}`).slice(0, 500);
      await pool.query(
        `INSERT INTO servicenow_incidents (investigate_ticket_id, status, last_error, payload_json)
         VALUES (?, 'Failed', ?, ?)
         ON DUPLICATE KEY UPDATE status = 'Failed', last_error = VALUES(last_error), payload_json = VALUES(payload_json), updated_at = CURRENT_TIMESTAMP`,
        [params.ticketId, errMsg, JSON.stringify(body || {})]
      );
      return;
    }

    const number = body?.result?.number || null;
    const sysId = body?.result?.sys_id || null;
    const state = body?.result?.state || null;
    await pool.query(
      `INSERT INTO servicenow_incidents (investigate_ticket_id, incident_number, sys_id, state, status, payload_json)
       VALUES (?, ?, ?, ?, 'Created', ?)
       ON DUPLICATE KEY UPDATE
         incident_number = VALUES(incident_number),
         sys_id = VALUES(sys_id),
         state = VALUES(state),
         status = 'Created',
         payload_json = VALUES(payload_json),
         updated_at = CURRENT_TIMESTAMP`,
      [params.ticketId, number, sysId, state, JSON.stringify(body?.result || body || {})]
    );
  } catch (err: any) {
    await pool.query(
      `INSERT INTO servicenow_incidents (investigate_ticket_id, status, last_error)
       VALUES (?, 'Failed', ?)
       ON DUPLICATE KEY UPDATE status = 'Failed', last_error = VALUES(last_error), updated_at = CURRENT_TIMESTAMP`,
      [params.ticketId, String(err?.message || 'ServiceNow incident creation failed').slice(0, 500)]
    );
  }
}

async function upsertTicket(
  agentId: string,
  hostname: string,
  metricType: string,
  resourceKey: string,
  currentValue: number,
  severity: TicketSeverity,
  descriptionOverride?: string
) {
  const [existing]: any = await pool.query(
    `SELECT id, ticket_id FROM investigate_tickets
     WHERE agent_id = ? AND metric_type = ? AND resource_key = ? AND status = 'Open'
     LIMIT 1`,
    [agentId, metricType, resourceKey]
  );

  const threshold = thresholdForSeverity(severity);
  const description = descriptionOverride || ticketDescription(metricType, severity, currentValue, hostname, resourceKey);

  if (existing.length) {
    await pool.query(
      `UPDATE investigate_tickets
       SET severity = ?, current_value = ?, threshold_value = ?, description = ?, updated_at = NOW(), last_seen_at = NOW(), resolved_at = NULL
       WHERE id = ?`,
      [severity, currentValue, threshold, description, existing[0].id]
    );
    return existing[0].ticket_id as string;
  }

  const ticketId = `INV-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  await pool.query(
    `INSERT INTO investigate_tickets
     (ticket_id, agent_id, hostname, metric_type, resource_key, severity, current_value, threshold_value, status, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?)`,
    [ticketId, agentId, hostname, metricType, resourceKey, severity, currentValue, threshold, description]
  );
  return ticketId;
}

async function resolveTicket(agentId: string, metricType: string, resourceKey: string) {
  await pool.query(
    `UPDATE investigate_tickets
     SET status = 'Resolved', resolved_at = NOW(), updated_at = NOW()
     WHERE agent_id = ? AND metric_type = ? AND resource_key = ? AND status = 'Open'`,
    [agentId, metricType, resourceKey]
  );
}

async function upsertTicketWithOptionalIncident(params: {
  agentId: string;
  hostname: string;
  metricType: string;
  resourceKey: string;
  currentValue: number;
  severity: TicketSeverity;
  description: string;
  incidentTrigger?: IncidentTriggerKind;
}) {
  const ticketId = await upsertTicket(
    params.agentId,
    params.hostname,
    params.metricType,
    params.resourceKey,
    params.currentValue,
    params.severity,
    params.description
  );

  if (params.incidentTrigger && ticketId) {
    await createServiceNowIncidentForTicket({
      ticketId,
      severity: params.severity,
      hostname: params.hostname,
      metricType: params.metricType,
      resourceKey: params.resourceKey,
      description: params.description,
      triggerKind: params.incidentTrigger,
    });
  }
}

async function syncInvestigateTicketsFromRows(rows: any[]) {
  for (const row of rows) {
    const payload = parsePayload(row.payload_json);
    if (!payload) continue;

    const agentId = row.agent_id;
    const hostname = row.hostname || payload.hostname || agentId;

    const cpuPct = Number(payload?.cpu?.usagePct || 0);
    const memPct = Number(payload?.memory?.usedPct || 0);
    const diskUsage = Array.isArray(payload?.disk?.usage) ? payload.disk.usage : [];
    const root = diskUsage.find((d: any) => d.mountpoint === '/') || diskUsage[0] || null;
    const diskPct = root ? parsePct(root.usedPct) : 0;

    const ifaceCount = payload?.network && typeof payload.network === 'object'
      ? Object.values(payload.network).flat().filter(Boolean).length
      : 0;
    const networkPct = Math.min(100, Number(ifaceCount) * 10);

    const metricChecks = [
      { metric: 'cpu', value: cpuPct, resourceKey: 'overall' },
      { metric: 'memory', value: memPct, resourceKey: 'overall' },
      { metric: 'network', value: networkPct, resourceKey: 'overall' },
      { metric: 'disk', value: diskPct, resourceKey: root?.mountpoint || 'overall' },
    ];

    for (const check of metricChecks) {
      const severity = severityFromUtilization(check.value);
      if (severity) {
        await upsertTicket(agentId, hostname, check.metric, check.resourceKey, check.value, severity);
      } else {
        await resolveTicket(agentId, check.metric, check.resourceKey);
      }
    }
  }
}

async function syncInfraHealthAnomalyTickets() {
  try {
    const [rows]: any = await pool.query(
      `SELECT hc.agent_id, hc.hostname, hc.server_healthy, hc.failed_services_count, hc.hung_process_count, hc.payload_json
       FROM health_checks hc
       INNER JOIN (
         SELECT agent_id, MAX(checked_at) AS max_checked_at
         FROM health_checks
         GROUP BY agent_id
       ) latest
         ON latest.agent_id = hc.agent_id
        AND latest.max_checked_at = hc.checked_at`
    );

    for (const row of rows) {
      const payload = parsePayload(row.payload_json) || {};
      const summary = payload?.summary || {};
      const reasons = Array.isArray(summary?.majorIssueReasons) ? summary.majorIssueReasons.map((r: any) => String(r).toLowerCase()) : [];
      const agentId = row.agent_id;
      const hostname = row.hostname || agentId;

      const serverHealthy = Boolean(row.server_healthy);
      const failedServices = Number(row.failed_services_count || 0);
      const hungProcesses = Number(row.hung_process_count || 0);

      const hardwareFailedCount = Number(payload?.hardware?.failedCount || payload?.hardware?.failedDevices?.length || 0);
      const hasHardwareFailure = hardwareFailedCount > 0 || reasons.some((r: string) => r.includes('hardware'));

      const diskUsage = Array.isArray(payload?.disk?.usage) ? payload.disk.usage : [];
      const dataDisksHigh = diskUsage
        .map((d: any) => ({
          mountpoint: String(d?.mountpoint || 'unknown'),
          filesystem: String(d?.filesystem || 'unknown'),
          usedPct: parsePct(d?.usedPct),
        }))
        .filter((d: any) => isDataDiskMount(d.mountpoint, d.filesystem) && d.usedPct >= 90);

      const looksUnreachable = reasons.some((r: string) => r.includes('unreach') || r.includes('timeout') || r.includes('down') || r.includes('hop'));
      const isDownOrUnreachable = !serverHealthy && (looksUnreachable || (failedServices === 0 && hungProcesses === 0 && !hasHardwareFailure));

      if (isDownOrUnreachable) {
        await upsertTicketWithOptionalIncident({
          agentId,
          hostname,
          metricType: 'infra_unreachable',
          resourceKey: 'overall',
          currentValue: 100,
          severity: 'P1',
          description: `Infrastructure target ${hostname} is down or unreachable.`,
          incidentTrigger: 'down-or-unreachable',
        });
      } else {
        await resolveTicket(agentId, 'infra_unreachable', 'overall');
      }

      if (hasHardwareFailure) {
        await upsertTicketWithOptionalIncident({
          agentId,
          hostname,
          metricType: 'hardware_failed',
          resourceKey: 'overall',
          currentValue: Math.max(1, hardwareFailedCount),
          severity: 'P2',
          description: `Hardware failure detected on ${hostname}. Failed component count: ${Math.max(1, hardwareFailedCount)}.`,
          incidentTrigger: 'failed-hardware',
        });
      } else {
        await resolveTicket(agentId, 'hardware_failed', 'overall');
      }

      const criticalIssueCount = failedServices + hungProcesses;
      if (criticalIssueCount > 0) {
        await upsertTicketWithOptionalIncident({
          agentId,
          hostname,
          metricType: 'critical_service',
          resourceKey: 'overall',
          currentValue: criticalIssueCount,
          severity: 'P3',
          description: `Critical service/process issue on ${hostname}. Failed services: ${failedServices}, hung processes: ${hungProcesses}.`,
          incidentTrigger: 'critical-service',
        });
      } else {
        await resolveTicket(agentId, 'critical_service', 'overall');
      }

      const highDataDiskKeys = new Set<string>();
      for (const disk of dataDisksHigh) {
        const key = disk.mountpoint || disk.filesystem || 'unknown';
        highDataDiskKeys.add(key);
        await upsertTicketWithOptionalIncident({
          agentId,
          hostname,
          metricType: 'data_disk_utilization',
          resourceKey: key,
          currentValue: disk.usedPct,
          severity: 'P2',
          description: `Data disk ${key} on ${hostname} is ${disk.usedPct.toFixed(1)}% utilized (threshold 90%).`,
          incidentTrigger: 'data-disk-90',
        });
      }

      const [openDataDiskTickets]: any = await pool.query(
        `SELECT resource_key FROM investigate_tickets
         WHERE agent_id = ? AND metric_type = 'data_disk_utilization' AND status = 'Open'`,
        [agentId]
      );
      for (const t of openDataDiskTickets) {
        if (!highDataDiskKeys.has(t.resource_key)) {
          await resolveTicket(agentId, 'data_disk_utilization', t.resource_key);
        }
      }
    }
  } catch (err: any) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
}

async function syncDatabaseAvailabilityTickets() {
  try {
    const [rows]: any = await pool.query(
      `SELECT d.target_key, d.target_name, d.status, d.ok, d.collected_at
       FROM database_monitor_logs d
       INNER JOIN (
         SELECT target_key, MAX(collected_at) AS max_collected
         FROM database_monitor_logs
         GROUP BY target_key
       ) latest
         ON latest.target_key = d.target_key
        AND latest.max_collected = d.collected_at`
    );

    for (const row of rows) {
      const agentId = row.target_key;
      const hostname = row.target_name || row.target_key;
      const down = !Boolean(row.ok) || String(row.status || '').toLowerCase() !== 'connected';

      if (down) {
        await upsertTicketWithOptionalIncident({
          agentId,
          hostname,
          metricType: 'database_availability',
          resourceKey: row.target_key,
          currentValue: 100,
          severity: 'P1',
          description: `Database target ${hostname} is down or not reachable (status: ${row.status || 'Unknown'}).`,
          incidentTrigger: 'down-or-unreachable',
        });
      } else {
        await resolveTicket(agentId, 'database_availability', row.target_key);
      }
    }
  } catch (err: any) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
}

// ─────────────────────────────────────────────────────
// MONITORING ENGINE — runs a real check per asset type
// ─────────────────────────────────────────────────────
async function runCheck(asset: any) {
  if (!asset.target_endpoint || asset.target_endpoint === 'pending sync...') return;

  try {
    const result = await monitorAsset(asset);
    const endpoint = String(asset.target_endpoint || '').trim();

    const status = result.ok ? 'Up' : 'Down';
    const responseMs = result.latencyMs || 0;
    const errorPrefix = result.error ? `${result.error.code}: ${result.error.explanation}` : '';
    const message = (result.ok ? result.message : `${errorPrefix}${result.message ? ` | ${result.message}` : ''}`).slice(0, 500);
    const statusCode = result.statusCode || (result.ok ? 200 : 0);
    const now = new Date();

    // Keep SSL expiry in sync when HTTPS targets are configured.
    if (endpoint.startsWith('https://')) {
      try {
        const host = new URL(endpoint).hostname;
        const ssl = await monitorSSLTarget(host, 443);
        const validTo = ssl.diagnostics?.validTo;
        if (ssl.ok && validTo) {
          await pool.query(`UPDATE assets SET ssl_expiry_at = ? WHERE id = ?`, [new Date(validTo), asset.id]);
        }
      } catch {
        // SSL enrichment should not block core monitor flow.
      }
    }

    // Update asset with latest check data
    await pool.query(
      `UPDATE assets SET status = ?, last_checked_at = ?, last_response_ms = ? WHERE id = ?`,
      [status, now, responseMs, asset.id]
    );

    // Set first_up_at the first time this asset is confirmed Up
    if (status === 'Up' && !asset.first_up_at) {
      await pool.query(
        `UPDATE assets SET first_up_at = ? WHERE id = ? AND first_up_at IS NULL`,
        [now, asset.id]
      );
    }

    // If status goes Down, reset first_up_at so "active for" restarts when it recovers
    if (status === 'Down' && asset.first_up_at) {
      await pool.query(`UPDATE assets SET first_up_at = NULL WHERE id = ?`, [asset.id]);
    }

    // Insert into monitor_logs
    await pool.query(
      `INSERT INTO monitor_logs (asset_id, status, response_time_ms, message, status_code) VALUES (?, ?, ?, ?, ?)`,
      [asset.id, status, responseMs, message, statusCode]
    );

    if (status === 'Down') {
      await upsertTicketWithOptionalIncident({
        agentId: asset.id,
        hostname: asset.name || asset.id,
        metricType: 'uptime',
        resourceKey: asset.id,
        currentValue: 100,
        severity: 'P1',
        description: `Asset ${asset.name || asset.id} is down or unreachable. Latest check failed: ${message}`,
        incidentTrigger: 'down-or-unreachable',
      });
    } else {
      await resolveTicket(asset.id, 'uptime', asset.id);
    }

    console.log(`[${now.toISOString()}] ${asset.name}: ${status} (${responseMs}ms)`);
    if (!result.ok) {
      console.warn(
        `[${now.toISOString()}] monitor-diagnostics ${asset.name}`,
        JSON.stringify(
          {
            code: result.error?.code || 'MON_DOWN',
            explanation: result.error?.explanation || 'Monitor reported down status',
            raw: result.error?.raw || null,
            diagnostics: result.diagnostics || {},
          },
          null,
          2
        )
      );
    }
  } catch (err) {
    console.error(`Check failed for asset ${asset.name}:`, err);
  }
}

async function runAllChecks() {
  try {
    const [assets]: any = await pool.query('SELECT * FROM assets');
    const checks = assets.map((asset: any) => runCheck(asset));
    await Promise.allSettled(checks);

    // Keep ticketing in sync for infrastructure/database anomalies even without dashboard page loads.
    try {
      const [latestInfraRows]: any = await pool.query(
        `SELECT am.agent_id, am.hostname, am.payload_json
         FROM agent_metrics am
         INNER JOIN (
           SELECT agent_id, MAX(collected_at) AS max_collected
           FROM agent_metrics
           GROUP BY agent_id
         ) latest
           ON latest.agent_id = am.agent_id
          AND latest.max_collected = am.collected_at`
      );
      await syncInvestigateTicketsFromRows(latestInfraRows || []);
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    await syncInfraHealthAnomalyTickets();
    await syncDatabaseAvailabilityTickets();
  } catch (err) {
    console.error('Monitoring cycle error:', err);
  }
}

// Run immediately on startup, then every 60 seconds
Promise.allSettled([ensureSnowIncidentTable(), ensureDiagnosticsSnapshotTable(), ensureDiagnosticsAlertTables()])
  .then((results) => {
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    for (const f of failed) {
      console.warn('Startup table init skipped:', (f.reason as any)?.message || f.reason);
    }
  })
  .finally(() => {
    // Give platform health checks a brief window before first heavy monitoring cycle.
    setTimeout(runAllChecks, 5000);
    setInterval(runAllChecks, 60_000);
  });

// ─────────────────────────────────────────────────────
// ONE-OFF MONITOR ENDPOINTS (on-demand checks)
// ─────────────────────────────────────────────────────
app.get('/api/monitor/website', async (req, res) => {
  const url = req.query.url as string;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  res.json(await monitorWebsiteTarget(url));
});

app.get('/api/monitor/pagespeed', async (req, res) => {
  const url = req.query.url as string;
  const strategy = (req.query.strategy as 'desktop' | 'mobile') || 'desktop';
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  res.json(await monitorPageSpeedTarget(url, strategy));
});

app.get('/api/monitor/docker', async (req, res) => {
  const socketPath = (req.query.socketPath as string) || '/var/run/docker.sock';
  res.json(await monitorDockerTarget(socketPath));
});

app.get('/api/monitor/ping', async (req, res) => {
  const host = req.query.host as string;
  if (!host) return res.status(400).json({ error: 'Missing host parameter' });
  res.json(await monitorPingTarget(host));
});

app.get('/api/monitor/ssl', async (req, res) => {
  const host = req.query.host as string;
  const port = parseInt(req.query.port as string, 10) || 443;
  if (!host) return res.status(400).json({ error: 'Missing host parameter' });
  res.json(await monitorSSLTarget(host, port));
});

app.get('/api/monitor/port', async (req, res) => {
  const host = req.query.host as string;
  const port = parseInt(req.query.port as string, 10);
  if (!host || !port) return res.status(400).json({ error: 'Missing host or port' });
  res.json(await monitorPortTarget(host, port));
});

// ─────────────────────────────────────────────────────
// ASSET CRUD ENDPOINTS
// ─────────────────────────────────────────────────────

// Get all assets
app.get('/api/assets', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM assets ORDER BY created_at DESC');
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Connected agents list
app.get('/api/agents', async (_req, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT id, hostname, os, os_version, agent_version, status, started_at, last_heartbeat_at
       FROM agents
       ORDER BY COALESCE(last_heartbeat_at, created_at) DESC`
    );

    const agents = rows.map((r: any) => ({
      id: r.id,
      hostname: r.hostname,
      os: r.os,
      osVersion: r.os_version,
      agentVersion: r.agent_version,
      status: r.status,
      startedAt: r.started_at,
      lastHeartbeatAt: r.last_heartbeat_at,
    }));

    res.json(agents);
  } catch (err: any) {
    // If agents table is not initialized yet, return no agents instead of failing UI.
    if (err?.code === 'ER_NO_SUCH_TABLE') return res.json([]);
    res.status(500).json({ error: err.message });
  }
});

// Infrastructure metrics from capture agent snapshots
app.get('/api/infra', async (req, res) => {
  try {
    const requestedAgentId = (req.query.agentId as string) || null;
    const limit = Number(req.query.limit || 48);

    const bind = requestedAgentId ? [requestedAgentId, limit] : [limit];
    const sql = requestedAgentId
      ? `SELECT id, agent_id, hostname, payload_json, collected_at
         FROM agent_metrics
         WHERE agent_id = ?
         ORDER BY collected_at DESC
         LIMIT ?`
      : `SELECT id, agent_id, hostname, payload_json, collected_at
         FROM agent_metrics
         ORDER BY collected_at DESC
         LIMIT ?`;

    const [rows]: any = await pool.query(sql, bind);
    if (!rows.length) {
      return res.json({
        hasData: false,
        agentId: requestedAgentId,
        hostname: null,
        collectedAt: null,
        cpuTrend: [],
        networkTrend: [],
        diskMounts: [],
      });
    }

    await syncInvestigateTicketsFromRows(rows);

    let issueRows: any[] = [];
    try {
      const [rowsWithIssues]: any = await pool.query(
        `SELECT agent_id,
                COUNT(*) AS open_count,
                MAX(CASE severity WHEN 'P1' THEN 3 WHEN 'P2' THEN 2 WHEN 'P3' THEN 1 ELSE 0 END) AS max_severity
         FROM investigate_tickets
         WHERE status = 'Open'
         GROUP BY agent_id`
      );
      issueRows = rowsWithIssues;
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
    const issueMap = new Map<string, { count: number; severity: string | null }>();
    for (const row of issueRows) {
      const sevNum = Number(row.max_severity || 0);
      const severity = sevNum === 3 ? 'P1' : sevNum === 2 ? 'P2' : sevNum === 1 ? 'P3' : null;
      issueMap.set(row.agent_id, { count: Number(row.open_count || 0), severity });
    }

    const points = rows
      .map((r: any) => {
        const payload = parsePayload(r.payload_json);
        if (!payload) return null;

        const interfaces = payload?.network && typeof payload.network === 'object'
          ? Object.values(payload.network).flat().filter(Boolean).length
          : 0;

        return {
          time: new Date(r.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          cpu: Number(payload?.cpu?.usagePct ?? payload?.cpu?.usage ?? 0),
          network: interfaces,
          payload,
          collectedAt: r.collected_at,
          agentId: r.agent_id,
          hostname: r.hostname,
        };
      })
      .filter(Boolean)
      .reverse();

    const latest = points[points.length - 1];
    const latestDisk = latest?.payload?.disk?.usage || [];

    const diskMounts = Array.isArray(latestDisk)
      ? latestDisk.map((d: any) => ({
          mountpoint: d.mountpoint || 'unknown',
          filesystem: d.filesystem || 'unknown',
          usedPct: parsePct(d.usedPct),
          usedBytes: Number(d.usedBytes || 0),
          availBytes: Number(d.availBytes || 0),
          sizeBytes: Number(d.sizeBytes || 0),
        }))
      : [];

    res.json({
      hasData: true,
      agentId: latest.agentId,
      hostname: latest.hostname,
      collectedAt: latest.collectedAt,
      cpuTrend: points.map((p: any) => ({ time: p.time, value: Number(p.cpu.toFixed(2)) })),
      networkTrend: points.map((p: any) => ({ time: p.time, value: Number(p.network) })),
      diskMounts,
    });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({
        hasData: false,
        agentId: null,
        hostname: null,
        collectedAt: null,
        cpuTrend: [],
        networkTrend: [],
        diskMounts: [],
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// Infrastructure inventory list for large server fleets
app.get('/api/infra/servers', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize || 50)));
    const offset = (page - 1) * pageSize;

    const where = q ? 'WHERE am.agent_id LIKE ? OR am.hostname LIKE ? OR am.distro LIKE ?' : '';
    const whereBind = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];

    const [countRows]: any = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM agent_metrics am
      INNER JOIN (
        SELECT agent_id, MAX(collected_at) AS max_collected
        FROM agent_metrics
        GROUP BY agent_id
      ) latest ON latest.agent_id = am.agent_id AND latest.max_collected = am.collected_at
      ${where}
      `,
      whereBind
    );

    const [rows]: any = await pool.query(
      `
      SELECT
        am.agent_id,
        am.hostname,
        am.platform,
        am.distro,
        am.os_version,
        am.collected_at,
        am.payload_json,
        a.status AS agent_status,
        a.last_heartbeat_at,
        JSON_UNQUOTE(JSON_EXTRACT(am.payload_json, '$.cpu.usagePct')) AS cpu_usage,
        JSON_UNQUOTE(JSON_EXTRACT(am.payload_json, '$.memory.usedPct')) AS memory_used,
        JSON_UNQUOTE(JSON_EXTRACT(am.payload_json, '$.uptimeSeconds')) AS uptime_seconds
      FROM agent_metrics am
      INNER JOIN (
        SELECT agent_id, MAX(collected_at) AS max_collected
        FROM agent_metrics
        GROUP BY agent_id
      ) latest ON latest.agent_id = am.agent_id AND latest.max_collected = am.collected_at
      LEFT JOIN agents a ON a.id = am.agent_id
      ${where}
      ORDER BY am.collected_at DESC
      LIMIT ? OFFSET ?
      `,
      [...whereBind, pageSize, offset]
    );

    const parsePayload = (value: any) => {
      if (!value) return null;
      if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return null; }
      }
      return value;
    };

    const parsePct = (value: any): number => {
      if (typeof value === 'number') return Number(value.toFixed(2));
      if (typeof value !== 'string') return 0;
      const n = Number(value.replace('%', '').trim());
      return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
    };

    let issueRows: any[] = [];
    try {
      const [rowsWithIssues]: any = await pool.query(
        `SELECT agent_id,
                COUNT(*) AS open_count,
                MAX(CASE severity WHEN 'P1' THEN 3 WHEN 'P2' THEN 2 WHEN 'P3' THEN 1 ELSE 0 END) AS max_severity
         FROM investigate_tickets
         WHERE status = 'Open'
         GROUP BY agent_id`
      );
      issueRows = rowsWithIssues;
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
    const issueMap = new Map<string, { count: number; severity: string | null }>();
    for (const row of issueRows) {
      const sevNum = Number(row.max_severity || 0);
      const severity = sevNum === 3 ? 'P1' : sevNum === 2 ? 'P2' : sevNum === 1 ? 'P3' : null;
      issueMap.set(row.agent_id, { count: Number(row.open_count || 0), severity });
    }

    const servers = rows.map((r: any) => {
      const payload = parsePayload(r.payload_json);
      const diskUsage = Array.isArray(payload?.disk?.usage) ? payload.disk.usage : [];
      const root = diskUsage.find((d: any) => d.mountpoint === '/') || diskUsage[0] || null;
      const frequencyMHz = Number(payload?.cpu?.frequencyMHz || 0);
      const freshnessMinutes = Math.floor((Date.now() - new Date(r.collected_at).getTime()) / 60000);

      let status = 'Down';
      if (r.agent_status === 'Actively Syncing') status = 'Up';
      else if (r.agent_status === 'Delayed Sync') status = 'Delayed';
      else if (freshnessMinutes <= 10) status = 'Up';
      else if (freshnessMinutes <= 30) status = 'Delayed';

      return {
        agentId: r.agent_id,
        hostname: r.hostname,
        platform: r.platform,
        os: r.distro,
        osVersion: r.os_version,
        status,
        frequencyGHz: frequencyMHz > 0 ? Number((frequencyMHz / 1000).toFixed(2)) : 0,
        cpuUsagePct: Number(r.cpu_usage || 0),
        memoryUsagePct: Number(r.memory_used || 0),
        diskUsagePct: root ? parsePct(root.usedPct) : 0,
        issueCount: issueMap.get(r.agent_id)?.count || 0,
        issueSeverity: issueMap.get(r.agent_id)?.severity || null,
        uptimeSeconds: Number(r.uptime_seconds || 0),
        lastCollectedAt: r.collected_at,
      };
    });

    res.json({
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
      servers,
    });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ page: 1, pageSize: 50, total: 0, servers: [] });
    }
    res.status(500).json({ error: err.message });
  }
});

// Latest health snapshot per agent for list views
app.get('/api/health/latest', async (_req, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT hc.agent_id,
              hc.server_healthy,
              hc.network_latency_ms,
              hc.payload_json,
              hc.checked_at
       FROM health_checks hc
       INNER JOIN (
         SELECT agent_id, MAX(checked_at) AS max_checked_at
         FROM health_checks
         GROUP BY agent_id
       ) latest
         ON latest.agent_id = hc.agent_id
        AND latest.max_checked_at = hc.checked_at
       ORDER BY hc.checked_at DESC`
    );

    res.json({
      health: rows.map((r: any) => {
        const payload = parsePayload(r.payload_json) || {};
        const summary = payload?.summary || {};
        return {
          agentId: r.agent_id,
          healthy: !!r.server_healthy,
          score: summary?.score == null ? null : Number(summary.score),
          scoreStatus: summary?.status || null,
          latencyMs: r.network_latency_ms == null ? null : Number(r.network_latency_ms),
          checkedAt: r.checked_at,
        };
      }),
    });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ health: [] });
    }
    res.status(500).json({ error: err.message });
  }
});

// Infrastructure detail for one server
app.get('/api/infra/servers/:agentId', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const limit = Math.min(288, Math.max(12, Number(req.query.limit || 48)));

    const [rows]: any = await pool.query(
      `SELECT am.agent_id, am.hostname, am.platform, am.distro, am.os_version, am.payload_json, am.collected_at,
              a.status AS agent_status, a.last_heartbeat_at
       FROM agent_metrics
       am
       LEFT JOIN agents a ON a.id = am.agent_id
      WHERE am.agent_id = ?
      ORDER BY am.collected_at DESC
       LIMIT ?`,
      [agentId, limit]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const parsePayload = (value: any) => {
      if (!value) return null;
      if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return null; }
      }
      return value;
    };

    const parsePct = (value: any): number => {
      if (typeof value === 'number') return Number(value.toFixed(2));
      if (typeof value !== 'string') return 0;
      const n = Number(value.replace('%', '').trim());
      return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
    };

    const points = rows
      .map((r: any) => {
        const payload = parsePayload(r.payload_json);
        if (!payload) return null;

        const ifaceCount = payload?.network && typeof payload.network === 'object'
          ? Object.values(payload.network).flat().filter(Boolean).length
          : 0;

        return {
          time: new Date(r.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          cpu: Number(payload?.cpu?.usagePct ?? 0),
          memory: Number(payload?.memory?.usedPct ?? 0),
          network: Number(ifaceCount),
          payload,
          collectedAt: r.collected_at,
          hostname: r.hostname,
          platform: r.platform,
          distro: r.distro,
          osVersion: r.os_version,
        };
      })
      .filter(Boolean)
      .reverse();

    const latest = points[points.length - 1];
    const latestRaw = rows[0];
    const diskUsage = Array.isArray(latest?.payload?.disk?.usage) ? latest.payload.disk.usage : [];
    const inodeUsage = Array.isArray(latest?.payload?.disk?.inode) ? latest.payload.disk.inode : [];
    const rootDisk = diskUsage.find((d: any) => d.mountpoint === '/') || diskUsage[0] || null;

    const freshnessMinutes = Math.floor((Date.now() - new Date(latest.collectedAt).getTime()) / 60000);
    let status = 'Down';
    if (latestRaw?.agent_status === 'Actively Syncing') status = 'Up';
    else if (latestRaw?.agent_status === 'Delayed Sync') status = 'Delayed';
    else if (freshnessMinutes <= 10) status = 'Up';
    else if (freshnessMinutes <= 30) status = 'Delayed';

    const ifaceCount = Number(points[points.length - 1]?.network || 0);
    const networkUsagePct = Math.min(100, ifaceCount * 10);
    const swap = latest?.payload?.memory?.swap || { total: 0, used: 0, free: 0, usedPct: 0 };

    const diskMounts = diskUsage.map((d: any) => ({
      mountpoint: d.mountpoint || 'unknown',
      filesystem: d.filesystem || 'unknown',
      usedPct: parsePct(d.usedPct),
      usedBytes: Number(d.usedBytes || 0),
      availBytes: Number(d.availBytes || 0),
      sizeBytes: Number(d.sizeBytes || 0),
    }));

    const inodeMounts = inodeUsage.map((d: any) => ({
      mountpoint: d.mountpoint || 'unknown',
      filesystem: d.filesystem || 'unknown',
      usedPct: parsePct(d.usedPct),
      used: Number(d.used || 0),
      free: Number(d.free || 0),
      inodes: d.inodes == null ? null : Number(d.inodes),
    }));

    const networkMap = latest?.payload?.network && typeof latest.payload.network === 'object'
      ? latest.payload.network
      : {};
    const networkInterfaces = Object.entries(networkMap).map(([name, addresses]) => ({
      name,
      addresses: Array.isArray(addresses) ? addresses : [],
    }));

    const [issues]: any = await pool.query(
      `SELECT ticket_id, metric_type, resource_key, severity, current_value, threshold_value, status, description, created_at, updated_at
       FROM investigate_tickets
       WHERE agent_id = ? AND status = 'Open'
       ORDER BY FIELD(severity, 'P1', 'P2', 'P3'), updated_at DESC`,
      [agentId]
    );

    let health = null;
    let healthTrend: any[] = [];
    try {
      const [healthRows]: any = await pool.query(
        `SELECT server_healthy, cpu_usage_pct, memory_usage_pct, cpu_temperature_c,
                network_latency_ms, network_download_mbps, network_rx_mbps, network_tx_mbps,
          failed_services_count, hung_process_count, payload_json, checked_at
         FROM health_checks
         WHERE agent_id = ?
         ORDER BY checked_at DESC
         LIMIT 1`,
        [agentId]
      );

      const [trendRows]: any = await pool.query(
        `SELECT checked_at, network_latency_ms, network_download_mbps, network_rx_mbps, network_tx_mbps
         FROM health_checks
         WHERE agent_id = ?
         ORDER BY checked_at DESC
         LIMIT 60`,
        [agentId]
      );

      if (healthRows.length) {
        const h = healthRows[0];
        const payload = parsePayload(h.payload_json) || {};
        const summary = payload?.summary || {};
        const scoring = payload?.scoring || {};
        health = {
          serverHealthy: !!h.server_healthy,
          score: summary?.score == null ? null : Number(summary.score),
          scoreStatus: summary?.status || null,
          majorIssueReasons: Array.isArray(summary?.majorIssueReasons) ? summary.majorIssueReasons : [],
          scoringComponents: scoring?.components && typeof scoring.components === 'object' ? scoring.components : {},
          cpuUsagePct: h.cpu_usage_pct == null ? null : Number(h.cpu_usage_pct),
          memoryUsagePct: h.memory_usage_pct == null ? null : Number(h.memory_usage_pct),
          cpuTemperatureC: h.cpu_temperature_c == null ? null : Number(h.cpu_temperature_c),
          networkLatencyMs: h.network_latency_ms == null ? null : Number(h.network_latency_ms),
          networkDownloadMbps: h.network_download_mbps == null ? null : Number(h.network_download_mbps),
          networkRxMbps: h.network_rx_mbps == null ? null : Number(h.network_rx_mbps),
          networkTxMbps: h.network_tx_mbps == null ? null : Number(h.network_tx_mbps),
          failedServicesCount: Number(h.failed_services_count || 0),
          hungProcessCount: Number(h.hung_process_count || 0),
          checkedAt: h.checked_at,
        };
      }

      healthTrend = trendRows
        .map((r: any) => ({
          time: new Date(r.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          latencyMs: r.network_latency_ms == null ? null : Number(r.network_latency_ms),
          downloadMbps: r.network_download_mbps == null ? null : Number(r.network_download_mbps),
          rxMbps: r.network_rx_mbps == null ? null : Number(r.network_rx_mbps),
          txMbps: r.network_tx_mbps == null ? null : Number(r.network_tx_mbps),
        }))
        .reverse();
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    res.json({
      agentId,
      host: {
        hostname: latest.hostname,
        platform: latest.platform,
        os: latest.distro,
        osVersion: latest.osVersion,
        uptimeSeconds: Number(latest?.payload?.uptimeSeconds || 0),
        collectedAt: latest.collectedAt,
        status,
      },
      performance: {
        cpuUsagePct: Number(latest?.payload?.cpu?.usagePct || 0),
        memoryUsagePct: Number(latest?.payload?.memory?.usedPct || 0),
        networkUsagePct,
        diskUsagePct: rootDisk ? parsePct(rootDisk.usedPct) : 0,
      },
      cpu: {
        load: latest?.payload?.cpu?.load || [],
        cores: Number(latest?.payload?.cpu?.cores || 0),
        physicalCores: Number(latest?.payload?.cpu?.physicalCores || latest?.payload?.cpu?.cores || 0),
        logicalCores: Number(latest?.payload?.cpu?.logicalCores || latest?.payload?.cpu?.cores || 0),
        usagePct: Number(latest?.payload?.cpu?.usagePct || 0),
        frequencyMHz: latest?.payload?.cpu?.frequencyMHz ?? null,
        temperatureC: latest?.payload?.cpu?.temperatureC ?? null,
      },
      memory: {
        total: Number(latest?.payload?.memory?.total || 0),
        used: Number(latest?.payload?.memory?.used || 0),
        free: Number(latest?.payload?.memory?.free || 0),
        usedPct: Number(latest?.payload?.memory?.usedPct || 0),
        swapTotal: Number(swap.total || 0),
        swapUsed: Number(swap.used || 0),
        swapFree: Number(swap.free || 0),
        swapUsedPct: Number(swap.usedPct || 0),
      },
      cpuTrend: points.map((p: any) => ({ time: p.time, value: Number(p.cpu.toFixed(2)) })),
      memoryTrend: points.map((p: any) => ({ time: p.time, value: Number(p.memory.toFixed(2)) })),
      networkTrend: points.map((p: any) => ({ time: p.time, value: Number(p.network.toFixed(2)) })),
      diskMounts,
      inodeMounts,
      networkInterfaces,
      issues,
      health,
      healthTrend,
    });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(404).json({ error: 'No infrastructure metrics available' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/investigate', async (req, res) => {
  try {
    const status = String(req.query.status || 'Open');
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize || 50)));
    const offset = (page - 1) * pageSize;

    const statusSql = status === 'All' ? '' : 'AND t.status = ?';
    const statusBind = status === 'All' ? [] : [status];
    const searchSql = q ? 'AND (t.hostname LIKE ? OR t.ticket_id LIKE ? OR t.metric_type LIKE ?)' : '';
    const searchBind = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];

    const [rows]: any = await pool.query(
      `SELECT t.ticket_id, t.agent_id, t.hostname, t.metric_type, t.resource_key, t.severity,
              t.current_value, t.threshold_value, t.status, t.description, t.created_at, t.updated_at, t.resolved_at,
              s.incident_number AS service_now_incident, s.status AS service_now_status
       FROM investigate_tickets t
       LEFT JOIN servicenow_incidents s ON s.investigate_ticket_id = t.ticket_id
       WHERE 1=1 ${statusSql} ${searchSql}
       ORDER BY FIELD(t.severity, 'P1', 'P2', 'P3'), t.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...statusBind, ...searchBind, pageSize, offset]
    );

    const countStatusSql = status === 'All' ? '' : 'AND status = ?';
    const countSearchSql = q ? 'AND (hostname LIKE ? OR ticket_id LIKE ? OR metric_type LIKE ?)' : '';
    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total
       FROM investigate_tickets
       WHERE 1=1 ${countStatusSql} ${countSearchSql}`,
      [...statusBind, ...searchBind]
    );

    res.json({
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
      tickets: rows,
    });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ page: 1, pageSize: 50, total: 0, tickets: [] });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/databases', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || 'All').trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize || 25)));
    const offset = (page - 1) * pageSize;

    const whereParts: string[] = [];
    const bind: any[] = [];

    if (q) {
      whereParts.push('(d.target_name LIKE ? OR d.target_type LIKE ? OR d.engine LIKE ? OR d.version LIKE ?)');
      bind.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (status !== 'All') {
      whereParts.push('d.status = ?');
      bind.push(status);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total
       FROM database_monitor_logs d
       INNER JOIN (
         SELECT target_key, MAX(collected_at) AS max_collected
         FROM database_monitor_logs
         GROUP BY target_key
       ) latest ON latest.target_key = d.target_key AND latest.max_collected = d.collected_at
       ${whereSql}`,
      bind
    );

    const [rows]: any = await pool.query(
      `SELECT d.target_key, d.target_name, d.target_type, d.engine, d.version,
              d.ok, d.status, d.node_role, d.node_state, d.database_uptime_sec,
              d.total_databases, d.total_tables, d.total_space_mb, d.used_space_mb,
              d.free_space_mb, d.used_pct, d.latency_ms, d.active_sessions,
              d.slow_queries, d.lock_count, d.replication_lag_sec,
              d.os_platform, d.os_distro, d.os_version, d.payload_json, d.collected_at
       FROM database_monitor_logs d
       INNER JOIN (
         SELECT target_key, MAX(collected_at) AS max_collected
         FROM database_monitor_logs
         GROUP BY target_key
       ) latest ON latest.target_key = d.target_key AND latest.max_collected = d.collected_at
       ${whereSql}
       ORDER BY d.collected_at DESC
       LIMIT ? OFFSET ?`,
      [...bind, pageSize, offset]
    );

    res.json({
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
      databases: rows.map((r: any) => {
        const payload = parsePayload(r.payload_json) || {};
        return {
          targetKey: r.target_key,
          targetName: r.target_name,
          targetType: r.target_type,
          engine: r.engine,
          version: r.version,
          ok: !!r.ok,
          status: r.status,
          healthCategory: payload?.healthCategory || null,
          nodeRole: r.node_role,
          nodeState: r.node_state,
          databaseUptimeSec: r.database_uptime_sec == null ? null : Number(r.database_uptime_sec),
          totalDatabases: r.total_databases == null ? null : Number(r.total_databases),
          totalTables: r.total_tables == null ? null : Number(r.total_tables),
          totalSpaceMb: r.total_space_mb == null ? null : Number(r.total_space_mb),
          usedSpaceMb: r.used_space_mb == null ? null : Number(r.used_space_mb),
          freeSpaceMb: r.free_space_mb == null ? null : Number(r.free_space_mb),
          usedPct: r.used_pct == null ? null : Number(r.used_pct),
          latencyMs: r.latency_ms == null ? null : Number(r.latency_ms),
          activeSessions: r.active_sessions == null ? null : Number(r.active_sessions),
          slowQueries: r.slow_queries == null ? null : Number(r.slow_queries),
          lockCount: r.lock_count == null ? null : Number(r.lock_count),
          replicationLagSec: r.replication_lag_sec == null ? null : Number(r.replication_lag_sec),
          osPlatform: r.os_platform,
          osDistro: r.os_distro,
          osVersion: r.os_version,
          collectedAt: r.collected_at,
        };
      }),
    });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ page: 1, pageSize: 25, total: 0, databases: [] });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/databases/:targetKey', async (req, res) => {
  try {
    const targetKey = req.params.targetKey;
    const limit = Math.min(288, Math.max(12, Number(req.query.limit || 72)));

    const [rows]: any = await pool.query(
      `SELECT target_key, target_name, target_type, engine, version, ok, status,
              node_role, node_state, database_uptime_sec, total_databases, total_tables,
              total_space_mb, used_space_mb, free_space_mb, used_pct, latency_ms,
              active_sessions, slow_queries, lock_count, replication_lag_sec,
              os_platform, os_distro, os_version, payload_json, collected_at
       FROM database_monitor_logs
       WHERE target_key = ?
       ORDER BY collected_at DESC
       LIMIT ?`,
      [targetKey, limit]
    );

    if (!rows.length) return res.status(404).json({ error: 'Database target not found' });

    const latest = rows[0];
    const payload = parsePayload(latest.payload_json) || {};
    const history = [...rows].reverse();
    const osInfo = payload?.os || {};
    const summary = payload?.summary || {};

    res.json({
      targetKey: latest.target_key,
      overview: {
        osPlatform: osInfo?.platform || latest.os_platform || null,
        osDistro: osInfo?.distro || latest.os_distro || null,
        osVersion: osInfo?.version || latest.os_version || null,
        hostname: osInfo?.hostname || null,
        totalTargets: summary?.totalTargets == null ? null : Number(summary.totalTargets),
        healthyTargets: summary?.healthyTargets == null ? null : Number(summary.healthyTargets),
        unhealthyTargets: summary?.unhealthyTargets == null ? null : Number(summary.unhealthyTargets),
        installedEngines: summary?.installedEngines && typeof summary.installedEngines === 'object' ? summary.installedEngines : null,
        overallHealth: payload?.healthCategory || null,
      },
      latest: {
        targetName: latest.target_name,
        targetType: latest.target_type,
        engine: latest.engine,
        version: latest.version,
        ok: !!latest.ok,
        status: latest.status,
        healthCategory: payload?.healthCategory || null,
        nodeRole: latest.node_role,
        nodeState: latest.node_state,
        databaseUptimeSec: latest.database_uptime_sec == null ? null : Number(latest.database_uptime_sec),
        totalDatabases: latest.total_databases == null ? null : Number(latest.total_databases),
        totalTables: latest.total_tables == null ? null : Number(latest.total_tables),
        totalSpaceMb: latest.total_space_mb == null ? null : Number(latest.total_space_mb),
        usedSpaceMb: latest.used_space_mb == null ? null : Number(latest.used_space_mb),
        freeSpaceMb: latest.free_space_mb == null ? null : Number(latest.free_space_mb),
        usedPct: latest.used_pct == null ? null : Number(latest.used_pct),
        latencyMs: latest.latency_ms == null ? null : Number(latest.latency_ms),
        activeSessions: latest.active_sessions == null ? null : Number(latest.active_sessions),
        slowQueries: latest.slow_queries == null ? null : Number(latest.slow_queries),
        lockCount: latest.lock_count == null ? null : Number(latest.lock_count),
        replicationLagSec: latest.replication_lag_sec == null ? null : Number(latest.replication_lag_sec),
        osPlatform: latest.os_platform,
        osDistro: latest.os_distro,
        osVersion: latest.os_version,
        collectedAt: latest.collected_at,
      },
      inventory: payload?.inventory || null,
      node: payload?.node || null,
      performance: payload?.performance || null,
      space: payload?.space || null,
      asm: payload?.asm || null,
      compactOutput: payload?.compactOutput || [],
      latencyTrend: history.map((r: any) => ({
        time: new Date(r.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: r.latency_ms == null ? null : Number(r.latency_ms),
      })),
      sessionsTrend: history.map((r: any) => ({
        time: new Date(r.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: r.active_sessions == null ? null : Number(r.active_sessions),
      })),
    });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(404).json({ error: 'No database monitor data available' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Create a new asset and immediately trigger a check
app.post('/api/assets', async (req, res) => {
  try {
    const { name, parent_type, sub_type, target_endpoint, environment } = req.body;
    const id = `INV-${Date.now()}`;

    await pool.query(
      `INSERT INTO assets (id, name, parent_type, sub_type, target_endpoint, environment, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Initializing')`,
      [id, name, parent_type, sub_type || null, target_endpoint, environment]
    );

    const [rows]: any = await pool.query('SELECT * FROM assets WHERE id = ?', [id]);
    const asset = rows[0];
    res.status(201).json(asset);

    // Trigger first check in background
    runCheck(asset);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete an asset
app.delete('/api/assets/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM assets WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────
// STATS ENDPOINT — real computed data for detail view
// ─────────────────────────────────────────────────────
app.get('/api/assets/:id/stats', async (req, res) => {
  try {
    const assetId = req.params.id;
    const [assets]: any = await pool.query('SELECT * FROM assets WHERE id = ?', [assetId]);
    if (!assets.length) return res.status(404).json({ error: 'Asset not found' });

    const asset = assets[0];

    // Fetch last 200 logs (most recent first)
    const [logs]: any = await pool.query(
      'SELECT * FROM monitor_logs WHERE asset_id = ? ORDER BY timestamp DESC LIMIT 200',
      [assetId]
    );

    const upLogs = logs.filter((l: any) => l.status === 'Up');
    const downLogs = logs.filter((l: any) => l.status === 'Down');

    // Average response time across up checks
    const avgResponseMs = upLogs.length
      ? Math.round(upLogs.reduce((s: number, l: any) => s + (l.response_time_ms || 0), 0) / upLogs.length)
      : 0;

    // "Active for" — time since first_up_at
    let activeForMs = 0;
    if (asset.first_up_at) {
      activeForMs = Date.now() - new Date(asset.first_up_at).getTime();
    }

    // "Last check" — seconds ago
    let lastCheckAgo = 'Never';
    if (asset.last_checked_at) {
      const diffS = Math.round((Date.now() - new Date(asset.last_checked_at).getTime()) / 1000);
      if (diffS < 60) lastCheckAgo = `${diffS}s ago`;
      else if (diffS < 3600) lastCheckAgo = `${Math.floor(diffS / 60)}m ago`;
      else lastCheckAgo = `${Math.floor(diffS / 3600)}h ago`;
    }

    // SSL expiry formatted
    let sslExpiry = null;
    if (asset.ssl_expiry_at) {
      sslExpiry = new Date(asset.ssl_expiry_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
      });
    }

    // Response time chart data (chronological)
    const chartData = [...logs].reverse().map((l: any) => ({
      time: new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: l.response_time_ms || 0,
      status: l.status,
    }));

    const forceDiagnostics = String(req.query.forceDiagnostics || '').toLowerCase() === 'true';
    const diagnostics = await getCachedDiagnostics(asset, { force: forceDiagnostics, source: forceDiagnostics ? 'manual' : 'auto' });
    const snapshotComparison = await getSnapshotComparison(asset.id);
    const activeAlerts = await getActiveDiagnosticsAlerts(asset.id);

    res.json({
      ...asset,
      avgResponseMs,
      activeForMs,
      lastCheckAgo,
      lastResponseMs: asset.last_response_ms,
      sslExpiry,
      totalChecks: logs.length,
      upChecks: upLogs.length,
      downChecks: downLogs.length,
      uptimePct: logs.length ? Math.round((upLogs.length / logs.length) * 100) : null,
      chartData,
      recentLogs: logs,
      diagnostics,
      snapshotComparison,
      activeAlerts,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assets/:id/diagnostics/run', async (req, res) => {
  try {
    const [assets]: any = await pool.query('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    if (!assets.length) return res.status(404).json({ error: 'Asset not found' });

    const asset = assets[0];
    const diagnostics = await getCachedDiagnostics(asset, { force: true, source: 'manual' });
    const snapshotComparison = await getSnapshotComparison(asset.id);
    const activeAlerts = await getActiveDiagnosticsAlerts(asset.id);
    res.json({ diagnostics, snapshotComparison, activeAlerts, ranAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/assets/:id/diagnostics/history', async (req, res) => {
  try {
    const assetId = req.params.id;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 10)));
    const offset = (page - 1) * pageSize;
    const category = String(req.query.category || '').trim();

    const where = ['asset_id = ?'];
    const params: any[] = [assetId];
    if (category && category !== 'ALL') {
      where.push('root_cause_category = ?');
      params.push(category);
    }

    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM diagnostics_snapshots WHERE ${where.join(' AND ')}`,
      params
    );
    const total = Number(countRows?.[0]?.total || 0);

    const [rows]: any = await pool.query(
      `SELECT id, trigger_source, monitor_status, severity, probable_cause, root_cause_category, payload_json, created_at
       FROM diagnostics_snapshots
       WHERE ${where.join(' AND ')}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize + 1, offset]
    );

    const visible = (rows || []).slice(0, pageSize);
    const history = visible.map((row: any, idx: number) => {
      const previous = rows[idx + 1] || null;
      return {
        id: row.id,
        triggerSource: row.trigger_source,
        monitorStatus: row.monitor_status,
        severity: row.severity,
        probableCause: row.probable_cause,
        rootCauseCategory: row.root_cause_category,
        createdAt: row.created_at,
        diff: buildDiagnosticsDiff(row, previous),
      };
    });

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      history,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/assets/:id/diagnostics/alerts/rules', async (req, res) => {
  try {
    const assetId = req.params.id;
    const [rules]: any = await pool.query(
      `SELECT id, asset_id, enabled, severity_threshold, consecutive_runs, created_at, updated_at
       FROM diagnostics_alert_rules
       WHERE asset_id = ? OR asset_id IS NULL
       ORDER BY CASE WHEN asset_id IS NULL THEN 1 ELSE 0 END, id ASC`,
      [assetId]
    );
    res.json({ rules: rules || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assets/:id/diagnostics/alerts/rules', async (req, res) => {
  try {
    const assetId = req.params.id;
    const threshold = String(req.body?.severityThreshold || 'high').toLowerCase();
    const consecutiveRuns = Math.max(1, Number(req.body?.consecutiveRuns || 3));
    const enabled = req.body?.enabled === false ? 0 : 1;

    const [existing]: any = await pool.query(
      `SELECT id FROM diagnostics_alert_rules WHERE asset_id = ? LIMIT 1`,
      [assetId]
    );

    if (existing.length) {
      await pool.query(
        `UPDATE diagnostics_alert_rules
         SET enabled = ?, severity_threshold = ?, consecutive_runs = ?
         WHERE id = ?`,
        [enabled, threshold, consecutiveRuns, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO diagnostics_alert_rules (asset_id, enabled, severity_threshold, consecutive_runs)
         VALUES (?, ?, ?, ?)`,
        [assetId, enabled, threshold, consecutiveRuns]
      );
    }

    const [rules]: any = await pool.query(
      `SELECT id, asset_id, enabled, severity_threshold, consecutive_runs, created_at, updated_at
       FROM diagnostics_alert_rules
       WHERE asset_id = ? OR asset_id IS NULL
       ORDER BY CASE WHEN asset_id IS NULL THEN 1 ELSE 0 END, id ASC`,
      [assetId]
    );

    res.json({ success: true, rules: rules || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/assets/:id/incidents/active', async (req, res) => {
  try {
    const assetId = req.params.id;
    const [assets]: any = await pool.query(
      `SELECT id, name, target_endpoint
       FROM assets
       WHERE id = ?`,
      [assetId]
    );
    if (!assets.length) return res.status(404).json({ error: 'Asset not found' });

    const asset = assets[0] || {};
    const endpoint = String(asset.target_endpoint || '').trim();
    let endpointHost = endpoint;
    try {
      endpointHost = new URL(endpoint).hostname;
    } catch {
      endpointHost = endpoint.split('/')[0] || endpoint;
    }
    endpointHost = endpointHost.split(':')[0].trim();

    const candidates = Array.from(new Set(
      [asset.id, asset.name, endpoint, endpointHost]
        .map((v) => String(v || '').trim().toLowerCase())
        .filter(Boolean)
    ));
    const fuzzyNeedle = String(endpointHost || endpoint || asset.name || '').toLowerCase();
    const fuzzyLike = fuzzyNeedle ? `%${fuzzyNeedle}%` : '';

    if (!candidates.length) {
      return res.json({ activeTickets: [] });
    }

    const placeholders = candidates.map(() => '?').join(', ');
    const [rows]: any = await pool.query(
      `SELECT
         ticket_id,
         agent_id,
         hostname,
         metric_type,
         resource_key,
         severity,
         status,
         description,
         created_at,
         updated_at,
         last_seen_at
       FROM investigate_tickets
       WHERE status = 'Open'
         AND (
           LOWER(hostname) IN (${placeholders})
           OR LOWER(agent_id) IN (${placeholders})
           OR LOWER(resource_key) IN (${placeholders})
           ${fuzzyLike ? 'OR LOWER(hostname) LIKE ? OR LOWER(resource_key) LIKE ?' : ''}
         )
       ORDER BY FIELD(severity, 'P1', 'P2', 'P3'), updated_at DESC
       LIMIT 100`,
      [...candidates, ...candidates, ...candidates, ...(fuzzyLike ? [fuzzyLike, fuzzyLike] : [])]
    );

    const activeTickets = (rows || []).map((r: any) => ({
      ticket_id: r.ticket_id,
      agent_id: r.agent_id,
      hostname: r.hostname,
      metric_type: r.metric_type,
      resource_key: r.resource_key,
      severity: r.severity,
      status: r.status,
      description: r.description,
      created_at: r.created_at,
      updated_at: r.updated_at,
      last_seen_at: r.last_seen_at,
    }));

    res.json({ activeTickets });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ activeTickets: [] });
    }
    res.status(500).json({ error: err.message || 'Failed to fetch active incidents' });
  }
});

// Overview summary endpoint
app.get('/api/overview', async (_req, res) => {
  try {
    // ── Derive all per-asset stats DIRECTLY from assets table ──────────────
    const [assets]: any = await pool.query('SELECT * FROM assets ORDER BY created_at DESC');
    const total = assets.length;
    const upCount   = assets.filter((a: any) => (a.status || '').toUpperCase() === 'UP').length;
    const downCount = assets.filter((a: any) => (a.status || '').toUpperCase() === 'DOWN').length;
    const pausedCount = assets.filter((a: any) => (a.status || '').toUpperCase() === 'PAUSED').length;

    // Average response time — only include assets that have a real response (exclude 0 = timeout)
    const checkedAssets = assets.filter((a: any) => a.last_response_ms != null && Number(a.last_response_ms) > 0);
    const avgLatencyMs = checkedAssets.length
      ? Math.round(checkedAssets.reduce((s: number, a: any) => s + Number(a.last_response_ms), 0) / checkedAssets.length)
      : null;

    // Currently-down assets (sorted by last_checked_at desc) — from assets table, no JOIN needed
    const downAssets = assets
      .filter((a: any) => (a.status || '').toUpperCase() === 'DOWN')
      .slice(0, 10)
      .map((a: any) => ({
        asset_name: a.name,
        parent_type: a.parent_type,
        status: a.status,
        timestamp: a.last_checked_at,
        response_time_ms: a.last_response_ms,
      }));

    // ── Global uptime % from monitor_logs (safe BigInt cast) ───────────────
    let globalUptimePct: string | null = null;
    try {
      const [logStats]: any = await pool.query(
        `SELECT COUNT(*) AS total, SUM(status = 'Up') AS up_count FROM monitor_logs`
      );
      const totalLogs = Number(logStats[0]?.total ?? 0);
      const upLogs    = Number(logStats[0]?.up_count ?? 0);
      if (totalLogs > 0) globalUptimePct = ((upLogs / totalLogs) * 100).toFixed(2);
    } catch (_) { /* non-fatal */ }

    // ── Trend: per-minute avg response time over last 24h ─────────────────
    // Use a subquery alias to avoid ONLY_FULL_GROUP_BY issues
    let trend: any[] = [];
    try {
      const [rows]: any = await pool.query(
        `SELECT t, ROUND(AVG(r)) AS latency FROM (
           SELECT DATE_FORMAT(timestamp, '%H:%i') AS t, response_time_ms AS r
           FROM monitor_logs
           WHERE timestamp >= NOW() - INTERVAL 24 HOUR AND response_time_ms > 0
         ) sub
         GROUP BY t
         ORDER BY t ASC
         LIMIT 24`
      );
      trend = rows.map((r: any) => ({ time: r.t, latency: Number(r.latency) }));
    } catch (_) { /* non-fatal */ }

    res.json({
      total,
      upCount,
      downCount,
      pausedCount,
      avgLatencyMs,
      globalUptimePct,
      recentDown: downAssets,
      trend,
      assets,
    });
  } catch (err: any) {
    console.error('[/api/overview]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Logs history endpoint
app.get('/api/assets/:id/logs', async (req, res) => {

  try {
    const [rows] = await pool.query(
      'SELECT * FROM monitor_logs WHERE asset_id = ? ORDER BY timestamp DESC LIMIT 50',
      [req.params.id]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nPulseIQ Backend running on http://localhost:${PORT}`);
  console.log(`Monitoring engine started — checking all assets every 60s\n`);
});
