import express from 'express';
import cors from 'cors';
import { readFileSync } from 'node:fs';
import * as dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dgram from 'node:dgram';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import {
  monitorAsset,
  monitorDockerTarget,
  monitorPageSpeedTarget,
  monitorPingTarget,
  monitorPortTarget,
  monitorSSLTarget,
  monitorWebsiteTarget,
} from '../monitoring/monitor-probe';
import pool from '../../lib/db';
import type { ObservabilityIssue, Severity } from '../../observability/self/analyze';
import { generateObservabilityAIInsight } from '../../observability/ai/gemini';

const app = express();
const PORT = 5145;
const execFileAsync = promisify(execFile);
const DB_MONITOR_STALE_AFTER_SEC = Math.max(60, Number(process.env.DB_MONITOR_STALE_AFTER_SEC || 180));

/**
 * Resolve a UTC-correct Date from a database monitor row.
 *
 * mysql2 (without timezone:'Z') treats DATETIME columns as LOCAL time, but
 * the agent writes collected_at in UTC.  This creates a false age offset equal
 * to the server's UTC offset (e.g. +5:30 on IST), causing every checkpoint to
 * appear hours stale and the target to be shown as Disconnected.
 *
 * Resolution order (most to least authoritative):
 *  1. payload.collectedAt  — explicit ISO-8601 UTC string written by the agent
 *  2. r.collected_at as a JS Date  — if mysql2 already boxed it, re-interpret
 *     the wall-clock digits as UTC so the value is timezone-neutral
 *  3. r.collected_at as a bare YYYY-MM-DD HH:MM:SS string — append 'Z'
 */
function resolveCollectedAt(dbRow: any, payload?: Record<string, any> | null): Date | null {
  // 1. Authoritative ISO UTC from agent payload
  const payloadTs = payload?.collectedAt;
  if (payloadTs && typeof payloadTs === 'string') {
    const d = new Date(payloadTs);
    if (Number.isFinite(d.getTime())) return d;
  }
  const raw = dbRow?.collected_at;
  if (raw == null) return null;
  // 2. mysql2 returned a Date object — extract digits and re-parse as UTC
  if (raw instanceof Date) {
    const iso = raw.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    const d = new Date(iso + 'Z');
    return Number.isFinite(d.getTime()) ? d : null;
  }
  // 3. Bare string from mysql2 (dateStrings:true or custom driver config)
  if (typeof raw === 'string') {
    const normalised = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}$/.test(raw.trim())
      ? raw.trim().replace(' ', 'T') + 'Z'
      : raw;
    const d = new Date(normalised);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

const SNMP_DEFAULT_RETENTION_HOURS = Math.max(1, Number(process.env.SNMP_RETENTION_HOURS || 48));
const SNMP_POLL_TIMEOUT_MS = Math.max(1000, Number(process.env.SNMP_POLL_TIMEOUT_MS || 8000));
const SNMP_TRAP_ENABLED = (String(process.env.SNMP_TRAP_ENABLED || 'true').toLowerCase() === 'true');
const SNMP_TRAP_BIND_HOST = String(process.env.SNMP_TRAP_BIND_HOST || '0.0.0.0');
const SNMP_TRAP_PORT = Math.max(1, Number(process.env.SNMP_TRAP_PORT || 9162));
const SYSLOG_ENABLED = (String(process.env.SYSLOG_ENABLED || 'true').toLowerCase() === 'true');
const SYSLOG_BIND_HOST = String(process.env.SYSLOG_BIND_HOST || '0.0.0.0');
const SYSLOG_UDP_PORT = Math.max(1, Number(process.env.SYSLOG_UDP_PORT || 5514));
const SYSLOG_TCP_PORT = Math.max(1, Number(process.env.SYSLOG_TCP_PORT || 5514));
const SYSLOG_RETENTION_HOURS = Math.max(1, Number(process.env.SYSLOG_RETENTION_HOURS || 48));
const INFRA_DB_NAME = (() => {
  const candidate = String(process.env.INFRA_DB_NAME || 'bsa').trim();
  return /^[A-Za-z0-9_]+$/.test(candidate) ? candidate : 'bsa';
})();
const APP_DB_NAME = (() => {
  const candidate = String(process.env.DB_NAME || 'pulseiq').trim();
  return /^[A-Za-z0-9_]+$/.test(candidate) ? candidate : 'pulseiq';
})();
const OBSERVABILITY_ANALYSIS_CADENCE_SECONDS = 60;
const OBSERVABILITY_ANALYSIS_CADENCE_MS = OBSERVABILITY_ANALYSIS_CADENCE_SECONDS * 1000;
const OBSERVABILITY_ANALYSIS_WINDOW_MINUTES = 1;
const OBSERVABILITY_TELEMETRY_GAP_MINUTES = 60;

const OBS_POLICY = {
  disruption: {
    downWeight: 1,
    degradedWeight: 0.35,
  },
  latency: {
    warningMs: 250,
    highMs: 600,
    criticalMs: 1200,
    spikeMinMs: 350,
    spikeMultiplier: 1.8,
    scoreScaleDivisor: 45,
  },
  uptime: {
    warningPct: 99,
    highRiskPct: 97,
    criticalPct: 95,
    anomalyCriticalPct: 90,
  },
  flapping: {
    minSamples: 6,
    minTransitions: 3,
  },
  risk: {
    minAttentionScore: 22,
    downPenalty: 65,
    degradedPenalty: 24,
    uptimeCriticalPenalty: 30,
    uptimeWarningPenalty: 12,
    latencyCriticalPenalty: 28,
    latencyHighPenalty: 16,
    incidentPenalty: 16,
    criticalThreshold: 72,
    highThreshold: 48,
  },
  scoring: {
    downServicePenalty: 9,
    degradedServicePenalty: 3,
    networkLatencyCap: 24,
    alertCap: 18,
    criticalInfraCap: 20,
    containerStressCap: 12,
    syslogCap: 12,
  },
  heat: {
    disruptionWeight: 0.6,
    diagnosticsWeight: 2.2,
    infraWeight: 2.4,
    latencyDivisor: 35,
    criticalThreshold: 75,
    highThreshold: 50,
    moderateThreshold: 25,
  },
} as const;

type CachedObservabilityPayload = {
  generatedAt: string;
  nextAnalysisAt: string;
  analysisWindowMinutes: number;
  placeholder: {
    isEmpty: boolean;
    title: string;
    message: string;
  };
  summary: {
    overallInfrastructureScore: number;
    overallServiceDisruptionPct: number;
    avgNetworkLatencyMs: number;
    peakNetworkLatencyMs: number;
    operationalSignalHeat: 'low' | 'moderate' | 'high' | 'critical';
    entitiesMonitored: number;
    entitiesNeedingAttention: number;
    activeIncidents: number;
    entitiesWithTelemetry: number;
    entitiesWithTelemetryGap: number;
  };
  operationalSignals: {
    downMonitorEvents1h: number;
    openDiagnosticAlerts: number;
    criticalInfrastructureEvents1h: number;
    highContainerStressEvents1h: number;
    snmpTrapBurstEvents1h: number;
    criticalSyslogEvents1h: number;
  };
  serviceDomains: Array<{
    domain: string;
    healthy: number;
    degraded: number;
    down: number;
    avgUptimePct: number;
    avgResponseMs: number;
  }>;
  entitiesNeedingAttention: Array<{
    id: string;
    name: string;
    domain: string;
    status: string;
    riskLevel: 'critical' | 'high' | 'medium';
    riskScore: number;
    likelyCause: string;
    predictedRisk: string;
    lastCheckedAt: string | null;
  }>;
  anomalies: Array<{
    id: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    detail: string;
    domain: string;
    confidence: number;
  }>;
  predictions: Array<{
    id: string;
    title: string;
    detail: string;
    horizon: string;
    confidence: number;
  }>;
  observations: string[];
  issues: ObservabilityIssue[];
  highlights: {
    immediateAttention: string[];
    painPoints: string[];
    keyFindings: string[];
  };
};

let observabilityCache: {
  expiresAt: number;
  payload: CachedObservabilityPayload;
} | null = null;

let observabilityAiCache: {
  expiresAt: number;
  generatedAt: string;
  result: {
    enabled: boolean;
    used: boolean;
    provider: 'gemini' | 'openai';
    summary: string | null;
    error: string | null;
  };
} | null = null;

const INTERNAL_TOKEN_PATTERNS: RegExp[] = [
  /\b(?:pulseiq|bsa)\.[a-z0-9_]+\b/gi,
  /\b(?:database_monitor_logs|diagnostics_alert_events|diagnostics_alert_rules|diagnostics_snapshots|health_checks|monitor_logs|snmp_telemetry_samples|snmp_traps|syslog_events|disk_metrics|docker_container_stats|health_events|metric_snapshots|network_interfaces|status_pages|data_center_capacity|data_center_connectivity)\b/gi,
];

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  /\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:serial|device|agent|asset|user|username|email|token|secret|password|apikey|api[_-]?key|auth[_-]?key|priv[_-]?key|id)\s*[:=\-#]*\s*[a-z0-9_.:@-]{4,}\b/gi,
];

function sanitizeCustomerFacingText(value: string): string {
  let text = String(value || '');
  for (const pattern of INTERNAL_TOKEN_PATTERNS) {
    text = text.replace(pattern, 'internal source');
  }
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    text = text.replace(pattern, '[redacted]');
  }
  return text.replace(/\s{2,}/g, ' ').trim();
}

function sanitizeCustomerFacingPayload<T>(input: T): T {
  if (input == null) return input;
  if (typeof input === 'string') return sanitizeCustomerFacingText(input) as unknown as T;
  if (Array.isArray(input)) return input.map((item) => sanitizeCustomerFacingPayload(item)) as unknown as T;
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      out[key] = sanitizeCustomerFacingPayload(value);
    }
    return out as T;
  }
  return input;
}

async function getAdminSettingsSnapshot() {
  const defaults = {
    aiEnabled: false,
    aiAnalysisIntervalSeconds: 900,
  };

  try {
    const [rows]: any = await pool.query(
      `SELECT settings_json FROM app_settings WHERE scope_key = 'admin' LIMIT 1`
    );
    const raw = rows?.[0]?.settings_json;
    let parsed: Record<string, any> = {};
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }
    } else if (raw && typeof raw === 'object') {
      parsed = raw;
    }

    return {
      aiEnabled: String(parsed.aiEnabled ?? defaults.aiEnabled).toLowerCase() === 'true' || parsed.aiEnabled === true,
      aiAnalysisIntervalSeconds: Math.max(60, Number(parsed.aiAnalysisIntervalSeconds || 0) || defaults.aiAnalysisIntervalSeconds),
    };
  } catch {
    return defaults;
  }
}

let infraSchemaAvailabilityCache: { value: boolean; checkedAt: number } | null = null;

function infraTable(tableName: string) {
  const safeTableName = /^[A-Za-z0-9_]+$/.test(String(tableName || '').trim()) ? tableName : '';
  if (!safeTableName) throw new Error('Invalid infra table name');
  return `\`${INFRA_DB_NAME}\`.\`${safeTableName}\``;
}

async function hasNewInfraSchema() {
  const now = Date.now();
  if (infraSchemaAvailabilityCache && now - infraSchemaAvailabilityCache.checkedAt < 60_000) {
    return infraSchemaAvailabilityCache.value;
  }

  try {
    const [rows]: any = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.tables
       WHERE table_schema = ?
         AND table_name IN ('agents', 'metric_snapshots', 'disk_metrics', 'network_interfaces', 'health_events')`,
      [INFRA_DB_NAME]
    );
    const available = Number(rows?.[0]?.total || 0) >= 5;
    infraSchemaAvailabilityCache = { value: available, checkedAt: now };
    return available;
  } catch {
    infraSchemaAvailabilityCache = { value: false, checkedAt: now };
    return false;
  }
}

const DIAG_TTL_MS = 120_000;
const DIAG_TIMEOUT_MS = 4_500;
const PASSWORD_ROTATION_DAYS = 90;
const PASSWORD_EXPIRY_WARNING_DAYS = 7;
const STATUS_PAGE_COMPONENTS = ['servers', 'storage', 'vms', 'san', 'database', 'uptime'] as const;
type StatusPageComponent = (typeof STATUS_PAGE_COMPONENTS)[number];
const APP_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as { version?: string };
    return String(pkg.version || '0.0.0');
  } catch {
    return String(process.env.npm_package_version || process.env.VITE_APP_VERSION || '0.0.0');
  }
})();
const diagnosticsCache = new Map<string, { expiresAt: number; payload: any }>();

// ── Auth / Session store ──────────────────────────────────────────────────────
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const SESSION_SECRET = String(process.env.SESSION_SECRET || process.env.JWT_SECRET || 'pulseiq-dev-session-secret').trim();
interface SessionEntry { username: string; role: string; expiresAt: number }
const sessions = new Map<string, SessionEntry>();

function hashPassword(plain: string): string {
  return crypto.createHash('sha256').update(String(plain)).digest('hex');
}

function createSessionToken(session: SessionEntry): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readSessionToken(token: string): SessionEntry | null {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;

  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (signature !== expected) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionEntry;
    if (!parsed?.username || !parsed?.role || !parsed?.expiresAt || parsed.expiresAt < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getSessionUser(req: any): { username: string; role: string } | null {
  const auth = String(req.headers?.['authorization'] || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;

  const liveSession = sessions.get(token);
  if (liveSession && liveSession.expiresAt >= Date.now()) {
    return { username: liveSession.username, role: liveSession.role };
  }

  const restoredSession = readSessionToken(token);
  if (!restoredSession) {
    sessions.delete(token);
    return null;
  }

  sessions.set(token, restoredSession);
  return { username: restoredSession.username, role: restoredSession.role };
}

type PortalAuditEventType = 'auth' | 'action' | 'security' | 'system';
type PortalAuditSeverity = 'info' | 'warning' | 'critical';
type PortalAuditOutcome = 'success' | 'failed';

function getRequestIp(req: any): string | null {
  const forwardedFor = String(req.headers?.['x-forwarded-for'] || '').trim();
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  return String(req.ip || req.socket?.remoteAddress || '').trim() || null;
}

function isMonitorRequestAuthorized(req: any): boolean {
  const requestIp = getRequestIp(req) || '';
  const normalizedIp = requestIp.replace('::ffff:', '');
  const isLocalRequest = normalizedIp === '127.0.0.1' || normalizedIp === '::1';
  if (isLocalRequest) return true;

  const configuredKey = String(process.env.PORTAL_MONITOR_KEY || '').trim();
  const suppliedKey = String(req.headers['x-portal-monitor-key'] || '').trim();
  const keyEnabled = Boolean(configuredKey) && configuredKey !== 'your-secret-key';
  if (!keyEnabled) return true;
  return suppliedKey === configuredKey;
}

async function logPortalAuditEvent(params: {
  req?: any;
  eventType: PortalAuditEventType;
  action: string;
  actorUsername?: string | null;
  actorRole?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  severity?: PortalAuditSeverity;
  outcome?: PortalAuditOutcome;
  message?: string;
  details?: any;
}) {
  try {
    const req = params.req;
    const ipAddress = req ? getRequestIp(req) : null;
    const userAgent = req ? String(req.headers?.['user-agent'] || '').slice(0, 512) || null : null;

    await pool.query(
      `INSERT INTO portal_audit_logs (
        event_type, action, actor_username, actor_role,
        target_type, target_id, severity, outcome,
        message, details_json, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.eventType,
        String(params.action || 'unknown').slice(0, 120),
        params.actorUsername || null,
        params.actorRole || null,
        params.targetType || null,
        params.targetId || null,
        params.severity || 'info',
        params.outcome || 'success',
        String(params.message || '').slice(0, 1024),
        params.details == null ? null : JSON.stringify(params.details),
        ipAddress,
        userAgent,
      ]
    );
  } catch {
    // Audit logging should never break business APIs.
  }
}

async function savePortalRuntimeSnapshot(params: {
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
  highestSeverity: PortalAuditSeverity;
  details?: any;
}) {
  await pool.query(
    `INSERT INTO portal_runtime_snapshots (
      frontend_url, backend_url,
      frontend_ok, frontend_status_code, frontend_latency_ms,
      backend_ok, backend_status_code, backend_latency_ms,
      portal_uptime_seconds, app_version,
      db_engine_name, db_engine_version, db_space_bytes, db_signature, db_uptime_seconds,
      vulnerability_total, vulnerability_info, vulnerability_low, vulnerability_moderate, vulnerability_high, vulnerability_critical,
      overall_status, highest_severity, details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.frontendUrl,
      params.backendUrl,
      params.frontend.ok ? 1 : 0,
      Number(params.frontend.status || 0),
      Number(params.frontend.latencyMs || 0),
      params.backend.ok ? 1 : 0,
      Number(params.backend.status || 0),
      Number(params.backend.latencyMs || 0),
      params.portalUptimeSeconds == null ? null : Number(params.portalUptimeSeconds),
      params.appVersion || null,
      params.dbEngineName || null,
      params.dbEngineVersion || null,
      params.dbSpaceBytes == null ? null : Number(params.dbSpaceBytes),
      params.dbSignature || null,
      params.dbUptimeSeconds == null ? null : Number(params.dbUptimeSeconds),
      Number(params.vulnerabilities.total || 0),
      Number(params.vulnerabilities.info || 0),
      Number(params.vulnerabilities.low || 0),
      Number(params.vulnerabilities.moderate || 0),
      Number(params.vulnerabilities.high || 0),
      Number(params.vulnerabilities.critical || 0),
      params.overallStatus,
      params.highestSeverity,
      params.details == null ? null : JSON.stringify(params.details),
    ]
  );
}

// ── Settings split ────────────────────────────────────────────────────────────
const USER_SETTING_KEYS = new Set(['timezone', 'theme', 'language']);

const USER_DEFAULTS: Record<string, any> = {
  timezone: 'Asia/Kolkata',
  theme: 'light',
  language: 'en',
};

const ADMIN_DEFAULTS: Record<string, any> = {
  emailAlerts: true,
  downtimeOnly: false,
  alertEmail: '',
  snowInstance: '',
  snowUser: '',
  snowToken: '',
  snowAssignGroup: '',
  smtpHost: '',
  smtpPort: '587',
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  smtpTls: 'starttls',
  aiEnabled: false,
  aiProvider: 'openai',
  aiModel: 'gpt-4.1-mini',
  aiBaseUrl: '',
  aiApiKey: '',
  aiAnalysisIntervalSeconds: 900,
  sessionTimeout: '60',
  mfa: false,
  allowAllDomains: true,
  allowedDomains: [],
};

const REGISTRATION_ROLES = new Set(['admin', 'editor', 'superuser', 'viewer']);
const REGISTRATION_TEAMS = new Set([
  'Storage Team',
  'Platform Team',
  'Database Team',
  'Network Team',
  'Incident Manager',
  'Stakeholders',
  'Monitoring Team',
  'Application Team',
]);

function isStrongPassword(value: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(String(value || ''));
}

function getPasswordStatusMeta(passwordUpdatedAt: string | Date | null | undefined, createdAt?: string | Date | null) {
  const reference = passwordUpdatedAt || createdAt || Date.now();
  const updatedAtMs = new Date(reference).getTime();
  const passwordAgeDays = Number.isFinite(updatedAtMs)
    ? Math.max(0, Math.floor((Date.now() - updatedAtMs) / 86400000))
    : PASSWORD_ROTATION_DAYS;
  const passwordDaysRemaining = Math.max(0, PASSWORD_ROTATION_DAYS - passwordAgeDays);
  const passwordUpdateRequired = passwordAgeDays >= PASSWORD_ROTATION_DAYS;
  const passwordNearExpiry = passwordDaysRemaining <= PASSWORD_EXPIRY_WARNING_DAYS;
  const passwordExpiryAt = Number.isFinite(updatedAtMs)
    ? new Date(updatedAtMs + PASSWORD_ROTATION_DAYS * 86400000).toISOString()
    : null;

  return {
    passwordAgeDays,
    passwordDaysRemaining,
    passwordUpdateRequired,
    passwordNearExpiry,
    passwordExpiryAt,
    passwordPolicy: 'Minimum 8 characters with upper/lower case, number, and special character. Rotation every 90 days.',
  };
}

function normalizeStatusPageComponent(value: any): StatusPageComponent | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'server' || normalized === 'servers') return 'servers';
  if (normalized === 'storage') return 'storage';
  if (normalized === 'vm' || normalized === 'vms' || normalized === 'virtual-machines') return 'vms';
  if (normalized === 'san') return 'san';
  if (normalized === 'database' || normalized === 'databases') return 'database';
  if (normalized === 'uptime' || normalized === 'web' || normalized === 'website') return 'uptime';
  return null;
}

function normalizeStatusPageComponents(input: any): StatusPageComponent[] {
  const rawValues = Array.isArray(input) ? input : String(input || '').split(',');
  const seen = new Set<StatusPageComponent>();
  for (const item of rawValues) {
    const normalized = normalizeStatusPageComponent(item);
    if (normalized) seen.add(normalized);
  }
  return Array.from(seen);
}

function buildStatusPageId() {
  return `sp-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function buildStatusPagePublicToken() {
  return crypto.randomBytes(24).toString('hex');
}

function classifyAssetForStatusPage(asset: any): StatusPageComponent | null {
  const summary = [asset?.device_category, asset?.parent_type, asset?.sub_type, asset?.target_endpoint]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  if (summary.includes('storage')) return 'storage';
  if (summary.includes('san')) return 'san';
  if (summary.includes('vm') || summary.includes('virtual')) return 'vms';
  if (summary.includes('website') || summary.includes('uptime') || /^https?:\/\//i.test(String(asset?.target_endpoint || ''))) return 'uptime';
  if (summary.includes('server') || summary.includes('host') || summary.includes('computer')) return 'servers';
  return 'servers';
}

function shapeStatusPageRow(row: any) {
  const components = normalizeStatusPageComponents(
    typeof row?.components_json === 'string' ? JSON.parse(row.components_json) : row?.components_json
  );

  return {
    id: row.id,
    name: row.name,
    groupName: row.group_name || 'General',
    components,
    timezone: row.timezone || 'UTC',
    companyName: row.company_name || 'Status Page',
    pageAddress: row.page_address || '',
    showResponseCharts: !!row.show_response_charts,
    createdBy: row.created_by || 'system',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publicToken: row.public_token,
  };
}

async function getStatusPageServices(components: StatusPageComponent[]) {
  const selected = new Set(components);
  const services: Array<{
    id: string;
    group: string;
    name: string;
    endpoint: string;
    status: string;
    uptimePct: number;
    avgResponseMs: number | null;
    lastCheckedAt: string | null;
    incident: string | null;
    history: Array<{ ok: boolean; down: boolean }>;
    responseHistory: number[];
  }> = [];

  if ([...selected].some((component) => component !== 'database')) {
    try {
      const [assetRows]: any = await pool.query(
        `SELECT id, name, target_endpoint, status, last_checked_at, last_response_ms, parent_type, sub_type, device_category
         FROM assets
         ORDER BY created_at DESC`
      );

      const assets = Array.isArray(assetRows) ? assetRows : [];
      const assetIds = assets.map((row: any) => row.id).filter(Boolean);
      const historyMap = new Map<string, Array<{ ok: boolean; down: boolean; responseMs: number | null; timestamp: string }>>();

      if (assetIds.length) {
        const placeholders = assetIds.map(() => '?').join(', ');
        const [logRows]: any = await pool.query(
          `SELECT asset_id, status, response_time_ms, timestamp
           FROM monitor_logs
           WHERE asset_id IN (${placeholders})
           ORDER BY timestamp DESC
           LIMIT ${Math.max(500, assetIds.length * 24)}`,
          assetIds
        );

        for (const row of Array.isArray(logRows) ? logRows : []) {
          const key = String(row.asset_id || '');
          if (!key) continue;
          const current = historyMap.get(key) || [];
          if (current.length >= 20) continue;
          const normalized = String(row.status || '').toLowerCase();
          current.push({
            ok: normalized === 'up',
            down: normalized === 'down',
            responseMs: row.response_time_ms == null ? null : Number(row.response_time_ms),
            timestamp: row.timestamp,
          });
          historyMap.set(key, current);
        }
      }

      for (const asset of assets) {
        const component = classifyAssetForStatusPage(asset);
        if (!component || !selected.has(component)) continue;

        const recent = [...(historyMap.get(String(asset.id)) || [])].reverse();
        const rawStatus = String(asset.status || 'Unknown');
        const normalizedStatus = rawStatus.toLowerCase();
        const isHealthy = ['up', 'online', 'running', 'connected'].includes(normalizedStatus);
        const isDown = ['down', 'offline', 'stopped', 'disconnected'].includes(normalizedStatus);
        const responseValues = recent.map((entry) => entry.responseMs).filter((entry): entry is number => entry != null);
        const avgResponseMs = responseValues.length
          ? Math.round(responseValues.reduce((sum, value) => sum + value, 0) / responseValues.length)
          : (asset.last_response_ms == null ? null : Number(asset.last_response_ms));
        const uptimePct = recent.length
          ? Number(((recent.filter((entry) => entry.ok).length / recent.length) * 100).toFixed(1))
          : (isHealthy ? 100 : isDown ? 0 : 50);

        services.push({
          id: `asset:${asset.id}`,
          group: component,
          name: asset.name || `Asset ${asset.id}`,
          endpoint: asset.target_endpoint || '—',
          status: isHealthy ? 'Online' : isDown ? 'Down' : rawStatus || 'Degraded',
          uptimePct,
          avgResponseMs,
          lastCheckedAt: asset.last_checked_at || (recent[recent.length - 1]?.timestamp || null),
          incident: isDown ? 'Service disruption detected.' : null,
          history: recent.map((entry) => ({ ok: entry.ok, down: entry.down })),
          responseHistory: responseValues,
        });
      }
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
  }

  if (selected.has('database')) {
    try {
      const [dbRows]: any = await pool.query(
        `SELECT d.target_key, d.target_name, d.status, d.ok, d.latency_ms, d.collected_at
         FROM database_monitor_logs d
         INNER JOIN (
           SELECT target_key, MAX(collected_at) AS max_collected
           FROM database_monitor_logs
           GROUP BY target_key
         ) latest ON latest.target_key = d.target_key AND latest.max_collected = d.collected_at
         ORDER BY d.collected_at DESC`
      );

      const [historyRows]: any = await pool.query(
        `SELECT target_key, status, latency_ms, collected_at
         FROM database_monitor_logs
         ORDER BY collected_at DESC
         LIMIT 600`
      );

      const historyMap = new Map<string, Array<{ ok: boolean; down: boolean; responseMs: number | null }>>();
      for (const row of Array.isArray(historyRows) ? historyRows : []) {
        const key = String(row.target_key || '');
        if (!key) continue;
        const current = historyMap.get(key) || [];
        if (current.length >= 20) continue;
        const normalized = String(row.status || '').toLowerCase();
        current.push({
          ok: normalized === 'connected',
          down: normalized === 'disconnected',
          responseMs: row.latency_ms == null ? null : Number(row.latency_ms),
        });
        historyMap.set(key, current);
      }

      for (const row of Array.isArray(dbRows) ? dbRows : []) {
        const recent = [...(historyMap.get(String(row.target_key || '')) || [])].reverse();
        const rawStatus = String(row.status || (row.ok ? 'Connected' : 'Disconnected'));
        const normalizedStatus = rawStatus.toLowerCase();
        const isHealthy = normalizedStatus === 'connected';
        const responseValues = recent.map((entry) => entry.responseMs).filter((entry): entry is number => entry != null);

        services.push({
          id: `db:${row.target_key}`,
          group: 'database',
          name: row.target_name || String(row.target_key || 'Database'),
          endpoint: String(row.target_key || 'database'),
          status: isHealthy ? 'Online' : 'Down',
          uptimePct: recent.length ? Number(((recent.filter((entry) => entry.ok).length / recent.length) * 100).toFixed(1)) : (isHealthy ? 100 : 0),
          avgResponseMs: responseValues.length ? Math.round(responseValues.reduce((sum, value) => sum + value, 0) / responseValues.length) : (row.latency_ms == null ? null : Number(row.latency_ms)),
          lastCheckedAt: row.collected_at || null,
          incident: isHealthy ? null : 'Database connectivity issue detected.',
          history: recent.map((entry) => ({ ok: entry.ok, down: entry.down })),
          responseHistory: responseValues,
        });
      }
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
  }

  return services;
}

type SnmpVersion = '2c' | '3';

interface SnmpMetricDef {
  key: string;
  oid: string;
  unit?: string;
}

const SNMP_VENDOR_METRICS: Record<string, SnmpMetricDef[]> = {
  default: [
    { key: 'sys_name', oid: '1.3.6.1.2.1.1.5.0' },
    { key: 'sys_descr', oid: '1.3.6.1.2.1.1.1.0' },
    { key: 'sys_uptime_ticks', oid: '1.3.6.1.2.1.1.3.0', unit: 'ticks' },
    { key: 'if_number', oid: '1.3.6.1.2.1.2.1.0' },
  ],
  brocade: [
    { key: 'sys_name', oid: '1.3.6.1.2.1.1.5.0' },
    { key: 'sys_descr', oid: '1.3.6.1.2.1.1.1.0' },
    { key: 'sys_uptime_ticks', oid: '1.3.6.1.2.1.1.3.0', unit: 'ticks' },
    { key: 'if_number', oid: '1.3.6.1.2.1.2.1.0' },
  ],
  cisco: [
    { key: 'sys_name', oid: '1.3.6.1.2.1.1.5.0' },
    { key: 'sys_descr', oid: '1.3.6.1.2.1.1.1.0' },
    { key: 'sys_uptime_ticks', oid: '1.3.6.1.2.1.1.3.0', unit: 'ticks' },
    { key: 'if_number', oid: '1.3.6.1.2.1.2.1.0' },
  ],
  aruba: [
    { key: 'sys_name', oid: '1.3.6.1.2.1.1.5.0' },
    { key: 'sys_descr', oid: '1.3.6.1.2.1.1.1.0' },
    { key: 'sys_uptime_ticks', oid: '1.3.6.1.2.1.1.3.0', unit: 'ticks' },
    { key: 'if_number', oid: '1.3.6.1.2.1.2.1.0' },
  ],
  netapp: [
    { key: 'sys_name', oid: '1.3.6.1.2.1.1.5.0' },
    { key: 'sys_descr', oid: '1.3.6.1.2.1.1.1.0' },
    { key: 'sys_uptime_ticks', oid: '1.3.6.1.2.1.1.3.0', unit: 'ticks' },
  ],
  hpe: [
    { key: 'sys_name', oid: '1.3.6.1.2.1.1.5.0' },
    { key: 'sys_descr', oid: '1.3.6.1.2.1.1.1.0' },
    { key: 'sys_uptime_ticks', oid: '1.3.6.1.2.1.1.3.0', unit: 'ticks' },
  ],
  infinidat: [
    { key: 'sys_name', oid: '1.3.6.1.2.1.1.5.0' },
    { key: 'sys_descr', oid: '1.3.6.1.2.1.1.1.0' },
    { key: 'sys_uptime_ticks', oid: '1.3.6.1.2.1.1.3.0', unit: 'ticks' },
  ],
  pure: [
    { key: 'sys_name', oid: '1.3.6.1.2.1.1.5.0' },
    { key: 'sys_descr', oid: '1.3.6.1.2.1.1.1.0' },
    { key: 'sys_uptime_ticks', oid: '1.3.6.1.2.1.1.3.0', unit: 'ticks' },
  ],
  'dell emc': [
    { key: 'sys_name', oid: '1.3.6.1.2.1.1.5.0' },
    { key: 'sys_descr', oid: '1.3.6.1.2.1.1.1.0' },
    { key: 'sys_uptime_ticks', oid: '1.3.6.1.2.1.1.3.0', unit: 'ticks' },
  ],
  ibm: [
    { key: 'sys_name', oid: '1.3.6.1.2.1.1.5.0' },
    { key: 'sys_descr', oid: '1.3.6.1.2.1.1.1.0' },
    { key: 'sys_uptime_ticks', oid: '1.3.6.1.2.1.1.3.0', unit: 'ticks' },
  ],
  hitachi: [
    { key: 'sys_name', oid: '1.3.6.1.2.1.1.5.0' },
    { key: 'sys_descr', oid: '1.3.6.1.2.1.1.1.0' },
    { key: 'sys_uptime_ticks', oid: '1.3.6.1.2.1.1.3.0', unit: 'ticks' },
  ],
};

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.status(200).json({ service: 'PulseIQ Backend', status: 'ok' });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.get('/api/observability/summary', async (req, res) => {
  const forceRefresh = ['1', 'true', 'yes'].includes(String(req.query.force || '').toLowerCase());
  const aiRequested = ['1', 'true', 'yes'].includes(String(req.query.ai || '').toLowerCase());
  const nowMs = Date.now();

  const rankSeverity = (severity: Severity) => {
    if (severity === 'critical') return 3;
    if (severity === 'warning') return 2;
    return 1;
  };

  const normalizeDomain = (value: string) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'servers') return 'Infrastructure';
    if (normalized === 'storage') return 'Storage';
    if (normalized === 'vms') return 'Virtual Machines';
    if (normalized === 'san') return 'SAN';
    if (normalized === 'database') return 'Database';
    return 'Uptime';
  };

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const queryOne = async (sql: string, params: any[] = []) => {
    const [rows]: any = await pool.query(sql, params);
    return rows?.[0] || {};
  };

  const checkTable = async (databaseName: string, tableName: string) => {
    const [rows]: any = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
       WHERE table_schema = ? AND table_name = ?`,
      [databaseName, tableName]
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  };

  try {
    const actor = getSessionUser(req);
    const isAdminActor = !!actor && (actor.role === 'admin' || actor.role === 'superuser');
    const adminSettings = await getAdminSettingsSnapshot();

    if (aiRequested && !isAdminActor) {
      return res.status(403).json({ error: 'Only admins can initiate AI analysis.' });
    }

    let payload: CachedObservabilityPayload;

    if (!forceRefresh && observabilityCache && observabilityCache.expiresAt > nowMs) {
      payload = observabilityCache.payload;
    } else {
      const generatedAt = new Date().toISOString();
      const nextAnalysisAt = new Date(new Date(generatedAt).getTime() + OBSERVABILITY_ANALYSIS_CADENCE_MS).toISOString();

      const allServices = await getStatusPageServices([...STATUS_PAGE_COMPONENTS]);
      const services = allServices.filter((service) => String(service.id || '').startsWith('asset:'));
      const totalServices = services.length;
      const entitiesWithAnyTelemetry = services.filter((service) => {
        const hasHistory = Array.isArray(service.history) && service.history.length > 0;
        const hasLastSeen = !!service.lastCheckedAt;
        return hasHistory || hasLastSeen;
      }).length;
      const entitiesWithoutTelemetry = Math.max(0, totalServices - entitiesWithAnyTelemetry);

      const telemetryGapMinutes = OBSERVABILITY_TELEMETRY_GAP_MINUTES;
      const entitiesWithTelemetryGap = services.filter((service) => {
        const hasHistory = Array.isArray(service.history) && service.history.length > 0;
        const hasLastSeen = !!service.lastCheckedAt;
        if (!hasHistory && !hasLastSeen) return false;
        if (!service.lastCheckedAt) return false;
        const lastSeenMs = new Date(service.lastCheckedAt).getTime();
        if (!Number.isFinite(lastSeenMs)) return false;
        const gapMinutes = Math.floor((nowMs - lastSeenMs) / (60 * 1000));
        return gapMinutes > telemetryGapMinutes;
      });

      const downServices = services.filter((item) => String(item.status || '').toLowerCase() === 'down').length;
      const degradedServices = services.filter((item) => {
        const status = String(item.status || '').toLowerCase();
        return status !== 'online' && status !== 'down';
      }).length;
      const healthyServices = Math.max(0, totalServices - downServices - degradedServices);

      const serviceDisruptionPct = totalServices
        ? Number((((downServices * OBS_POLICY.disruption.downWeight + degradedServices * OBS_POLICY.disruption.degradedWeight) / totalServices) * 100).toFixed(1))
        : 0;

      const hasHealthChecks = await checkTable(APP_DB_NAME, 'health_checks');
      const hasMonitorLogs = await checkTable(APP_DB_NAME, 'monitor_logs');
      const hasDiagAlerts = await checkTable(APP_DB_NAME, 'diagnostics_alert_events');
      const hasSnmpTraps = await checkTable(APP_DB_NAME, 'snmp_traps');
      const hasSyslogEvents = await checkTable(APP_DB_NAME, 'syslog_events');
      const hasBsaHealthEvents = await checkTable(INFRA_DB_NAME, 'health_events');
      const hasBsaContainerStats = await checkTable(INFRA_DB_NAME, 'docker_container_stats');

      const appDbRef = `\`${APP_DB_NAME}\``;
      const infraDbRef = `\`${INFRA_DB_NAME}\``;

      let avgNetworkLatencyMs = 0;
      let peakNetworkLatencyMs = 0;
      if (hasHealthChecks) {
        const row = await queryOne(
          `SELECT AVG(network_latency_ms) AS avg_latency, MAX(network_latency_ms) AS peak_latency
           FROM ${appDbRef}.health_checks
           WHERE checked_at >= UTC_TIMESTAMP() - INTERVAL 1 HOUR
             AND network_latency_ms IS NOT NULL`
        );
        avgNetworkLatencyMs = Number(row?.avg_latency || 0);
        peakNetworkLatencyMs = Number(row?.peak_latency || 0);
      }

      let downMonitorEvents1h = 0;
      if (hasMonitorLogs) {
        const row = await queryOne(
          `SELECT COUNT(*) AS down_count
           FROM ${appDbRef}.monitor_logs
           WHERE timestamp >= UTC_TIMESTAMP() - INTERVAL 1 HOUR
             AND LOWER(status) = 'down'`
        );
        downMonitorEvents1h = Number(row?.down_count || 0);
      }

      let openDiagnosticAlerts = 0;
      if (hasDiagAlerts) {
        const row = await queryOne(
          `SELECT COUNT(*) AS open_count
           FROM ${appDbRef}.diagnostics_alert_events
           WHERE status = 'Open'`
        );
        openDiagnosticAlerts = Number(row?.open_count || 0);
      }

      let snmpTrapBurstEvents1h = 0;
      if (hasSnmpTraps) {
        const row = await queryOne(
          `SELECT COUNT(*) AS cnt
           FROM ${appDbRef}.snmp_traps
           WHERE received_at >= UTC_TIMESTAMP() - INTERVAL 1 HOUR`
        );
        snmpTrapBurstEvents1h = Number(row?.cnt || 0);
      }

      let criticalSyslogEvents1h = 0;
      if (hasSyslogEvents) {
        const row = await queryOne(
          `SELECT COUNT(*) AS cnt
           FROM ${appDbRef}.syslog_events
           WHERE received_at >= UTC_TIMESTAMP() - INTERVAL 1 HOUR
             AND (
               severity_label = 'critical'
               OR severity <= 2
             )`
        );
        criticalSyslogEvents1h = Number(row?.cnt || 0);
      }

      let criticalInfrastructureEvents1h = 0;
      if (hasBsaHealthEvents) {
        const row = await queryOne(
          `SELECT COUNT(*) AS cnt
           FROM ${infraDbRef}.health_events
           WHERE captured_at >= UTC_TIMESTAMP() - INTERVAL 1 HOUR
             AND severity = 'critical'`
        );
        criticalInfrastructureEvents1h = Number(row?.cnt || 0);
      }

      let highContainerStressEvents1h = 0;
      if (hasBsaContainerStats) {
        const row = await queryOne(
          `SELECT COUNT(*) AS cnt
           FROM ${infraDbRef}.docker_container_stats
           WHERE captured_at >= UTC_TIMESTAMP() - INTERVAL 1 HOUR
             AND (
               IFNULL(cpu_percent, 0) >= 90
               OR IFNULL(memory_percent, 0) >= 90
             )`
        );
        highContainerStressEvents1h = Number(row?.cnt || 0);
      }

      const serviceDomains = Array.from(
        services.reduce((map, service) => {
          const domain = normalizeDomain(service.group);
          const current = map.get(domain) || {
            domain,
            healthy: 0,
            degraded: 0,
            down: 0,
            uptimeValues: [] as number[],
            responseValues: [] as number[],
          };

          const status = String(service.status || '').toLowerCase();
          if (status === 'down') current.down += 1;
          else if (status === 'online') current.healthy += 1;
          else current.degraded += 1;

          if (Number.isFinite(service.uptimePct)) current.uptimeValues.push(Number(service.uptimePct));
          if (Number.isFinite(service.avgResponseMs)) current.responseValues.push(Number(service.avgResponseMs));

          map.set(domain, current);
          return map;
        }, new Map<string, {
          domain: string;
          healthy: number;
          degraded: number;
          down: number;
          uptimeValues: number[];
          responseValues: number[];
        }>()).values()
      ).map((item) => ({
        domain: item.domain,
        healthy: item.healthy,
        degraded: item.degraded,
        down: item.down,
        avgUptimePct: item.uptimeValues.length
          ? Number((item.uptimeValues.reduce((sum, value) => sum + value, 0) / item.uptimeValues.length).toFixed(1))
          : 100,
        avgResponseMs: item.responseValues.length
          ? Math.round(item.responseValues.reduce((sum, value) => sum + value, 0) / item.responseValues.length)
          : 0,
      }));

      const entitiesNeedingAttention = services
        .map((service) => {
          const reasons: string[] = [];
          const status = String(service.status || '').toLowerCase();
          let riskScore = 0;

          if (status === 'down') {
            riskScore += OBS_POLICY.risk.downPenalty;
            reasons.push('Service is currently down.');
          } else if (status !== 'online') {
            riskScore += OBS_POLICY.risk.degradedPenalty;
            reasons.push('Service is degraded.');
          }

          if (service.uptimePct < OBS_POLICY.uptime.criticalPct) {
            riskScore += OBS_POLICY.risk.uptimeCriticalPenalty;
            reasons.push(`Uptime dropped to ${service.uptimePct.toFixed(1)}%.`);
          } else if (service.uptimePct < OBS_POLICY.uptime.warningPct) {
            riskScore += OBS_POLICY.risk.uptimeWarningPenalty;
            reasons.push(`Uptime is trending low at ${service.uptimePct.toFixed(1)}%.`);
          }

          const responseMs = Number(service.avgResponseMs || 0);
          if (responseMs >= OBS_POLICY.latency.criticalMs) {
            riskScore += OBS_POLICY.risk.latencyCriticalPenalty;
            reasons.push('High response latency detected.');
          } else if (responseMs >= OBS_POLICY.latency.highMs) {
            riskScore += OBS_POLICY.risk.latencyHighPenalty;
            reasons.push('Response latency is elevated.');
          }

          if (service.incident) {
            riskScore += OBS_POLICY.risk.incidentPenalty;
            reasons.push('Recent incident or disruption observed.');
          }

          if (riskScore < OBS_POLICY.risk.minAttentionScore) return null;

          const riskLevel: 'critical' | 'high' | 'medium' = riskScore >= OBS_POLICY.risk.criticalThreshold
            ? 'critical'
            : riskScore >= OBS_POLICY.risk.highThreshold
              ? 'high'
              : 'medium';

          const predictedRisk = status === 'down'
            ? 'High chance of continued disruption in the next 60 minutes without intervention.'
            : riskScore >= 60
              ? 'Likely to degrade further in the next 60 minutes if trend continues.'
              : 'Monitor closely; potential instability in the next 60 minutes.';

          return {
            id: service.id,
            name: service.name,
            domain: normalizeDomain(service.group),
            status: service.status,
            riskLevel,
            riskScore: clamp(Math.round(riskScore), 0, 100),
            likelyCause: reasons[0] || 'Performance instability detected.',
            predictedRisk,
            lastCheckedAt: service.lastCheckedAt || null,
          };
        })
        .filter((item): item is NonNullable<typeof item> => !!item)
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 12);

      const anomalies: CachedObservabilityPayload['anomalies'] = [];
      for (const service of services.slice(0, 80)) {
        const responseSeries = Array.isArray(service.responseHistory) ? service.responseHistory : [];
        const latestResponse = responseSeries.length ? responseSeries[responseSeries.length - 1] : 0;
        const responseAvg = responseSeries.length
          ? responseSeries.reduce((sum, value) => sum + value, 0) / responseSeries.length
          : 0;

        if (
          responseSeries.length >= OBS_POLICY.flapping.minSamples
          && latestResponse > OBS_POLICY.latency.spikeMinMs
          && latestResponse > responseAvg * OBS_POLICY.latency.spikeMultiplier
        ) {
          anomalies.push({
            id: `latency-spike:${service.id}`,
            severity: latestResponse > OBS_POLICY.latency.criticalMs ? 'critical' : 'warning',
            title: `Latency spike on ${service.name}`,
            detail: `Response latency increased to ${Math.round(latestResponse)}ms from a recent average near ${Math.round(responseAvg)}ms.`,
            domain: normalizeDomain(service.group),
            confidence: latestResponse > OBS_POLICY.latency.criticalMs ? 87 : 79,
          });
        }

        const statusSeq = Array.isArray(service.history) ? service.history.map((entry) => (entry.down ? 'down' : 'up')) : [];
        let flips = 0;
        for (let i = 1; i < statusSeq.length; i += 1) {
          if (statusSeq[i] !== statusSeq[i - 1]) flips += 1;
        }
        if (statusSeq.length >= OBS_POLICY.flapping.minSamples && flips >= OBS_POLICY.flapping.minTransitions) {
          anomalies.push({
            id: `flapping:${service.id}`,
            severity: 'warning',
            title: `Flapping behaviour on ${service.name}`,
            detail: `Service status changed ${flips} times in recent checks, indicating instability.`,
            domain: normalizeDomain(service.group),
            confidence: 78,
          });
        }

        if (service.uptimePct < OBS_POLICY.uptime.highRiskPct) {
          anomalies.push({
            id: `uptime-drop:${service.id}`,
            severity: service.uptimePct < OBS_POLICY.uptime.anomalyCriticalPct ? 'critical' : 'warning',
            title: `Uptime degradation on ${service.name}`,
            detail: `Observed uptime is ${service.uptimePct.toFixed(1)}% in recent samples.`,
            domain: normalizeDomain(service.group),
            confidence: service.uptimePct < OBS_POLICY.uptime.anomalyCriticalPct ? 90 : 84,
          });
        }
      }

      if (criticalInfrastructureEvents1h > 0) {
        anomalies.push({
          id: 'infra-critical-events',
          severity: criticalInfrastructureEvents1h >= 8 ? 'critical' : 'warning',
          title: 'Critical infrastructure events detected',
          detail: `${criticalInfrastructureEvents1h} critical infrastructure events were raised in the last hour.`,
          domain: 'Infrastructure',
          confidence: 84,
        });
      }

      const predictions: CachedObservabilityPayload['predictions'] = [];
      for (const entity of entitiesNeedingAttention.slice(0, 8)) {
        const predictedConfidence = entity.riskScore >= OBS_POLICY.risk.criticalThreshold
          ? 88
          : entity.riskScore >= OBS_POLICY.risk.highThreshold
            ? 79
            : 69;
        predictions.push({
          id: `prediction:${entity.id}`,
          title: `${entity.name} risk outlook`,
          detail: entity.predictedRisk,
          horizon: 'Next 60 minutes',
          confidence: predictedConfidence,
        });
      }

      const activeIncidents = downServices + (openDiagnosticAlerts > 0 ? 1 : 0) + (criticalInfrastructureEvents1h > 0 ? 1 : 0);
      const weightedIncidentPenalty =
        downServices * OBS_POLICY.scoring.downServicePenalty
        + degradedServices * OBS_POLICY.scoring.degradedServicePenalty
        + clamp(Math.round(avgNetworkLatencyMs / OBS_POLICY.latency.scoreScaleDivisor), 0, OBS_POLICY.scoring.networkLatencyCap)
        + clamp(Math.round(openDiagnosticAlerts * OBS_POLICY.heat.diagnosticsWeight), 0, OBS_POLICY.scoring.alertCap)
        + clamp(Math.round(criticalInfrastructureEvents1h * OBS_POLICY.heat.infraWeight), 0, OBS_POLICY.scoring.criticalInfraCap)
        + clamp(highContainerStressEvents1h, 0, OBS_POLICY.scoring.containerStressCap)
        + clamp(criticalSyslogEvents1h, 0, OBS_POLICY.scoring.syslogCap);

      const overallInfrastructureScore = clamp(100 - weightedIncidentPenalty, 0, 100);

      const heatScore = clamp(
        Math.round(
          serviceDisruptionPct * OBS_POLICY.heat.disruptionWeight
          + openDiagnosticAlerts * OBS_POLICY.heat.diagnosticsWeight
          + criticalInfrastructureEvents1h * OBS_POLICY.heat.infraWeight
          + (avgNetworkLatencyMs / OBS_POLICY.heat.latencyDivisor)
        ),
        0,
        100
      );

      const operationalSignalHeat: CachedObservabilityPayload['summary']['operationalSignalHeat'] = heatScore >= OBS_POLICY.heat.criticalThreshold
        ? 'critical'
        : heatScore >= OBS_POLICY.heat.highThreshold
          ? 'high'
          : heatScore >= OBS_POLICY.heat.moderateThreshold
            ? 'moderate'
            : 'low';

      const issues: ObservabilityIssue[] = [];

      for (const entity of entitiesNeedingAttention.slice(0, 10)) {
        issues.push({
          id: `entity-${entity.id}`,
          severity: entity.riskLevel === 'critical' ? 'critical' : entity.riskLevel === 'high' ? 'warning' : 'info',
          source: `${entity.domain}:${entity.name}`,
          title: `${entity.name} requires attention`,
          detail: entity.likelyCause,
          metric: 'risk_score',
          value: entity.riskScore,
          threshold: OBS_POLICY.risk.highThreshold,
        });
      }

      for (const anomaly of anomalies.slice(0, 10)) {
        issues.push({
          id: `anomaly-${anomaly.id}`,
          severity: anomaly.severity,
          source: `Anomaly:${anomaly.domain}`,
          title: anomaly.title,
          detail: anomaly.detail,
          metric: 'anomaly_confidence',
          value: anomaly.confidence,
          threshold: 70,
        });
      }

      issues.sort((a, b) => rankSeverity(b.severity) - rankSeverity(a.severity));

      const observations: string[] = [];

      if (totalServices === 0) {
        observations.push('No monitored entities are available in inventory yet.');
      } else {
        observations.push(`Overall service disruption is ${serviceDisruptionPct.toFixed(1)}% across ${totalServices} monitored entities.`);
        observations.push(`Average network latency is ${avgNetworkLatencyMs.toFixed(1)}ms with peak ${peakNetworkLatencyMs.toFixed(1)}ms in the last hour.`);
        observations.push(`${entitiesNeedingAttention.length} entities currently require closer operational attention.`);

        if (entitiesWithoutTelemetry > 0) {
          observations.push(`${entitiesWithoutTelemetry} monitored entities have not produced telemetry yet.`);
        }
        if (entitiesWithTelemetryGap.length > 0) {
          observations.push(`${entitiesWithTelemetryGap.length} monitored entities show a telemetry gap after previously reporting data.`);
        }
        if (anomalies.length) {
          observations.push(`${anomalies.length} anomaly patterns were detected, including instability and latency spikes.`);
        }
      }

      const highlights = {
        immediateAttention: issues
          .filter((item) => item.severity === 'critical')
          .slice(0, 5)
          .map((item) => `${item.title}: ${item.detail}`),
        painPoints: [
          downServices > 0 ? `${downServices} services are currently down.` : '',
          degradedServices > 0 ? `${degradedServices} services are degraded and may impact user experience.` : '',
          openDiagnosticAlerts > 0 ? `${openDiagnosticAlerts} diagnostics alerts remain open.` : '',
          highContainerStressEvents1h > 0 ? `${highContainerStressEvents1h} container stress events were detected in the last hour.` : '',
        ].filter(Boolean),
        keyFindings: [
          `Infrastructure score is ${overallInfrastructureScore}/100.`,
          `Operational signal heat is ${operationalSignalHeat.toUpperCase()}.`,
          `${healthyServices} healthy, ${degradedServices} degraded, ${downServices} down services in latest analysis.`,
        ],
      };

      if (!highlights.immediateAttention.length) {
        highlights.immediateAttention.push('No immediate critical service outage requiring escalation right now.');
      }
      if (!highlights.painPoints.length) {
        if (totalServices === 0) {
          highlights.painPoints.push('No monitored entities have been onboarded to inventory yet.');
        } else if (entitiesWithAnyTelemetry === 0) {
          highlights.painPoints.push('Monitored entities are present, but telemetry has not been received yet.');
        } else {
          highlights.painPoints.push('No dominant operational pain point detected in the current cycle.');
        }
      }

      const placeholder = totalServices === 0
        ? {
            isEmpty: true,
            title: 'No Monitored Entities',
            message: 'Add devices/services to inventory to begin observability analysis.',
          }
        : entitiesWithAnyTelemetry === 0
          ? {
              isEmpty: true,
              title: 'No Telemetry Yet',
              message: 'Entities exist in inventory, but monitoring data has not been received yet.',
            }
          : {
              isEmpty: false,
              title: '',
              message: '',
            };

      payload = {
        generatedAt,
        nextAnalysisAt,
        analysisWindowMinutes: OBSERVABILITY_ANALYSIS_WINDOW_MINUTES,
        placeholder,
        summary: {
          overallInfrastructureScore,
          overallServiceDisruptionPct: serviceDisruptionPct,
          avgNetworkLatencyMs: Number(avgNetworkLatencyMs.toFixed(1)),
          peakNetworkLatencyMs: Number(peakNetworkLatencyMs.toFixed(1)),
          operationalSignalHeat,
          entitiesMonitored: totalServices,
          entitiesNeedingAttention: entitiesNeedingAttention.length,
          activeIncidents,
          entitiesWithTelemetry: entitiesWithAnyTelemetry,
          entitiesWithTelemetryGap: entitiesWithTelemetryGap.length,
        },
        operationalSignals: {
          downMonitorEvents1h,
          openDiagnosticAlerts,
          criticalInfrastructureEvents1h,
          highContainerStressEvents1h,
          snmpTrapBurstEvents1h,
          criticalSyslogEvents1h,
        },
        serviceDomains,
        entitiesNeedingAttention,
        anomalies: anomalies.slice(0, 20),
        predictions,
        observations,
        issues: issues.slice(0, 20),
        highlights,
      };

      observabilityCache = {
        expiresAt: new Date(nextAnalysisAt).getTime(),
        payload,
      };
    }

    let aiResult = (adminSettings.aiEnabled && observabilityAiCache?.result)
      ? observabilityAiCache.result
      : {
          enabled: false,
          used: false,
          provider: 'openai' as const,
          summary: null,
          error: adminSettings.aiEnabled
            ? 'AI analysis is available but has not been initiated by an admin yet.'
            : 'AI analysis is disabled in admin settings.',
        };

    const aiCacheExpired = !observabilityAiCache || observabilityAiCache.expiresAt <= nowMs;
    const canInitiateAi = aiRequested && isAdminActor && adminSettings.aiEnabled;

    if (canInitiateAi && aiCacheExpired) {
      aiResult = await generateObservabilityAIInsight({
        generatedAt: payload.generatedAt,
        context: {
          summary: payload.summary,
          operationalSignals: payload.operationalSignals,
          serviceDomains: payload.serviceDomains,
          entitiesNeedingAttention: payload.entitiesNeedingAttention.slice(0, 8),
          anomalies: payload.anomalies.slice(0, 10),
          predictions: payload.predictions.slice(0, 8),
        },
        observations: payload.observations,
        issues: payload.issues,
      });

      observabilityAiCache = {
        generatedAt: new Date().toISOString(),
        expiresAt: nowMs + adminSettings.aiAnalysisIntervalSeconds * 1000,
        result: aiResult,
      };
    } else if (canInitiateAi && observabilityAiCache) {
      aiResult = observabilityAiCache.result;
    }

    const safePayload = sanitizeCustomerFacingPayload({
      ...payload,
      ai: aiResult,
    });

    res.json(safePayload);
  } catch (err: any) {
    const generatedAt = new Date().toISOString();
    const nextAnalysisAt = new Date(Date.now() + OBSERVABILITY_ANALYSIS_CADENCE_MS).toISOString();
    const errorPayload = {
      error: err?.message || 'Failed to build observability summary',
      generatedAt,
      nextAnalysisAt,
      analysisWindowMinutes: OBSERVABILITY_ANALYSIS_WINDOW_MINUTES,
      placeholder: {
        isEmpty: true,
        title: 'Observability Unavailable',
        message: 'Observability summary is temporarily unavailable. Please retry shortly.',
      },
      summary: {
        overallInfrastructureScore: 0,
        overallServiceDisruptionPct: 0,
        avgNetworkLatencyMs: 0,
        peakNetworkLatencyMs: 0,
        operationalSignalHeat: 'low',
        entitiesMonitored: 0,
        entitiesNeedingAttention: 0,
        activeIncidents: 0,
        entitiesWithTelemetry: 0,
        entitiesWithTelemetryGap: 0,
      },
      operationalSignals: {
        downMonitorEvents1h: 0,
        openDiagnosticAlerts: 0,
        criticalInfrastructureEvents1h: 0,
        highContainerStressEvents1h: 0,
        snmpTrapBurstEvents1h: 0,
        criticalSyslogEvents1h: 0,
      },
      serviceDomains: [],
      entitiesNeedingAttention: [],
      anomalies: [],
      predictions: [],
      observations: [],
      issues: [],
      highlights: {
        immediateAttention: [],
        painPoints: [],
        keyFindings: [],
      },
      ai: {
        enabled: false,
        used: false,
        provider: 'gemini',
        summary: null,
        error: 'Observability endpoint failed before AI analysis.',
      },
    };

    res.status(500).json(sanitizeCustomerFacingPayload(errorPayload));
  }
});

// Capture agent heartbeat ingestion (API-first; no DB creds on agent)
app.post('/api/agents/heartbeat', async (_req, res) => {
  res.status(410).json({
    error: 'Legacy PulseIQ agent heartbeat endpoint is disabled. Use bsa-backed ingest path.',
  });
});

// Capture agent metrics ingestion (API-first; no DB creds on agent)
app.post('/api/agents/metrics', async (_req, res) => {
  res.status(410).json({
    error: 'Legacy PulseIQ agent metrics endpoint is disabled. Use bsa-backed ingest path.',
  });
});

// Capture agent health ingestion (API-first; no DB creds on agent)
app.post('/api/agents/health', async (_req, res) => {
  res.status(410).json({
    error: 'Legacy PulseIQ agent health endpoint is disabled. Use bsa-backed ingest path.',
  });
});

// Database monitor ingestion (API-first; no DB creds on agent)
app.post('/api/databases/ingest', async (req, res) => {
  try {
    const body = req.body || {};
    const agentId = String(body.agentId || '').trim();
    if (!agentId) return res.status(400).json({ error: 'agentId is required' });

    const osInfo = body.os && typeof body.os === 'object' ? body.os : {};
    const summary = body.summary && typeof body.summary === 'object' ? body.summary : {};
    const compactOutput = Array.isArray(body.compactOutput) ? body.compactOutput : [];
    const collectedAt = body.collectedAt ? new Date(body.collectedAt) : new Date();
    const results = Array.isArray(body.results) ? body.results : [];

    if (!results.length) {
      return res.status(400).json({ error: 'results is required and must be a non-empty array' });
    }

    const asNumber = (v: any): number | null => {
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    for (const r of results) {
      const target = r?.target && typeof r.target === 'object' ? r.target : {};
      const targetType = String(target?.type || r?.targetType || 'unknown').trim();
      const targetName = String(target?.name || r?.targetName || agentId).trim();
      const targetKey = `${targetType}:${targetName}`;

      const node = r?.node && typeof r.node === 'object' ? r.node : {};
      const perf = r?.performance && typeof r.performance === 'object' ? r.performance : {};
      const inventory = r?.inventory && typeof r.inventory === 'object' ? r.inventory : {};
      const space = r?.space && typeof r.space === 'object' ? r.space : {};
      const system = r?.system && typeof r.system === 'object' ? r.system : {};
      const capabilityMatrix = r?.capabilityMatrix && typeof r.capabilityMatrix === 'object' ? r.capabilityMatrix : null;

      const inventoryRows = Array.isArray(inventory?.databases) ? inventory.databases : [];
      const totalTables = inventoryRows.reduce((sum: number, d: any) => sum + Number(d?.tableCount || 0), 0);

      const enrichedPayload = {
        ...r,
        os: osInfo,
        summary,
        compactOutput,
      };

      await pool.query(
        `INSERT INTO database_monitor_logs (
           target_key, target_name, target_type, engine, version, ok, status, node_role, node_state,
           database_uptime_sec, total_databases, total_tables, total_space_mb, used_space_mb, free_space_mb, used_pct,
           latency_ms, active_sessions, slow_queries, lock_count, replication_lag_sec,
           connection_utilization_pct, error_rate_pct, cpu_load_pct, memory_used_pct, disk_used_pct, host_pressure,
           capability_matrix_json, db_signature, os_platform, os_distro, os_version,
           health_category, health_reason,
           qps, transactions_per_sec, threads_running, threads_connected, max_connections,
           connection_errors, deadlocks, full_table_scans, lock_wait_ms,
           buffer_cache_hit_pct, cache_hit_ratio_pct, redo_log_usage_pct, page_faults,
           bytes_received, bytes_sent, transactions_waiting,
           latency_trend_json, sessions_trend_json, qps_trend_json, tps_trend_json, connections_trend_json,
           payload_json, collected_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          targetKey,
          targetName,
          targetType,
          r?.engine || null,
          r?.version || null,
          r?.ok ? 1 : 0,
          r?.status || 'Unknown',
          node?.role || null,
          node?.nodeState || null,
          asNumber(r?.databaseUptimeSec),
          asNumber(inventory?.totalDatabases),
          Number.isFinite(totalTables) ? totalTables : null,
          asNumber(space?.totalMb),
          asNumber(space?.usedMb),
          asNumber(space?.freeMb),
          asNumber(space?.usedPct),
          asNumber(perf?.latencyMs),
          asNumber(perf?.activeSessions),
          asNumber(perf?.slowQueries),
          asNumber(perf?.locks),
          asNumber(perf?.replicationLagSec ?? node?.replicationLagSec),
          asNumber(perf?.connectionUtilizationPct),
          asNumber(perf?.errorRatePct),
          asNumber(system?.cpu?.loadPct),
          asNumber(system?.memory?.usedPct),
          asNumber(system?.disk?.usedPct),
          String(system?.hostPressure || '') || null,
          capabilityMatrix ? JSON.stringify(capabilityMatrix) : null,
          String(node?.dbSignature || r?.dbSignature || '') || null,
          String(osInfo?.platform || '') || null,
          String(osInfo?.distro || '') || null,
          String(osInfo?.version || '') || null,
          String(r?.healthCategory || '') || null,
          String(r?.healthReason || r?.error || r?.reason || '') || null,
          asNumber(perf?.qps ?? perf?.qpsRate),
          asNumber(perf?.transactionsPerSec ?? perf?.transactionsPerSecRate),
          asNumber(perf?.threadsRunning),
          asNumber(perf?.threadsConnected),
          asNumber(perf?.maxConnections),
          asNumber(perf?.connectionErrors),
          asNumber(perf?.deadlocks),
          asNumber(perf?.fullTableScans),
          asNumber(perf?.lockWaitMs),
          asNumber(perf?.bufferCacheHitPct),
          asNumber(perf?.cacheHitRatioPct),
          asNumber(perf?.redoLogUsagePct),
          asNumber(perf?.pageFaults),
          asNumber(perf?.bytesReceived),
          asNumber(perf?.bytesSent),
          asNumber(perf?.transactionsWaiting),
          Array.isArray(r?.latencyTrend) ? JSON.stringify(r.latencyTrend) : null,
          Array.isArray(r?.sessionsTrend) ? JSON.stringify(r.sessionsTrend) : null,
          Array.isArray(r?.qpsTrend) ? JSON.stringify(r.qpsTrend) : null,
          Array.isArray(r?.tpsTrend) ? JSON.stringify(r.tpsTrend) : null,
          Array.isArray(r?.connectionsTrend) ? JSON.stringify(r.connectionsTrend) : null,
          JSON.stringify(enrichedPayload),
          new Date(r?.collectedAt || collectedAt),
        ]
      );
    }

    res.json({ success: true, inserted: results.length, agentId });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(404).json({ error: 'database_monitor_logs table not found' });
    }
    res.status(500).json({ error: err.message || 'Failed to ingest database monitor payload' });
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

type InvestigateTicketState = 'In progress' | 'ServiceNow' | 'Canceled' | 'Resolved' | 'Closed Un-resolved';

function incidentPriorityFromSeverity(severity: TicketSeverity) {
  if (severity === 'P1') return '1';
  if (severity === 'P2') return '2';
  return '3';
}

function normalizeInvestigateTicketState(value: any, fallback: InvestigateTicketState = 'In progress'): InvestigateTicketState {
  const normalized = String(value || '').trim();
  const allowed: InvestigateTicketState[] = ['In progress', 'ServiceNow', 'Canceled', 'Resolved', 'Closed Un-resolved'];
  return allowed.includes(normalized as InvestigateTicketState) ? (normalized as InvestigateTicketState) : fallback;
}

function derivedInvestigateTicketState(current: any): InvestigateTicketState {
  const explicit = current?.ticket_state ? normalizeInvestigateTicketState(current.ticket_state) : null;

  if (String(current?.status || '').trim() === 'Resolved') {
    if (explicit === 'Canceled' || explicit === 'Closed Un-resolved' || explicit === 'Resolved') {
      return explicit;
    }
    return 'Resolved';
  }

  if (explicit) {
    return explicit;
  }
  if (current?.incident_number || current?.service_now_incident) {
    return 'ServiceNow';
  }
  return 'In progress';
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

async function ensurePortalAuditTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS portal_audit_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_type ENUM('auth', 'action', 'security', 'system') NOT NULL,
      action VARCHAR(120) NOT NULL,
      actor_username VARCHAR(100) NULL,
      actor_role VARCHAR(30) NULL,
      target_type VARCHAR(80) NULL,
      target_id VARCHAR(160) NULL,
      severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'info',
      outcome ENUM('success', 'failed') NOT NULL DEFAULT 'success',
      resolved_at TIMESTAMP NULL,
      resolved_by VARCHAR(100) NULL,
      message VARCHAR(1024) NULL,
      details_json JSON NULL,
      ip_address VARCHAR(120) NULL,
      user_agent VARCHAR(512) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_portal_audit_created (created_at),
      INDEX idx_portal_audit_actor (actor_username, created_at),
      INDEX idx_portal_audit_event (event_type, action, created_at),
      INDEX idx_portal_audit_resolved (resolved_at, resolved_by),
      INDEX idx_portal_audit_severity (severity, outcome, created_at)
    )`
  );

  try {
    await pool.query(`ALTER TABLE portal_audit_logs ADD COLUMN resolved_at TIMESTAMP NULL AFTER outcome`);
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_FIELDNAME' && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  try {
    await pool.query(`ALTER TABLE portal_audit_logs ADD COLUMN resolved_by VARCHAR(100) NULL AFTER resolved_at`);
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_FIELDNAME' && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  try {
    await pool.query(`CREATE INDEX idx_portal_audit_resolved ON portal_audit_logs(resolved_at, resolved_by)`);
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_KEYNAME' && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
}

async function ensurePortalRuntimeSnapshotsTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS portal_runtime_snapshots (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      frontend_url VARCHAR(512) NOT NULL,
      backend_url VARCHAR(512) NOT NULL,
      frontend_ok TINYINT(1) NOT NULL DEFAULT 0,
      frontend_status_code INT NOT NULL DEFAULT 0,
      frontend_latency_ms INT NOT NULL DEFAULT 0,
      backend_ok TINYINT(1) NOT NULL DEFAULT 0,
      backend_status_code INT NOT NULL DEFAULT 0,
      backend_latency_ms INT NOT NULL DEFAULT 0,
      portal_uptime_seconds BIGINT NULL,
      app_version VARCHAR(40) NULL,
      db_engine_name VARCHAR(40) NULL,
      db_engine_version VARCHAR(120) NULL,
      db_space_bytes BIGINT NULL,
      db_signature VARCHAR(128) NULL,
      db_uptime_seconds BIGINT NULL,
      vulnerability_total INT NOT NULL DEFAULT 0,
      vulnerability_info INT NOT NULL DEFAULT 0,
      vulnerability_low INT NOT NULL DEFAULT 0,
      vulnerability_moderate INT NOT NULL DEFAULT 0,
      vulnerability_high INT NOT NULL DEFAULT 0,
      vulnerability_critical INT NOT NULL DEFAULT 0,
      overall_status ENUM('healthy', 'degraded', 'critical') NOT NULL DEFAULT 'healthy',
      highest_severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'info',
      details_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_portal_runtime_created (created_at),
      INDEX idx_portal_runtime_status (overall_status, highest_severity, created_at)
    )`
  );

  try {
    await pool.query(`ALTER TABLE portal_runtime_snapshots ADD COLUMN db_engine_name VARCHAR(40) NULL AFTER app_version`);
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_FIELDNAME' && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  try {
    await pool.query(`ALTER TABLE portal_runtime_snapshots ADD COLUMN db_engine_version VARCHAR(120) NULL AFTER db_engine_name`);
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_FIELDNAME' && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  try {
    await pool.query(`ALTER TABLE portal_runtime_snapshots ADD COLUMN db_space_bytes BIGINT NULL AFTER db_engine_version`);
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_FIELDNAME' && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  try {
    await pool.query(`ALTER TABLE portal_runtime_snapshots ADD COLUMN db_signature VARCHAR(128) NULL AFTER db_space_bytes`);
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_FIELDNAME' && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  try {
    await pool.query(`ALTER TABLE portal_runtime_snapshots ADD COLUMN db_uptime_seconds BIGINT NULL AFTER db_signature`);
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_FIELDNAME' && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
}

async function cleanupPortalAuditRetention() {
  await pool.query(`DELETE FROM portal_audit_logs WHERE created_at < (UTC_TIMESTAMP() - INTERVAL 7 DAY)`);
  await pool.query(`DELETE FROM portal_runtime_snapshots WHERE created_at < (UTC_TIMESTAMP() - INTERVAL 7 DAY)`);
}

async function ensureInvestigateTicketWorkflowTables() {
  try {
    await pool.query(`ALTER TABLE investigate_tickets ADD COLUMN work_notes LONGTEXT NULL AFTER description`);
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_FIELDNAME' && err?.code !== 'ER_NO_SUCH_TABLE') {
      throw err;
    }
  }

  try {
    await pool.query(
      `ALTER TABLE investigate_tickets
       ADD COLUMN ticket_state ENUM('In progress', 'ServiceNow', 'Canceled', 'Resolved', 'Closed Un-resolved') NULL DEFAULT 'In progress' AFTER work_notes`
    );
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_FIELDNAME' && err?.code !== 'ER_NO_SUCH_TABLE') {
      throw err;
    }
  }

  await pool.query(
    `CREATE TABLE IF NOT EXISTS investigate_ticket_updates (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      ticket_id VARCHAR(64) NOT NULL,
      note_text LONGTEXT NULL,
      ticket_state ENUM('In progress', 'ServiceNow', 'Canceled', 'Resolved', 'Closed Un-resolved') NULL,
      actor_username VARCHAR(100) NULL,
      actor_role VARCHAR(30) NULL,
      note_source ENUM('manual-note', 'status-change', 'system') NOT NULL DEFAULT 'manual-note',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_investigate_ticket_updates_ticket (ticket_id, created_at)
    )`
  );

  try {
    await pool.query(
      `UPDATE investigate_tickets
       SET ticket_state = 'Resolved'
       WHERE status = 'Resolved' AND (ticket_state IS NULL OR ticket_state = 'In progress' OR ticket_state = 'ServiceNow')`
    );
  } catch (err: any) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') {
      throw err;
    }
  }
}

async function appendInvestigateTicketActivity(params: {
  ticketId: string;
  noteText?: string | null;
  ticketState?: InvestigateTicketState | null;
  actorUsername?: string | null;
  actorRole?: string | null;
  noteSource?: 'manual-note' | 'status-change' | 'system';
}) {
  const noteText = String(params.noteText || '').trim();
  const ticketState = params.ticketState ? normalizeInvestigateTicketState(params.ticketState) : null;
  if (!noteText && !ticketState) return;

  await pool.query(
    `INSERT INTO investigate_ticket_updates (ticket_id, note_text, ticket_state, actor_username, actor_role, note_source)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.ticketId,
      noteText || null,
      ticketState,
      params.actorUsername || null,
      params.actorRole || null,
      params.noteSource || 'manual-note',
    ]
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

async function ensureAgentIdentityColumns() {
  const checks = [
    { table: 'agents', column: 'serial_number', ddl: `ALTER TABLE agents ADD COLUMN serial_number VARCHAR(128) NULL` },
    { table: 'agent_metrics', column: 'serial_number', ddl: `ALTER TABLE agent_metrics ADD COLUMN serial_number VARCHAR(128) NULL` },
    { table: 'agent_metrics', column: 'machine_type', ddl: `ALTER TABLE agent_metrics ADD COLUMN machine_type VARCHAR(20) NULL` },
  ];

  for (const c of checks) {
    const [rows]: any = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [c.table, c.column]
    );
    if (!Number(rows?.[0]?.cnt || 0)) {
      await pool.query(c.ddl);
    }
  }

  const [idxRows]: any = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'agents' AND index_name = 'ux_agents_serial_number'`
  );
  if (!Number(idxRows?.[0]?.cnt || 0)) {
    try {
      await pool.query(`CREATE UNIQUE INDEX ux_agents_serial_number ON agents(serial_number)`);
    } catch (err: any) {
      // Existing duplicate serials can block unique index creation; keep migration non-fatal.
      if (err?.code === 'ER_DUP_ENTRY') {
        const [fallbackRows]: any = await pool.query(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = 'agents' AND index_name = 'idx_agents_serial_number'`
        );
        if (!Number(fallbackRows?.[0]?.cnt || 0)) {
          await pool.query(`CREATE INDEX idx_agents_serial_number ON agents(serial_number)`);
        }
      } else {
        throw err;
      }
    }
  }

  const [machineIdxRows]: any = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'agent_metrics' AND index_name = 'idx_agent_metrics_machine_type'`
  );
  if (!Number(machineIdxRows?.[0]?.cnt || 0)) {
    await pool.query(`CREATE INDEX idx_agent_metrics_machine_type ON agent_metrics(machine_type)`);
  }
}

async function ensureDatabaseMonitorColumns() {
  const checks = [
    {
      table: 'database_monitor_logs',
      column: 'db_signature',
      ddl: 'ALTER TABLE database_monitor_logs ADD COLUMN db_signature VARCHAR(255) NULL',
    },
  ];

  for (const c of checks) {
    const [rows]: any = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [c.table, c.column]
    );
    if (!Number(rows?.[0]?.cnt || 0)) {
      await pool.query(c.ddl);
    }
  }
}

async function ensureAssetCategoryColumn() {
  const [rows]: any = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'assets' AND column_name = 'device_category'`
  );
  if (!Number(rows?.[0]?.cnt || 0)) {
    await pool.query(`ALTER TABLE assets ADD COLUMN device_category VARCHAR(50) NULL`);
  }
}

async function ensureSettingsTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS app_settings (
      scope_key VARCHAR(120) PRIMARY KEY,
      settings_json JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );
  // Resize scope_key if still VARCHAR(50) from an older install
  try {
    await pool.query(`ALTER TABLE app_settings MODIFY COLUMN scope_key VARCHAR(120) NOT NULL`);
  } catch { /* already correct size */ }
  // Ensure admin scope row exists
  await pool.query(
    `INSERT INTO app_settings (scope_key, settings_json)
     VALUES ('admin', JSON_OBJECT())
     ON DUPLICATE KEY UPDATE scope_key = scope_key`
  );
}

async function ensureUsersTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      full_name VARCHAR(255) NULL,
      employee_id VARCHAR(80) NULL,
      contact_number VARCHAR(50) NULL,
      email VARCHAR(255) NULL,
      password_hash VARCHAR(64) NOT NULL,
      password_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      role ENUM('admin', 'editor', 'superuser', 'viewer') NOT NULL DEFAULT 'editor',
      team VARCHAR(120) NULL,
      company VARCHAR(255) NULL,
      manager_name VARCHAR(255) NULL,
      manager_email VARCHAR(255) NULL,
      account_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      rejection_reason VARCHAR(512) NULL,
      reviewed_by VARCHAR(100) NULL,
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );
  const checks = [
    { column: 'full_name', ddl: 'ALTER TABLE users ADD COLUMN full_name VARCHAR(255) NULL' },
    { column: 'employee_id', ddl: 'ALTER TABLE users ADD COLUMN employee_id VARCHAR(80) NULL' },
    { column: 'contact_number', ddl: 'ALTER TABLE users ADD COLUMN contact_number VARCHAR(50) NULL' },
    { column: 'team', ddl: 'ALTER TABLE users ADD COLUMN team VARCHAR(120) NULL' },
    { column: 'company', ddl: 'ALTER TABLE users ADD COLUMN company VARCHAR(255) NULL' },
    { column: 'manager_name', ddl: 'ALTER TABLE users ADD COLUMN manager_name VARCHAR(255) NULL' },
    { column: 'manager_email', ddl: 'ALTER TABLE users ADD COLUMN manager_email VARCHAR(255) NULL' },
    { column: 'password_updated_at', ddl: 'ALTER TABLE users ADD COLUMN password_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { column: 'account_status', ddl: "ALTER TABLE users ADD COLUMN account_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending'" },
    { column: 'rejection_reason', ddl: 'ALTER TABLE users ADD COLUMN rejection_reason VARCHAR(512) NULL' },
    { column: 'reviewed_by', ddl: 'ALTER TABLE users ADD COLUMN reviewed_by VARCHAR(100) NULL' },
    { column: 'reviewed_at', ddl: 'ALTER TABLE users ADD COLUMN reviewed_at TIMESTAMP NULL' },
  ];

  for (const c of checks) {
    const [rows]: any = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = ?`,
      [c.column]
    );
    if (!Number(rows?.[0]?.cnt || 0)) {
      await pool.query(c.ddl);
    }
  }

  try {
    await pool.query("ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'editor', 'superuser', 'viewer') NOT NULL DEFAULT 'editor'");
    // Migrate legacy 'staff' rows to the new 'editor' name
    await pool.query("UPDATE users SET role = 'editor' WHERE role = 'staff'");
  } catch {
    // Already correct or variant rejects enum conversion.
  }

  const [emailIdx]: any = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'uniq_users_email'`
  );
  if (!Number(emailIdx?.[0]?.cnt || 0)) {
    await pool.query(`CREATE UNIQUE INDEX uniq_users_email ON users(email)`);
  }

  const [employeeIdx]: any = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'uniq_users_employee_id'`
  );
  if (!Number(employeeIdx?.[0]?.cnt || 0)) {
    await pool.query(`CREATE UNIQUE INDEX uniq_users_employee_id ON users(employee_id)`);
  }

  // Extend enum to include 'suspended'
  try {
    await pool.query(`ALTER TABLE users MODIFY COLUMN account_status ENUM('pending', 'approved', 'rejected', 'suspended') NOT NULL DEFAULT 'pending'`);
  } catch {
    // Already correct
  }

  await pool.query(`UPDATE users SET account_status = 'approved' WHERE account_status IS NULL`);
  await pool.query(`UPDATE users SET password_updated_at = COALESCE(password_updated_at, updated_at, created_at) WHERE password_updated_at IS NULL`);

  // ── Seed: Super Admin ────────────────────────────────────────────────────────
  await pool.query(
    `INSERT INTO users (
       username, full_name, employee_id, contact_number, email,
       password_hash, password_updated_at, role, team, company, manager_name, manager_email,
       account_status
     )
     VALUES (
       'Root-user', 'Super Admin', 'SU-001', 'N/A', 'root@beacyn.com',
       ?, CURRENT_TIMESTAMP, 'superuser', 'System', 'Beacyn Labs.', 'N/A', 'N/A', 'approved'
     )
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       employee_id = VALUES(employee_id),
       contact_number = VALUES(contact_number),
       email = VALUES(email),
       password_hash = VALUES(password_hash),
       password_updated_at = CURRENT_TIMESTAMP,
       role = VALUES(role),
       team = VALUES(team),
       company = VALUES(company),
       manager_name = VALUES(manager_name),
       manager_email = VALUES(manager_email),
       account_status = 'approved'`,
    [hashPassword('Root@Beacyn#26')]
  );

  // ── Seed: Service Account (Portal Audit + Settings access) ───────────────────
  await pool.query(
    `INSERT INTO users (
       username, full_name, employee_id, contact_number, email,
       password_hash, password_updated_at, role, team, company, manager_name, manager_email,
       account_status
     )
     VALUES (
       'Beacyn-SVC', 'Beacyn Service', 'SVC-001', 'N/A', 'svc@beacyn.com',
       ?, CURRENT_TIMESTAMP, 'superuser', 'System', 'Beacyn Labs.', 'N/A', 'N/A', 'approved'
     )
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       employee_id = VALUES(employee_id),
       contact_number = VALUES(contact_number),
       email = VALUES(email),
       password_hash = VALUES(password_hash),
       password_updated_at = CURRENT_TIMESTAMP,
       role = VALUES(role),
       team = VALUES(team),
       company = VALUES(company),
       manager_name = VALUES(manager_name),
       manager_email = VALUES(manager_email),
       account_status = 'approved'`,
    [hashPassword('Svc@Beacyn#26')]
  );
}

async function ensureUserFeedbackTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_feedback (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL,
      email VARCHAR(255) NULL,
      category VARCHAR(80) NOT NULL DEFAULT 'general',
      rating INT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_feedback_user (username, created_at)
    )`
  );
}

async function ensureStatusPagesTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS status_pages (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      group_name VARCHAR(160) NULL,
      components_json JSON NOT NULL,
      timezone VARCHAR(80) NOT NULL DEFAULT 'UTC',
      company_name VARCHAR(255) NOT NULL,
      page_address VARCHAR(255) NOT NULL,
      show_response_charts TINYINT(1) NOT NULL DEFAULT 1,
      public_token VARCHAR(96) NOT NULL,
      created_by VARCHAR(100) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_status_pages_token (public_token),
      UNIQUE KEY uniq_status_pages_address (page_address),
      INDEX idx_status_pages_created (created_at)
    )`
  );
}

async function ensureStatusNotificationsTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS status_notifications (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'info',
      is_global TINYINT(1) NOT NULL DEFAULT 0,
      status_page_id VARCHAR(64) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      publish_at TIMESTAMP NULL,
      remove_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status_notifications_active (is_active),
      INDEX idx_status_notifications_page (status_page_id)
    )`
  );

  try {
    await pool.query(`ALTER TABLE status_notifications ADD COLUMN publish_at TIMESTAMP NULL`);
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_FIELDNAME') console.warn('Failed to add publish_at column:', err.message);
  }

  try {
    await pool.query(`ALTER TABLE status_notifications ADD COLUMN remove_at TIMESTAMP NULL`);
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_FIELDNAME') console.warn('Failed to add remove_at column:', err.message);
  }
}

async function ensureMaintenanceWindowsTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS maintenance_windows (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      reason TEXT,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      scope_type VARCHAR(64) NOT NULL,
      scope_target VARCHAR(255) NULL,
      suppress_alerts TINYINT(1) DEFAULT 1,
      is_completed TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_mw_dates (start_time, end_time)
    )`
  );

  try {
    await pool.query(`ALTER TABLE assets ADD COLUMN maintenance_window_id VARCHAR(64) NULL`);
  } catch (err: any) {
    if (err?.code !== 'ER_DUP_FIELDNAME') console.warn('Failed to add maintenance_window_id column:', err.message);
  }
}

async function ensureSnmpTables() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS snmp_devices (
      id VARCHAR(64) PRIMARY KEY,
      asset_id VARCHAR(50) NULL,
      name VARCHAR(255) NOT NULL,
      vendor VARCHAR(100) NULL,
      device_type VARCHAR(60) NOT NULL,
      host VARCHAR(255) NOT NULL,
      port INT NOT NULL DEFAULT 161,
      snmp_version ENUM('2c', '3') NOT NULL DEFAULT '2c',
      community VARCHAR(255) NULL,
      sec_username VARCHAR(255) NULL,
      auth_protocol ENUM('MD5', 'SHA', 'SHA224', 'SHA256', 'SHA384', 'SHA512') NULL,
      auth_key VARCHAR(255) NULL,
      priv_protocol ENUM('DES', 'AES', 'AES192', 'AES256') NULL,
      priv_key VARCHAR(255) NULL,
      context_name VARCHAR(255) NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      poll_interval_sec INT NOT NULL DEFAULT 60,
      retention_hours INT NOT NULL DEFAULT 48,
      status VARCHAR(50) NOT NULL DEFAULT 'Unknown',
      last_polled_at TIMESTAMP NULL,
      last_error VARCHAR(512) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_snmp_target (host, port),
      INDEX idx_snmp_enabled (enabled),
      INDEX idx_snmp_asset (asset_id)
    )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS snmp_telemetry_samples (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      device_id VARCHAR(64) NOT NULL,
      metric_key VARCHAR(120) NOT NULL,
      metric_value_num DECIMAL(20,4) NULL,
      metric_value_text VARCHAR(512) NULL,
      unit VARCHAR(30) NULL,
      oid VARCHAR(128) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'info',
      sample_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_snmp_samples_device_time (device_id, sample_time),
      INDEX idx_snmp_samples_metric_time (metric_key, sample_time)
    )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS snmp_traps (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      device_id VARCHAR(64) NULL,
      source_ip VARCHAR(120) NOT NULL,
      trap_oid VARCHAR(128) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'warning',
      message VARCHAR(512) NULL,
      payload_json JSON NULL,
      received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_snmp_traps_device_time (device_id, received_at),
      INDEX idx_snmp_traps_source_time (source_ip, received_at)
    )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS syslog_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      device_id VARCHAR(64) NULL,
      source_ip VARCHAR(120) NOT NULL,
      hostname VARCHAR(255) NULL,
      app_name VARCHAR(120) NULL,
      facility INT NULL,
      severity INT NULL,
      severity_label VARCHAR(20) NULL,
      message VARCHAR(1024) NOT NULL,
      raw_message TEXT NULL,
      payload_json JSON NULL,
      received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_syslog_device_time (device_id, received_at),
      INDEX idx_syslog_source_time (source_ip, received_at),
      INDEX idx_syslog_severity_time (severity_label, received_at)
    )`
  );
}

async function ensureRackPointTables() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS rackpoint_racks (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      dc_id VARCHAR(64) NOT NULL,
      dc_name VARCHAR(255) NOT NULL,
      rack_type ENUM('42U', '45U', '48U') NOT NULL,
      total_u INT NOT NULL,
      location VARCHAR(255) NOT NULL,
      power_draw VARCHAR(60) NULL,
      created_by VARCHAR(100) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_rackpoint_rack_name (dc_id, name),
      INDEX idx_rackpoint_dc (dc_id, dc_name)
    )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS rackpoint_devices (
      id VARCHAR(64) PRIMARY KEY,
      rack_id VARCHAR(64) NOT NULL,
      name VARCHAR(160) NOT NULL,
      serial_number VARCHAR(160) NULL,
      hostname VARCHAR(255) NULL,
      type ENUM('server', 'storage', 'network', 'firewall', 'loadbalancer', 'patch', 'kvm', 'ups', 'pdu') NOT NULL,
      u_start INT NOT NULL,
      u_size INT NOT NULL,
      vendor VARCHAR(120) NOT NULL,
      model VARCHAR(160) NOT NULL,
      ip VARCHAR(120) NULL,
      status ENUM('active', 'standby', 'maintenance', 'offline') NOT NULL DEFAULT 'active',
      availability_status ENUM('reachable', 'unreachable', 'unknown') NOT NULL DEFAULT 'unknown',
      availability_message VARCHAR(255) NULL,
      last_availability_latency_ms INT NULL,
      last_availability_checked_at TIMESTAMP NULL,
      role VARCHAR(255) NULL,
      specs TEXT NULL,
      created_by VARCHAR(100) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_rackpoint_devices_rack_slot (rack_id, u_start),
      INDEX idx_rackpoint_devices_type (type, status),
      INDEX idx_rackpoint_devices_serial (serial_number),
      INDEX idx_rackpoint_devices_availability (availability_status, last_availability_checked_at)
    )`
  );

  const rackPointDeviceColumns = [
    { column: 'serial_number', ddl: 'ALTER TABLE rackpoint_devices ADD COLUMN serial_number VARCHAR(160) NULL AFTER name' },
    { column: 'availability_status', ddl: "ALTER TABLE rackpoint_devices ADD COLUMN availability_status ENUM('reachable', 'unreachable', 'unknown') NOT NULL DEFAULT 'unknown' AFTER status" },
    { column: 'availability_message', ddl: 'ALTER TABLE rackpoint_devices ADD COLUMN availability_message VARCHAR(255) NULL AFTER availability_status' },
    { column: 'last_availability_latency_ms', ddl: 'ALTER TABLE rackpoint_devices ADD COLUMN last_availability_latency_ms INT NULL AFTER availability_message' },
    { column: 'last_availability_checked_at', ddl: 'ALTER TABLE rackpoint_devices ADD COLUMN last_availability_checked_at TIMESTAMP NULL AFTER last_availability_latency_ms' },
  ];

  for (const c of rackPointDeviceColumns) {
    const [rows]: any = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'rackpoint_devices' AND column_name = ?`,
      [c.column]
    );
    if (!Number(rows?.[0]?.cnt || 0)) {
      await pool.query(c.ddl);
    }
  }
}

async function ensureDataCenterTables() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS data_centers (
      id VARCHAR(64) PRIMARY KEY,
      dc_code VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      type ENUM('colocation', 'shared', 'private') NOT NULL,
      dc_role ENUM('Primary', 'Disaster Recovery', 'Backup Site', 'Edge DC') NOT NULL,
      region VARCHAR(120) NOT NULL,
      region_group VARCHAR(120) NULL,
      country VARCHAR(120) NOT NULL,
      city VARCHAR(120) NOT NULL,
      address VARCHAR(255) NOT NULL,
      exact_address VARCHAR(255) NULL,
      owner_company VARCHAR(255) NOT NULL,
      business_unit VARCHAR(255) NULL,
      vendor_provider VARCHAR(255) NOT NULL,
      paired_dc_id VARCHAR(64) NULL,
      paired_dc_name VARCHAR(255) NULL,
      map_pos_x DECIMAL(5,2) NULL,
      map_pos_y DECIMAL(5,2) NULL,
      contact_person VARCHAR(160) NOT NULL,
      contact_email VARCHAR(255) NOT NULL,
      contact_phone VARCHAR(50) NULL,
      noc_phone VARCHAR(50) NOT NULL,
      noc_email VARCHAR(255) NOT NULL,
      emergency_contact_name VARCHAR(160) NULL,
      emergency_contact_phone VARCHAR(50) NOT NULL,
      emergency_contact_email VARCHAR(255) NULL,
      created_by VARCHAR(100) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_data_centers_dc_code (dc_code),
      INDEX idx_data_centers_region (region_group, region, city),
      INDEX idx_data_centers_role (dc_role, type)
    )`
  );

  const dataCenterColumns = [
    { column: 'map_pos_x', ddl: 'ALTER TABLE data_centers ADD COLUMN map_pos_x DECIMAL(5,2) NULL AFTER paired_dc_name' },
    { column: 'map_pos_y', ddl: 'ALTER TABLE data_centers ADD COLUMN map_pos_y DECIMAL(5,2) NULL AFTER map_pos_x' },
  ];

  for (const c of dataCenterColumns) {
    const [rows]: any = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'data_centers' AND column_name = ?`,
      [c.column]
    );
    if (!Number(rows?.[0]?.cnt || 0)) {
      await pool.query(c.ddl);
    }
  }

  await pool.query(
    `CREATE TABLE IF NOT EXISTS data_center_capacity (
      dc_id VARCHAR(64) PRIMARY KEY,
      building_type VARCHAR(80) NULL,
      redundancy_level VARCHAR(80) NULL,
      rack_total INT NOT NULL DEFAULT 0,
      rack_used INT NOT NULL DEFAULT 0,
      rack_available INT NOT NULL DEFAULT 0,
      power_capacity VARCHAR(120) NULL,
      ups_backup_duration VARCHAR(120) NULL,
      generator_capacity VARCHAR(160) NULL,
      primary_isp VARCHAR(160) NULL,
      secondary_isp VARCHAR(160) NULL,
      primary_bandwidth VARCHAR(120) NULL,
      secondary_bandwidth VARCHAR(120) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_data_center_capacity_racks (rack_used, rack_available)
    )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS data_center_connectivity (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      source_dc_id VARCHAR(64) NOT NULL,
      target_dc_id VARCHAR(64) NULL,
      target_name VARCHAR(255) NOT NULL,
      region_group VARCHAR(120) NULL,
      line_variant ENUM('general-network', 'replication', 'bidirectional-replication', 'secondary-network') NOT NULL DEFAULT 'general-network',
      line_color VARCHAR(16) NOT NULL DEFAULT '#2563eb',
      line_style ENUM('direct', 'dotted') NOT NULL DEFAULT 'direct',
      connection_type ENUM('MPLS', 'Leased Line', 'VPN (IPSec)', 'SD-WAN') NOT NULL,
      bandwidth VARCHAR(120) NULL,
      latency_ms INT NULL,
      is_redundant TINYINT(1) NOT NULL DEFAULT 1,
      mode ENUM('Active-Active', 'Active-Passive') NOT NULL DEFAULT 'Active-Passive',
      replication_type ENUM('Synchronous', 'Asynchronous') NOT NULL DEFAULT 'Asynchronous',
      replication_tool VARCHAR(255) NULL,
      failover ENUM('Manual', 'Automatic') NOT NULL DEFAULT 'Manual',
      rto VARCHAR(80) NULL,
      rpo VARCHAR(80) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_data_center_connectivity (source_dc_id, target_name, line_variant),
      INDEX idx_data_center_connectivity_source (source_dc_id),
      INDEX idx_data_center_connectivity_target (target_dc_id, target_name)
    )`
  );

  const connectivityColumns = [
    { column: 'line_variant', ddl: "ALTER TABLE data_center_connectivity ADD COLUMN line_variant ENUM('general-network', 'replication', 'bidirectional-replication', 'secondary-network') NOT NULL DEFAULT 'general-network' AFTER region_group" },
    { column: 'line_color', ddl: "ALTER TABLE data_center_connectivity ADD COLUMN line_color VARCHAR(16) NOT NULL DEFAULT '#2563eb' AFTER region_group" },
    { column: 'line_style', ddl: "ALTER TABLE data_center_connectivity ADD COLUMN line_style ENUM('direct', 'dotted') NOT NULL DEFAULT 'direct' AFTER line_color" },
  ];

  for (const c of connectivityColumns) {
    const [rows]: any = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'data_center_connectivity' AND column_name = ?`,
      [c.column]
    );
    if (!Number(rows?.[0]?.cnt || 0)) {
      await pool.query(c.ddl);
    }
  }

  const [connectivityIndexRows]: any = await pool.query(
    `SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS columns_used
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'data_center_connectivity'
       AND index_name = 'uniq_data_center_connectivity'`
  );
  const currentConnectivityUnique = String(connectivityIndexRows?.[0]?.columns_used || '');
  if (currentConnectivityUnique !== 'source_dc_id,target_name,line_variant') {
    try {
      await pool.query(`ALTER TABLE data_center_connectivity DROP INDEX uniq_data_center_connectivity`);
    } catch {
      // ignore if index is not present yet
    }
    await pool.query(
      `ALTER TABLE data_center_connectivity
       ADD UNIQUE KEY uniq_data_center_connectivity (source_dc_id, target_name, line_variant)`
    );
  }

  await pool.query(
    `CREATE TABLE IF NOT EXISTS data_center_inventory (
      dc_id VARCHAR(64) PRIMARY KEY,
      physical_servers INT NOT NULL DEFAULT 0,
      virtualization_hosts INT NOT NULL DEFAULT 0,
      storage_arrays INT NOT NULL DEFAULT 0,
      network_devices INT NOT NULL DEFAULT 0,
      racks_occupied INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_data_center_inventory_footprint (racks_occupied, physical_servers, network_devices)
    )`
  );
}

const RACKPOINT_TYPE_TO_U: Record<string, number> = {
  '42U': 42,
  '45U': 45,
  '48U': 48,
};

function buildRackPointId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function normalizeRackType(value: any): '42U' | '45U' | '48U' | null {
  const v = String(value || '').trim().toUpperCase();
  if (v === '42U' || v === '45U' || v === '48U') return v;
  return null;
}

function normalizeRackDeviceType(value: any) {
  const v = String(value || '').trim().toLowerCase();
  return ['server', 'storage', 'network', 'firewall', 'loadbalancer', 'patch', 'kvm', 'ups', 'pdu'].includes(v) ? v : null;
}

function normalizeRackDeviceStatus(value: any) {
  const v = String(value || '').trim().toLowerCase();
  return ['active', 'standby', 'maintenance', 'offline'].includes(v) ? v : null;
}

function requireAuthenticatedUser(req: any, res: any) {
  const actor = getSessionUser(req);
  if (!actor) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return actor;
}

function requireAdminUser(req: any, res: any) {
  const actor = requireAuthenticatedUser(req, res);
  if (!actor) return null;
  if (actor.role !== 'admin' && actor.role !== 'superuser') {
    res.status(403).json({ error: 'Admin access is required.' });
    return null;
  }
  return actor;
}

// Allows admin + editor but blocks superuser (who cannot modify devices/assets)
function requireDeviceOperator(req: any, res: any) {
  const actor = requireAuthenticatedUser(req, res);
  if (!actor) return null;
  if (actor.role === 'superuser') {
    res.status(403).json({ error: 'Super Admins cannot add or modify devices and assets.' });
    return null;
  }
  if (actor.role !== 'admin' && actor.role !== 'editor') {
    res.status(403).json({ error: 'Editor or Admin access is required.' });
    return null;
  }
  return actor;
}

function buildDataCenterId() {
  return `dc-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function normalizeDataCenterType(value: any): 'colocation' | 'shared' | 'private' | null {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'colocation' || normalized === 'shared' || normalized === 'private' ? normalized : null;
}

function normalizeDcRole(value: any): 'Primary' | 'Disaster Recovery' | 'Backup Site' | 'Edge DC' | null {
  const normalized = String(value || '').trim();
  return ['Primary', 'Disaster Recovery', 'Backup Site', 'Edge DC'].includes(normalized) ? normalized as any : null;
}

function normalizeConnectionType(value: any): 'MPLS' | 'Leased Line' | 'VPN (IPSec)' | 'SD-WAN' | null {
  const normalized = String(value || '').trim();
  return ['MPLS', 'Leased Line', 'VPN (IPSec)', 'SD-WAN'].includes(normalized) ? normalized as any : null;
}

function normalizeConnectivityMode(value: any): 'Active-Active' | 'Active-Passive' | null {
  const normalized = String(value || '').trim();
  return normalized === 'Active-Active' || normalized === 'Active-Passive' ? normalized : null;
}

function normalizeReplicationType(value: any): 'Synchronous' | 'Asynchronous' | null {
  const normalized = String(value || '').trim();
  return normalized === 'Synchronous' || normalized === 'Asynchronous' ? normalized : null;
}

function normalizeFailoverType(value: any): 'Manual' | 'Automatic' | null {
  const normalized = String(value || '').trim();
  return normalized === 'Manual' || normalized === 'Automatic' ? normalized : null;
}

function normalizeContinuityLineStyle(value: any): 'direct' | 'dotted' | null {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'direct' || normalized === 'dotted' ? normalized : null;
}

function normalizeContinuityLineVariant(value: any): 'general-network' | 'replication' | 'bidirectional-replication' | 'secondary-network' | null {
  const normalized = String(value || '').trim().toLowerCase();
  return ['general-network', 'replication', 'bidirectional-replication', 'secondary-network'].includes(normalized)
    ? normalized as 'general-network' | 'replication' | 'bidirectional-replication' | 'secondary-network'
    : null;
}

function normalizeContinuityLineColor(value: any) {
  const normalized = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : '#2563eb';
}

function normalizeOperationalWorkHours(value: any): '9-5' | '8-6' | '24x7' | '24x5' {
  const normalized = String(value || '').trim();
  return ['9-5', '8-6', '24x7', '24x5'].includes(normalized) ? normalized as '9-5' | '8-6' | '24x7' | '24x5' : '24x7';
}

function normalizeYesNo(value: any): 'Yes' | 'No' {
  return String(value || '').trim() === 'Yes' ? 'Yes' : 'No';
}

function optionalString(value: any) {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

function requiredString(value: any) {
  return String(value || '').trim();
}

function nonNegativeInt(value: any) {
  return Math.max(0, Number(value || 0));
}

function clampMapPosition(value: any, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(6, Math.min(94, parsed));
}

function mapDataCenterSummaryRow(row: any) {
  return {
    id: row.id,
    dcCode: row.dcCode,
    name: row.name,
    type: row.type,
    dcRole: row.dcRole,
    region: row.region,
    regionGroup: row.regionGroup || '',
    country: row.country,
    city: row.city,
    address: row.address,
    exactAddress: row.exactAddress,
    ownerCompany: row.ownerCompany,
    businessUnit: row.businessUnit,
    vendorProvider: row.vendorProvider,
    contactPerson: row.contactPerson,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    escalationContact: row.emergencyContactPhone,
    nocPhone: row.nocPhone,
    nocEmail: row.nocEmail,
    operationalWorkHours: row.operationalWorkHours || '24x7',
    visitorAccessNeeded: row.visitorAccessNeeded || 'No',
    pairedDcId: row.pairedDcId,
    pairedDcName: row.pairedDcName,
    mapPosX: row.mapPosX == null ? null : Number(row.mapPosX),
    mapPosY: row.mapPosY == null ? null : Number(row.mapPosY),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getDataCenterSummaryRows(db: any = pool) {
  const [rows]: any = await db.query(
    `SELECT
       id,
       dc_code AS dcCode,
       name,
       type,
       dc_role AS dcRole,
       region,
       region_group AS regionGroup,
       country,
       city,
       address,
       exact_address AS exactAddress,
       owner_company AS ownerCompany,
       business_unit AS businessUnit,
       vendor_provider AS vendorProvider,
       contact_person AS contactPerson,
       contact_email AS contactEmail,
       contact_phone AS contactPhone,
       emergency_contact_phone AS emergencyContactPhone,
       noc_phone AS nocPhone,
       noc_email AS nocEmail,
       operational_work_hours AS operationalWorkHours,
       visitor_access_required AS visitorAccessNeeded,
       paired_dc_id AS pairedDcId,
       paired_dc_name AS pairedDcName,
       map_pos_x AS mapPosX,
       map_pos_y AS mapPosY,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM data_centers
     ORDER BY name ASC`
  );
  return (rows || []).map(mapDataCenterSummaryRow);
}

async function getDataCenterDetail(dcId: string, db: any = pool) {
  const [rows]: any = await db.query(
    `SELECT
       dc.id,
       dc.dc_code AS dcCode,
       dc.name,
       dc.type,
       dc.dc_role AS dcRole,
       dc.region,
       dc.region_group AS regionGroup,
       dc.country,
       dc.city,
       dc.address,
       dc.exact_address AS exactAddress,
       dc.owner_company AS ownerCompany,
       dc.business_unit AS businessUnit,
       dc.vendor_provider AS vendorProvider,
       dc.contact_person AS contactPerson,
       dc.contact_email AS contactEmail,
       dc.contact_phone AS contactPhone,
       dc.noc_phone AS nocPhone,
       dc.noc_email AS nocEmail,
       dc.operational_work_hours AS operationalWorkHours,
       dc.visitor_access_required AS visitorAccessNeeded,
       dc.visitor_name AS visitorName,
       dc.visitor_phone AS visitorPhone,
       dc.visitor_official_email AS visitorOfficialEmail,
       dc.visitor_vendor AS visitorVendor,
       dc.visit_duration AS visitDuration,
       dc.visitor_special_instructions AS visitorSpecialInstructions,
       dc.emergency_contact_name AS emergencyContactName,
       dc.emergency_contact_phone AS emergencyContactPhone,
       dc.emergency_contact_email AS emergencyContactEmail,
       dc.paired_dc_id AS pairedDcId,
       dc.paired_dc_name AS pairedDcName,
       dc.map_pos_x AS mapPosX,
       dc.map_pos_y AS mapPosY,
       dc.created_at AS createdAt,
       dc.updated_at AS updatedAt,
       cap.building_type AS buildingType,
       cap.redundancy_level AS redundancyLevel,
       cap.rack_total AS rackTotal,
       cap.rack_used AS rackUsed,
       cap.rack_available AS rackAvailable,
       cap.power_capacity AS powerCapacity,
       cap.ups_backup_duration AS upsBackupDuration,
       cap.generator_capacity AS generatorCapacity,
       cap.primary_isp AS primaryIsp,
       cap.secondary_isp AS secondaryIsp,
       cap.primary_bandwidth AS primaryBandwidth,
       cap.secondary_bandwidth AS secondaryBandwidth,
       inv.physical_servers AS physicalServers,
       inv.virtualization_hosts AS virtualizationHosts,
       inv.storage_arrays AS storageArrays,
       inv.network_devices AS networkDevices,
       inv.racks_occupied AS racksOccupied
     FROM data_centers dc
     LEFT JOIN data_center_capacity cap ON cap.dc_id = dc.id
     LEFT JOIN data_center_inventory inv ON inv.dc_id = dc.id
     WHERE dc.id = ?
     LIMIT 1`,
    [dcId]
  );
  const row = rows?.[0];
  if (!row) return null;

  const [connectionRows]: any = await db.query(
    `SELECT
       source_dc_id AS sourceDcId,
       target_dc_id AS targetId,
       target_name AS targetName,
       region_group AS regionGroup,
       line_variant AS lineVariant,
       line_color AS lineColor,
       line_style AS lineStyle,
       connection_type AS connectionType,
       bandwidth,
       latency_ms AS latencyMs,
       is_redundant AS redundant,
       mode,
       replication_type AS replicationType,
       replication_tool AS replicationTool,
       failover,
       rto,
       rpo
     FROM data_center_connectivity
     WHERE source_dc_id = ?
     ORDER BY target_name ASC`,
    [dcId]
  );

  return {
    ...mapDataCenterSummaryRow(row),
    nocContact: {
      phone: row.nocPhone || '',
      email: row.nocEmail || '',
    },
    emergencyContact: {
      name: row.emergencyContactName || '',
      phone: row.emergencyContactPhone || '',
      email: row.emergencyContactEmail || '',
    },
    facility: {
      buildingType: row.buildingType || '',
      redundancyLevel: row.redundancyLevel || '',
      rackCapacity: {
        total: Number(row.rackTotal || 0),
        used: Number(row.rackUsed || 0),
        available: Number(row.rackAvailable || 0),
      },
      powerCapacity: row.powerCapacity || '',
      upsBackupDuration: row.upsBackupDuration || '',
      generatorCapacity: row.generatorCapacity || '',
    },
    network: {
      ispProviders: {
        primary: row.primaryIsp || '',
        secondary: row.secondaryIsp || '',
      },
      bandwidthPerLink: {
        primary: row.primaryBandwidth || '',
        secondary: row.secondaryBandwidth || '',
      },
    },
    connectivity: (connectionRows || []).map((item: any) => ({
      sourceDcId: item.sourceDcId,
      targetId: item.targetId,
      targetName: item.targetName,
      regionGroup: item.regionGroup || '',
      lineVariant: item.lineVariant || 'general-network',
      lineColor: item.lineColor || '#2563eb',
      lineStyle: item.lineStyle || 'direct',
      connectionType: item.connectionType,
      bandwidth: item.bandwidth || '',
      latencyMs: Number(item.latencyMs || 0),
      redundant: Boolean(item.redundant),
      mode: item.mode,
      replicationType: item.replicationType,
      replicationTool: item.replicationTool || '',
      failover: item.failover,
      rto: item.rto || '',
      rpo: item.rpo || '',
    })),
    inventory: {
      physicalServers: Number(row.physicalServers || 0),
      virtualizationHosts: Number(row.virtualizationHosts || 0),
      storageArrays: Number(row.storageArrays || 0),
      networkDevices: Number(row.networkDevices || 0),
      racksOccupied: Number(row.racksOccupied || 0),
    },
    guardrails: {
      operationalCoverage: '24x7',
      operationalWorkHours: row.operationalWorkHours || '24x7',
      visitorAccessNeeded: row.visitorAccessNeeded || 'No',
      visitorDetails: {
        name: row.visitorName || '',
        phone: row.visitorPhone || '',
        officialEmail: row.visitorOfficialEmail || '',
        vendor: row.visitorVendor || '',
        visitDuration: row.visitDuration || '',
        specialInstructions: row.visitorSpecialInstructions || '',
      },
    },
  };
}

function normalizeAvailabilityStatus(value: any): 'reachable' | 'unreachable' | 'unknown' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'reachable' || normalized === 'unreachable') return normalized;
  return 'unknown';
}

async function probeRackPointDeviceReachability(target: string | null) {
  if (!target) {
    return {
      availabilityStatus: 'unknown' as const,
      availabilityMessage: 'No hostname or IP provided',
      latencyMs: null,
      checkedAt: new Date(),
    };
  }

  const trimmed = String(target || '').trim();
  if (!trimmed) {
    return {
      availabilityStatus: 'unknown' as const,
      availabilityMessage: 'No hostname or IP provided',
      latencyMs: null,
      checkedAt: new Date(),
    };
  }

  const host = trimmed.includes(':') && !trimmed.includes('://') ? trimmed.split(':')[0] : trimmed;
  const pingResult = await monitorPingTarget(host);
  return {
    availabilityStatus: pingResult.ok ? ('reachable' as const) : ('unreachable' as const),
    availabilityMessage: pingResult.message || (pingResult.ok ? 'Reachable' : 'Unreachable'),
    latencyMs: Number.isFinite(Number(pingResult.latencyMs)) ? Number(pingResult.latencyMs) : null,
    checkedAt: new Date(),
  };
}

async function refreshRackPointDeviceAvailability(device: any) {
  const target = String(device.ip || device.hostname || '').trim() || null;
  const checkedAt = device.lastAvailabilityCheckedAt ? new Date(device.lastAvailabilityCheckedAt) : null;
  const staleMs = 2 * 60 * 1000;
  if (checkedAt && Number.isFinite(checkedAt.getTime()) && (Date.now() - checkedAt.getTime()) < staleMs) {
    return {
      availabilityStatus: normalizeAvailabilityStatus(device.availabilityStatus),
      availabilityMessage: device.availabilityMessage || (device.availabilityStatus === 'reachable' ? 'Reachable' : device.availabilityStatus === 'unreachable' ? 'Unreachable' : 'Unknown'),
      latencyMs: device.lastAvailabilityLatencyMs == null ? null : Number(device.lastAvailabilityLatencyMs),
      checkedAt,
    };
  }

  const probe = await probeRackPointDeviceReachability(target);
  await pool.query(
    `UPDATE rackpoint_devices
     SET availability_status = ?,
         availability_message = ?,
         last_availability_latency_ms = ?,
         last_availability_checked_at = ?
     WHERE id = ?`,
    [probe.availabilityStatus, probe.availabilityMessage, probe.latencyMs, probe.checkedAt, device.id]
  );
  return probe;
}

async function ensureRackPointRackExists(params: {
  dcId: string;
  dcName: string;
  rackName: string;
  rackType: '42U' | '45U' | '48U';
  location: string;
  powerDraw: string | null;
  createdBy: string;
}) {
  const [rows]: any = await pool.query(
    `SELECT id, name, total_u AS totalU, rack_type AS rackType, dc_id AS dcId, dc_name AS dcName, location, power_draw AS powerDraw
     FROM rackpoint_racks
     WHERE dc_id = ? AND name = ?
     LIMIT 1`,
    [params.dcId, params.rackName]
  );
  if (rows?.length) return rows[0];

  const id = buildRackPointId('rack');
  const totalU = RACKPOINT_TYPE_TO_U[params.rackType];
  await pool.query(
    `INSERT INTO rackpoint_racks (id, name, dc_id, dc_name, rack_type, total_u, location, power_draw, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, params.rackName, params.dcId, params.dcName, params.rackType, totalU, params.location, params.powerDraw, params.createdBy]
  );
  return {
    id,
    name: params.rackName,
    totalU,
    rackType: params.rackType,
    dcId: params.dcId,
    dcName: params.dcName,
    location: params.location,
    powerDraw: params.powerDraw,
  };
}

function severityFromSyslogCode(severity: number | null): string {
  if (severity == null || !Number.isFinite(severity)) return 'info';
  if (severity <= 2) return 'critical';
  if (severity <= 4) return 'warning';
  return 'info';
}

function extractFirstOid(raw: string): string {
  const match = String(raw || '').match(/(?:\d+\.){6,}\d+/);
  return match?.[0] || 'unknown';
}

function clipText(value: any, max = 1024): string {
  return String(value || '').replace(/\0/g, '').trim().slice(0, max);
}

async function resolveSnmpDevice(sourceIp: string, hostname?: string): Promise<any | null> {
  const host = String(sourceIp || '').trim();
  const hostName = String(hostname || '').trim();
  const [rows]: any = await pool.query(
    `SELECT id, name, host, device_type
     FROM snmp_devices
     WHERE host = ? OR (? <> '' AND name = ?)
     ORDER BY updated_at DESC
     LIMIT 1`,
    [host, hostName, hostName]
  );
  return rows?.[0] || null;
}

async function insertSnmpTrapRecord(params: {
  deviceId?: string | null;
  sourceIp: string;
  trapOid: string;
  severity?: string;
  message?: string | null;
  payload?: any;
  receivedAt?: Date;
}) {
  const sourceIp = clipText(params.sourceIp, 120);
  const trapOid = clipText(params.trapOid || 'unknown', 128);
  const severity = clipText(params.severity || 'warning', 20).toLowerCase() || 'warning';
  const message = params.message ? clipText(params.message, 500) : null;
  const payloadJson = params.payload == null ? null : JSON.stringify(params.payload);
  const receivedAt = params.receivedAt || new Date();

  let deviceId = params.deviceId || null;
  if (!deviceId) {
    const device = await resolveSnmpDevice(sourceIp);
    deviceId = device?.id || null;
  }

  await pool.query(
    `INSERT INTO snmp_traps (device_id, source_ip, trap_oid, severity, message, payload_json, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [deviceId, sourceIp, trapOid, severity, message, payloadJson, receivedAt]
  );
}

function parseSyslogFrame(input: string) {
  const raw = clipText(input, 8000);
  const rfc5424 = raw.match(/^<(?<pri>\d{1,3})>\d\s+(?<ts>\S+)\s+(?<host>\S+)\s+(?<app>\S+)\s+(?<proc>\S+)\s+(?<msgid>\S+)\s+(?<sd>(?:-|\[[^\]]*\]))\s*(?<msg>.*)$/);
  if (rfc5424?.groups) {
    const pri = Number(rfc5424.groups.pri);
    const facility = Number.isFinite(pri) ? Math.floor(pri / 8) : null;
    const severity = Number.isFinite(pri) ? pri % 8 : null;
    return {
      hostname: clipText(rfc5424.groups.host, 255) || null,
      appName: clipText(rfc5424.groups.app, 120) || null,
      facility,
      severity,
      severityLabel: severityFromSyslogCode(severity),
      message: clipText(rfc5424.groups.msg, 1024) || raw,
      rawMessage: raw,
      receivedAt: new Date(),
    };
  }

  const rfc3164 = raw.match(/^<(?<pri>\d{1,3})>(?<rest>.*)$/);
  if (rfc3164?.groups) {
    const pri = Number(rfc3164.groups.pri);
    const facility = Number.isFinite(pri) ? Math.floor(pri / 8) : null;
    const severity = Number.isFinite(pri) ? pri % 8 : null;
    const rest = clipText(rfc3164.groups.rest, 2000);
    const hostMatch = rest.match(/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d\d:\d\d:\d\d\s+(?<host>\S+)\s+(?<tail>.*)$/);
    const host = hostMatch?.groups?.host || null;
    const tail = hostMatch?.groups?.tail || rest;
    const appMatch = tail.match(/^(?<app>[\w.-]+)(?:\[\d+\])?:\s*(?<msg>.*)$/);
    return {
      hostname: host ? clipText(host, 255) : null,
      appName: appMatch?.groups?.app ? clipText(appMatch.groups.app, 120) : null,
      facility,
      severity,
      severityLabel: severityFromSyslogCode(severity),
      message: clipText(appMatch?.groups?.msg || tail, 1024) || rest,
      rawMessage: raw,
      receivedAt: new Date(),
    };
  }

  return {
    hostname: null,
    appName: null,
    facility: null,
    severity: null,
    severityLabel: 'info',
    message: clipText(raw, 1024),
    rawMessage: raw,
    receivedAt: new Date(),
  };
}

async function insertSyslogRecord(params: {
  sourceIp: string;
  hostname?: string | null;
  appName?: string | null;
  facility?: number | null;
  severity?: number | null;
  severityLabel?: string | null;
  message: string;
  rawMessage?: string | null;
  payload?: any;
  receivedAt?: Date;
}) {
  const sourceIp = clipText(params.sourceIp, 120);
  const hostname = params.hostname ? clipText(params.hostname, 255) : null;
  const appName = params.appName ? clipText(params.appName, 120) : null;
  const facility = params.facility == null ? null : Number(params.facility);
  const severity = params.severity == null ? null : Number(params.severity);
  const severityLabel = clipText(params.severityLabel || severityFromSyslogCode(severity), 20);
  const message = clipText(params.message, 1024);
  const rawMessage = params.rawMessage ? clipText(params.rawMessage, 8000) : null;
  const payloadJson = params.payload == null ? null : JSON.stringify(params.payload);
  const receivedAt = params.receivedAt || new Date();

  const device = await resolveSnmpDevice(sourceIp, hostname || undefined);
  const deviceId = device?.id || null;

  await pool.query(
    `INSERT INTO syslog_events (
       device_id, source_ip, hostname, app_name, facility, severity, severity_label,
       message, raw_message, payload_json, received_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      deviceId,
      sourceIp,
      hostname,
      appName,
      facility,
      severity,
      severityLabel,
      message,
      rawMessage,
      payloadJson,
      receivedAt,
    ]
  );
}

let snmpTrapSocket: dgram.Socket | null = null;
let syslogUdpSocket: dgram.Socket | null = null;
let syslogTcpServer: net.Server | null = null;

function startSnmpTrapListener() {
  if (!SNMP_TRAP_ENABLED || snmpTrapSocket) return;
  const sock = dgram.createSocket('udp4');
  snmpTrapSocket = sock;

  sock.on('message', async (msg, rinfo) => {
    try {
      const raw = msg.toString('utf8');
      await insertSnmpTrapRecord({
        sourceIp: rinfo.address,
        trapOid: extractFirstOid(raw),
        severity: 'warning',
        message: clipText(raw, 500),
        payload: { raw, bytes: msg.length, listener: 'udp-native' },
      });
    } catch (err) {
      console.warn('SNMP trap listener insert failed:', shortError(err));
    }
  });

  sock.on('error', (err) => {
    console.warn('SNMP trap listener error:', shortError(err));
  });

  sock.bind(SNMP_TRAP_PORT, SNMP_TRAP_BIND_HOST, () => {
    console.log(`SNMP trap UDP listener active on ${SNMP_TRAP_BIND_HOST}:${SNMP_TRAP_PORT}`);
  });
}

function startSyslogListeners() {
  if (!SYSLOG_ENABLED) return;

  if (!syslogUdpSocket) {
    const udp = dgram.createSocket('udp4');
    syslogUdpSocket = udp;
    udp.on('message', async (msg, rinfo) => {
      try {
        const parsed = parseSyslogFrame(msg.toString('utf8'));
        await insertSyslogRecord({
          sourceIp: rinfo.address,
          hostname: parsed.hostname,
          appName: parsed.appName,
          facility: parsed.facility,
          severity: parsed.severity,
          severityLabel: parsed.severityLabel,
          message: parsed.message,
          rawMessage: parsed.rawMessage,
          payload: { listener: 'udp-native' },
          receivedAt: parsed.receivedAt,
        });
      } catch (err) {
        console.warn('Syslog UDP insert failed:', shortError(err));
      }
    });
    udp.on('error', (err) => console.warn('Syslog UDP listener error:', shortError(err)));
    udp.bind(SYSLOG_UDP_PORT, SYSLOG_BIND_HOST, () => {
      console.log(`Syslog UDP listener active on ${SYSLOG_BIND_HOST}:${SYSLOG_UDP_PORT}`);
    });
  }

  if (!syslogTcpServer) {
    const tcp = net.createServer((socket) => {
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop() || '';
        for (const line of parts) {
          const frame = line.trim();
          if (!frame) continue;
          const parsed = parseSyslogFrame(frame);
          insertSyslogRecord({
            sourceIp: socket.remoteAddress?.replace('::ffff:', '') || 'unknown',
            hostname: parsed.hostname,
            appName: parsed.appName,
            facility: parsed.facility,
            severity: parsed.severity,
            severityLabel: parsed.severityLabel,
            message: parsed.message,
            rawMessage: parsed.rawMessage,
            payload: { listener: 'tcp-native' },
            receivedAt: parsed.receivedAt,
          }).catch((err) => {
            console.warn('Syslog TCP insert failed:', shortError(err));
          });
        }
      });
    });
    syslogTcpServer = tcp;
    tcp.on('error', (err) => console.warn('Syslog TCP listener error:', shortError(err)));
    tcp.listen(SYSLOG_TCP_PORT, SYSLOG_BIND_HOST, () => {
      console.log(`Syslog TCP listener active on ${SYSLOG_BIND_HOST}:${SYSLOG_TCP_PORT}`);
    });
  }
}

function normalizeSnmpVersion(value: any): SnmpVersion {
  const v = String(value || '').trim().toLowerCase();
  return v === '3' || v === 'v3' || v === 'snmpv3' ? '3' : '2c';
}

function normalizeVendor(value: any): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeDeviceType(value: any): string {
  const t = String(value || '').trim().toLowerCase();
  if (!t) return 'Switch';
  return t[0].toUpperCase() + t.slice(1);
}

function isSnmpEligibleAsset(parentType: any): boolean {
  const p = String(parentType || '').trim().toLowerCase();
  return p === 'switch' || p === 'storage' || p === 'appliance';
}

function parseSnmpEndpoint(targetEndpoint: string, fallbackPort = 161) {
  const trimmed = String(targetEndpoint || '').trim();
  if (!trimmed) return { host: '', port: fallbackPort };
  const [hostPart, portPart] = trimmed.split(':');
  const host = String(hostPart || '').trim();
  const port = portPart && Number.isFinite(Number(portPart)) ? Number(portPart) : fallbackPort;
  return { host, port };
}

async function upsertSnmpDeviceFromAsset(asset: any, snmpConfig: any = {}) {
  if (!isSnmpEligibleAsset(asset?.parent_type)) return;

  const target = String(asset?.target_endpoint || '').trim();
  const { host, port } = parseSnmpEndpoint(target, Number(snmpConfig?.port || 161));
  if (!host) return;

  const deviceId = `SNMP-${String(asset.id || Date.now())}`;
  const snmpVersion = normalizeSnmpVersion(snmpConfig?.version);
  const vendor = String(asset?.sub_type || snmpConfig?.vendor || '').trim() || null;
  const retentionHours = Number(snmpConfig?.retentionHours || SNMP_DEFAULT_RETENTION_HOURS);
  const pollIntervalSec = Math.max(30, Number(snmpConfig?.pollIntervalSec || 60));
  const enabled = snmpConfig?.enabled == null ? 1 : Number(snmpConfig.enabled ? 1 : 0);

  await pool.query(
    `INSERT INTO snmp_devices (
       id, asset_id, name, vendor, device_type, host, port, snmp_version,
       community, sec_username, auth_protocol, auth_key, priv_protocol, priv_key,
       context_name, enabled, poll_interval_sec, retention_hours, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unknown')
     ON DUPLICATE KEY UPDATE
       asset_id = VALUES(asset_id),
       name = VALUES(name),
       vendor = VALUES(vendor),
       device_type = VALUES(device_type),
       snmp_version = VALUES(snmp_version),
       community = VALUES(community),
       sec_username = VALUES(sec_username),
       auth_protocol = VALUES(auth_protocol),
       auth_key = VALUES(auth_key),
       priv_protocol = VALUES(priv_protocol),
       priv_key = VALUES(priv_key),
       context_name = VALUES(context_name),
       enabled = VALUES(enabled),
       poll_interval_sec = VALUES(poll_interval_sec),
       retention_hours = VALUES(retention_hours)`,
    [
      deviceId,
      asset.id,
      String(asset?.name || host),
      vendor,
      normalizeDeviceType(asset?.parent_type),
      host,
      port,
      snmpVersion,
      snmpVersion === '2c' ? String(snmpConfig?.community || process.env.SNMP_COMMUNITY || 'public') : null,
      snmpVersion === '3' ? String(snmpConfig?.username || '') || null : null,
      snmpVersion === '3' ? String(snmpConfig?.authProtocol || 'SHA') : null,
      snmpVersion === '3' ? String(snmpConfig?.authKey || '') || null : null,
      snmpVersion === '3' ? String(snmpConfig?.privProtocol || 'AES') : null,
      snmpVersion === '3' ? String(snmpConfig?.privKey || '') || null : null,
      snmpVersion === '3' ? String(snmpConfig?.contextName || '') || null : null,
      enabled,
      pollIntervalSec,
      retentionHours,
    ]
  );
}

function parseSnmpGetOutput(stdout: string): string | null {
  const raw = String(stdout || '').trim();
  if (!raw) return null;
  const idx = raw.indexOf('=');
  if (idx >= 0) return raw.slice(idx + 1).trim().replace(/^STRING:\s*/i, '').replace(/^INTEGER:\s*/i, '').trim();
  return raw;
}

async function querySnmpOid(device: any, oid: string): Promise<{ ok: boolean; value?: string; error?: string }> {
  const host = String(device.host || '').trim();
  const port = Number(device.port || 161);
  const target = `${host}:${port}`;
  const version = normalizeSnmpVersion(device.snmp_version);

  const baseArgs = ['-Oqv'];
  if (version === '2c') {
    baseArgs.push('-v2c', '-c', String(device.community || process.env.SNMP_COMMUNITY || 'public'), target, oid);
  } else {
    const secUsername = String(device.sec_username || '').trim();
    const authKey = String(device.auth_key || '').trim();
    const privKey = String(device.priv_key || '').trim();
    const level = authKey && privKey ? 'authPriv' : authKey ? 'authNoPriv' : 'noAuthNoPriv';
    baseArgs.push('-v3', '-l', level, '-u', secUsername || 'snmpuser');
    if (authKey) {
      baseArgs.push('-a', String(device.auth_protocol || 'SHA'), '-A', authKey);
    }
    if (privKey) {
      baseArgs.push('-x', String(device.priv_protocol || 'AES'), '-X', privKey);
    }
    if (device.context_name) {
      baseArgs.push('-n', String(device.context_name));
    }
    baseArgs.push(target, oid);
  }

  try {
    const { stdout } = await execFileAsync('snmpget', baseArgs, { timeout: SNMP_POLL_TIMEOUT_MS });
    const value = parseSnmpGetOutput(stdout);
    if (value == null) {
      return { ok: false, error: 'empty snmp response' };
    }
    return { ok: true, value };
  } catch (err: any) {
    const message = String(err?.message || err?.stderr || 'snmpget failed').slice(0, 300);
    return { ok: false, error: message };
  }
}

async function ingestSnmpPoll(device: any) {
  const vendor = normalizeVendor(device.vendor);
  const metricDefs = SNMP_VENDOR_METRICS[vendor] || SNMP_VENDOR_METRICS.default;
  let okCount = 0;
  let failCount = 0;
  let lastError: string | null = null;

  for (const metric of metricDefs) {
    const result = await querySnmpOid(device, metric.oid);
    if (result.ok) {
      okCount += 1;
      const textValue = String(result.value || '').trim();
      const numeric = Number(textValue);
      await pool.query(
        `INSERT INTO snmp_telemetry_samples (device_id, metric_key, metric_value_num, metric_value_text, unit, oid, severity, sample_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          device.id,
          metric.key,
          Number.isFinite(numeric) ? numeric : null,
          textValue || null,
          metric.unit || null,
          metric.oid,
          'info',
        ]
      );
    } else {
      failCount += 1;
      lastError = result.error || 'snmpget failed';
    }
  }

  const status = okCount > 0 && failCount === 0 ? 'Up' : okCount > 0 ? 'Degraded' : 'Down';
  await pool.query(
    `UPDATE snmp_devices
     SET status = ?, last_polled_at = NOW(), last_error = ?
     WHERE id = ?`,
    [status, lastError, device.id]
  );

  if (status !== 'Up') {
    await upsertTicketWithOptionalIncident({
      agentId: device.id,
      hostname: device.name || device.host || device.id,
      metricType: 'snmp_availability',
      resourceKey: device.id,
      currentValue: 100,
      severity: status === 'Down' ? 'P1' : 'P2',
      description: `SNMP polling for ${device.name || device.host || device.id} is ${status}. ${lastError || ''}`.trim(),
      incidentTrigger: 'down-or-unreachable',
    });
  } else {
    await resolveTicket(device.id, 'snmp_availability', device.id);
  }
}

async function cleanupSnmpRetention() {
  const retentionHours = SNMP_DEFAULT_RETENTION_HOURS;
  await pool.query(
    `DELETE s
     FROM snmp_telemetry_samples s
     INNER JOIN snmp_devices d ON d.id = s.device_id
     WHERE s.sample_time < UTC_TIMESTAMP() - INTERVAL d.retention_hours HOUR`
  );
  await pool.query(
    `DELETE FROM snmp_telemetry_samples
     WHERE sample_time < UTC_TIMESTAMP() - INTERVAL ? HOUR`,
    [retentionHours]
  );
  await pool.query(
    `DELETE FROM snmp_traps
     WHERE received_at < UTC_TIMESTAMP() - INTERVAL ? HOUR`,
    [retentionHours]
  );
  await pool.query(
    `DELETE FROM syslog_events
     WHERE received_at < UTC_TIMESTAMP() - INTERVAL ? HOUR`,
    [SYSLOG_RETENTION_HOURS]
  );
}

async function runSnmpPollingCycle() {
  const [devices]: any = await pool.query(
    `SELECT * FROM snmp_devices
     WHERE enabled = 1
       AND (
         last_polled_at IS NULL
         OR TIMESTAMPDIFF(SECOND, last_polled_at, UTC_TIMESTAMP()) >= poll_interval_sec
       )
     ORDER BY updated_at ASC
     LIMIT 100`
  );

  await Promise.allSettled((devices || []).map((device: any) => ingestSnmpPoll(device)));
  await cleanupSnmpRetention();
}

function parsePayload(value: any) {
  if (!value) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value;
}

function toFiniteNumber(value: any, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const n = Number(value.replace('%', '').trim());
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function firstFinite(...values: any[]): number | null {
  for (const value of values) {
    const n = toFiniteNumber(value, Number.NaN);
    if (Number.isFinite(n)) return Number(n);
  }
  return null;
}

function extractDiskUsageRows(payload: any): any[] {
  if (Array.isArray(payload?.disk?.usage)) return payload.disk.usage;
  if (Array.isArray(payload?.disks)) return payload.disks;
  return [];
}

function readDiskUsedPercent(disk: any): number {
  return toFiniteNumber(
    disk?.usedPct ??
    disk?.usedPercent ??
    disk?.used_percentage ??
    disk?.usagePct,
    0
  );
}

function boolish(v: any): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'up' || s === 'ok' || s === 'running';
}

function deriveInfraStatus(payload: any, freshnessMinutes: number, explicitHealthStatus?: any): 'Down' | 'Healthy' | 'Warning' | 'Faulty' {
  if (!payload || !Number.isFinite(freshnessMinutes) || freshnessMinutes > 10) return 'Down';

  const uptimeSec = toFiniteNumber(payload?.uptimeSeconds ?? payload?.system?.uptimeSeconds, 0);
  const alive = payload?.alive || {};
  const aliveOk = alive?.isAlive == null ? uptimeSec > 0 || boolish(explicitHealthStatus) : boolish(alive.isAlive);
  const networkOk = alive?.networkOk == null ? true : boolish(alive.networkOk);
  const state = String(alive?.systemState || '').toLowerCase();

  const cpu = toFiniteNumber(
    payload?.cpu?.usagePct ?? payload?.cpu?.usagePercent ?? payload?.performance?.cpuUsagePercent,
    0
  );
  const mem = toFiniteNumber(
    payload?.memory?.usedPct ?? payload?.memory?.usedPercent ?? payload?.performance?.memoryUsedPercent,
    0
  );
  const disks = extractDiskUsageRows(payload);
  const diskPct = disks.reduce((mx: number, d: any) => Math.max(mx, readDiskUsedPercent(d)), 0);

  const healthOverall = String(explicitHealthStatus || payload?.health?.overall || '').toLowerCase();
  const smartRaw = `${String(payload?.smartRaw || '')} ${disks.map((d: any) => String(d?.smart || d?.health || '')).join(' ')}`.toLowerCase();
  const hwFault = boolish(alive?.hardwareFault) || /failed|prefail|critical/.test(smartRaw);

  if (!aliveOk || !networkOk || state === 'stopped' || state === 'offline' || state === 'down' || uptimeSec <= 0) {
    return 'Down';
  }
  if (healthOverall === 'critical' || healthOverall === 'error' || hwFault || boolish(alive?.criticalIssue)) {
    return 'Faulty';
  }
  if (healthOverall === 'warning' || cpu >= 85 || mem >= 85 || diskPct >= 90) {
    return 'Warning';
  }
  return 'Healthy';
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
  const [rows]: any = await pool.query(
    `SELECT ticket_id
     FROM investigate_tickets
     WHERE agent_id = ? AND metric_type = ? AND resource_key = ? AND status = 'Open'`,
    [agentId, metricType, resourceKey]
  );

  await pool.query(
    `UPDATE investigate_tickets
     SET status = 'Resolved', ticket_state = 'Resolved', resolved_at = NOW(), updated_at = NOW()
     WHERE agent_id = ? AND metric_type = ? AND resource_key = ? AND status = 'Open'`,
    [agentId, metricType, resourceKey]
  );

  for (const row of rows || []) {
    await appendInvestigateTicketActivity({
      ticketId: String(row.ticket_id),
      noteText: 'Ticket automatically resolved after the monitored condition returned to normal.',
      ticketState: 'Resolved',
      actorUsername: 'system',
      actorRole: 'system',
      noteSource: 'system',
    });
  }
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
  if (asset.status === 'MM') return;
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
    await runSnmpPollingCycle();
    await cleanupPortalAuditRetention();
  } catch (err) {
    console.error('Monitoring cycle error:', err);
  }
}

// Run immediately on startup, then every 60 seconds
Promise.allSettled([
  ensureSnowIncidentTable(),
  ensurePortalAuditTable(),
  ensurePortalRuntimeSnapshotsTable(),
  ensureInvestigateTicketWorkflowTables(),
  ensureDiagnosticsSnapshotTable(),
  ensureDiagnosticsAlertTables(),
  ensureAgentIdentityColumns(),
  ensureDatabaseMonitorColumns(),
  ensureAssetCategoryColumn(),
  ensureSettingsTable(),
  ensureUsersTable(),
  ensureUserFeedbackTable(),
  ensureStatusPagesTable(),
  ensureStatusNotificationsTable(),
  ensureMaintenanceWindowsTable(),
  ensureSnmpTables(),
  ensureRackPointTables(),
  ensureDataCenterTables(),
])
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
// DATA CENTER CRUD ENDPOINTS
// ─────────────────────────────────────────────────────

app.get('/api/datacenters', async (req, res) => {
  const actor = requireAuthenticatedUser(req, res);
  if (!actor) return;

  try {
    res.json(await getDataCenterSummaryRows());
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return res.json([]);
    res.status(500).json({ error: err.message || 'Failed to load data centers' });
  }
});

app.get('/api/datacenters/continuity-map', async (req, res) => {
  const actor = requireAuthenticatedUser(req, res);
  if (!actor) return;

  try {
    const nodes = await getDataCenterSummaryRows();
    const [connections]: any = await pool.query(
      `SELECT
         source_dc_id AS sourceDcId,
         target_dc_id AS targetId,
         target_name AS targetName,
         region_group AS regionGroup,
        line_variant AS lineVariant,
        line_color AS lineColor,
        line_style AS lineStyle,
         connection_type AS connectionType,
         bandwidth,
         latency_ms AS latencyMs,
         is_redundant AS redundant,
         mode,
         replication_type AS replicationType,
         replication_tool AS replicationTool,
         failover,
         rto,
         rpo
       FROM data_center_connectivity
       ORDER BY source_dc_id ASC, target_name ASC`
    );
    res.json({
      nodes,
      connections: (connections || []).map((row: any) => ({
        sourceDcId: row.sourceDcId,
        targetId: row.targetId,
        targetName: row.targetName,
        regionGroup: row.regionGroup || '',
        lineVariant: row.lineVariant || 'general-network',
        lineColor: row.lineColor || '#2563eb',
        lineStyle: row.lineStyle || 'direct',
        connectionType: row.connectionType,
        bandwidth: row.bandwidth || '',
        latencyMs: Number(row.latencyMs || 0),
        redundant: Boolean(row.redundant),
        mode: row.mode,
        replicationType: row.replicationType,
        replicationTool: row.replicationTool || '',
        failover: row.failover,
        rto: row.rto || '',
        rpo: row.rpo || '',
      })),
    });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return res.json({ nodes: [], connections: [] });
    res.status(500).json({ error: err.message || 'Failed to load continuity map' });
  }
});

app.put('/api/datacenters/continuity-map', async (req, res) => {
  const actor = requireAdminUser(req, res);
  if (!actor) return;

  const connection = await pool.getConnection();
  try {
    const nodes = Array.isArray(req.body?.nodes) ? req.body.nodes : [];
    const links = Array.isArray(req.body?.connections) ? req.body.connections : [];

    await connection.beginTransaction();

    for (const [index, node] of nodes.entries()) {
      const id = requiredString(node.id);
      if (!id) {
        throw new Error(`Node at index ${index + 1} is missing an id.`);
      }
      await connection.query(
        `UPDATE data_centers SET map_pos_x = ?, map_pos_y = ? WHERE id = ?`,
        [clampMapPosition(node.mapPosX, 50), clampMapPosition(node.mapPosY, 50), id]
      );
    }

    await connection.query(`DELETE FROM data_center_connectivity`);
    await connection.query(`UPDATE data_centers SET paired_dc_id = NULL, paired_dc_name = NULL`);

    const pairedBySource = new Map<string, { targetId: string | null; targetName: string }>();
    for (const [index, item] of links.entries()) {
      const sourceDcId = requiredString(item.sourceDcId);
      const targetId = optionalString(item.targetId);
      const targetName = requiredString(item.targetName);
      const regionGroup = requiredString(item.regionGroup);
      const lineVariant = normalizeContinuityLineVariant(item.lineVariant);
      const lineStyle = normalizeContinuityLineStyle(item.lineStyle);
      const connectionType = normalizeConnectionType(item.connectionType);
      const mode = normalizeConnectivityMode(item.mode);
      const replicationType = normalizeReplicationType(item.replicationType);
      const failover = normalizeFailoverType(item.failover);
      if (!sourceDcId || !targetName || !lineVariant || !lineStyle || !connectionType || !mode || !replicationType || !failover) {
        throw new Error(`Connection at index ${index + 1} is missing required values.`);
      }

      await connection.query(
        `INSERT INTO data_center_connectivity (
           source_dc_id, target_dc_id, target_name, region_group, line_variant, line_color, line_style, connection_type, bandwidth, latency_ms,
           is_redundant, mode, replication_type, replication_tool, failover, rto, rpo
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sourceDcId,
          targetId,
          targetName,
          regionGroup,
          lineVariant,
          normalizeContinuityLineColor(item.lineColor),
          lineStyle,
          connectionType,
          optionalString(item.bandwidth),
          nonNegativeInt(item.latencyMs),
          item.redundant ? 1 : 0,
          mode,
          replicationType,
          optionalString(item.replicationTool),
          failover,
          optionalString(item.rto),
          optionalString(item.rpo),
        ]
      );

      if (!pairedBySource.has(sourceDcId)) {
        pairedBySource.set(sourceDcId, { targetId, targetName });
      }
    }

    for (const [sourceDcId, pair] of pairedBySource.entries()) {
      await connection.query(
        `UPDATE data_centers SET paired_dc_id = ?, paired_dc_name = ? WHERE id = ?`,
        [pair.targetId, pair.targetName, sourceDcId]
      );
    }

    await connection.commit();

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'datacenter-save-continuity-map',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'data_center_continuity_map',
      targetId: 'global',
      message: `Saved continuity map for ${nodes.length} data centers`,
      details: { nodes: nodes.length, connections: links.length },
    });

    res.json({ ok: true });
  } catch (err: any) {
    await connection.rollback();
    res.status(500).json({ error: err.message || 'Failed to save continuity map' });
  } finally {
    connection.release();
  }
});

app.get('/api/datacenters/:id', async (req, res) => {
  const actor = requireAuthenticatedUser(req, res);
  if (!actor) return;

  try {
    const detail = await getDataCenterDetail(String(req.params.id || '').trim());
    if (!detail) return res.status(404).json({ error: 'Data center not found' });
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load data center details' });
  }
});

app.post('/api/datacenters', async (req, res) => {
  const actor = requireDeviceOperator(req, res);
  if (!actor) return;

  const connection = await pool.getConnection();
  try {
    const body = req.body || {};
    const name = requiredString(body.name);
    const dcCode = requiredString(body.dcCode);
    const type = normalizeDataCenterType(body.type);
    const dcRole = normalizeDcRole(body.dcRole);
    const region = requiredString(body.region);
    const regionGroup = requiredString(body.regionGroup);
    const country = requiredString(body.country);
    const city = requiredString(body.city);
    const address = requiredString(body.address);
    const exactAddress = optionalString(body.exactAddress);
    const ownerCompany = requiredString(body.ownerCompany);
    const businessUnit = optionalString(body.businessUnit);
    const vendorProvider = requiredString(body.vendorProvider);
    const contactPerson = requiredString(body.contactPerson);
    const contactEmail = requiredString(body.contactEmail);
    const contactPhone = optionalString(body.contactPhone);
    const nocPhone = requiredString(body.nocPhone);
    const nocEmail = requiredString(body.nocEmail);
    const operationalWorkHours = normalizeOperationalWorkHours(body.operationalWorkHours);
    const visitorAccessNeeded = normalizeYesNo(body.visitorAccessNeeded);
    const visitorName = visitorAccessNeeded === 'Yes' ? optionalString(body.visitorName) : null;
    const visitorPhone = visitorAccessNeeded === 'Yes' ? optionalString(body.visitorPhone) : null;
    const visitorEmail = visitorAccessNeeded === 'Yes' ? optionalString(body.visitorEmail) : null;
    const visitorVendor = visitorAccessNeeded === 'Yes' ? optionalString(body.visitorVendor) : null;
    const visitDuration = visitorAccessNeeded === 'Yes' ? optionalString(body.visitDuration) : null;
    const specialInstructions = visitorAccessNeeded === 'Yes' ? optionalString(body.specialInstructions) : null;
    const emergencyContactName = optionalString(body.emergencyContactName);
    const emergencyContactPhone = requiredString(body.emergencyContactPhone);
    const emergencyContactEmail = optionalString(body.emergencyContactEmail);

    if (!name || !dcCode || !type || !dcRole || !region || !country || !city || !address || !ownerCompany || !vendorProvider || !contactPerson || !contactEmail || !nocPhone || !nocEmail || !emergencyContactPhone) {
      return res.status(400).json({ error: 'Missing required data center fields.' });
    }
    if (visitorAccessNeeded === 'Yes' && (!visitorName || !visitorPhone || !visitorEmail || !visitorVendor || !visitDuration)) {
      return res.status(400).json({ error: 'Visitor details are required when site access is needed.' });
    }

    const id = buildDataCenterId();

    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO data_centers (
         id, dc_code, name, type, dc_role, region, region_group, country, city, address, exact_address,
         owner_company, business_unit, vendor_provider, contact_person, contact_email, contact_phone,
         noc_phone, noc_email, operational_work_hours, visitor_access_required, visitor_name, visitor_phone,
         visitor_official_email, visitor_vendor, visit_duration, visitor_special_instructions,
         emergency_contact_name, emergency_contact_phone, emergency_contact_email, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, dcCode, name, type, dcRole, region, regionGroup || null, country, city, address, exactAddress,
        ownerCompany, businessUnit, vendorProvider, contactPerson, contactEmail, contactPhone,
        nocPhone, nocEmail, operationalWorkHours, visitorAccessNeeded, visitorName, visitorPhone,
        visitorEmail, visitorVendor, visitDuration, specialInstructions,
        emergencyContactName, emergencyContactPhone, emergencyContactEmail, actor.username,
      ]
    );

    await connection.query(
      `INSERT INTO data_center_capacity (
         dc_id, building_type, redundancy_level, rack_total, rack_used, rack_available, power_capacity,
         ups_backup_duration, generator_capacity, primary_isp, secondary_isp, primary_bandwidth, secondary_bandwidth
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        optionalString(body.buildingType),
        optionalString(body.redundancyLevel),
        nonNegativeInt(body.rackTotal),
        nonNegativeInt(body.rackUsed),
        nonNegativeInt(body.rackAvailable),
        optionalString(body.powerCapacity),
        optionalString(body.upsBackupDuration),
        optionalString(body.generatorCapacity),
        optionalString(body.ispPrimary),
        optionalString(body.ispSecondary),
        optionalString(body.bandwidthPrimary),
        optionalString(body.bandwidthSecondary),
      ]
    );

    await connection.query(
      `INSERT INTO data_center_inventory (
         dc_id, physical_servers, virtualization_hosts, storage_arrays, network_devices, racks_occupied
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        nonNegativeInt(body.physicalServers),
        nonNegativeInt(body.virtualizationHosts),
        nonNegativeInt(body.storageArrays),
        nonNegativeInt(body.networkDevices),
        nonNegativeInt(body.racksOccupied),
      ]
    );

    await connection.commit();

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'datacenter-create',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'data_center',
      targetId: id,
      message: `Created data center ${name}`,
      details: { dcCode, type, dcRole, city, country },
    });

    const detail = await getDataCenterDetail(id);
    res.status(201).json(detail);
  } catch (err: any) {
    await connection.rollback();
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A data center with this DC code already exists.' });
    }
    res.status(500).json({ error: err.message || 'Failed to create data center' });
  } finally {
    connection.release();
  }
});

app.put('/api/datacenters/:id', async (req, res) => {
  const actor = requireDeviceOperator(req, res);
  if (!actor) return;

  const dcId = String(req.params.id || '').trim();
  const connection = await pool.getConnection();
  try {
    const body = req.body || {};
    const name = requiredString(body.name);
    const dcCode = requiredString(body.dcCode);
    const type = normalizeDataCenterType(body.type);
    const dcRole = normalizeDcRole(body.dcRole);
    const region = requiredString(body.region);
    const regionGroup = requiredString(body.regionGroup);
    const country = requiredString(body.country);
    const city = requiredString(body.city);
    const address = requiredString(body.address);
    const exactAddress = optionalString(body.exactAddress);
    const ownerCompany = requiredString(body.ownerCompany);
    const businessUnit = optionalString(body.businessUnit);
    const vendorProvider = requiredString(body.vendorProvider);
    const contactPerson = requiredString(body.contactPerson);
    const contactEmail = requiredString(body.contactEmail);
    const contactPhone = optionalString(body.contactPhone);
    const nocPhone = requiredString(body.nocPhone);
    const nocEmail = requiredString(body.nocEmail);
    const operationalWorkHours = normalizeOperationalWorkHours(body.operationalWorkHours);
    const visitorAccessNeeded = normalizeYesNo(body.visitorAccessNeeded);
    const visitorName = visitorAccessNeeded === 'Yes' ? optionalString(body.visitorName) : null;
    const visitorPhone = visitorAccessNeeded === 'Yes' ? optionalString(body.visitorPhone) : null;
    const visitorEmail = visitorAccessNeeded === 'Yes' ? optionalString(body.visitorEmail) : null;
    const visitorVendor = visitorAccessNeeded === 'Yes' ? optionalString(body.visitorVendor) : null;
    const visitDuration = visitorAccessNeeded === 'Yes' ? optionalString(body.visitDuration) : null;
    const specialInstructions = visitorAccessNeeded === 'Yes' ? optionalString(body.specialInstructions) : null;
    const emergencyContactName = optionalString(body.emergencyContactName);
    const emergencyContactPhone = requiredString(body.emergencyContactPhone);
    const emergencyContactEmail = optionalString(body.emergencyContactEmail);

    if (!dcId || !name || !dcCode || !type || !dcRole || !region || !country || !city || !address || !ownerCompany || !vendorProvider || !contactPerson || !contactEmail || !nocPhone || !nocEmail || !emergencyContactPhone) {
      return res.status(400).json({ error: 'Missing required data center fields.' });
    }
    if (visitorAccessNeeded === 'Yes' && (!visitorName || !visitorPhone || !visitorEmail || !visitorVendor || !visitDuration)) {
      return res.status(400).json({ error: 'Visitor details are required when site access is needed.' });
    }

    await connection.beginTransaction();
    const [existingRows]: any = await connection.query(`SELECT id FROM data_centers WHERE id = ? LIMIT 1`, [dcId]);
    if (!existingRows?.[0]) {
      await connection.rollback();
      return res.status(404).json({ error: 'Data center not found' });
    }

    await connection.query(
      `UPDATE data_centers
       SET dc_code = ?, name = ?, type = ?, dc_role = ?, region = ?, region_group = ?, country = ?, city = ?,
           address = ?, exact_address = ?, owner_company = ?, business_unit = ?, vendor_provider = ?,
           contact_person = ?, contact_email = ?, contact_phone = ?, noc_phone = ?, noc_email = ?,
           operational_work_hours = ?, visitor_access_required = ?, visitor_name = ?, visitor_phone = ?,
           visitor_official_email = ?, visitor_vendor = ?, visit_duration = ?, visitor_special_instructions = ?,
           emergency_contact_name = ?, emergency_contact_phone = ?, emergency_contact_email = ?
       WHERE id = ?`,
      [
        dcCode, name, type, dcRole, region, regionGroup || null, country, city,
        address, exactAddress, ownerCompany, businessUnit, vendorProvider,
        contactPerson, contactEmail, contactPhone, nocPhone, nocEmail,
        operationalWorkHours, visitorAccessNeeded, visitorName, visitorPhone,
        visitorEmail, visitorVendor, visitDuration, specialInstructions,
        emergencyContactName, emergencyContactPhone, emergencyContactEmail, dcId,
      ]
    );

    await connection.query(
      `INSERT INTO data_center_capacity (
         dc_id, building_type, redundancy_level, rack_total, rack_used, rack_available, power_capacity,
         ups_backup_duration, generator_capacity, primary_isp, secondary_isp, primary_bandwidth, secondary_bandwidth
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         building_type = VALUES(building_type),
         redundancy_level = VALUES(redundancy_level),
         rack_total = VALUES(rack_total),
         rack_used = VALUES(rack_used),
         rack_available = VALUES(rack_available),
         power_capacity = VALUES(power_capacity),
         ups_backup_duration = VALUES(ups_backup_duration),
         generator_capacity = VALUES(generator_capacity),
         primary_isp = VALUES(primary_isp),
         secondary_isp = VALUES(secondary_isp),
         primary_bandwidth = VALUES(primary_bandwidth),
         secondary_bandwidth = VALUES(secondary_bandwidth)`,
      [
        dcId,
        optionalString(body.buildingType),
        optionalString(body.redundancyLevel),
        nonNegativeInt(body.rackTotal),
        nonNegativeInt(body.rackUsed),
        nonNegativeInt(body.rackAvailable),
        optionalString(body.powerCapacity),
        optionalString(body.upsBackupDuration),
        optionalString(body.generatorCapacity),
        optionalString(body.ispPrimary),
        optionalString(body.ispSecondary),
        optionalString(body.bandwidthPrimary),
        optionalString(body.bandwidthSecondary),
      ]
    );

    await connection.query(
      `INSERT INTO data_center_inventory (
         dc_id, physical_servers, virtualization_hosts, storage_arrays, network_devices, racks_occupied
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         physical_servers = VALUES(physical_servers),
         virtualization_hosts = VALUES(virtualization_hosts),
         storage_arrays = VALUES(storage_arrays),
         network_devices = VALUES(network_devices),
         racks_occupied = VALUES(racks_occupied)`,
      [
        dcId,
        nonNegativeInt(body.physicalServers),
        nonNegativeInt(body.virtualizationHosts),
        nonNegativeInt(body.storageArrays),
        nonNegativeInt(body.networkDevices),
        nonNegativeInt(body.racksOccupied),
      ]
    );

    await connection.commit();

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'datacenter-update',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'data_center',
      targetId: dcId,
      message: `Updated data center ${name}`,
      details: { dcCode, type, dcRole, city, country },
    });

    const detail = await getDataCenterDetail(dcId);
    res.json(detail);
  } catch (err: any) {
    await connection.rollback();
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A data center with this DC code already exists.' });
    }
    res.status(500).json({ error: err.message || 'Failed to update data center' });
  } finally {
    connection.release();
  }
});

app.delete('/api/datacenters/:id', async (req, res) => {
  const actor = requireDeviceOperator(req, res);
  if (!actor) return;

  const dcId = String(req.params.id || '').trim();
  const connection = await pool.getConnection();
  try {
    const [rackRows]: any = await connection.query(`SELECT COUNT(*) AS cnt FROM rackpoint_racks WHERE dc_id = ?`, [dcId]);
    if (Number(rackRows?.[0]?.cnt || 0) > 0) {
      return res.status(409).json({ error: 'Cannot delete data center while RackPoint racks are assigned to it.' });
    }

    await connection.beginTransaction();
    await connection.query(`DELETE FROM data_center_connectivity WHERE source_dc_id = ? OR target_dc_id = ?`, [dcId, dcId]);
    await connection.query(`DELETE FROM data_center_inventory WHERE dc_id = ?`, [dcId]);
    await connection.query(`DELETE FROM data_center_capacity WHERE dc_id = ?`, [dcId]);
    const [result]: any = await connection.query(`DELETE FROM data_centers WHERE id = ?`, [dcId]);
    if (!result?.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ error: 'Data center not found' });
    }
    await connection.commit();

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'datacenter-delete',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'data_center',
      targetId: dcId,
      message: `Deleted data center ${dcId}`,
    });

    res.json({ ok: true });
  } catch (err: any) {
    await connection.rollback();
    res.status(500).json({ error: err.message || 'Failed to delete data center' });
  } finally {
    connection.release();
  }
});

// ─────────────────────────────────────────────────────
// RACKPOINT CRUD ENDPOINTS
// ─────────────────────────────────────────────────────

app.get('/api/rackpoint/racks', async (_req, res) => {
  try {
    const [rackRows]: any = await pool.query(
      `SELECT
         id,
         name,
         dc_id AS dcId,
         dc_name AS dcName,
         rack_type AS rackType,
         total_u AS totalU,
         location,
         power_draw AS powerDraw,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM rackpoint_racks
       ORDER BY dc_name ASC, name ASC`
    );

    const [deviceRows]: any = await pool.query(
      `SELECT
         id,
         rack_id AS rackId,
         name,
         serial_number AS serialNumber,
         hostname,
         type,
         u_start AS uStart,
         u_size AS uSize,
         vendor,
         model,
         ip,
         status,
         availability_status AS availabilityStatus,
         availability_message AS availabilityMessage,
         last_availability_latency_ms AS lastAvailabilityLatencyMs,
         last_availability_checked_at AS lastAvailabilityCheckedAt,
         role,
         specs,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM rackpoint_devices
       ORDER BY rack_id ASC, u_start ASC`
    );

    const refreshedRows = await Promise.all((deviceRows || []).map(async (row: any) => {
      const probe = await refreshRackPointDeviceAvailability(row);
      return {
        ...row,
        availabilityStatus: probe.availabilityStatus,
        availabilityMessage: probe.availabilityMessage,
        lastAvailabilityLatencyMs: probe.latencyMs,
        lastAvailabilityCheckedAt: probe.checkedAt,
      };
    }));

    const devicesByRack = new Map<string, any[]>();
    for (const row of refreshedRows || []) {
      const key = String(row.rackId);
      if (!devicesByRack.has(key)) devicesByRack.set(key, []);
      devicesByRack.get(key)!.push(row);
    }

    res.json(
      (rackRows || []).map((rack: any) => ({
        ...rack,
        devices: devicesByRack.get(String(rack.id)) || [],
      }))
    );
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return res.json([]);
    res.status(500).json({ error: err.message || 'Failed to load RackPoint racks' });
  }
});

app.get('/api/rackpoint/data-centers', async (_req, res) => {
  try {
    const dataCenters = await getDataCenterSummaryRows();
    res.json(
      dataCenters.map((dc: any) => ({
        id: dc.id,
        dcCode: dc.dcCode,
        name: dc.name,
        type: dc.type,
        dcRole: dc.dcRole,
        region: dc.region,
        regionGroup: dc.regionGroup,
        country: dc.country,
        city: dc.city,
        vendorProvider: dc.vendorProvider,
        isAvailable: true,
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load data centers' });
  }
});

app.post('/api/rackpoint/racks', async (req, res) => {
  const actor = requireDeviceOperator(req, res);
  if (!actor) return;

  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const dcId = String(body.dcId || '').trim();
    const dcName = String(body.dcName || '').trim();
    const rackType = normalizeRackType(body.rackType);
    const location = String(body.location || '').trim();
    const powerDraw = String(body.powerDraw || '').trim() || null;
    const [selectedDcRows]: any = await pool.query(
      `SELECT id, name FROM data_centers WHERE id = ? LIMIT 1`,
      [dcId]
    );
    const selectedDc = selectedDcRows?.[0];

    if (!name || !dcId || !dcName || !rackType || !location) {
      return res.status(400).json({ error: 'name, dcId, dcName, rackType, and location are required.' });
    }
    if (!selectedDc) {
      return res.status(400).json({ error: 'Selected data center is not available for RackPoint.' });
    }
    if (selectedDc.name !== dcName) {
      return res.status(400).json({ error: 'Selected data center metadata is out of date. Refresh and try again.' });
    }

    const id = buildRackPointId('rack');
    const totalU = RACKPOINT_TYPE_TO_U[rackType];

    await pool.query(
      `INSERT INTO rackpoint_racks (id, name, dc_id, dc_name, rack_type, total_u, location, power_draw, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, dcId, dcName, rackType, totalU, location, powerDraw, actor.username]
    );

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'rackpoint-create-rack',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'rackpoint_rack',
      targetId: id,
      message: `Created RackPoint rack ${name}`,
      details: { rackType, dcId, dcName, location },
    });

    res.status(201).json({
      id,
      name,
      dcId,
      dcName,
      rackType,
      totalU,
      location,
      powerDraw,
      devices: [],
    });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A rack with this name already exists for the selected data center.' });
    }
    res.status(500).json({ error: err.message || 'Failed to create RackPoint rack' });
  }
});

app.all(['/api/rackpoint/racks/:rackId', '/api/rackpoint/racks/:rackId/update'], async (req, res, next) => {
  const isUpdateRoute = req.method === 'PUT' || (req.method === 'POST' && String(req.path || '').endsWith('/update'));
  if (!isUpdateRoute) return next();

  const actor = requireAuthenticatedUser(req, res);
  if (!actor) return;

  try {
    const rackId = String(req.params.rackId || '').trim();
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const rackType = normalizeRackType(body.rackType);
    const location = String(body.location || '').trim();
    const powerDraw = String(body.powerDraw || '').trim() || null;

    if (!rackId || !name || !rackType || !location) {
      return res.status(400).json({ error: 'name, rackType, and location are required.' });
    }

    const [existingRows]: any = await pool.query(
      `SELECT id, dc_id AS dcId, dc_name AS dcName, name FROM rackpoint_racks WHERE id = ? LIMIT 1`,
      [rackId]
    );
    const existing = existingRows?.[0];
    if (!existing) return res.status(404).json({ error: 'Rack not found.' });

    const totalU = RACKPOINT_TYPE_TO_U[rackType];
    const [overflowRows]: any = await pool.query(
      `SELECT id, name, u_start AS uStart, u_size AS uSize
       FROM rackpoint_devices
       WHERE rack_id = ? AND (u_start + u_size - 1) > ?
       ORDER BY u_start DESC
       LIMIT 1`,
      [rackId, totalU]
    );
    if (overflowRows?.length) {
      const device = overflowRows[0];
      return res.status(409).json({
        error: `${device.name} no longer fits in ${rackType}. Move it from U${device.uStart}–U${device.uStart + device.uSize - 1} first.`,
      });
    }

    await pool.query(
      `UPDATE rackpoint_racks
       SET name = ?, rack_type = ?, total_u = ?, location = ?, power_draw = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, rackType, totalU, location, powerDraw, rackId]
    );

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'rackpoint-update-rack',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'rackpoint_rack',
      targetId: rackId,
      message: `Updated RackPoint rack ${name}`,
      details: { rackType, location },
    });

    res.json({
      id: rackId,
      name,
      dcId: existing.dcId,
      dcName: existing.dcName,
      rackType,
      totalU,
      location,
      powerDraw,
    });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A rack with this name already exists for the selected data center.' });
    }
    res.status(500).json({ error: err.message || 'Failed to update RackPoint rack' });
  }
});

app.all(['/api/rackpoint/racks/:rackId', '/api/rackpoint/racks/:rackId/delete'], async (req, res, next) => {
  const isDeleteRoute = req.method === 'DELETE' || (req.method === 'POST' && String(req.path || '').endsWith('/delete'));
  if (!isDeleteRoute) return next();

  const actor = requireAuthenticatedUser(req, res);
  if (!actor) return;

  const rackId = String(req.params.rackId || '').trim();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingRows]: any = await connection.query(
      `SELECT id, name FROM rackpoint_racks WHERE id = ? LIMIT 1`,
      [rackId]
    );
    const existing = existingRows?.[0];
    if (!existing) {
      await connection.rollback();
      return res.status(404).json({ error: 'Rack not found.' });
    }

    await connection.query(`DELETE FROM rackpoint_devices WHERE rack_id = ?`, [rackId]);
    await connection.query(`DELETE FROM rackpoint_racks WHERE id = ?`, [rackId]);
    await connection.commit();

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'rackpoint-delete-rack',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'rackpoint_rack',
      targetId: rackId,
      message: `Deleted RackPoint rack ${existing.name}`,
    });

    res.json({ ok: true });
  } catch (err: any) {
    await connection.rollback();
    res.status(500).json({ error: err.message || 'Failed to delete RackPoint rack' });
  } finally {
    connection.release();
  }
});

app.post('/api/rackpoint/racks/:rackId/devices', async (req, res) => {
  const actor = requireDeviceOperator(req, res);
  if (!actor) return;

  try {
    const rackId = String(req.params.rackId || '').trim();
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const serialNumber = String(body.serialNumber || '').trim() || null;
    const hostname = String(body.hostname || '').trim() || null;
    const type = normalizeRackDeviceType(body.type);
    const uStart = Math.max(1, Number(body.uStart || 0));
    const uSize = Math.max(1, Number(body.uSize || 0));
    const vendor = String(body.vendor || '').trim();
    const model = String(body.model || '').trim();
    const ip = String(body.ip || '').trim() || null;
    const status = normalizeRackDeviceStatus(body.status) || 'active';
    const role = String(body.role || '').trim() || null;
    const specs = String(body.specs || '').trim() || null;

    if (!rackId || !name || !type || !vendor || !model || !uStart || !uSize) {
      return res.status(400).json({ error: 'rackId, name, type, uStart, uSize, vendor, and model are required.' });
    }

    const [rackRows]: any = await pool.query(
      `SELECT id, name, total_u AS totalU FROM rackpoint_racks WHERE id = ? LIMIT 1`,
      [rackId]
    );
    const rack = rackRows?.[0];
    if (!rack) return res.status(404).json({ error: 'Rack not found.' });

    const endU = uStart + uSize - 1;
    if (endU > Number(rack.totalU || 0)) {
      return res.status(400).json({ error: `Device exceeds rack capacity. ${rack.name} supports only ${rack.totalU}U.` });
    }

    const [conflicts]: any = await pool.query(
      `SELECT id, name, u_start AS uStart, u_size AS uSize
       FROM rackpoint_devices
       WHERE rack_id = ?
         AND NOT ((u_start + u_size - 1) < ? OR u_start > ?)
       LIMIT 1`,
      [rackId, uStart, endU]
    );
    if (conflicts?.length) {
      const conflict = conflicts[0];
      return res.status(409).json({
        error: `${conflict.name} already occupies U${conflict.uStart}–U${conflict.uStart + conflict.uSize - 1}.`,
      });
    }

    const id = buildRackPointId('rdev');
    const probe = await probeRackPointDeviceReachability(ip || hostname);
    await pool.query(
      `INSERT INTO rackpoint_devices (
         id, rack_id, name, serial_number, hostname, type, u_start, u_size, vendor, model, ip, status,
         availability_status, availability_message, last_availability_latency_ms, last_availability_checked_at,
         role, specs, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, rackId, name, serialNumber, hostname, type, uStart, uSize, vendor, model, ip, status,
        probe.availabilityStatus, probe.availabilityMessage, probe.latencyMs, probe.checkedAt,
        role, specs, actor.username,
      ]
    );

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'rackpoint-add-device',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'rackpoint_device',
      targetId: id,
      message: `Added RackPoint device ${name}`,
      details: { rackId, rackName: rack.name, uStart, uSize, type },
    });

    res.status(201).json({
      id,
      rackId,
      name,
      serialNumber,
      hostname,
      type,
      uStart,
      uSize,
      vendor,
      model,
      ip,
      status,
      availabilityStatus: probe.availabilityStatus,
      availabilityMessage: probe.availabilityMessage,
      lastAvailabilityLatencyMs: probe.latencyMs,
      lastAvailabilityCheckedAt: probe.checkedAt,
      role,
      specs,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to add RackPoint device' });
  }
});

app.all(['/api/rackpoint/devices/:deviceId', '/api/rackpoint/devices/:deviceId/update'], async (req, res, next) => {
  const isUpdateRoute = req.method === 'PUT' || (req.method === 'POST' && String(req.path || '').endsWith('/update'));
  if (!isUpdateRoute) return next();

  const actor = requireAuthenticatedUser(req, res);
  if (!actor) return;

  try {
    const deviceId = String(req.params.deviceId || '').trim();
    const body = req.body || {};
    const rackId = String(body.rackId || '').trim();
    const name = String(body.name || '').trim();
    const serialNumber = String(body.serialNumber || '').trim() || null;
    const hostname = String(body.hostname || '').trim() || null;
    const type = normalizeRackDeviceType(body.type);
    const uStart = Math.max(1, Number(body.uStart || 0));
    const uSize = Math.max(1, Number(body.uSize || 0));
    const vendor = String(body.vendor || '').trim();
    const model = String(body.model || '').trim();
    const ip = String(body.ip || '').trim() || null;
    const status = normalizeRackDeviceStatus(body.status) || 'active';
    const role = String(body.role || '').trim() || null;
    const specs = String(body.specs || '').trim() || null;

    if (!deviceId || !rackId || !name || !type || !vendor || !model || !uStart || !uSize) {
      return res.status(400).json({ error: 'deviceId, rackId, name, type, uStart, uSize, vendor, and model are required.' });
    }

    const [currentRows]: any = await pool.query(
      `SELECT id, name FROM rackpoint_devices WHERE id = ? LIMIT 1`,
      [deviceId]
    );
    const current = currentRows?.[0];
    if (!current) return res.status(404).json({ error: 'Device not found.' });

    const [rackRows]: any = await pool.query(
      `SELECT id, name, total_u AS totalU FROM rackpoint_racks WHERE id = ? LIMIT 1`,
      [rackId]
    );
    const rack = rackRows?.[0];
    if (!rack) return res.status(404).json({ error: 'Rack not found.' });

    const endU = uStart + uSize - 1;
    if (endU > Number(rack.totalU || 0)) {
      return res.status(400).json({ error: `Device exceeds rack capacity. ${rack.name} supports only ${rack.totalU}U.` });
    }

    const [conflicts]: any = await pool.query(
      `SELECT id, name, u_start AS uStart, u_size AS uSize
       FROM rackpoint_devices
       WHERE rack_id = ?
         AND id <> ?
         AND NOT ((u_start + u_size - 1) < ? OR u_start > ?)
       LIMIT 1`,
      [rackId, deviceId, uStart, endU]
    );
    if (conflicts?.length) {
      const conflict = conflicts[0];
      return res.status(409).json({
        error: `${conflict.name} already occupies U${conflict.uStart}–U${conflict.uStart + conflict.uSize - 1}.`,
      });
    }

    const probe = await probeRackPointDeviceReachability(ip || hostname);
    await pool.query(
      `UPDATE rackpoint_devices
       SET rack_id = ?,
           name = ?,
           serial_number = ?,
           hostname = ?,
           type = ?,
           u_start = ?,
           u_size = ?,
           vendor = ?,
           model = ?,
           ip = ?,
           status = ?,
           availability_status = ?,
           availability_message = ?,
           last_availability_latency_ms = ?,
           last_availability_checked_at = ?,
           role = ?,
           specs = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        rackId, name, serialNumber, hostname, type, uStart, uSize, vendor, model, ip, status,
        probe.availabilityStatus, probe.availabilityMessage, probe.latencyMs, probe.checkedAt,
        role, specs, deviceId,
      ]
    );

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'rackpoint-update-device',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'rackpoint_device',
      targetId: deviceId,
      message: `Updated RackPoint device ${name}`,
      details: { rackId, rackName: rack.name, uStart, uSize, type },
    });

    res.json({
      id: deviceId,
      rackId,
      name,
      serialNumber,
      hostname,
      type,
      uStart,
      uSize,
      vendor,
      model,
      ip,
      status,
      availabilityStatus: probe.availabilityStatus,
      availabilityMessage: probe.availabilityMessage,
      lastAvailabilityLatencyMs: probe.latencyMs,
      lastAvailabilityCheckedAt: probe.checkedAt,
      role,
      specs,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update RackPoint device' });
  }
});

app.all(['/api/rackpoint/devices/:deviceId', '/api/rackpoint/devices/:deviceId/delete'], async (req, res, next) => {
  const isDeleteRoute = req.method === 'DELETE' || (req.method === 'POST' && String(req.path || '').endsWith('/delete'));
  if (!isDeleteRoute) return next();

  const actor = requireAuthenticatedUser(req, res);
  if (!actor) return;

  try {
    const deviceId = String(req.params.deviceId || '').trim();
    const [existingRows]: any = await pool.query(
      `SELECT id, name FROM rackpoint_devices WHERE id = ? LIMIT 1`,
      [deviceId]
    );
    const existing = existingRows?.[0];
    if (!existing) return res.status(404).json({ error: 'Device not found.' });

    await pool.query(`DELETE FROM rackpoint_devices WHERE id = ?`, [deviceId]);

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'rackpoint-delete-device',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'rackpoint_device',
      targetId: deviceId,
      message: `Deleted RackPoint device ${existing.name}`,
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete RackPoint device' });
  }
});

app.post('/api/rackpoint/import', async (req, res) => {
  const actor = requireAuthenticatedUser(req, res);
  if (!actor) return;

  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'rows is required and must be a non-empty array.' });

    let createdRacks = 0;
    let createdDevices = 0;
    const warnings: string[] = [];

    for (const [index, row] of rows.entries()) {
      const dcId = String(row.dcId || '').trim();
      const dcName = String(row.dcName || '').trim();
      const rackName = String(row.rackName || '').trim();
      const rackType = normalizeRackType(row.rackType);
      const location = String(row.location || '').trim();
      const powerDraw = String(row.powerDraw || '').trim() || null;
      const deviceName = String(row.deviceName || '').trim();
      const serialNumber = String(row.serialNumber || '').trim() || null;
      const hostname = String(row.hostname || '').trim() || null;
      const ip = String(row.ip || '').trim() || null;
      const deviceType = normalizeRackDeviceType(row.deviceType || row.type);
      const vendor = String(row.vendor || '').trim();
      const model = String(row.model || '').trim();
      const uStart = Math.max(1, Number(row.uStart || 0));
      const uSize = Math.max(1, Number(row.uSize || 1));
      const status = normalizeRackDeviceStatus(row.lifecycleStatus || row.status) || 'active';
      const role = String(row.role || '').trim() || null;
      const specs = String(row.specs || '').trim() || null;

      if (!dcId || !dcName || !rackName || !rackType || !location || !deviceName || !deviceType || !vendor || !model || !uStart || !uSize) {
        warnings.push(`Row ${index + 1}: skipped due to missing required values.`);
        continue;
      }

      const [dcRows]: any = await pool.query(
        `SELECT id FROM data_centers WHERE id = ? LIMIT 1`,
        [dcId]
      );
      if (!dcRows?.[0]) {
        warnings.push(`Row ${index + 1}: skipped because data center ${dcId} is not available.`);
        continue;
      }

      const [existingRackRows]: any = await pool.query(
        `SELECT id FROM rackpoint_racks WHERE dc_id = ? AND name = ? LIMIT 1`,
        [dcId, rackName]
      );
      const rack = await ensureRackPointRackExists({
        dcId,
        dcName,
        rackName,
        rackType,
        location,
        powerDraw,
        createdBy: actor.username,
      });
      if (!existingRackRows?.length) createdRacks += 1;

      const endU = uStart + uSize - 1;
      if (endU > Number(rack.totalU || RACKPOINT_TYPE_TO_U[rackType])) {
        warnings.push(`Row ${index + 1}: device ${deviceName} exceeds rack capacity.`);
        continue;
      }

      const [conflicts]: any = await pool.query(
        `SELECT id, name FROM rackpoint_devices
         WHERE rack_id = ?
           AND NOT ((u_start + u_size - 1) < ? OR u_start > ?)
         LIMIT 1`,
        [rack.id, uStart, endU]
      );
      if (conflicts?.length) {
        warnings.push(`Row ${index + 1}: skipped because ${conflicts[0].name} already occupies that slot range.`);
        continue;
      }

      const probe = await probeRackPointDeviceReachability(ip || hostname);
      await pool.query(
        `INSERT INTO rackpoint_devices (
           id, rack_id, name, serial_number, hostname, type, u_start, u_size, vendor, model, ip, status,
           availability_status, availability_message, last_availability_latency_ms, last_availability_checked_at,
           role, specs, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          buildRackPointId('rdev'), rack.id, deviceName, serialNumber, hostname, deviceType, uStart, uSize, vendor, model, ip, status,
          probe.availabilityStatus, probe.availabilityMessage, probe.latencyMs, probe.checkedAt,
          role, specs, actor.username,
        ]
      );
      createdDevices += 1;
    }

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'rackpoint-bulk-import',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'rackpoint_bulk_import',
      targetId: String(Date.now()),
      message: `RackPoint bulk import completed: ${createdRacks} racks, ${createdDevices} devices`,
      details: { rows: rows.length, createdRacks, createdDevices, warnings },
    });

    res.status(201).json({ createdRacks, createdDevices, warnings });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to bulk import RackPoint data' });
  }
});

app.get('/api/status-pages', async (req, res) => {
  const actor = requireAdminUser(req, res);
  if (!actor) return;

  try {
    const [rows]: any = await pool.query(
      `SELECT id, name, group_name, components_json, timezone, company_name, page_address,
              show_response_charts, public_token, created_by, created_at, updated_at
       FROM status_pages
       ORDER BY created_at DESC`
    );
    res.json((Array.isArray(rows) ? rows : []).map((row) => shapeStatusPageRow(row)));
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return res.json([]);
    res.status(500).json({ error: err.message || 'Failed to load status pages.' });
  }
});

app.post('/api/status-pages', async (req, res) => {
  const actor = requireAdminUser(req, res);
  if (!actor) return;

  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const groupName = String(body.groupName || '').trim() || 'General';
    const components = normalizeStatusPageComponents(body.components);
    const timezone = String(body.timezone || 'UTC').trim() || 'UTC';
    const companyName = String(body.companyName || '').trim();
    const pageAddress = String(body.pageAddress || '').trim().toLowerCase();
    const showResponseCharts = body.showResponseCharts === false ? 0 : 1;

    if (!name || !companyName || !pageAddress || !components.length) {
      return res.status(400).json({ error: 'Name, selected monitors, company name, and status page address are required.' });
    }

    const id = buildStatusPageId();
    const publicToken = buildStatusPagePublicToken();

    await pool.query(
      `INSERT INTO status_pages (
         id, name, group_name, components_json, timezone, company_name, page_address,
         show_response_charts, public_token, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, groupName, JSON.stringify(components), timezone, companyName, pageAddress, showResponseCharts, publicToken, actor.username]
    );

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'create-status-page',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'status_page',
      targetId: id,
      message: `Created status page ${name}`,
      details: { components, timezone, pageAddress },
    });

    const [rows]: any = await pool.query(
      `SELECT id, name, group_name, components_json, timezone, company_name, page_address,
              show_response_charts, public_token, created_by, created_at, updated_at
       FROM status_pages WHERE id = ? LIMIT 1`,
      [id]
    );
    res.status(201).json(shapeStatusPageRow(rows?.[0] || {}));
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That status page address already exists. Please choose another one.' });
    }
    res.status(500).json({ error: err.message || 'Failed to create status page.' });
  }
});

app.put('/api/status-pages/:id', async (req, res) => {
  const actor = requireAdminUser(req, res);
  if (!actor) return;

  try {
    const id = String(req.params.id || '').trim();
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const groupName = String(body.groupName || '').trim() || 'General';
    const components = normalizeStatusPageComponents(body.components);
    const timezone = String(body.timezone || 'UTC').trim() || 'UTC';
    const companyName = String(body.companyName || '').trim();
    const pageAddress = String(body.pageAddress || '').trim().toLowerCase();
    const showResponseCharts = body.showResponseCharts === false ? 0 : 1;

    if (!id || !name || !companyName || !pageAddress || !components.length) {
      return res.status(400).json({ error: 'Name, selected monitors, company name, and status page address are required.' });
    }

    const [result]: any = await pool.query(
      `UPDATE status_pages
       SET name = ?, group_name = ?, components_json = ?, timezone = ?, company_name = ?,
           page_address = ?, show_response_charts = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, groupName, JSON.stringify(components), timezone, companyName, pageAddress, showResponseCharts, id]
    );
    if (!result?.affectedRows) return res.status(404).json({ error: 'Status page not found.' });

    const [rows]: any = await pool.query(
      `SELECT id, name, group_name, components_json, timezone, company_name, page_address,
              show_response_charts, public_token, created_by, created_at, updated_at
       FROM status_pages WHERE id = ? LIMIT 1`,
      [id]
    );
    res.json(shapeStatusPageRow(rows?.[0] || {}));
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That status page address already exists. Please choose another one.' });
    }
    res.status(500).json({ error: err.message || 'Failed to update status page.' });
  }
});

app.delete('/api/status-pages/:id', async (req, res) => {
  const actor = requireAdminUser(req, res);
  if (!actor) return;

  try {
    const id = String(req.params.id || '').trim();
    const [result]: any = await pool.query(`DELETE FROM status_pages WHERE id = ?`, [id]);
    if (!result?.affectedRows) return res.status(404).json({ error: 'Status page not found.' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete status page.' });
  }
});

// ─────────────────────────────────────────────────────
// STATUS NOTIFICATIONS ENDPOINTS
// ─────────────────────────────────────────────────────

app.get('/api/status-notifications', async (req, res) => {
  const actor = requireAdminUser(req, res);
  if (!actor) return;
  try {
    const [rows] = await pool.query('SELECT * FROM status_notifications ORDER BY created_at DESC');
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch status notifications.' });
  }
});

app.post('/api/status-notifications', async (req, res) => {
  const actor = requireAdminUser(req, res);
  if (!actor) return;
  try {
    const { title, message, severity, is_global, status_page_id, publish_at, remove_at } = req.body;
    if (!title || !message || !severity) return res.status(400).json({ error: 'Missing required fields.' });

    const { nanoid } = await import('nanoid');
    const id = nanoid(16);

    await pool.query(
      `INSERT INTO status_notifications (id, title, message, severity, is_global, status_page_id, publish_at, remove_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, message, severity, is_global ? 1 : 0, status_page_id || null, publish_at || null, remove_at || null]
    );
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create status notification.' });
  }
});

app.put('/api/status-notifications/:id/active', async (req, res) => {
  const actor = requireAdminUser(req, res);
  if (!actor) return;
  try {
    const id = req.params.id;
    const { is_active } = req.body;
    await pool.query(`UPDATE status_notifications SET is_active = ? WHERE id = ?`, [is_active ? 1 : 0, id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update status notification.' });
  }
});

app.delete('/api/status-notifications/:id', async (req, res) => {
  const actor = requireAdminUser(req, res);
  if (!actor) return;
  try {
    await pool.query(`DELETE FROM status_notifications WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete status notification.' });
  }
});

app.get('/api/status-pages/public/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Missing public token.' });

    const [rows]: any = await pool.query(
      `SELECT id, name, group_name, components_json, timezone, company_name, page_address,
              show_response_charts, public_token, created_by, created_at, updated_at
       FROM status_pages
       WHERE public_token = ?
       LIMIT 1`,
      [token]
    );

    const page = rows?.[0];
    if (!page) return res.status(404).json({ error: 'Status page not found.' });

    const shaped = shapeStatusPageRow(page);
    const services = await getStatusPageServices(shaped.components);
    const down = services.filter((service) => ['down', 'offline'].includes(String(service.status || '').toLowerCase())).length;
    const degraded = services.filter((service) => !['online', 'up', 'down', 'offline'].includes(String(service.status || '').toLowerCase())).length;
    const avgUptime = services.length
      ? Number((services.reduce((sum, service) => sum + Number(service.uptimePct || 0), 0) / services.length).toFixed(1))
      : 100;

    const [notifRows]: any = await pool.query(
      `SELECT id, title, message, severity, status_page_id, is_active, publish_at, remove_at, created_at
       FROM status_notifications
       WHERE is_active = 1 
         AND (is_global = 1 OR status_page_id = ?)
         AND (publish_at IS NULL OR publish_at <= NOW())
         AND (remove_at IS NULL OR remove_at >= NOW())
       ORDER BY created_at DESC`,
      [page.id]
    );

    res.json({
      page: {
        id: shaped.id,
        name: shaped.name,
        groupName: shaped.groupName,
        timezone: shaped.timezone,
        companyName: shaped.companyName,
        pageAddress: shaped.pageAddress,
        showResponseCharts: shaped.showResponseCharts,
        createdAt: shaped.createdAt,
      },
      services,
      notifications: notifRows || [],
      generatedAt: new Date().toISOString(),
      overall: {
        label: down > 0 ? 'Partial Service Disruption' : degraded > 0 ? 'Minor Service Issues' : 'All Systems Operational',
        avgUptime,
        total: services.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load public status page.' });
  }
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
// ---------------------------------------------------------------------------
// Agent heartbeat sync — marks agents Online/Offline in the DB based on
// whether last_seen_at is within the last 2 minutes.
// ---------------------------------------------------------------------------
async function syncAgentHeartbeats(): Promise<void> {
  const infraDbName = process.env.INFRA_DB_NAME || 'bsa';
  try {
    // Mark agents that haven't reported in > 2 min as Inactive
    await pool.query(
      `UPDATE ${infraDbName}.agents
       SET heartbeat = 'Inactive'
       WHERE (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL 2 MINUTE)
         AND heartbeat = 'Active'`
    );
    // Mark agents that ARE reporting within 2 min as Active
    await pool.query(
      `UPDATE ${infraDbName}.agents
       SET heartbeat = 'Active'
       WHERE last_seen_at >= NOW() - INTERVAL 2 MINUTE
         AND heartbeat = 'Inactive'`
    );
  } catch {
    // bsa DB may not be reachable — silently skip
  }
}

app.get('/api/agents', async (_req, res) => {
  try {
    // Sync heartbeat status before returning data so the DB reflects reality
    await syncAgentHeartbeats();

    try {
      const infraDbName = process.env.INFRA_DB_NAME || 'bsa';
    const [rows]: any = await pool.query(
        `SELECT id, agent_uuid, agent_name, hostname, os_name, platform, platform_version, kernel_version, architecture,
                virtualization_type, serial_number, machine_type, heartbeat, first_seen_at, last_seen_at
         FROM ${infraDbName}.agents
         ORDER BY COALESCE(last_seen_at, updated_at, created_at) DESC`
      );

      const STALE_MS = 2 * 60 * 1000; // 2 minutes
      const agents = rows.map((r: any) => {
        const lastSeenAt: Date | null = r.last_seen_at ? new Date(r.last_seen_at) : null;
        const isOnline = lastSeenAt !== null && (Date.now() - lastSeenAt.getTime()) < STALE_MS;

        return {
          id: r.id,
          agentUuid: r.agent_uuid,
          agentName: r.agent_name,
          hostname: r.hostname,
          os: r.os_name,
          platform: r.platform,
          platformVersion: r.platform_version,
          kernelVersion: r.kernel_version,
          architecture: r.architecture,
          virtualizationType: r.virtualization_type,
          serialNumber: r.serial_number,
          machineType: r.machine_type,
          heartbeat: isOnline ? 'Active' : 'Inactive',
          targetEndpoint: r.hostname,
          status: isOnline ? 'Online' : 'Offline',
          firstSeenAt: r.first_seen_at,
          lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
          lastHeartbeatAt: lastSeenAt ? lastSeenAt.toISOString() : null,
        };
      });

      return res.json(agents);
    } catch (infraErr: any) {
      if (infraErr?.code !== 'ER_NO_SUCH_TABLE') throw infraErr;
    }

    const [rows]: any = await pool.query(
      `SELECT id, hostname, os, os_version, agent_version, status, started_at, last_heartbeat_at
       FROM agents
       ORDER BY COALESCE(last_heartbeat_at, created_at) DESC`
    );

    const agents = rows.map((r: any) => ({
      id: r.id,
      agentUuid: r.id,
      agentName: r.hostname,
      hostname: r.hostname,
      os: r.os,
      osVersion: r.os_version,
      agentVersion: r.agent_version,
      targetEndpoint: r.hostname,
      status: String(r.status || '').toLowerCase() === 'active' ? 'Running' : (r.status || 'Stopped'),
      startedAt: r.started_at,
      lastHeartbeatAt: r.last_heartbeat_at,
      lastSeenAt: r.last_heartbeat_at,
    }));

    res.json(agents);
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return res.json([]);
    res.status(500).json({ error: err.message });
  }
});

// Delete an agent and all its related data from bsa + pulseiq
app.delete('/api/agents/:agentUuid', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required.' });
    if (actor.role === 'superuser') return res.status(403).json({ error: 'Super Admins cannot delete agents.' });
    if (actor.role !== 'admin' && actor.role !== 'editor') return res.status(403).json({ error: 'Editor or Admin access is required.' });

    const infraDbName = process.env.INFRA_DB_NAME || 'bsa';
    const agentUuid = String(req.params.agentUuid || '').trim();
    if (!agentUuid) return res.status(400).json({ error: 'Missing agent UUID' });

    // --- Try bsa.agents first (primary store) ---
    let deletedFromBsa = false;
    try {
      const [[agentRow]]: any = await pool.query(
        `SELECT id FROM ${infraDbName}.agents WHERE agent_uuid = ? OR id = ? LIMIT 1`,
        [agentUuid, agentUuid]
      );
      if (agentRow) {
        const agentId = agentRow.id;
        // Cascade-delete all bsa tables that reference this agent; ignore missing tables
        for (const tbl of ['metric_snapshots', 'disk_metrics', 'docker_container_stats', 'health_events', 'network_interfaces']) {
          await pool.query(`DELETE FROM ${infraDbName}.${tbl} WHERE agent_id = ?`, [agentId]).catch(() => {});
        }
        await pool.query(`DELETE FROM ${infraDbName}.agents WHERE id = ?`, [agentId]);
        deletedFromBsa = true;
      }
    } catch (bsaErr: any) {
      // bsa DB unavailable – fall through to pulseiq fallback
      if (bsaErr?.code !== 'ER_NO_SUCH_TABLE' && bsaErr?.code !== 'ER_BAD_DB_ERROR') throw bsaErr;
    }

    // --- Fallback: pulseiq.agents (used when bsa is not yet provisioned) ---
    if (!deletedFromBsa) {
      const [[legacyRow]]: any = await pool.query(
        `SELECT id FROM agents WHERE id = ? LIMIT 1`,
        [agentUuid]
      ).catch(() => [[]]);
      if (!legacyRow) return res.status(404).json({ error: 'Agent not found' });
      const agentId = legacyRow.id;
      await pool.query(`DELETE FROM agent_metrics  WHERE agent_id = ?`, [agentId]).catch(() => {});
      await pool.query(`DELETE FROM health_checks  WHERE agent_id = ?`, [agentId]).catch(() => {});
      await pool.query(`DELETE FROM investigate_tickets WHERE agent_id = ?`, [agentId]).catch(() => {});
      await pool.query(`DELETE FROM agents WHERE id = ?`, [agentId]);
    }

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'delete-agent',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'agent',
      targetId: agentUuid,
      severity: 'warning',
      outcome: 'success',
      message: `Agent and all related data deleted: ${agentUuid}`,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete agent' });
  }
});


app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const loginId = String(username || '').trim();
    if (!loginId || !password) {
      await logPortalAuditEvent({
        req,
        eventType: 'auth',
        action: 'login',
        actorUsername: loginId || null,
        severity: 'warning',
        outcome: 'failed',
        message: 'Login rejected: missing username or password',
      });
      return res.status(400).json({ error: 'Email/Employee ID and password are required' });
    }
    const hash = hashPassword(String(password));
    const [rows]: any = await pool.query(
      `SELECT username, role, account_status, rejection_reason, password_updated_at
       FROM users
       WHERE (username = ? OR email = ? OR employee_id = ?)
         AND password_hash = ?
       LIMIT 1`,
      [loginId, loginId, loginId, hash]
    );
    if (!rows.length) {
      await logPortalAuditEvent({
        req,
        eventType: 'auth',
        action: 'login',
        actorUsername: loginId,
        severity: 'warning',
        outcome: 'failed',
        message: 'Login failed: invalid credentials',
      });
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = rows[0];
    const accountStatus = String(user.account_status || 'approved').toLowerCase();
    if (accountStatus === 'pending') {
      await logPortalAuditEvent({
        req,
        eventType: 'auth',
        action: 'login',
        actorUsername: user.username,
        actorRole: user.role,
        severity: 'warning',
        outcome: 'failed',
        message: 'Login blocked: account pending approval',
      });
      return res.status(403).json({ code: 'pending_approval', error: 'Your registration is pending admin approval.' });
    }
    if (accountStatus === 'suspended') {
      await logPortalAuditEvent({
        req,
        eventType: 'auth',
        action: 'login',
        actorUsername: user.username,
        actorRole: user.role,
        severity: 'warning',
        outcome: 'failed',
        message: 'Login blocked: account suspended',
      });
      return res.status(403).json({ code: 'suspended', error: 'Your account has been suspended. Contact an administrator.' });
    }
    if (accountStatus === 'rejected') {
      const reason = String(user.rejection_reason || '').trim();
      await logPortalAuditEvent({
        req,
        eventType: 'auth',
        action: 'login',
        actorUsername: user.username,
        actorRole: user.role,
        severity: 'warning',
        outcome: 'failed',
        message: 'Login blocked: account rejected',
      });
      return res.status(403).json({
        code: 'rejected',
        error: reason ? `Your registration was rejected: ${reason}` : 'Your registration was rejected by admin.',
      });
    }
    const passwordMeta = getPasswordStatusMeta(user.password_updated_at);

    const session = { username: user.username, role: user.role, expiresAt: Date.now() + SESSION_TTL_MS };
    const token = createSessionToken(session);
    sessions.set(token, session);
    await logPortalAuditEvent({
      req,
      eventType: 'auth',
      action: 'login',
      actorUsername: user.username,
      actorRole: user.role,
      severity: passwordMeta.passwordUpdateRequired ? 'warning' : 'info',
      outcome: 'success',
      message: passwordMeta.passwordUpdateRequired ? 'Login succeeded with password rotation warning' : 'Login succeeded',
      details: { passwordAgeDays: passwordMeta.passwordAgeDays, passwordUpdateRequired: passwordMeta.passwordUpdateRequired },
    });
    res.json({ username: user.username, role: user.role, token, passwordUpdateRequired: passwordMeta.passwordUpdateRequired, passwordAgeDays: passwordMeta.passwordAgeDays, passwordDaysRemaining: passwordMeta.passwordDaysRemaining, passwordNearExpiry: passwordMeta.passwordNearExpiry });
  } catch (err: any) {
    // Allow login even if users table isn't ready yet (legacy fallback: admin/admin)
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      const { username, password } = req.body || {};
      if (String(username) === 'admin' && String(password) === 'admin') {
        const session = { username: 'admin', role: 'admin', expiresAt: Date.now() + SESSION_TTL_MS };
        const token = createSessionToken(session);
        sessions.set(token, session);
        await logPortalAuditEvent({
          req,
          eventType: 'auth',
          action: 'login',
          actorUsername: 'admin',
          actorRole: 'admin',
          severity: 'warning',
          outcome: 'success',
          message: 'Login succeeded through legacy fallback path',
        });
        return res.json({ username: 'admin', role: 'admin', token });
      }
      await logPortalAuditEvent({
        req,
        eventType: 'auth',
        action: 'login',
        actorUsername: String(username || '').trim() || null,
        severity: 'warning',
        outcome: 'failed',
        message: 'Login failed under legacy fallback path',
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    await logPortalAuditEvent({
      req,
      eventType: 'auth',
      action: 'login',
      actorUsername: String(req.body?.username || '').trim() || null,
      severity: 'critical',
      outcome: 'failed',
      message: 'Login errored',
      details: { error: err?.message || 'unknown' },
    });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const body = req.body || {};
    const fullName = String(body.fullName || '').trim();
    const employeeId = String(body.employeeId || '').trim();
    const contactNumber = String(body.contactNumber || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');
    const company = String(body.company || '').trim();
    const managerName = String(body.managerName || '').trim();
    const managerEmail = String(body.managerEmail || '').trim().toLowerCase();
    const roleInput = String(body.roleType || '').trim().toLowerCase();
    const team = String(body.team || '').trim();

    if (!fullName || !employeeId || !contactNumber || !email || !password || !company || !managerName || !managerEmail || !team || !roleInput) {
      return res.status(400).json({ error: 'Please fill all required fields.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail)) {
      return res.status(400).json({ error: 'Please enter a valid manager email address.' });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters with upper/lower case, number, and special character.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }
    if (!REGISTRATION_ROLES.has(roleInput)) {
      return res.status(400).json({ error: 'Invalid role type selected.' });
    }
    if (!REGISTRATION_TEAMS.has(team)) {
      return res.status(400).json({ error: 'Invalid team selected.' });
    }

    const [dupRows]: any = await pool.query(
      `SELECT id, account_status
       FROM users
       WHERE email = ? OR employee_id = ?
       LIMIT 1`,
      [email, employeeId]
    );
    if (dupRows.length) {
      const status = String(dupRows[0].account_status || '').toLowerCase();
      if (status === 'pending') {
        return res.status(409).json({ error: 'A registration request with this email or employee ID is already pending approval.' });
      }
      return res.status(409).json({ error: 'An account with this email or employee ID already exists.' });
    }

    const passwordHash = hashPassword(password);
    await pool.query(
      `INSERT INTO users (
        username, full_name, employee_id, contact_number, email,
        password_hash, role, team, company, manager_name, manager_email,
        account_status, rejection_reason, reviewed_by, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL)`,
      [email, fullName, employeeId, contactNumber, email, passwordHash, roleInput, team, company, managerName, managerEmail]
    );

    res.status(201).json({ success: true, message: 'Registration submitted. Waiting for admin approval.' });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email or employee ID already exists.' });
    }
    res.status(500).json({ error: err.message || 'Failed to submit registration.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const auth = String(req.headers?.['authorization'] || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const actor = token ? (sessions.get(token) || readSessionToken(token)) : null;
  if (token) sessions.delete(token);
  void logPortalAuditEvent({
    req,
    eventType: 'auth',
    action: 'logout',
    actorUsername: actor?.username || null,
    actorRole: actor?.role || null,
    severity: 'info',
    outcome: 'success',
    message: actor?.username ? `Logout for ${actor.username}` : 'Logout requested',
  });
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  (async () => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const [rows]: any = await pool.query(
        `SELECT id, username, email, role, created_at, updated_at,
                full_name, employee_id, contact_number, team, company,
                manager_name, manager_email, account_status, rejection_reason,
                reviewed_by, reviewed_at, password_updated_at
         FROM users
         WHERE username = ?
         LIMIT 1`,
        [user.username]
      );

      if (!rows?.length) return res.json(user);

      if (String(rows[0].account_status || '').toLowerCase() === 'suspended') {
        return res.status(403).json({ code: 'suspended', error: 'Your account has been suspended. Contact an administrator.' });
      }

      const passwordMeta = getPasswordStatusMeta(rows[0].password_updated_at, rows[0].created_at);

      res.json({
        id: rows[0].id,
        username: rows[0].username,
        email: rows[0].email,
        role: rows[0].role,
        created_at: rows[0].created_at,
        updated_at: rows[0].updated_at,
        full_name: rows[0].full_name,
        employee_id: rows[0].employee_id,
        contact_number: rows[0].contact_number,
        team: rows[0].team,
        company: rows[0].company,
        manager_name: rows[0].manager_name,
        manager_email: rows[0].manager_email,
        account_status: rows[0].account_status,
        rejection_reason: rows[0].rejection_reason,
        reviewed_by: rows[0].reviewed_by,
        reviewed_at: rows[0].reviewed_at,
        password_updated_at: rows[0].password_updated_at,
        password_age_days: passwordMeta.passwordAgeDays,
        password_days_remaining: passwordMeta.passwordDaysRemaining,
        password_near_expiry: passwordMeta.passwordNearExpiry,
        password_expiry_at: passwordMeta.passwordExpiryAt,
        password_policy: passwordMeta.passwordPolicy,
        password_update_required: passwordMeta.passwordUpdateRequired,
      });
    } catch {
      res.json(user);
    }
  })();
});

app.get('/api/auth/my-team', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor) return res.status(401).json({ error: 'Not authenticated' });

    // Always re-read the role from DB so stale tokens don't affect directory logic
    const [[dbUser]]: any = await pool.query(
      `SELECT role, team, company FROM users WHERE username = ? LIMIT 1`,
      [actor.username]
    );
    if (!dbUser) {
      // User authenticated but not in DB yet (e.g. after token restore) — return empty team rather than 401
      return res.json([]);
    }
    const liveRole: string = String(dbUser.role || actor.role);

    if (liveRole === 'superuser') {
      const [rows]: any = await pool.query(
        `SELECT id, username, full_name, email, role, team, account_status FROM users ORDER BY full_name ASC`
      );
      return res.json(Array.isArray(rows) ? rows : []);
    }

    const currentTeam = String(dbUser.team || '').trim();
    const currentCompany = String(dbUser.company || '').trim();

    if (!currentTeam || !currentCompany) {
      return res.json([]);
    }

    const [rows]: any = await pool.query(
      `SELECT id, username, full_name, email, role, team, account_status
       FROM users
       WHERE team = ?
         AND company = ?
         AND account_status = 'approved'
         AND username NOT IN ('admin', 'Root-user', 'Beacyn-SVC')
       ORDER BY full_name ASC`,
      [currentTeam, currentCompany]
    );
    res.json(Array.isArray(rows) ? rows : []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/profile', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor) return res.status(401).json({ error: 'Not authenticated' });

    const contactNumber = String(req.body?.contactNumber || '').trim();
    const team = String(req.body?.team || '').trim();
    const managerName = String(req.body?.managerName || '').trim();
    const managerEmail = String(req.body?.managerEmail || '').trim().toLowerCase();

    if (managerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail)) {
      return res.status(400).json({ error: 'Please enter a valid manager email address.' });
    }

    await pool.query(
      `UPDATE users
       SET contact_number = ?, team = ?, manager_name = ?, manager_email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`,
      [contactNumber || null, team || null, managerName || null, managerEmail || null, actor.username]
    );

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'update-profile',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'user',
      targetId: actor.username,
      outcome: 'success',
      message: 'User profile updated',
      details: { contactNumber, team, managerName, managerEmail },
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update profile.' });
  }
});

app.post('/api/auth/feedback', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor) return res.status(401).json({ error: 'Not authenticated' });

    const category = String(req.body?.category || 'general').trim().toLowerCase() || 'general';
    const rating = Number(req.body?.rating || 0);
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Feedback message is required.' });

    const [rows]: any = await pool.query(`SELECT email FROM users WHERE username = ? LIMIT 1`, [actor.username]);
    const email = rows?.[0]?.email ? String(rows[0].email) : null;

    await pool.query(
      `INSERT INTO user_feedback (username, email, category, rating, message)
       VALUES (?, ?, ?, ?, ?)`,
      [actor.username, email, category, Number.isFinite(rating) && rating > 0 ? rating : null, message]
    );

    res.status(201).json({ success: true, message: 'Feedback shared. Thank you.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to submit feedback.' });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor) return res.status(401).json({ error: 'Not authenticated' });

    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All password fields are required.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirm password do not match.' });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters with upper/lower case, number, and special character.' });
    }

    const currentHash = hashPassword(currentPassword);
    const [rows]: any = await pool.query(
      `SELECT id, password_hash
       FROM users
       WHERE username = ?
       LIMIT 1`,
      [actor.username]
    );
    if (!rows?.length) return res.status(404).json({ error: 'User not found.' });
    if (String(rows[0].password_hash) !== currentHash) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = hashPassword(newPassword);
    if (newHash === currentHash) {
      return res.status(400).json({ error: 'New password must be different from current password.' });
    }

    await pool.query(
      `UPDATE users
       SET password_hash = ?, password_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newHash, rows[0].id]
    );

    await logPortalAuditEvent({
      req,
      eventType: 'security',
      action: 'change-password',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'user',
      targetId: String(rows[0].id),
      severity: 'info',
      outcome: 'success',
      message: 'Password changed successfully',
    });

    res.json({ success: true });
  } catch (err: any) {
    const actor = getSessionUser(req);
    await logPortalAuditEvent({
      req,
      eventType: 'security',
      action: 'change-password',
      actorUsername: actor?.username || null,
      actorRole: actor?.role || null,
      targetType: 'user',
      targetId: actor?.username || null,
      severity: 'warning',
      outcome: 'failed',
      message: 'Password change failed',
      details: { error: err?.message || 'unknown' },
    });
    res.status(500).json({ error: err.message || 'Failed to update password.' });
  }
});

app.get('/api/system/portal-status', (req, res) => {
  const user = getSessionUser(req);
  const keyAuthorized = isMonitorRequestAuthorized(req);
  if (!user && !keyAuthorized) return res.status(401).json({ error: 'Not authenticated' });
  res.json({
    uptimeSeconds: Math.floor(process.uptime()),
    appVersion: APP_VERSION,
  });
});

app.get('/api/portal-audit', async (req, res) => {
  try {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize || 20)));
    const offset = (page - 1) * pageSize;

    const eventType = String(req.query.eventType || '').trim().toLowerCase();
    const severity = String(req.query.severity || '').trim().toLowerCase();
    const outcome = String(req.query.outcome || '').trim().toLowerCase();
    const actor = String(req.query.actor || '').trim();
    const q = String(req.query.q || '').trim();

    const whereParts: string[] = [];
    const bind: any[] = [];

    if (['auth', 'action', 'security', 'system'].includes(eventType)) {
      whereParts.push('event_type = ?');
      bind.push(eventType);
    }
    if (['info', 'warning', 'critical'].includes(severity)) {
      whereParts.push('severity = ?');
      bind.push(severity);
    }
    if (['success', 'failed'].includes(outcome)) {
      whereParts.push('outcome = ?');
      bind.push(outcome);
    }
    if (actor) {
      whereParts.push('actor_username LIKE ?');
      bind.push(`%${actor}%`);
    }
    if (q) {
      whereParts.push('(action LIKE ? OR target_type LIKE ? OR target_id LIKE ? OR message LIKE ?)');
      bind.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [rows]: any = await pool.query(
      `SELECT id, event_type, action, actor_username, actor_role, target_type, target_id,
              severity, outcome, resolved_at, resolved_by, message, created_at
       FROM portal_audit_logs
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...bind, pageSize, offset]
    );

    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total
       FROM portal_audit_logs
       ${whereSql}`,
      bind
    );

    const [summaryRows]: any = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) AS failed_count,
         SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical_count,
         COUNT(DISTINCT COALESCE(actor_username, 'system')) AS distinct_actors
       FROM portal_audit_logs
       ${whereSql}`,
      bind
    );

    let latestSnapshot = null;
    let runtimeSnapshots: any[] = [];
    try {
      const [snapshotRows]: any = await pool.query(
        `SELECT id, frontend_url, backend_url, frontend_ok, frontend_status_code, frontend_latency_ms,
                backend_ok, backend_status_code, backend_latency_ms, portal_uptime_seconds, app_version,
                db_engine_name, db_engine_version, db_space_bytes, db_signature, db_uptime_seconds,
                vulnerability_total, vulnerability_info, vulnerability_low, vulnerability_moderate,
                vulnerability_high, vulnerability_critical, overall_status, highest_severity, created_at
         FROM portal_runtime_snapshots
         ORDER BY created_at DESC
         LIMIT 1`
      );
      latestSnapshot = snapshotRows?.[0] || null;

      // Always inject live DB uptime and APP_VERSION so display is never stale/zero
      if (latestSnapshot) {
        try {
          const [liveUptimeRows]: any = await pool.query(`SHOW GLOBAL STATUS LIKE 'Uptime'`);
          const liveDbUptime = Number(liveUptimeRows?.[0]?.Value ?? liveUptimeRows?.[0]?.value ?? 0);
          if (liveDbUptime > 0) latestSnapshot.db_uptime_seconds = liveDbUptime;
        } catch { /* ignore — show stored value */ }
        latestSnapshot.app_version = APP_VERSION;
      }

      const [historyRows]: any = await pool.query(
        `SELECT id, frontend_url, backend_url, frontend_ok, frontend_status_code, frontend_latency_ms,
                backend_ok, backend_status_code, backend_latency_ms, portal_uptime_seconds, app_version,
                db_engine_name, db_engine_version, db_space_bytes, db_signature, db_uptime_seconds,
                vulnerability_total, vulnerability_info, vulnerability_low, vulnerability_moderate,
                vulnerability_high, vulnerability_critical, overall_status, highest_severity, created_at
         FROM portal_runtime_snapshots
         ORDER BY created_at DESC
         LIMIT 20`
      );
      runtimeSnapshots = historyRows || [];
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    const summary = summaryRows?.[0] || {};
    res.json({
      page,
      pageSize,
      total: Number(countRows?.[0]?.total || 0),
      events: rows || [],
      portalStatus: {
        uptimeSeconds: Math.floor(process.uptime()),
        appVersion: APP_VERSION,
      },
      latestSnapshot,
      runtimeSnapshots,
      summary: {
        total: Number(summary.total || 0),
        failedCount: Number(summary.failed_count || 0),
        criticalCount: Number(summary.critical_count || 0),
        distinctActors: Number(summary.distinct_actors || 0),
      },
    });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ page: 1, pageSize: 20, total: 0, events: [], summary: { total: 0, failedCount: 0, criticalCount: 0, distinctActors: 0 } });
    }
    res.status(500).json({ error: err.message || 'Failed to load portal audit events' });
  }
});

app.post('/api/portal-audit/system-snapshot', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    const keyAuthorized = isMonitorRequestAuthorized(req);
    if (!actor && !keyAuthorized) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const body = req.body || {};
    const frontend = body.frontend && typeof body.frontend === 'object' ? body.frontend : null;
    const backend = body.backend && typeof body.backend === 'object' ? body.backend : null;
    const vulnerabilities = body.vulnerabilities && typeof body.vulnerabilities === 'object' ? body.vulnerabilities : null;
    const frontendUrl = String(body.frontendUrl || '').trim();
    const backendUrl = String(body.backendUrl || '').trim();

    if (!frontend || !backend || !vulnerabilities || !frontendUrl || !backendUrl) {
      return res.status(400).json({ error: 'frontend, backend, vulnerabilities, frontendUrl, and backendUrl are required' });
    }

    const overallStatus = String(body.overallStatus || 'healthy').trim().toLowerCase();
    const highestSeverity = String(body.highestSeverity || 'info').trim().toLowerCase();

    await savePortalRuntimeSnapshot({
      frontendUrl,
      backendUrl,
      frontend: {
        ok: Boolean(frontend.ok),
        status: Number(frontend.status || 0),
        latencyMs: Number(frontend.latencyMs || 0),
        error: frontend.error ? String(frontend.error) : null,
      },
      backend: {
        ok: Boolean(backend.ok),
        status: Number(backend.status || 0),
        latencyMs: Number(backend.latencyMs || 0),
        error: backend.error ? String(backend.error) : null,
      },
      portalUptimeSeconds: body.portalUptimeSeconds == null ? null : Number(body.portalUptimeSeconds),
      appVersion: body.appVersion ? String(body.appVersion) : null,
      dbEngineName: body.dbEngineName ? String(body.dbEngineName) : null,
      dbEngineVersion: body.dbEngineVersion ? String(body.dbEngineVersion) : null,
      dbSpaceBytes: body.dbSpaceBytes == null ? null : Number(body.dbSpaceBytes),
      dbSignature: body.dbSignature ? String(body.dbSignature) : null,
      dbUptimeSeconds: body.dbUptimeSeconds == null ? null : Number(body.dbUptimeSeconds),
      vulnerabilities: {
        total: Number(vulnerabilities.total || 0),
        info: Number(vulnerabilities.info || 0),
        low: Number(vulnerabilities.low || 0),
        moderate: Number(vulnerabilities.moderate || 0),
        high: Number(vulnerabilities.high || 0),
        critical: Number(vulnerabilities.critical || 0),
      },
      overallStatus: overallStatus === 'critical' ? 'critical' : overallStatus === 'degraded' ? 'degraded' : 'healthy',
      highestSeverity: highestSeverity === 'critical' ? 'critical' : highestSeverity === 'warning' ? 'warning' : 'info',
      details: body.details || null,
    });

    await logPortalAuditEvent({
      req,
      eventType: 'system',
      action: 'portal-runtime-snapshot',
      actorUsername: actor?.username || 'system-monitor',
      actorRole: actor?.role || 'system',
      targetType: 'portal',
      targetId: frontendUrl,
      severity: highestSeverity === 'critical' ? 'critical' : highestSeverity === 'warning' ? 'warning' : 'info',
      outcome: 'success',
      message: `Runtime snapshot captured (${overallStatus})`,
      details: {
        frontendUrl,
        backendUrl,
        frontend,
        backend,
        vulnerabilities,
        overallStatus,
        highestSeverity,
        dbEngineName: body.dbEngineName ? String(body.dbEngineName) : null,
        dbEngineVersion: body.dbEngineVersion ? String(body.dbEngineVersion) : null,
        dbSpaceBytes: body.dbSpaceBytes == null ? null : Number(body.dbSpaceBytes),
        dbSignature: body.dbSignature ? String(body.dbSignature) : null,
        dbUptimeSeconds: body.dbUptimeSeconds == null ? null : Number(body.dbUptimeSeconds),
        portalUptimeSeconds: body.portalUptimeSeconds == null ? null : Number(body.portalUptimeSeconds),
        appVersion: body.appVersion ? String(body.appVersion) : null,
        report: body?.details?.auditReport || body?.details?.report || null,
        snapshotDetails: body.details || null,
      },
    });

    res.status(201).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save portal snapshot' });
  }
});

app.post('/api/portal-audit/system-event', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    const keyAuthorized = isMonitorRequestAuthorized(req);
    if (!actor && !keyAuthorized) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const body = req.body || {};
    const eventType = String(body.eventType || 'system').trim().toLowerCase();
    const action = String(body.action || '').trim();
    const message = String(body.message || '').trim();
    const severity = String(body.severity || 'warning').trim().toLowerCase();
    const outcome = String(body.outcome || 'failed').trim().toLowerCase();

    if (!action) return res.status(400).json({ error: 'action is required' });

    await logPortalAuditEvent({
      req,
      eventType: ['auth', 'action', 'security', 'system'].includes(eventType) ? eventType as PortalAuditEventType : 'system',
      action,
      actorUsername: actor?.username || 'system-monitor',
      actorRole: actor?.role || 'system',
      targetType: body.targetType ? String(body.targetType) : null,
      targetId: body.targetId ? String(body.targetId) : null,
      severity: ['info', 'warning', 'critical'].includes(severity) ? severity as PortalAuditSeverity : 'warning',
      outcome: outcome === 'success' ? 'success' : 'failed',
      message: message || action,
      details: body.details || null,
    });

    res.status(201).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to ingest system event' });
  }
});

app.get('/api/portal-audit/:id', async (req, res) => {
  try {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const id = Number(req.params.id || 0);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    const [rows]: any = await pool.query(
      `SELECT id, event_type, action, actor_username, actor_role, target_type, target_id,
              severity, outcome, resolved_at, resolved_by, message, details_json, ip_address, user_agent, created_at
       FROM portal_audit_logs
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'Audit entry not found' });

    let details = row.details_json;
    if (typeof details === 'string') {
      try { details = JSON.parse(details); } catch { /* keep as raw string */ }
    }

    res.json({ ...row, details_json: details ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load audit details' });
  }
});

app.patch('/api/portal-audit/:id/resolve', async (req, res) => {
  try {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const id = Number(req.params.id || 0);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    const [result]: any = await pool.query(
      `UPDATE portal_audit_logs
       SET resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP), resolved_by = COALESCE(resolved_by, ?)
       WHERE id = ?`,
      [String(user.username || 'unknown'), id]
    );

    if (!result?.affectedRows) return res.status(404).json({ error: 'Audit entry not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to resolve audit entry' });
  }
});

app.delete('/api/portal-audit/:id', async (req, res) => {
  try {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const id = Number(req.params.id || 0);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    const [result]: any = await pool.query(`DELETE FROM portal_audit_logs WHERE id = ?`, [id]);
    if (!result?.affectedRows) return res.status(404).json({ error: 'Audit entry not found' });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete audit entry' });
  }
});

app.get('/api/auth/requests', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor || (actor.role !== 'admin' && actor.role !== 'superuser')) return res.status(403).json({ error: 'Admin access required' });
    const status = String(req.query.status || 'pending').trim().toLowerCase();
    const bind: any[] = [];
    let whereSql = "WHERE username NOT IN ('admin', 'Root-user', 'Beacyn-SVC')";
    if (['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
      whereSql += ' AND account_status = ?';
      bind.push(status);
    }

    // Admin can only see users from their own team + company
    if (actor.role === 'admin') {
      const [[me]]: any = await pool.query(`SELECT team, company FROM users WHERE username = ? LIMIT 1`, [actor.username]);
      if (me?.team) { whereSql += ' AND team = ?'; bind.push(me.team); }
      if (me?.company) { whereSql += ' AND company = ?'; bind.push(me.company); }
    }

    const [rows]: any = await pool.query(
      `SELECT id, full_name, employee_id, contact_number, email, role, team, company,
              manager_name, manager_email, account_status, rejection_reason,
              reviewed_by, reviewed_at, created_at
       FROM users
       ${whereSql}
       ORDER BY created_at DESC`,
      bind
    );
    res.json(rows || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load access requests.' });
  }
});

app.post('/api/auth/requests/:id/approve', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor || (actor.role !== 'admin' && actor.role !== 'superuser')) return res.status(403).json({ error: 'Admin access required' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid request ID' });

    const [[targetUser]]: any = await pool.query(
      `SELECT role, team, company FROM users WHERE id = ? LIMIT 1`, [id]
    );
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    if (actor.role === 'superuser') {
      if (targetUser.role !== 'admin') {
        return res.status(403).json({ error: 'Superuser can only approve access requests for admin-role accounts. Editor and viewer requests must be approved by an admin.' });
      }
    }

    if (actor.role === 'admin') {
      const [[actorRecord]]: any = await pool.query(
        `SELECT team, company FROM users WHERE username = ? LIMIT 1`, [actor.username]
      );
      if (actorRecord?.team && actorRecord.team !== targetUser.team) {
        return res.status(403).json({ error: 'You can only approve users from your own team.' });
      }
      if (actorRecord?.company && actorRecord.company !== targetUser.company) {
        return res.status(403).json({ error: 'You can only approve users from your own company.' });
      }
    }

    await pool.query(
      `UPDATE users
       SET account_status = 'approved', rejection_reason = NULL, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [actor.username, id]
    );

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'approve-access-request',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'user-request',
      targetId: String(id),
      outcome: 'success',
      message: `Access request approved for user id ${id}`,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to approve request.' });
  }
});

app.post('/api/auth/requests/:id/reject', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor || (actor.role !== 'admin' && actor.role !== 'superuser')) return res.status(403).json({ error: 'Admin access required' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid request ID' });
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Rejection comment is required.' });

    const [[targetUser]]: any = await pool.query(
      `SELECT role, team, company FROM users WHERE id = ? LIMIT 1`, [id]
    );
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    if (actor.role === 'superuser') {
      if (targetUser.role !== 'admin') {
        return res.status(403).json({ error: 'Superuser can only reject access requests for admin-role accounts. Editor and viewer requests must be rejected by an admin.' });
      }
    }

    if (actor.role === 'admin') {
      const [[actorRecord]]: any = await pool.query(
        `SELECT team, company FROM users WHERE username = ? LIMIT 1`, [actor.username]
      );
      if (actorRecord?.team && actorRecord.team !== targetUser.team) {
        return res.status(403).json({ error: 'You can only reject users from your own team.' });
      }
      if (actorRecord?.company && actorRecord.company !== targetUser.company) {
        return res.status(403).json({ error: 'You can only reject users from your own company.' });
      }
    }

    await pool.query(
      `UPDATE users
       SET account_status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reason, actor.username, id]
    );

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'reject-access-request',
      actorUsername: actor.username,
      actorRole: actor.role,
      targetType: 'user-request',
      targetId: String(id),
      severity: 'warning',
      outcome: 'success',
      message: `Access request rejected for user id ${id}`,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reject request.' });
  }
});

// ── User management (admin) ──────────────────────────────────────────────────

// Update role of an approved user
app.patch('/api/auth/users/:id/role', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor || (actor.role !== 'admin' && actor.role !== 'superuser')) return res.status(403).json({ error: 'Admin access required' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid user ID' });
    const newRole = String(req.body?.role || '').trim().toLowerCase();
    if (!REGISTRATION_ROLES.has(newRole as any)) return res.status(400).json({ error: `Invalid role. Must be one of: ${[...REGISTRATION_ROLES].join(', ')}` });

    const [[target]]: any = await pool.query(`SELECT username, role, account_status FROM users WHERE id = ? LIMIT 1`, [id]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (['admin', 'Root-user', 'Beacyn-SVC'].includes(target.username)) return res.status(403).json({ error: 'Cannot modify built-in admin accounts' });

    // Superuser cannot assign the superuser role to anyone, but can demote any user (including admins)
    if (actor.role === 'superuser' && newRole === 'superuser') {
      return res.status(403).json({ error: 'The superuser role cannot be assigned to users.' });
    }
    // Admin can only assign editor or viewer; cannot touch admin/superuser accounts
    if (actor.role === 'admin') {
      if (newRole !== 'editor' && newRole !== 'viewer') {
        return res.status(403).json({ error: 'Admin can only assign editor or viewer roles.' });
      }
      if (target.role === 'admin' || target.role === 'superuser') {
        return res.status(403).json({ error: 'Admin cannot change the role of admin or superuser accounts.' });
      }
    }

    await pool.query(`UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newRole, id]);

    await logPortalAuditEvent({
      req, eventType: 'action', action: 'user-update-role',
      actorUsername: actor.username, actorRole: actor.role,
      targetType: 'user', targetId: String(id),
      message: `Role changed from ${target.role} to ${newRole} for user ${target.username}`,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update role' });
  }
});

// Suspend or re-activate an approved user
app.patch('/api/auth/users/:id/status', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor || (actor.role !== 'admin' && actor.role !== 'superuser')) return res.status(403).json({ error: 'Admin access required' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid user ID' });
    const newStatus = String(req.body?.status || '').trim().toLowerCase();
    if (!['approved', 'suspended'].includes(newStatus)) return res.status(400).json({ error: 'status must be approved or suspended' });

    const [[target]]: any = await pool.query(`SELECT username, role, account_status FROM users WHERE id = ? LIMIT 1`, [id]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (['admin', 'Root-user', 'Beacyn-SVC'].includes(target.username)) return res.status(403).json({ error: 'Cannot suspend built-in admin accounts' });
    if (actor.role === 'admin' && (target.role === 'admin' || target.role === 'superuser')) {
      return res.status(403).json({ error: 'Admin cannot suspend or reactivate admin or superuser accounts.' });
    }

    await pool.query(
      `UPDATE users SET account_status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newStatus, actor.username, id]
    );

    await logPortalAuditEvent({
      req, eventType: 'action', action: newStatus === 'suspended' ? 'user-suspend' : 'user-reactivate',
      actorUsername: actor.username, actorRole: actor.role,
      targetType: 'user', targetId: String(id),
      severity: newStatus === 'suspended' ? 'warning' : 'info',
      message: `User ${target.username} ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}`,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update account status' });
  }
});

// Delete a user
app.delete('/api/auth/users/:id', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor || (actor.role !== 'admin' && actor.role !== 'superuser')) return res.status(403).json({ error: 'Admin access required' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid user ID' });

    const [[target]]: any = await pool.query(`SELECT username, role FROM users WHERE id = ? LIMIT 1`, [id]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (['admin', 'Root-user', 'Beacyn-SVC'].includes(target.username)) return res.status(403).json({ error: 'Cannot delete built-in admin accounts' });
    if (actor.role === 'admin' && (target.role === 'admin' || target.role === 'superuser')) {
      return res.status(403).json({ error: 'Admin cannot delete admin or superuser accounts.' });
    }

    await pool.query(`DELETE FROM users WHERE id = ?`, [id]);

    await logPortalAuditEvent({
      req, eventType: 'action', action: 'user-delete',
      actorUsername: actor.username, actorRole: actor.role,
      targetType: 'user', targetId: String(id),
      severity: 'warning',
      message: `User ${target.username} (id ${id}) deleted`,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete user' });
  }
});

// ── Settings endpoints (per-user) ─────────────────────────────────────────────
app.get('/api/settings', async (req, res) => {
  try {
    const user = getSessionUser(req);
    const userScopeKey = user ? `user:${user.username}` : null;

    // User-specific settings
    let userSettings: Record<string, any> = {};
    if (userScopeKey) {
      const [uRows]: any = await pool.query(
        `SELECT settings_json FROM app_settings WHERE scope_key = ? LIMIT 1`,
        [userScopeKey]
      );
      const raw = uRows?.[0]?.settings_json;
      if (raw && typeof raw === 'string') { try { userSettings = JSON.parse(raw); } catch { userSettings = {}; } }
      else if (raw && typeof raw === 'object') { userSettings = raw; }
    }

    // Admin-managed settings (returned to admin callers only)
    let adminSettings: Record<string, any> = {};
    if (user?.role === 'admin' || user?.role === 'superuser') {
      const [aRows]: any = await pool.query(
        `SELECT settings_json FROM app_settings WHERE scope_key = 'admin' LIMIT 1`
      );
      const aRaw = aRows?.[0]?.settings_json;
      if (aRaw && typeof aRaw === 'string') { try { adminSettings = JSON.parse(aRaw); } catch { adminSettings = {}; } }
      else if (aRaw && typeof aRaw === 'object') { adminSettings = aRaw; }
    }

    res.json({
      ...USER_DEFAULTS,
      ...userSettings,
      ...((user?.role === 'admin' || user?.role === 'superuser') ? { ...ADMIN_DEFAULTS, ...adminSettings } : {}),
    });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return res.json({});
    res.status(500).json({ error: err.message || 'Failed to load settings' });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const payload: Record<string, any> = req.body && typeof req.body === 'object' ? req.body : {};

    // Split into user-owned and admin-owned fields
    const userPayload: Record<string, any> = {};
    const adminPayload: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (USER_SETTING_KEYS.has(k)) userPayload[k] = v;
      else adminPayload[k] = v;
    }

    const userScopeKey = `user:${user.username}`;
    await pool.query(
      `INSERT INTO app_settings (scope_key, settings_json)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json), updated_at = CURRENT_TIMESTAMP`,
      [userScopeKey, JSON.stringify(userPayload)]
    );

    if ((user.role === 'admin' || user.role === 'superuser') && Object.keys(adminPayload).length > 0) {
      await pool.query(
        `INSERT INTO app_settings (scope_key, settings_json)
         VALUES ('admin', ?)
         ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json), updated_at = CURRENT_TIMESTAMP`,
        [JSON.stringify(adminPayload)]
      );
    }

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'configure-settings',
      actorUsername: user.username,
      actorRole: user.role,
      targetType: 'settings',
      targetId: (user.role === 'admin' || user.role === 'superuser') ? 'admin+user' : `user:${user.username}`,
      outcome: 'success',
      message: 'Settings updated',
      details: { userKeys: Object.keys(userPayload), adminKeys: Object.keys(adminPayload) },
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save settings' });
  }
});

app.post('/api/settings/reset', async (req, res) => {
  try {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    await pool.query(`DELETE FROM app_settings WHERE scope_key = ?`, [`user:${user.username}`]);

    if ((user.role === 'admin' || user.role === 'superuser') && req.body?.resetAdmin) {
      await pool.query(`DELETE FROM app_settings WHERE scope_key = 'admin'`);
      await pool.query(
        `INSERT INTO app_settings (scope_key, settings_json) VALUES ('admin', JSON_OBJECT())
         ON DUPLICATE KEY UPDATE scope_key = scope_key`
      );
    }

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'reset-settings',
      actorUsername: user.username,
      actorRole: user.role,
      targetType: 'settings',
      targetId: req.body?.resetAdmin ? 'admin+user' : `user:${user.username}`,
      severity: req.body?.resetAdmin ? 'warning' : 'info',
      outcome: 'success',
      message: req.body?.resetAdmin ? 'User and admin settings reset' : 'User settings reset',
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reset settings' });
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
    const machineTypeQuery = String(req.query.machineType || '').trim().toLowerCase();
    const machineTypeFilter = machineTypeQuery === 'vm' || machineTypeQuery === 'physical' ? machineTypeQuery : '';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize || 50)));
    const offset = (page - 1) * pageSize;

    if (await hasNewInfraSchema()) {
      const whereParts: string[] = [];
      const whereBind: any[] = [];

      if (q) {
        whereParts.push(`(a.agent_uuid LIKE ? OR a.agent_name LIKE ? OR a.hostname LIKE ? OR COALESCE(a.serial_number, '') LIKE ? OR COALESCE(a.platform, '') LIKE ? OR COALESCE(a.os_name, '') LIKE ?)`);
        whereBind.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      }
      if (machineTypeFilter === 'vm') {
        whereParts.push(`LOWER(COALESCE(a.machine_type, 'unknown')) = 'vm'`);
      } else if (machineTypeFilter === 'physical') {
        whereParts.push(`LOWER(COALESCE(a.machine_type, 'unknown')) IN ('baremetal', 'physical', 'unknown')`);
      }

      const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

      const [countRows]: any = await pool.query(
        `SELECT COUNT(*) AS total FROM ${infraTable('agents')} a ${where}`,
        whereBind
      );

      let issueRows: any[] = [];
      try {
        const [events]: any = await pool.query(
          `SELECT agent_id,
                  COUNT(*) AS open_count,
                  MAX(CASE severity WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 WHEN 'unknown' THEN 1 ELSE 0 END) AS max_severity
           FROM ${infraTable('health_events')}
           WHERE severity <> 'ok'
           GROUP BY agent_id`
        );
        issueRows = events || [];
      } catch {
        issueRows = [];
      }

      const issueMap = new Map<number, { count: number; severity: 'P1' | 'P2' | 'P3' | null }>();
      for (const row of issueRows) {
        const sevNum = Number(row.max_severity || 0);
        const severity = sevNum === 3 ? 'P1' : sevNum === 2 ? 'P2' : sevNum === 1 ? 'P3' : null;
        issueMap.set(Number(row.agent_id || 0), { count: Number(row.open_count || 0), severity });
      }

      const [rows]: any = await pool.query(
        `
        SELECT
          a.id AS internal_id,
          a.agent_uuid,
          a.agent_name,
          a.hostname,
          a.os_name,
          a.platform,
          a.platform_version,
          a.serial_number,
          a.machine_type,
          a.virtualization_type,
          a.heartbeat,
          a.last_seen_at,
          ms.id AS snapshot_id,
          ms.captured_at,
          ms.health_status,
          ms.cpu_usage_percent,
          ms.memory_used_percent,
          ms.cpu_frequency_mhz,
          ms.payload_json,
          dm.used_percent AS root_disk_used_percent
        FROM ${infraTable('agents')} a
        LEFT JOIN (
          SELECT ms1.*
          FROM ${infraTable('metric_snapshots')} ms1
          INNER JOIN (
            SELECT agent_id, MAX(captured_at) AS max_captured
            FROM ${infraTable('metric_snapshots')}
            GROUP BY agent_id
          ) latest ON latest.agent_id = ms1.agent_id AND latest.max_captured = ms1.captured_at
        ) ms ON ms.agent_id = a.id
        LEFT JOIN ${infraTable('disk_metrics')} dm
          ON dm.snapshot_id = ms.id AND dm.agent_id = a.id AND dm.mountpoint = '/'
        ${where}
        ORDER BY COALESCE(ms.captured_at, a.last_seen_at, a.updated_at) DESC
        LIMIT ? OFFSET ?`,
        [...whereBind, pageSize, offset]
      );

      const servers = (rows || []).map((r: any) => {
        const payload = parsePayload(r.payload_json) || {};
        const diskRows = extractDiskUsageRows(payload);
        const rootDisk = diskRows.find((d: any) => d?.mountpoint === '/') || diskRows[0] || null;
        const rootDiskPct = r.root_disk_used_percent == null ? readDiskUsedPercent(rootDisk) : toFiniteNumber(r.root_disk_used_percent, 0);
        const collectedAt = r.captured_at || r.last_seen_at || null;
        const freshnessMinutes = collectedAt
          ? Math.floor((Date.now() - new Date(collectedAt).getTime()) / 60000)
          : Number.POSITIVE_INFINITY;
        const machineTypeRaw = String(r.machine_type || '').toLowerCase();
        const heartbeat = r.heartbeat == null ? null : String(r.heartbeat);
        const heartbeatActive = heartbeat ? heartbeat.toLowerCase() === 'active' : null;
        const derivedStatus = deriveInfraStatus(payload, freshnessMinutes, r.health_status);
        const status = heartbeatActive === true ? 'Online' : heartbeatActive === false ? 'Down' : derivedStatus;

        return {
          agentId: String(r.agent_uuid || r.internal_id),
          serialNumber: r.serial_number || null,
          hostname: r.hostname || r.agent_name || String(r.agent_uuid || r.internal_id),
          platform: r.platform || 'unknown',
          os: r.os_name || r.platform || 'unknown',
          osVersion: r.platform_version || 'unknown',
          machineType: machineTypeRaw === 'vm' ? 'VM' : 'Physical',
          status,
          heartbeat,
          isStale: heartbeatActive == null ? (!collectedAt || freshnessMinutes > 10) : !heartbeatActive,
          isAlive: heartbeatActive == null ? status !== 'Down' : heartbeatActive,
          frequencyGHz: Number((toFiniteNumber(r.cpu_frequency_mhz ?? payload?.cpu?.frequencyMHz, 0) / 1000).toFixed(2)),
          cpuUsagePct: Number(toFiniteNumber(r.cpu_usage_percent ?? payload?.cpu?.usagePercent ?? payload?.cpu?.usagePct, 0).toFixed(2)),
          memoryUsagePct: Number(toFiniteNumber(r.memory_used_percent ?? payload?.memory?.usedPercent ?? payload?.memory?.usedPct, 0).toFixed(2)),
          diskUsagePct: Number(rootDiskPct.toFixed(2)),
          issueCount: issueMap.get(Number(r.internal_id || 0))?.count || 0,
          issueSeverity: issueMap.get(Number(r.internal_id || 0))?.severity || null,
          uptimeSeconds: toFiniteNumber(payload?.system?.uptimeSeconds ?? payload?.uptimeSeconds, 0),
          lastCollectedAt: collectedAt,
        };
      });

      return res.json({
        page,
        pageSize,
        total: Number(countRows?.[0]?.total || 0),
        servers,
      });
    }

    const whereParts: string[] = [];
    const whereBindAgents: any[] = [];
    if (q) {
      whereParts.push('(a.id LIKE ? OR a.hostname LIKE ? OR a.os LIKE ? OR a.serial_number LIKE ?)');
      whereBindAgents.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (machineTypeFilter) {
      whereParts.push(`LOWER(COALESCE(am.machine_type, JSON_UNQUOTE(JSON_EXTRACT(am.payload_json, '$.machineType')), 'physical')) = ?`);
      whereBindAgents.push(machineTypeFilter);
    }
    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [countRows]: any = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM agents a
      LEFT JOIN (
        SELECT am1.*
        FROM agent_metrics am1
        INNER JOIN (
          SELECT agent_id, MAX(collected_at) AS max_collected
          FROM agent_metrics
          GROUP BY agent_id
        ) latest ON latest.agent_id = am1.agent_id AND latest.max_collected = am1.collected_at
      ) am ON am.agent_id = a.id
      ${where}
      `,
      whereBindAgents
    );

    const [rows]: any = await pool.query(
      `
      SELECT
        a.id AS agent_id,
        a.serial_number,
        COALESCE(am.hostname, a.hostname, a.id) AS hostname,
        COALESCE(am.platform, 'unknown') AS platform,
        COALESCE(am.distro, a.os, 'unknown') AS distro,
        COALESCE(am.os_version, a.os_version, 'unknown') AS os_version,
        COALESCE(am.machine_type, JSON_UNQUOTE(JSON_EXTRACT(am.payload_json, '$.machineType')), 'Physical') AS machine_type,
        am.collected_at,
        am.payload_json,
        a.status AS agent_status,
        a.last_heartbeat_at,
        JSON_UNQUOTE(JSON_EXTRACT(am.payload_json, '$.cpu.usagePct')) AS cpu_usage,
        JSON_UNQUOTE(JSON_EXTRACT(am.payload_json, '$.memory.usedPct')) AS memory_used,
        JSON_UNQUOTE(JSON_EXTRACT(am.payload_json, '$.uptimeSeconds')) AS uptime_seconds
      FROM agents a
      LEFT JOIN (
        SELECT am1.*
        FROM agent_metrics am1
        INNER JOIN (
          SELECT agent_id, MAX(collected_at) AS max_collected
          FROM agent_metrics
          GROUP BY agent_id
        ) latest ON latest.agent_id = am1.agent_id AND latest.max_collected = am1.collected_at
      ) am ON am.agent_id = a.id
      ${where}
      ORDER BY COALESCE(am.collected_at, a.last_heartbeat_at, a.created_at) DESC
      LIMIT ? OFFSET ?
      `,
      [...whereBindAgents, pageSize, offset]
    );

    const parseLocalPayload = (value: any) => {
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
      const payload = parseLocalPayload(r.payload_json);
      const diskUsage = Array.isArray(payload?.disk?.usage) ? payload.disk.usage : [];
      const root = diskUsage.find((d: any) => d.mountpoint === '/') || diskUsage[0] || null;
      const frequencyMHz = Number(payload?.cpu?.frequencyMHz || 0);
      const collectedAt = r.collected_at ? new Date(r.collected_at) : null;
      const freshnessMinutes = collectedAt ? Math.floor((Date.now() - collectedAt.getTime()) / 60000) : Number.POSITIVE_INFINITY;
      const status = deriveInfraStatus(payload, freshnessMinutes);
      const isStale = !collectedAt || freshnessMinutes > 10;

      return {
        agentId: r.agent_id,
        serialNumber: r.serial_number || null,
        hostname: r.hostname,
        platform: r.platform,
        os: r.distro,
        osVersion: r.os_version,
        machineType: String(r.machine_type || 'Physical'),
        status,
        isStale,
        isAlive: status !== 'Down',
        frequencyGHz: frequencyMHz > 0 ? Number((frequencyMHz / 1000).toFixed(2)) : 0,
        cpuUsagePct: Number(r.cpu_usage || 0),
        memoryUsagePct: Number(r.memory_used || 0),
        diskUsagePct: root ? parsePct(root.usedPct) : 0,
        issueCount: issueMap.get(r.agent_id)?.count || 0,
        issueSeverity: issueMap.get(r.agent_id)?.severity || null,
        uptimeSeconds: Number(r.uptime_seconds || 0),
        lastCollectedAt: r.collected_at || null,
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

app.delete('/api/infra/servers/:agentId', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    const agentId = String(req.params.agentId || '').trim();
    if (!agentId) return res.status(400).json({ error: 'Missing agent id' });

    const [rows]: any = await pool.query(
      `SELECT id, serial_number FROM agents WHERE id = ? LIMIT 1`,
      [agentId]
    );
    if (!rows?.length) return res.status(404).json({ error: 'Agent not found' });
    const serial = String(rows[0].serial_number || '').trim();

    if (serial) {
      await pool.query(`DELETE FROM agent_metrics WHERE agent_id = ? OR serial_number = ?`, [agentId, serial]);
    } else {
      await pool.query(`DELETE FROM agent_metrics WHERE agent_id = ?`, [agentId]);
    }
    await pool.query(`DELETE FROM health_checks WHERE agent_id = ?`, [agentId]);
    await pool.query(`DELETE FROM investigate_tickets WHERE agent_id = ?`, [agentId]);
    await pool.query(`DELETE FROM agents WHERE id = ?`, [agentId]);

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'delete-infra-server',
      actorUsername: actor?.username || null,
      actorRole: actor?.role || null,
      targetType: 'infra-server',
      targetId: agentId,
      severity: 'warning',
      outcome: 'success',
      message: `Infrastructure server deleted: ${agentId}`,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete infrastructure component' });
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

    if (await hasNewInfraSchema()) {
      const [agentRows]: any = await pool.query(
        `SELECT *
         FROM ${infraTable('agents')}
         WHERE agent_uuid = ? OR COALESCE(serial_number, '') = ? OR CAST(id AS CHAR) = ?
         LIMIT 1`,
        [agentId, agentId, agentId]
      );

      if (agentRows?.length) {
        const agent = agentRows[0];
        const [snapshotRows]: any = await pool.query(
          `SELECT id, agent_id, captured_at, health_status,
                  cpu_usage_percent, cpu_load_1, cpu_load_5, cpu_load_15,
                  cpu_frequency_mhz, cpu_temperature_c,
                  memory_total_bytes, memory_used_bytes, memory_available_bytes, memory_used_percent,
                  swap_total_bytes, swap_used_bytes, swap_used_percent,
                  network_bytes_sent, network_bytes_recv,
                  network_packets_sent, network_packets_recv,
                  disk_read_bytes, disk_write_bytes,
                  bandwidth_in_bps, bandwidth_out_bps,
                  disk_read_iops, disk_write_iops,
                  port_throughput_in_bps, port_throughput_out_bps,
                  network_latency_ms, network_latency_avg_ms, network_latency_min_ms, network_latency_max_ms,
                  network_latency_trend_json,
                  process_total, process_hung, process_zombie,
                  diagnostics_json, payload_json
           FROM ${infraTable('metric_snapshots')}
           WHERE agent_id = ?
           ORDER BY captured_at DESC
           LIMIT ?`,
          [agent.id, limit]
        );

        if (!snapshotRows?.length) {
          return res.status(404).json({ error: 'Server not found' });
        }

        const chronologicalRows = [...snapshotRows].reverse();
        let prevNetwork: { at: number; recv: number; sent: number } | null = null;
        const healthTrend = chronologicalRows.map((r: any) => {
          const payload = parsePayload(r.payload_json) || {};
          const perf = payload?.performance || {};
          const at = new Date(r.captured_at).getTime();
          const recv = toFiniteNumber(r.network_bytes_recv ?? perf?.networkBytesRecv, 0);
          const sent = toFiniteNumber(r.network_bytes_sent ?? perf?.networkBytesSent, 0);
          let rxMbps = firstFinite(
            r.bandwidth_in_bps == null ? null : Number((toFiniteNumber(r.bandwidth_in_bps, 0) / 1_000_000).toFixed(2)),
            perf?.rxMbps,
            payload?.network?.rxMbps
          );
          let txMbps = firstFinite(
            r.bandwidth_out_bps == null ? null : Number((toFiniteNumber(r.bandwidth_out_bps, 0) / 1_000_000).toFixed(2)),
            perf?.txMbps,
            payload?.network?.txMbps
          );
          let downloadMbps = firstFinite(
            r.port_throughput_in_bps == null ? null : Number((toFiniteNumber(r.port_throughput_in_bps, 0) / 1_000_000).toFixed(2)),
            perf?.throughputMbps,
            perf?.downloadMbps,
            payload?.network?.downloadMbps
          );
          const latencyMs = firstFinite(
            r.network_latency_avg_ms,
            r.network_latency_ms,
            r.network_latency_min_ms,
            r.network_latency_max_ms,
            perf?.latencyMs,
            payload?.network?.latencyMs,
            payload?.health?.networkLatencyMs
          );

          if (prevNetwork && Number.isFinite(at)) {
            const seconds = Math.max(1, (at - prevNetwork.at) / 1000);
            if (rxMbps == null) rxMbps = Number(Math.max(0, ((recv - prevNetwork.recv) * 8) / seconds / 1_000_000).toFixed(2));
            if (txMbps == null) txMbps = Number(Math.max(0, ((sent - prevNetwork.sent) * 8) / seconds / 1_000_000).toFixed(2));
            if (downloadMbps == null) downloadMbps = rxMbps;
          }

          prevNetwork = { at, recv, sent };
          return {
            time: new Date(r.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            latencyMs,
            downloadMbps,
            rxMbps,
            txMbps,
          };
        });

        const points = chronologicalRows.map((r: any, index: number) => {
          const payload = parsePayload(r.payload_json) || {};
          const throughput = healthTrend[index];
          return {
            time: throughput?.time || new Date(r.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            cpu: toFiniteNumber(r.cpu_usage_percent ?? payload?.cpu?.usagePercent ?? payload?.cpu?.usagePct, 0),
            memory: toFiniteNumber(r.memory_used_percent ?? payload?.memory?.usedPercent ?? payload?.memory?.usedPct, 0),
            network: Number((((throughput?.rxMbps || 0) + (throughput?.txMbps || 0))).toFixed(2)),
            payload,
            collectedAt: r.captured_at,
          };
        });

        const latestRaw = snapshotRows[0];
        const latestPayload = parsePayload(latestRaw.payload_json) || {};
        const latestPerf = latestPayload?.performance || {};
        const previousRaw = snapshotRows[1] || null;
        const sampleWindowSeconds = previousRaw
          ? Math.max(1, (new Date(latestRaw.captured_at).getTime() - new Date(previousRaw.captured_at).getTime()) / 1000)
          : null;
        const diskReadThroughputMBps = sampleWindowSeconds
          ? Number(Math.max(0, (toFiniteNumber(latestRaw.disk_read_bytes, 0) - toFiniteNumber(previousRaw?.disk_read_bytes, 0)) / sampleWindowSeconds / 1_000_000).toFixed(2))
          : null;
        const diskWriteThroughputMBps = sampleWindowSeconds
          ? Number(Math.max(0, (toFiniteNumber(latestRaw.disk_write_bytes, 0) - toFiniteNumber(previousRaw?.disk_write_bytes, 0)) / sampleWindowSeconds / 1_000_000).toFixed(2))
          : null;

        const [diskRows]: any = await pool.query(
          `SELECT device_name, mountpoint, fs_type, total_bytes, used_bytes, free_bytes, used_percent,
                  inode_used_percent, read_bytes, write_bytes, health_status, smart_summary
           FROM ${infraTable('disk_metrics')}
           WHERE agent_id = ? AND snapshot_id = ?
           ORDER BY mountpoint ASC`,
          [agent.id, latestRaw.id]
        );

        const [networkRows]: any = await pool.query(
          `SELECT interface_name, mac_address, mtu, flags_json, addresses_json,
                  bytes_sent, bytes_recv, packets_sent, packets_recv, errors_in, errors_out, drop_in, drop_out
           FROM ${infraTable('network_interfaces')}
           WHERE agent_id = ? AND snapshot_id = ?
           ORDER BY interface_name ASC`,
          [agent.id, latestRaw.id]
        );

        const [dockerRows]: any = await pool.query(
          `SELECT container_identifier, container_name, image_name, state_name, status_text,
                  cpu_percent, memory_percent, net_rx_bytes, net_tx_bytes,
                  block_read_bytes, block_write_bytes, pids
           FROM ${infraTable('docker_container_stats')}
           WHERE agent_id = ? AND snapshot_id = ?
           ORDER BY container_name ASC`,
          [agent.id, latestRaw.id]
        );

        let issueRows: any[] = [];
        try {
          const [events]: any = await pool.query(
            `SELECT id, check_name, severity, message, captured_at
             FROM ${infraTable('health_events')}
             WHERE agent_id = ? AND severity <> 'ok'
             ORDER BY FIELD(severity, 'critical', 'warning', 'unknown'), captured_at DESC
             LIMIT 50`,
            [agent.id]
          );
          const deduped = new Map<string, any>();
          for (const row of events || []) {
            const key = `${String(row?.check_name || '').toLowerCase()}|${String(row?.severity || '').toLowerCase()}|${String(row?.message || '').trim().toLowerCase()}`;
            if (!deduped.has(key)) deduped.set(key, row);
          }
          issueRows = Array.from(deduped.values());
        } catch {
          issueRows = [];
        }

        const diskSource = (diskRows?.length
          ? diskRows
          : extractDiskUsageRows(latestPayload).map((d: any) => ({
            mountpoint: d?.mountpoint || 'unknown',
            fs_type: d?.fs_type || d?.fsType || d?.filesystem || 'unknown',
            total_bytes: d?.total_bytes ?? d?.totalBytes ?? d?.sizeBytes ?? 0,
            used_bytes: d?.used_bytes ?? d?.usedBytes ?? 0,
            free_bytes: d?.free_bytes ?? d?.freeBytes ?? d?.availBytes ?? 0,
            used_percent: d?.used_percent ?? d?.usedPercent ?? d?.usedPct ?? 0,
            inode_used_percent: d?.inode_used_percent ?? d?.inodesUsedPercent ?? null,
          }))) || [];

        const diskMounts = diskSource.map((d: any) => ({
          mountpoint: d.mountpoint || 'unknown',
          filesystem: d.fs_type || d.filesystem || 'unknown',
          usedPct: toFiniteNumber(d.used_percent ?? d.usedPct ?? d.usedPercent, 0),
          usedBytes: toFiniteNumber(d.used_bytes ?? d.usedBytes, 0),
          availBytes: toFiniteNumber(d.free_bytes ?? d.freeBytes ?? d.availBytes, 0),
          sizeBytes: toFiniteNumber(d.total_bytes ?? d.totalBytes ?? d.sizeBytes, 0),
          readBytes: toFiniteNumber(d.read_bytes ?? d.readBytes, 0),
          writeBytes: toFiniteNumber(d.write_bytes ?? d.writeBytes, 0),
          healthStatus: d.health_status || d.health || null,
          smartSummary: d.smart_summary || d.smartSummary || d.smart || null,
        }));

        const inodeMounts = diskSource.map((d: any) => ({
          mountpoint: d.mountpoint || 'unknown',
          filesystem: d.fs_type || d.filesystem || 'unknown',
          usedPct: toFiniteNumber(d.inode_used_percent ?? d.inodesUsedPercent, 0),
          used: null,
          free: null,
          inodes: null,
        }));

        const payloadInterfaces = Array.isArray(latestPayload?.network?.interfaces) ? latestPayload.network.interfaces : [];
        const networkInterfaces = (networkRows?.length
          ? networkRows.map((row: any) => {
            const addresses = Array.isArray(parsePayload(row.addresses_json)) ? parsePayload(row.addresses_json) : [];
            return {
              name: row.interface_name,
              macAddress: row.mac_address || null,
              mtu: row.mtu == null ? null : Number(row.mtu),
              bytesSent: toFiniteNumber(row.bytes_sent, 0),
              bytesRecv: toFiniteNumber(row.bytes_recv, 0),
              packetsSent: toFiniteNumber(row.packets_sent, 0),
              packetsRecv: toFiniteNumber(row.packets_recv, 0),
              errorsIn: toFiniteNumber(row.errors_in, 0),
              errorsOut: toFiniteNumber(row.errors_out, 0),
              dropIn: toFiniteNumber(row.drop_in, 0),
              dropOut: toFiniteNumber(row.drop_out, 0),
              addresses: addresses
                .map((entry: any) => {
                  const address = typeof entry === 'string'
                    ? entry
                    : String(entry?.address || entry?.addr || '').trim();
                  if (!address) return null;
                  const bare = address.split('/')[0] || address;
                  return {
                    family: bare.includes(':') ? 'IPv6' : 'IPv4',
                    address,
                    internal: /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|::1|fe80:)/i.test(bare),
                  };
                })
                .filter(Boolean),
            };
          })
          : payloadInterfaces.map((iface: any) => ({
            name: String(iface?.name || 'unknown'),
            macAddress: iface?.hardwareAddr || null,
            mtu: iface?.mtu == null ? null : Number(iface.mtu),
            bytesSent: toFiniteNumber(iface?.bytesSent, 0),
            bytesRecv: toFiniteNumber(iface?.bytesRecv, 0),
            packetsSent: toFiniteNumber(iface?.packetsSent, 0),
            packetsRecv: toFiniteNumber(iface?.packetsRecv, 0),
            errorsIn: toFiniteNumber(iface?.errorIn ?? iface?.errorsIn, 0),
            errorsOut: toFiniteNumber(iface?.errorOut ?? iface?.errorsOut, 0),
            dropIn: toFiniteNumber(iface?.dropIn, 0),
            dropOut: toFiniteNumber(iface?.dropOut, 0),
            addresses: (Array.isArray(iface?.addresses) ? iface.addresses : [])
              .map((entry: any) => {
                const address = typeof entry === 'string'
                  ? entry
                  : String(entry?.address || entry?.addr || '').trim();
                if (!address) return null;
                const bare = address.split('/')[0] || address;
                return {
                  family: bare.includes(':') ? 'IPv6' : 'IPv4',
                  address,
                  internal: /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|::1|fe80:)/i.test(bare),
                };
              })
              .filter(Boolean),
          })))
          .filter((iface: any) => Array.isArray(iface.addresses) && iface.addresses.length > 0);

        const dockerPayload = latestPayload?.docker && typeof latestPayload.docker === 'object' ? latestPayload.docker : {};
        const dockerContainers = (dockerRows?.length
          ? dockerRows.map((row: any) => ({
            id: String(row.container_identifier || row.container_name || ''),
            name: String(row.container_name || row.container_identifier || 'container'),
            image: row.image_name || null,
            state: row.state_name || null,
            status: row.status_text || null,
            cpuPercent: firstFinite(row.cpu_percent),
            memoryPercent: firstFinite(row.memory_percent),
            netRxBytes: toFiniteNumber(row.net_rx_bytes, 0),
            netTxBytes: toFiniteNumber(row.net_tx_bytes, 0),
            blockReadBytes: toFiniteNumber(row.block_read_bytes, 0),
            blockWriteBytes: toFiniteNumber(row.block_write_bytes, 0),
            pids: row.pids == null ? null : Number(row.pids),
          }))
          : (Array.isArray(dockerPayload?.containers) ? dockerPayload.containers : []).map((row: any, index: number) => ({
            id: String(row?.id || row?.name || index),
            name: String(row?.name || row?.id || 'container'),
            image: row?.image || null,
            state: row?.state || null,
            status: row?.status || null,
            cpuPercent: firstFinite(row?.cpuPercent),
            memoryPercent: firstFinite(row?.memoryPercent),
            netRxBytes: toFiniteNumber(row?.netRxBytes, 0),
            netTxBytes: toFiniteNumber(row?.netTxBytes, 0),
            blockReadBytes: toFiniteNumber(row?.blockReadBytes, 0),
            blockWriteBytes: toFiniteNumber(row?.blockWriteBytes, 0),
            pids: row?.pids == null ? null : Number(row.pids),
          })));

        const latestHealthPoint = healthTrend[healthTrend.length - 1] || { latencyMs: null, downloadMbps: null, rxMbps: null, txMbps: null };
        const rootDisk = diskMounts.find((d: any) => d.mountpoint === '/') || diskMounts[0] || null;
        const freshnessMinutes = Math.floor((Date.now() - new Date(latestRaw.captured_at).getTime()) / 60000);
        const heartbeat = agent.heartbeat == null ? null : String(agent.heartbeat);
        const heartbeatActive = heartbeat ? heartbeat.toLowerCase() === 'active' : null;
        const hostStatus = heartbeatActive === true ? 'Online' : freshnessMinutes <= 30 ? 'Delayed' : 'Down';
        const currentSeverity = String(latestRaw.health_status || latestPayload?.health?.overall || '').toLowerCase();
        const score = currentSeverity === 'critical' ? 45 : currentSeverity === 'warning' ? 78 : currentSeverity === 'ok' ? 96 : null;
        const scoreStatus = currentSeverity === 'critical'
          ? 'Critical'
          : currentSeverity === 'warning'
            ? 'Warning'
            : currentSeverity === 'ok'
              ? 'Info'
              : null;

        const performanceTrend = chronologicalRows.map((r: any, index: number) => {
          const payload = parsePayload(r.payload_json) || {};
          const perf = payload?.performance || {};
          const disks = extractDiskUsageRows(payload);
          const root = disks.find((d: any) => d?.mountpoint === '/') || disks[0] || null;
          const healthPoint = healthTrend[index] || {};

          return {
            time: healthPoint?.time || new Date(r.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            latencyMs: firstFinite(
              r.network_latency_avg_ms,
              r.network_latency_ms,
              r.network_latency_min_ms,
              r.network_latency_max_ms,
              perf?.latencyMs,
              payload?.network?.latencyMs,
              payload?.health?.networkLatencyMs,
              healthPoint?.latencyMs
            ),
            throughputMbps: firstFinite(
              r.port_throughput_in_bps == null ? null : Number((toFiniteNumber(r.port_throughput_in_bps, 0) / 1_000_000).toFixed(2)),
              r.port_throughput_out_bps == null ? null : Number((toFiniteNumber(r.port_throughput_out_bps, 0) / 1_000_000).toFixed(2)),
              perf?.throughputMbps,
              perf?.downloadMbps,
              payload?.network?.downloadMbps,
              healthPoint?.downloadMbps,
              healthPoint?.rxMbps
            ),
            bandwidthMbps: firstFinite(
              (r.bandwidth_in_bps != null || r.bandwidth_out_bps != null)
                ? Number(((toFiniteNumber(r.bandwidth_in_bps, 0) + toFiniteNumber(r.bandwidth_out_bps, 0)) / 1_000_000).toFixed(2))
                : null,
              perf?.bandwidthMbps,
              perf?.networkBandwidthMbps,
              (healthPoint?.rxMbps != null || healthPoint?.txMbps != null) ? Number(((healthPoint?.rxMbps || 0) + (healthPoint?.txMbps || 0)).toFixed(2)) : null
            ),
            iops: firstFinite(
              (r.disk_read_iops != null || r.disk_write_iops != null) ? Number((toFiniteNumber(r.disk_read_iops, 0) + toFiniteNumber(r.disk_write_iops, 0)).toFixed(2)) : null,
              perf?.iops,
              perf?.iopsTotal,
              payload?.disk?.iops,
              payload?.storage?.iops,
              disks.reduce((sum: number, d: any) => sum + toFiniteNumber(d?.readOps, 0) + toFiniteNumber(d?.writeOps, 0), 0) || null
            ),
            diskUsagePct: root ? Number(readDiskUsedPercent(root).toFixed(2)) : null,
          };
        });

        const healthChecks = Array.isArray(latestPayload?.health?.checks) ? latestPayload.health.checks : [];
        const scoringComponents = healthChecks.reduce((acc: Record<string, { weight: number; status: string; metrics: Record<string, any> }>, check: any, index: number) => {
          const key = String(check?.name || `check${index + 1}`);
          const rawStatus = String(check?.status || '').toLowerCase();
          acc[key] = {
            weight: 1,
            status: rawStatus === 'critical' || rawStatus === 'error'
              ? 'Critical'
              : rawStatus === 'warning'
                ? 'Warning'
                : rawStatus === 'ok'
                  ? 'Healthy'
                  : 'Unknown',
            metrics: { message: String(check?.message || '').trim() },
          };
          return acc;
        }, {});

        const issueDescriptions = issueRows.map((row: any) => String(row.message || '').trim()).filter(Boolean);
        const payloadHealthReasons = healthChecks
          .filter((check: any) => String(check?.status || '').toLowerCase() !== 'ok')
          .map((check: any) => String(check?.message || check?.name || '').trim())
          .filter(Boolean);
        const majorIssueReasons = Array.from(new Set([...issueDescriptions, ...payloadHealthReasons]));

        return res.json({
          agentId: String(agent.agent_uuid || agent.id),
          host: {
            hostname: agent.hostname || latestPayload?.system?.hostname || agent.agent_name || String(agent.agent_uuid || agent.id),
            agentName: agent.agent_name || null,
            serialNumber: agent.serial_number || latestPayload?.system?.serialNumber || latestPayload?.system?.serialHint || null,
            platform: agent.platform || latestPayload?.system?.platform || 'unknown',
            os: agent.os_name || latestPayload?.system?.os || agent.platform || 'unknown',
            osVersion: agent.platform_version || latestPayload?.system?.platformVersion || 'unknown',
            kernelVersion: agent.kernel_version || latestPayload?.system?.kernelVersion || null,
            architecture: agent.architecture || latestPayload?.system?.architecture || latestPayload?.system?.kernelArch || null,
            virtualizationType: agent.virtualization_type || latestPayload?.system?.virtualization || null,
            machineType: agent.machine_type || null,
            uptimeSeconds: toFiniteNumber(latestPayload?.system?.uptimeSeconds ?? latestPayload?.uptimeSeconds, 0),
            firstSeenAt: agent.first_seen_at || null,
            lastSeenAt: agent.last_seen_at || latestRaw.captured_at,
            collectedAt: latestRaw.captured_at,
            heartbeat,
            status: hostStatus,
          },
          performance: {
            cpuUsagePct: Number(toFiniteNumber(latestRaw.cpu_usage_percent ?? latestPayload?.cpu?.usagePercent ?? latestPayload?.cpu?.usagePct, 0).toFixed(2)),
            memoryUsagePct: Number(toFiniteNumber(latestRaw.memory_used_percent ?? latestPayload?.memory?.usedPercent ?? latestPayload?.memory?.usedPct, 0).toFixed(2)),
            networkUsagePct: Number(Math.min(100, ((latestHealthPoint.rxMbps || 0) + (latestHealthPoint.txMbps || 0)) * 10).toFixed(2)),
            diskUsagePct: rootDisk ? Number(toFiniteNumber(rootDisk.usedPct, 0).toFixed(2)) : 0,
            latencyMs: firstFinite(
              latestRaw.network_latency_avg_ms,
              latestRaw.network_latency_ms,
              latestRaw.network_latency_min_ms,
              latestRaw.network_latency_max_ms,
              latestPerf?.latencyMs,
              latestPayload?.network?.latencyMs,
              latestPayload?.health?.networkLatencyMs,
              latestHealthPoint.latencyMs
            ),
            throughputMbps: firstFinite(
              latestRaw.port_throughput_in_bps == null ? null : Number((toFiniteNumber(latestRaw.port_throughput_in_bps, 0) / 1_000_000).toFixed(2)),
              latestRaw.port_throughput_out_bps == null ? null : Number((toFiniteNumber(latestRaw.port_throughput_out_bps, 0) / 1_000_000).toFixed(2)),
              latestPerf?.throughputMbps,
              latestPerf?.downloadMbps,
              latestPayload?.network?.downloadMbps,
              latestHealthPoint.downloadMbps,
              latestHealthPoint.rxMbps
            ),
            bandwidthMbps: firstFinite(
              (latestRaw.bandwidth_in_bps != null || latestRaw.bandwidth_out_bps != null)
                ? Number(((toFiniteNumber(latestRaw.bandwidth_in_bps, 0) + toFiniteNumber(latestRaw.bandwidth_out_bps, 0)) / 1_000_000).toFixed(2))
                : null,
              latestPerf?.bandwidthMbps,
              latestPerf?.networkBandwidthMbps,
              ((latestHealthPoint.rxMbps || 0) + (latestHealthPoint.txMbps || 0))
            ),
            iops: firstFinite(
              (latestRaw.disk_read_iops != null || latestRaw.disk_write_iops != null)
                ? Number((toFiniteNumber(latestRaw.disk_read_iops, 0) + toFiniteNumber(latestRaw.disk_write_iops, 0)).toFixed(2))
                : null,
              latestPerf?.iops,
              latestPerf?.iopsTotal,
              latestPayload?.disk?.iops,
              latestPayload?.storage?.iops
            ),
            diskReadThroughputMBps: diskReadThroughputMBps == null ? null : Number(diskReadThroughputMBps.toFixed(2)),
            diskWriteThroughputMBps: diskWriteThroughputMBps == null ? null : Number(diskWriteThroughputMBps.toFixed(2)),
          },
          cpu: {
            load: [
              toFiniteNumber(latestRaw.cpu_load_1, 0),
              toFiniteNumber(latestRaw.cpu_load_5, 0),
              toFiniteNumber(latestRaw.cpu_load_15, 0),
            ],
            cores: toFiniteNumber(latestPayload?.cpu?.logicalCores ?? latestPayload?.cpu?.cores, 0),
            physicalCores: toFiniteNumber(latestPayload?.cpu?.physicalCores ?? latestPayload?.cpu?.cores, 0),
            logicalCores: toFiniteNumber(latestPayload?.cpu?.logicalCores ?? latestPayload?.cpu?.cores, 0),
            usagePct: Number(toFiniteNumber(latestRaw.cpu_usage_percent ?? latestPayload?.cpu?.usagePercent ?? latestPayload?.cpu?.usagePct, 0).toFixed(2)),
            frequencyMHz: latestRaw.cpu_frequency_mhz == null ? (latestPayload?.cpu?.frequencyMHz ?? null) : Number(latestRaw.cpu_frequency_mhz),
            temperatureC: latestRaw.cpu_temperature_c == null ? null : Number(latestRaw.cpu_temperature_c),
          },
          memory: {
            total: toFiniteNumber(latestRaw.memory_total_bytes ?? latestPayload?.memory?.totalBytes ?? latestPayload?.memory?.total, 0),
            used: toFiniteNumber(latestRaw.memory_used_bytes ?? latestPayload?.memory?.usedBytes ?? latestPayload?.memory?.used, 0),
            free: toFiniteNumber(latestRaw.memory_available_bytes ?? latestPayload?.memory?.availableBytes ?? latestPayload?.memory?.free, 0),
            usedPct: Number(toFiniteNumber(latestRaw.memory_used_percent ?? latestPayload?.memory?.usedPercent ?? latestPayload?.memory?.usedPct, 0).toFixed(2)),
            swapTotal: toFiniteNumber(latestRaw.swap_total_bytes ?? latestPayload?.memory?.swapTotalBytes ?? latestPayload?.memory?.swap?.total, 0),
            swapUsed: toFiniteNumber(latestRaw.swap_used_bytes ?? latestPayload?.memory?.swapUsedBytes ?? latestPayload?.memory?.swap?.used, 0),
            swapFree: Math.max(
              0,
              toFiniteNumber(latestRaw.swap_total_bytes ?? latestPayload?.memory?.swapTotalBytes ?? latestPayload?.memory?.swap?.total, 0)
              - toFiniteNumber(latestRaw.swap_used_bytes ?? latestPayload?.memory?.swapUsedBytes ?? latestPayload?.memory?.swap?.used, 0)
            ),
            swapUsedPct: Number(toFiniteNumber(latestRaw.swap_used_percent ?? latestPayload?.memory?.swapUsedPercent ?? latestPayload?.memory?.swap?.usedPct, 0).toFixed(2)),
          },
          cpuTrend: points.map((p: any) => ({ time: p.time, value: Number(p.cpu.toFixed(2)) })),
          memoryTrend: points.map((p: any) => ({ time: p.time, value: Number(p.memory.toFixed(2)) })),
          networkTrend: points.map((p: any) => ({ time: p.time, value: Number(p.network.toFixed(2)) })),
          performanceTrend,
          diskMounts,
          inodeMounts,
          networkInterfaces,
          docker: {
            enabled: boolish(dockerPayload?.enabled) || dockerContainers.length > 0,
            total: toFiniteNumber(dockerPayload?.total ?? dockerContainers.length, dockerContainers.length),
            running: toFiniteNumber(dockerPayload?.running ?? dockerContainers.filter((c: any) => String(c?.state || '').toLowerCase() === 'running').length, 0),
            error: String(dockerPayload?.error || '').trim() || null,
            statusText: dockerContainers.length
              ? 'Docker running'
              : 'Docker not running or Not Available',
            containers: dockerContainers,
          },
          issues: issueRows.map((row: any) => ({
            ticket_id: `HE-${row.id}`,
            metric_type: String(row.check_name || 'health'),
            resource_key: 'system',
            severity: row.severity === 'critical' ? 'P1' : row.severity === 'warning' ? 'P2' : 'P3',
            current_value: null,
            threshold_value: null,
            description: String(row.message || '').trim(),
          })),
          health: {
            serverHealthy: currentSeverity !== 'critical' && freshnessMinutes <= 10,
            score,
            scoreStatus,
            majorIssueReasons,
            scoringComponents,
            cpuUsagePct: Number(toFiniteNumber(latestRaw.cpu_usage_percent ?? latestPayload?.cpu?.usagePercent ?? latestPayload?.cpu?.usagePct, 0).toFixed(2)),
            memoryUsagePct: Number(toFiniteNumber(latestRaw.memory_used_percent ?? latestPayload?.memory?.usedPercent ?? latestPayload?.memory?.usedPct, 0).toFixed(2)),
            cpuTemperatureC: latestRaw.cpu_temperature_c == null ? null : Number(latestRaw.cpu_temperature_c),
            networkLatencyMs: firstFinite(
              latestRaw.network_latency_avg_ms,
              latestRaw.network_latency_ms,
              latestRaw.network_latency_min_ms,
              latestRaw.network_latency_max_ms,
              latestPerf?.latencyMs,
              latestPayload?.network?.latencyMs,
              latestPayload?.health?.networkLatencyMs,
              latestHealthPoint.latencyMs
            ),
            networkDownloadMbps: latestHealthPoint.downloadMbps,
            networkRxMbps: latestHealthPoint.rxMbps,
            networkTxMbps: latestHealthPoint.txMbps,
            failedServicesCount: issueRows.filter((row: any) => ['critical', 'warning'].includes(String(row.severity || '').toLowerCase())).length,
            hungProcessCount: 0,
            checkedAt: latestRaw.captured_at,
          },
          healthTrend,
        });
      }
    }

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

    const parseLocalPayload = (value: any) => {
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
        const payload = parseLocalPayload(r.payload_json);
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
    const toAddressRows = (value: any) => {
      const normalizeOne = (entry: any) => {
        if (!entry) return null;
        if (typeof entry === 'string') {
          return {
            family: entry.includes(':') ? 'IPv6' : 'IPv4',
            address: entry,
            internal: false,
          };
        }
        if (typeof entry !== 'object') return null;
        const address = String(entry.address || entry.addr || entry.ip || entry.local || '').trim();
        if (!address) return null;
        const familyRaw = String(entry.family || entry.type || '').toUpperCase();
        const family = familyRaw.includes('6') ? 'IPv6' : (familyRaw.includes('4') ? 'IPv4' : (address.includes(':') ? 'IPv6' : 'IPv4'));
        return {
          family,
          address,
          internal: !!entry.internal,
        };
      };

      if (Array.isArray(value)) {
        return value.map(normalizeOne).filter(Boolean);
      }
      if (value && typeof value === 'object') {
        const source = Array.isArray(value.addresses)
          ? value.addresses
          : Array.isArray(value.addrs)
            ? value.addrs
            : [];
        return source.map(normalizeOne).filter(Boolean);
      }
      return [];
    };

    const networkInterfaces = Object.entries(networkMap)
      .map(([name, raw]) => ({
        name,
        addresses: toAddressRows(raw),
      }))
      .filter((iface) => iface.addresses.length > 0);

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
        const payload = parseLocalPayload(h.payload_json) || {};
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
              t.current_value, t.threshold_value, t.status, t.description, t.work_notes,
              CASE
                WHEN t.status = 'Resolved' AND (t.ticket_state IS NULL OR t.ticket_state = 'In progress' OR t.ticket_state = 'ServiceNow') THEN 'Resolved'
                ELSE COALESCE(t.ticket_state, CASE
                  WHEN s.incident_number IS NOT NULL AND s.status = 'Created' THEN 'ServiceNow'
                  WHEN t.status = 'Resolved' THEN 'Resolved'
                  ELSE 'In progress'
                END)
              END AS ticket_state,
              t.created_at, t.updated_at, t.resolved_at,
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

app.get('/api/investigate/:ticketId', async (req, res) => {
  try {
    const ticketId = String(req.params.ticketId || '').trim();
    if (!ticketId) return res.status(400).json({ error: 'ticketId is required' });

    const [rows]: any = await pool.query(
      `SELECT t.ticket_id, t.agent_id, t.hostname, t.metric_type, t.resource_key, t.severity,
              t.current_value, t.threshold_value, t.status, t.description, t.work_notes,
              CASE
                WHEN t.status = 'Resolved' AND (t.ticket_state IS NULL OR t.ticket_state = 'In progress' OR t.ticket_state = 'ServiceNow') THEN 'Resolved'
                ELSE COALESCE(t.ticket_state, CASE
                  WHEN s.incident_number IS NOT NULL AND s.status = 'Created' THEN 'ServiceNow'
                  WHEN t.status = 'Resolved' THEN 'Resolved'
                  ELSE 'In progress'
                END)
              END AS ticket_state,
              t.created_at, t.updated_at, t.resolved_at,
              s.incident_number AS service_now_incident, s.status AS service_now_status
       FROM investigate_tickets t
       LEFT JOIN servicenow_incidents s ON s.investigate_ticket_id = t.ticket_id
       WHERE t.ticket_id = ?
       LIMIT 1`,
      [ticketId]
    );

    if (!rows?.length) {
      return res.status(404).json({ error: 'Investigate ticket not found' });
    }

    const [activityRows]: any = await pool.query(
      `SELECT id, ticket_id, note_text, ticket_state, actor_username, actor_role, note_source, created_at
       FROM investigate_ticket_updates
       WHERE ticket_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [ticketId]
    );

    res.json({ ticket: rows[0], activities: activityRows || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load investigate ticket' });
  }
});

app.patch('/api/investigate/:ticketId/resolve', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    const ticketId = String(req.params.ticketId || '').trim();
    if (!ticketId) return res.status(400).json({ error: 'ticketId is required' });

    const [result]: any = await pool.query(
      `UPDATE investigate_tickets
       SET status = 'Resolved', ticket_state = 'Resolved', resolved_at = NOW(), updated_at = NOW()
       WHERE ticket_id = ?`,
      [ticketId]
    );

    if (!result?.affectedRows) {
      return res.status(404).json({ error: 'Investigate ticket not found' });
    }

    await appendInvestigateTicketActivity({
      ticketId,
      noteText: 'Ticket manually marked as resolved.',
      ticketState: 'Resolved',
      actorUsername: actor?.username || null,
      actorRole: actor?.role || null,
      noteSource: 'status-change',
    });

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'resolve-investigate-ticket',
      actorUsername: actor?.username || null,
      actorRole: actor?.role || null,
      targetType: 'investigate-ticket',
      targetId: ticketId,
      outcome: 'success',
      message: `Investigate ticket resolved: ${ticketId}`,
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to resolve investigate ticket' });
  }
});

app.delete('/api/investigate/:ticketId', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    const ticketId = String(req.params.ticketId || '').trim();
    if (!ticketId) return res.status(400).json({ error: 'ticketId is required' });

    await pool.query(`DELETE FROM servicenow_incidents WHERE investigate_ticket_id = ?`, [ticketId]);
    await pool.query(`DELETE FROM investigate_ticket_updates WHERE ticket_id = ?`, [ticketId]);
    const [result]: any = await pool.query(`DELETE FROM investigate_tickets WHERE ticket_id = ?`, [ticketId]);

    if (!result?.affectedRows) {
      return res.status(404).json({ error: 'Investigate ticket not found' });
    }

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'delete-investigate-ticket',
      actorUsername: actor?.username || null,
      actorRole: actor?.role || null,
      targetType: 'investigate-ticket',
      targetId: ticketId,
      severity: 'warning',
      outcome: 'success',
      message: `Investigate ticket deleted: ${ticketId}`,
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete investigate ticket' });
  }
});

app.get('/api/investigate/:ticketId/servicenow-url', async (req, res) => {
  try {
    const ticketId = String(req.params.ticketId || '').trim();
    if (!ticketId) return res.status(400).json({ error: 'ticketId is required' });
    if (!SNOW_INSTANCE_URL) {
      return res.status(404).json({ error: 'ServiceNow is not configured' });
    }

    const [rows]: any = await pool.query(
      `SELECT incident_number, sys_id, status
       FROM servicenow_incidents
       WHERE investigate_ticket_id = ?
       LIMIT 1`,
      [ticketId]
    );

    const incident = rows?.[0];
    if (!incident || incident.status !== 'Created') {
      return res.status(404).json({ error: 'No ServiceNow incident found for this ticket' });
    }

    const url = incident.sys_id
      ? `${SNOW_INSTANCE_URL}/nav_to.do?uri=incident.do?sys_id=${encodeURIComponent(String(incident.sys_id))}`
      : incident.incident_number
        ? `${SNOW_INSTANCE_URL}/nav_to.do?uri=incident_list.do?sysparm_query=number=${encodeURIComponent(String(incident.incident_number))}`
        : null;

    if (!url) {
      return res.status(404).json({ error: 'No ServiceNow incident link available for this ticket' });
    }

    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load ServiceNow incident link' });
  }
});

app.patch('/api/investigate/:ticketId/work-notes', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    const ticketId = String(req.params.ticketId || '').trim();
    const workNotes = String(req.body?.workNotes || '').trim();
    const requestedState = String(req.body?.ticketState || '').trim();
    if (!ticketId) return res.status(400).json({ error: 'ticketId is required' });

    const [existingRows]: any = await pool.query(
      `SELECT t.ticket_id, t.work_notes, t.status, t.ticket_state, s.incident_number AS service_now_incident
       FROM investigate_tickets t
       LEFT JOIN servicenow_incidents s ON s.investigate_ticket_id = t.ticket_id
       WHERE t.ticket_id = ?
       LIMIT 1`,
      [ticketId]
    );

    const existing = existingRows?.[0];
    if (!existing) {
      return res.status(404).json({ error: 'Investigate ticket not found' });
    }

    const currentState = derivedInvestigateTicketState(existing);
    const nextState = normalizeInvestigateTicketState(requestedState, currentState);
    const nextStatus = ['Resolved', 'Canceled', 'Closed Un-resolved'].includes(nextState) ? 'Resolved' : 'Open';

    const [result]: any = await pool.query(
      `UPDATE investigate_tickets
       SET work_notes = ?, ticket_state = ?, status = ?,
           resolved_at = CASE WHEN ? = 'Open' THEN NULL ELSE COALESCE(resolved_at, NOW()) END,
           updated_at = NOW()
       WHERE ticket_id = ?`,
      [workNotes || null, nextState, nextStatus, nextStatus, ticketId]
    );

    if (!result?.affectedRows) {
      return res.status(404).json({ error: 'Investigate ticket not found' });
    }

    const notesChanged = workNotes !== String(existing.work_notes || '').trim();
    const stateChanged = nextState !== currentState;

    if (notesChanged || stateChanged) {
      await appendInvestigateTicketActivity({
        ticketId,
        noteText: notesChanged ? workNotes : null,
        ticketState: nextState,
        actorUsername: actor?.username || null,
        actorRole: actor?.role || null,
        noteSource: stateChanged ? 'status-change' : 'manual-note',
      });
    }

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'edit-investigate-work-notes',
      actorUsername: actor?.username || null,
      actorRole: actor?.role || null,
      targetType: 'investigate-ticket',
      targetId: ticketId,
      outcome: 'success',
      message: `Ticket workflow updated for ${ticketId}`,
      details: { nextState, nextStatus, notesChanged, stateChanged },
    });

    res.json({ ok: true, ticketState: nextState, status: nextStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save work notes' });
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
    if (status === 'Connected') {
      whereParts.push('d.status = ? AND TIMESTAMPDIFF(SECOND, d.collected_at, UTC_TIMESTAMP()) <= ?');
      bind.push('Connected', DB_MONITOR_STALE_AFTER_SEC);
    } else if (status === 'Disconnected') {
      whereParts.push('(d.status <> ? OR TIMESTAMPDIFF(SECOND, d.collected_at, UTC_TIMESTAMP()) > ?)');
      bind.push('Connected', DB_MONITOR_STALE_AFTER_SEC);
    } else if (status !== 'All') {
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
              d.connection_utilization_pct, d.error_rate_pct, d.cpu_load_pct, d.memory_used_pct, d.disk_used_pct, d.host_pressure,
              d.capability_matrix_json, d.db_signature,
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
        // Parse payload first — resolveCollectedAt uses it to get the authoritative UTC timestamp.
        const payload = parsePayload(r.payload_json) || {};
        const capabilityMatrixColumn = parsePayload(r.capability_matrix_json) || null;
        const nowMs = Date.now();
        const collectedAt = resolveCollectedAt(r, payload);
        const checkpointAgeSec = collectedAt ? Math.max(0, Math.floor((nowMs - collectedAt.getTime()) / 1000)) : null;
        const isStale = checkpointAgeSec == null ? true : checkpointAgeSec > DB_MONITOR_STALE_AFTER_SEC;
        // Honour the agent's own ok/status fields; only override with Disconnected when
        // data is genuinely stale (agent went silent) or the agent itself reported failure.
        const agentConnected = String(r.status || '').toLowerCase() === 'connected' && !!r.ok;
        const normalizedStatus = agentConnected && !isStale ? 'Connected' : 'Disconnected';
        const capabilityMatrix = payload?.capabilityMatrix || capabilityMatrixColumn || null;
        const system = payload?.system || {
          cpu: { loadPct: r.cpu_load_pct == null ? null : Number(r.cpu_load_pct) },
          memory: { usedPct: r.memory_used_pct == null ? null : Number(r.memory_used_pct) },
          disk: { usedPct: r.disk_used_pct == null ? null : Number(r.disk_used_pct) },
          hostPressure: r.host_pressure || null,
        };
        return {
          targetKey: r.target_key,
          targetName: r.target_name,
          targetType: r.target_type,
          engine: r.engine,
          version: r.version,
          ok: !!r.ok,
          status: normalizedStatus,
          rawStatus: r.status,
          isStale,
          checkpointAgeSec,
          healthCategory: payload?.healthCategory || null,
          healthReason: payload?.healthReason || payload?.error || payload?.reason || null,
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
          connectionUtilizationPct: payload?.performance?.connectionUtilizationPct == null
            ? (r.connection_utilization_pct == null ? null : Number(r.connection_utilization_pct))
            : Number(payload.performance.connectionUtilizationPct),
          errorRatePct: payload?.performance?.errorRatePct == null
            ? (r.error_rate_pct == null ? null : Number(r.error_rate_pct))
            : Number(payload.performance.errorRatePct),
          cpuLoadPct: system?.cpu?.loadPct == null ? null : Number(system.cpu.loadPct),
          memoryUsedPct: system?.memory?.usedPct == null ? null : Number(system.memory.usedPct),
          diskUsedPct: system?.disk?.usedPct == null ? null : Number(system.disk.usedPct),
          hostPressure: system?.hostPressure || null,
          dbSignature: r.db_signature || payload?.node?.dbSignature || null,
          capabilityMatrix,
          osPlatform: r.os_platform,
          osDistro: r.os_distro,
          osVersion: r.os_version,
          // Return the resolved UTC ISO string so the browser always gets a
          // timezone-unambiguous value regardless of MySQL server timezone.
          collectedAt: collectedAt ? collectedAt.toISOString() : null,
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
              connection_utilization_pct, error_rate_pct, cpu_load_pct, memory_used_pct, disk_used_pct, host_pressure,
              capability_matrix_json, db_signature,
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
    const capabilityMatrixColumn = parsePayload(latest.capability_matrix_json) || null;
    const systemFallback = {
      cpu: { loadPct: latest.cpu_load_pct == null ? null : Number(latest.cpu_load_pct) },
      memory: { usedPct: latest.memory_used_pct == null ? null : Number(latest.memory_used_pct) },
      disk: { usedPct: latest.disk_used_pct == null ? null : Number(latest.disk_used_pct) },
      hostPressure: latest.host_pressure || null,
    };
    const history = [...rows].reverse();
    const historyWithPayload = history.map((r: any) => ({
      row: r,
      payload: parsePayload(r.payload_json) || {},
    }));
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
        healthReason: payload?.healthReason || payload?.error || payload?.reason || null,
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
        dbSignature: latest.db_signature || payload?.node?.dbSignature || null,
        osPlatform: latest.os_platform,
        osDistro: latest.os_distro,
        osVersion: latest.os_version,
        collectedAt: latest.collected_at,
      },
      inventory: payload?.inventory || null,
      node: payload?.node || null,
      performance: payload?.performance || null,
      diagnostics: payload?.diagnostics || null,
      system: payload?.system || systemFallback,
      capabilityMatrix: payload?.capabilityMatrix || capabilityMatrixColumn || null,
      space: payload?.space || null,
      asm: payload?.asm || null,
      compactOutput: payload?.compactOutput || [],
      latencyTrend: historyWithPayload.map((h: any) => ({
        time: new Date(h.row.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: h.row.latency_ms == null ? null : Number(h.row.latency_ms),
      })),
      sessionsTrend: historyWithPayload.map((h: any) => ({
        time: new Date(h.row.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: h.row.active_sessions == null ? null : Number(h.row.active_sessions),
      })),
      qpsTrend: historyWithPayload.map((h: any) => ({
        time: new Date(h.row.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: h.payload?.performance?.qps == null
          ? (h.payload?.performance?.qpsRate == null ? null : Number(h.payload.performance.qpsRate))
          : Number(h.payload.performance.qps),
      })),
      tpsTrend: historyWithPayload.map((h: any) => ({
        time: new Date(h.row.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: h.payload?.performance?.transactionsPerSec == null
          ? (h.payload?.performance?.transactionsPerSecRate == null ? null : Number(h.payload.performance.transactionsPerSecRate))
          : Number(h.payload.performance.transactionsPerSec),
      })),
      connectionsTrend: historyWithPayload.map((h: any) => ({
        time: new Date(h.row.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: h.payload?.performance?.activeConnections == null
          ? (h.payload?.performance?.threadsConnected == null
            ? (h.row.active_sessions == null ? null : Number(h.row.active_sessions))
            : Number(h.payload.performance.threadsConnected))
          : Number(h.payload.performance.activeConnections),
      })),
      memoryTrend: historyWithPayload.map((h: any) => ({
        time: new Date(h.row.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: h.payload?.performance?.memory?.hostMemoryUsedPct == null
          ? (h.payload?.system?.memory?.usedPct == null ? null : Number(h.payload.system.memory.usedPct))
          : Number(h.payload.performance.memory.hostMemoryUsedPct),
      })),
      cpuTrend: historyWithPayload.map((h: any) => ({
        time: new Date(h.row.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: h.payload?.system?.cpu?.loadPct == null ? null : Number(h.payload.system.cpu.loadPct),
      })),
      diskTrend: historyWithPayload.map((h: any) => ({
        time: new Date(h.row.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: h.payload?.system?.disk?.usedPct == null ? null : Number(h.payload.system.disk.usedPct),
      })),
      bufferPoolUsageTrend: historyWithPayload.map((h: any) => ({
        time: new Date(h.row.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: h.payload?.performance?.innodb?.bufferPoolUsagePct == null ? null : Number(h.payload.performance.innodb.bufferPoolUsagePct),
      })),
      queryCacheHitTrend: historyWithPayload.map((h: any) => ({
        time: new Date(h.row.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: h.payload?.performance?.cache?.queryCacheHitRatioPct == null ? null : Number(h.payload.performance.cache.queryCacheHitRatioPct),
      })),
    });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(404).json({ error: 'No database monitor data available' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Table metadata for a specific database within a monitored target.
// Queries information_schema (read-only, schema-level) — no row data is exposed.
app.get('/api/databases/:targetKey/tables/:dbName', async (req, res) => {
  try {
    const targetKey = String(req.params.targetKey || '').trim();
    const dbName = String(req.params.dbName || '').trim();
    if (!targetKey || !dbName) return res.status(400).json({ error: 'targetKey and dbName are required' });

    // Verify the target exists and the requested dbName is part of its inventory.
    // This prevents probing arbitrary schemas on the MySQL host.
    const [targetRows]: any = await pool.query(
      `SELECT payload_json FROM database_monitor_logs
       WHERE target_key = ?
       ORDER BY collected_at DESC LIMIT 1`,
      [targetKey]
    );
    if (!targetRows.length) return res.status(404).json({ error: 'Target not found' });

    const targetPayload = parsePayload(targetRows[0].payload_json) || {};
    const inventoryDbs: string[] = (targetPayload?.inventory?.databases || [])
      .map((d: any) => String(d.dbName || d.id || '').trim())
      .filter(Boolean);

    if (!inventoryDbs.includes(dbName)) {
      return res.status(403).json({ error: 'Database is not part of this target\'s inventory' });
    }

    // Query information_schema — parameterised, read-only, schema-level metadata only.
    const [tables]: any = await pool.query(
      `SELECT
         TABLE_NAME        AS tableName,
         TABLE_TYPE        AS tableType,
         ENGINE            AS engine,
         TABLE_ROWS        AS tableRows,
         AVG_ROW_LENGTH    AS avgRowLength,
         DATA_LENGTH       AS dataLength,
         INDEX_LENGTH      AS indexLength,
         CREATE_TIME       AS createTime,
         UPDATE_TIME       AS updateTime,
         TABLE_COMMENT     AS tableComment,
         TABLE_COLLATION   AS tableCollation,
         ROW_FORMAT        AS rowFormat,
         AUTO_INCREMENT    AS autoIncrement
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME ASC`,
      [dbName]
    );

    res.json({
      targetKey,
      dbName,
      totalTables: tables.length,
      tables: tables.map((t: any) => ({
        tableName:      String(t.tableName || ''),
        tableType:      String(t.tableType || ''),
        engine:         t.engine ? String(t.engine) : null,
        tableRows:      t.tableRows == null ? null : Number(t.tableRows),
        avgRowLength:   t.avgRowLength == null ? null : Number(t.avgRowLength),
        dataLength:     t.dataLength == null ? null : Number(t.dataLength),
        indexLength:    t.indexLength == null ? null : Number(t.indexLength),
        createTime:     t.createTime ? new Date(t.createTime).toISOString() : null,
        updateTime:     t.updateTime ? new Date(t.updateTime).toISOString() : null,
        tableComment:   t.tableComment ? String(t.tableComment) : null,
        tableCollation: t.tableCollation ? String(t.tableCollation) : null,
        rowFormat:      t.rowFormat ? String(t.rowFormat) : null,
        autoIncrement:  t.autoIncrement == null ? null : Number(t.autoIncrement),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/databases/:targetKey', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    const targetKey = String(req.params.targetKey || '').trim();
    if (!targetKey) return res.status(400).json({ error: 'targetKey is required' });

    const [result]: any = await pool.query(
      `DELETE FROM database_monitor_logs WHERE target_key = ?`,
      [targetKey]
    );

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'delete-database-monitor-data',
      actorUsername: actor?.username || null,
      actorRole: actor?.role || null,
      targetType: 'database-target',
      targetId: targetKey,
      severity: 'warning',
      outcome: 'success',
      message: `Database monitor history deleted for target ${targetKey}`,
      details: { deletedRows: Number(result?.affectedRows || 0) },
    });

    res.json({ success: true, targetKey, deletedRows: Number(result?.affectedRows || 0) });
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(404).json({ error: 'database_monitor_logs table not found' });
    }
    res.status(500).json({ error: err.message || 'Failed to delete database monitor logs' });
  }
});

// Create a new asset and immediately trigger a check
app.post('/api/assets', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required.' });
    if (actor.role === 'superuser') return res.status(403).json({ error: 'Super Admins cannot add devices or assets.' });
    if (actor.role !== 'admin' && actor.role !== 'editor') return res.status(403).json({ error: 'Editor or Admin access is required to add assets.' });
    const { name, parent_type, sub_type, target_endpoint, environment, device_category, snmp } = req.body;
    const id = `INV-${Date.now()}`;

    await pool.query(
      `INSERT INTO assets (id, name, parent_type, sub_type, target_endpoint, environment, device_category, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Initializing')`,
      [id, name, parent_type, sub_type || null, target_endpoint, environment, device_category || null]
    );

    const [rows]: any = await pool.query('SELECT * FROM assets WHERE id = ?', [id]);
    const asset = rows[0];

    if (isSnmpEligibleAsset(parent_type)) {
      try {
        await upsertSnmpDeviceFromAsset(asset, snmp || {});
      } catch (snmpErr) {
        console.warn('SNMP auto-registration skipped:', snmpErr);
      }
    }

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'add-asset',
      actorUsername: actor?.username || null,
      actorRole: actor?.role || null,
      targetType: 'asset',
      targetId: id,
      outcome: 'success',
      message: `Asset created: ${name || id}`,
      details: { parent_type, sub_type, environment, device_category },
    });

    res.status(201).json(asset);

    // Trigger first check in background
    runCheck(asset);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update an asset's core configuration
app.put('/api/assets/:id', async (req, res) => {
  const actor = requireDeviceOperator(req, res);
  if (!actor) return;
  try {
    const { name, target_endpoint, parent_type, environment, device_category } = req.body;
    const [result]: any = await pool.query(
      `UPDATE assets 
       SET name = ?, target_endpoint = ?, parent_type = ?, environment = ?, device_category = ? 
       WHERE id = ?`,
      [name, target_endpoint, parent_type, environment, device_category, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete an asset
app.put('/api/assets/:id/status', async (req, res) => {
  const actor = requireDeviceOperator(req, res);
  if (!actor) return;
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    const [result]: any = await pool.query('UPDATE assets SET status = ? WHERE id = ?', [status, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/assets/:id', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required.' });
    if (actor.role === 'superuser') return res.status(403).json({ error: 'Super Admins cannot delete assets.' });
    if (actor.role !== 'admin' && actor.role !== 'editor') return res.status(403).json({ error: 'Editor or Admin access is required.' });
    await pool.query('DELETE FROM assets WHERE id = ?', [req.params.id]);

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'delete-asset',
      actorUsername: actor?.username || null,
      actorRole: actor?.role || null,
      targetType: 'asset',
      targetId: String(req.params.id || ''),
      severity: 'warning',
      outcome: 'success',
      message: `Asset deleted: ${req.params.id}`,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/snmp/devices', async (_req, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT id, asset_id, name, vendor, device_type, host, port, snmp_version,
              enabled, poll_interval_sec, retention_hours, status, last_polled_at, last_error,
              created_at, updated_at
       FROM snmp_devices
       ORDER BY updated_at DESC`
    );
    res.json(rows || []);
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return res.json([]);
    res.status(500).json({ error: err.message || 'Failed to list SNMP devices' });
  }
});

app.post('/api/snmp/devices', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required.' });
    if (actor.role === 'superuser') return res.status(403).json({ error: 'Super Admins cannot add devices.' });
    if (actor.role !== 'admin' && actor.role !== 'editor') return res.status(403).json({ error: 'Editor or Admin access is required.' });
    const body = req.body || {};
    const host = String(body.host || '').trim();
    if (!host) return res.status(400).json({ error: 'host is required' });

    const nowId = `SNMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const snmpVersion = normalizeSnmpVersion(body.snmpVersion || body.snmp_version);
    const port = Math.max(1, Number(body.port || 161));
    const retentionHours = Math.max(1, Number(body.retentionHours || SNMP_DEFAULT_RETENTION_HOURS));
    const pollIntervalSec = Math.max(30, Number(body.pollIntervalSec || 60));

    await pool.query(
      `INSERT INTO snmp_devices (
         id, asset_id, name, vendor, device_type, host, port, snmp_version,
         community, sec_username, auth_protocol, auth_key, priv_protocol, priv_key,
         context_name, enabled, poll_interval_sec, retention_hours, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unknown')`,
      [
        nowId,
        body.assetId || null,
        String(body.name || host),
        String(body.vendor || '') || null,
        normalizeDeviceType(body.deviceType || body.device_type || 'Switch'),
        host,
        port,
        snmpVersion,
        snmpVersion === '2c' ? String(body.community || process.env.SNMP_COMMUNITY || 'public') : null,
        snmpVersion === '3' ? String(body.username || body.secUsername || '') || null : null,
        snmpVersion === '3' ? String(body.authProtocol || 'SHA') : null,
        snmpVersion === '3' ? String(body.authKey || '') || null : null,
        snmpVersion === '3' ? String(body.privProtocol || 'AES') : null,
        snmpVersion === '3' ? String(body.privKey || '') || null : null,
        snmpVersion === '3' ? String(body.contextName || '') || null : null,
        body.enabled == null ? 1 : Number(body.enabled ? 1 : 0),
        pollIntervalSec,
        retentionHours,
      ]
    );

    const [rows]: any = await pool.query(
      `SELECT id, asset_id, name, vendor, device_type, host, port, snmp_version,
              enabled, poll_interval_sec, retention_hours, status, last_polled_at, last_error,
              created_at, updated_at
       FROM snmp_devices WHERE id = ?`,
      [nowId]
    );

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'add-snmp-device',
      actorUsername: actor?.username || null,
      actorRole: actor?.role || null,
      targetType: 'snmp-device',
      targetId: nowId,
      outcome: 'success',
      message: `SNMP device added for host ${host}`,
      details: { snmpVersion, port },
    });

    res.status(201).json(rows?.[0] || { id: nowId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create SNMP device' });
  }
});

app.patch('/api/snmp/devices/:id', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required.' });
    if (actor.role === 'superuser') return res.status(403).json({ error: 'Super Admins cannot modify devices.' });
    if (actor.role !== 'admin' && actor.role !== 'editor') return res.status(403).json({ error: 'Editor or Admin access is required.' });
    const body = req.body || {};
    const snmpVersion = normalizeSnmpVersion(body.snmpVersion || body.snmp_version);

    await pool.query(
      `UPDATE snmp_devices
       SET name = COALESCE(?, name),
           vendor = COALESCE(?, vendor),
           device_type = COALESCE(?, device_type),
           host = COALESCE(?, host),
           port = COALESCE(?, port),
           snmp_version = COALESCE(?, snmp_version),
           community = ?,
           sec_username = ?,
           auth_protocol = ?,
           auth_key = ?,
           priv_protocol = ?,
           priv_key = ?,
           context_name = ?,
           enabled = COALESCE(?, enabled),
           poll_interval_sec = COALESCE(?, poll_interval_sec),
           retention_hours = COALESCE(?, retention_hours)
       WHERE id = ?`,
      [
        body.name ?? null,
        body.vendor ?? null,
        body.deviceType ?? body.device_type ?? null,
        body.host ?? null,
        body.port == null ? null : Math.max(1, Number(body.port || 161)),
        snmpVersion,
        snmpVersion === '2c' ? String(body.community || process.env.SNMP_COMMUNITY || 'public') : null,
        snmpVersion === '3' ? String(body.username || body.secUsername || '') || null : null,
        snmpVersion === '3' ? String(body.authProtocol || 'SHA') : null,
        snmpVersion === '3' ? String(body.authKey || '') || null : null,
        snmpVersion === '3' ? String(body.privProtocol || 'AES') : null,
        snmpVersion === '3' ? String(body.privKey || '') || null : null,
        snmpVersion === '3' ? String(body.contextName || '') || null : null,
        body.enabled == null ? null : Number(body.enabled ? 1 : 0),
        body.pollIntervalSec == null ? null : Math.max(30, Number(body.pollIntervalSec || 60)),
        body.retentionHours == null ? null : Math.max(1, Number(body.retentionHours || SNMP_DEFAULT_RETENTION_HOURS)),
        req.params.id,
      ]
    );

    const [rows]: any = await pool.query(
      `SELECT id, asset_id, name, vendor, device_type, host, port, snmp_version,
              enabled, poll_interval_sec, retention_hours, status, last_polled_at, last_error,
              created_at, updated_at
       FROM snmp_devices WHERE id = ?`,
      [req.params.id]
    );

    if (!rows?.length) return res.status(404).json({ error: 'SNMP device not found' });

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'configure-snmp-device',
      actorUsername: actor?.username || null,
      actorRole: actor?.role || null,
      targetType: 'snmp-device',
      targetId: String(req.params.id || ''),
      outcome: 'success',
      message: `SNMP device updated: ${req.params.id}`,
      details: { snmpVersion },
    });

    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update SNMP device' });
  }
});

app.delete('/api/snmp/devices/:id', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required.' });
    if (actor.role === 'superuser') return res.status(403).json({ error: 'Super Admins cannot delete devices.' });
    if (actor.role !== 'admin' && actor.role !== 'editor') return res.status(403).json({ error: 'Editor or Admin access is required.' });
    await pool.query('DELETE FROM snmp_devices WHERE id = ?', [req.params.id]);
    await pool.query('DELETE FROM snmp_telemetry_samples WHERE device_id = ?', [req.params.id]);
    await pool.query('DELETE FROM snmp_traps WHERE device_id = ?', [req.params.id]);

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'delete-snmp-device',
      actorUsername: actor?.username || null,
      actorRole: actor?.role || null,
      targetType: 'snmp-device',
      targetId: String(req.params.id || ''),
      severity: 'warning',
      outcome: 'success',
      message: `SNMP device deleted: ${req.params.id}`,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete SNMP device' });
  }
});

app.post('/api/snmp/devices/:id/poll', async (req, res) => {
  try {
    const actor = getSessionUser(req);
    const [rows]: any = await pool.query('SELECT * FROM snmp_devices WHERE id = ?', [req.params.id]);
    if (!rows?.length) return res.status(404).json({ error: 'SNMP device not found' });

    await ingestSnmpPoll(rows[0]);

    const [latest]: any = await pool.query(
      `SELECT id, device_id, metric_key, metric_value_num, metric_value_text, unit, oid, severity, sample_time
       FROM snmp_telemetry_samples
       WHERE device_id = ?
       ORDER BY sample_time DESC
       LIMIT 20`,
      [req.params.id]
    );

    await logPortalAuditEvent({
      req,
      eventType: 'action',
      action: 'report-snmp-poll',
      actorUsername: actor?.username || null,
      actorRole: actor?.role || null,
      targetType: 'snmp-device',
      targetId: String(req.params.id || ''),
      outcome: 'success',
      message: `SNMP poll executed for ${req.params.id}`,
      details: { samples: Array.isArray(latest) ? latest.length : 0 },
    });

    res.json({ success: true, deviceId: req.params.id, samples: latest || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'SNMP poll failed' });
  }
});

app.get('/api/snmp/telemetry', async (req, res) => {
  try {
    const deviceId = String(req.query.deviceId || '').trim();
    const hours = Math.max(1, Number(req.query.hours || 6));
    const limit = Math.max(1, Math.min(2000, Number(req.query.limit || 500)));

    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

    const [rows]: any = await pool.query(
      `SELECT id, device_id, metric_key, metric_value_num, metric_value_text, unit, oid, severity, sample_time
       FROM snmp_telemetry_samples
       WHERE device_id = ?
         AND sample_time >= UTC_TIMESTAMP() - INTERVAL ? HOUR
       ORDER BY sample_time DESC
       LIMIT ?`,
      [deviceId, hours, limit]
    );
    res.json(rows || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list SNMP telemetry' });
  }
});

app.post('/api/snmp/traps', async (req, res) => {
  try {
    const body = req.body || {};
    const sourceIp = String(body.sourceIp || body.source_ip || '').trim();
    const trapOid = String(body.trapOid || body.trap_oid || '').trim();
    if (!sourceIp || !trapOid) {
      return res.status(400).json({ error: 'sourceIp and trapOid are required' });
    }

    await insertSnmpTrapRecord({
      deviceId: body.deviceId || null,
      sourceIp,
      trapOid,
      severity: String(body.severity || 'warning'),
      message: String(body.message || '') || null,
      payload: body.payload || null,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
    });

    res.status(201).json({ success: true, sourceIp, trapOid });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to ingest SNMP trap' });
  }
});

app.get('/api/snmp/traps', async (req, res) => {
  try {
    const deviceId = String(req.query.deviceId || '').trim();
    const hours = Math.max(1, Number(req.query.hours || 24));
    const limit = Math.max(1, Math.min(2000, Number(req.query.limit || 500)));

    const [rows]: any = deviceId
      ? await pool.query(
        `SELECT id, device_id, source_ip, trap_oid, severity, message, payload_json, received_at
           FROM snmp_traps
           WHERE device_id = ?
             AND received_at >= UTC_TIMESTAMP() - INTERVAL ? HOUR
           ORDER BY received_at DESC
           LIMIT ?`,
        [deviceId, hours, limit]
      )
      : await pool.query(
        `SELECT id, device_id, source_ip, trap_oid, severity, message, payload_json, received_at
           FROM snmp_traps
           WHERE received_at >= UTC_TIMESTAMP() - INTERVAL ? HOUR
           ORDER BY received_at DESC
           LIMIT ?`,
        [hours, limit]
      );

    res.json(rows || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list SNMP traps' });
  }
});

app.post('/api/syslog/ingest', async (req, res) => {
  try {
    const body = req.body || {};
    const sourceIp = String(body.sourceIp || body.source_ip || '').trim();
    const message = String(body.message || '').trim();
    if (!sourceIp || !message) {
      return res.status(400).json({ error: 'sourceIp and message are required' });
    }

    await insertSyslogRecord({
      sourceIp,
      hostname: body.hostname || null,
      appName: body.appName || body.app_name || null,
      facility: body.facility == null ? null : Number(body.facility),
      severity: body.severity == null ? null : Number(body.severity),
      severityLabel: body.severityLabel || body.severity_label || null,
      message,
      rawMessage: body.rawMessage || body.raw_message || message,
      payload: body.payload || null,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
    });

    res.status(201).json({ success: true, sourceIp });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to ingest syslog event' });
  }
});

app.get('/api/snmp/events', async (req, res) => {
  try {
    const category = String(req.query.category || '').trim().toLowerCase();
    const source = String(req.query.source || '').trim().toLowerCase();
    const severity = String(req.query.severity || '').trim().toLowerCase();
    const q = String(req.query.q || '').trim();
    const deviceId = String(req.query.deviceId || '').trim();
    const hours = Math.max(1, Number(req.query.hours || 24));
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 200)));
    const offset = (page - 1) * limit;

    const where: string[] = ['e.event_time >= UTC_TIMESTAMP() - INTERVAL ? HOUR'];
    const bind: any[] = [hours];

    if (category === 'storage' || category === 'san') {
      where.push('e.category = ?');
      bind.push(category);
    }
    if (source === 'snmp_trap' || source === 'syslog') {
      where.push('e.source = ?');
      bind.push(source);
    }
    if (severity) {
      where.push('LOWER(e.severity) = ?');
      bind.push(severity);
    }
    if (deviceId) {
      where.push('e.device_id = ?');
      bind.push(deviceId);
    }
    if (q) {
      where.push('(e.device_name LIKE ? OR e.message LIKE ? OR e.source_ip LIKE ? OR e.event_key LIKE ?)');
      const like = `%${q}%`;
      bind.push(like, like, like, like);
    }

    const baseUnion = `
      SELECT
        'snmp_trap' AS source,
        t.id AS source_id,
        t.received_at AS event_time,
        LOWER(COALESCE(NULLIF(t.severity, ''), 'warning')) AS severity,
        t.message AS message,
        t.source_ip AS source_ip,
        t.trap_oid AS event_key,
        COALESCE(d.id, t.device_id) AS device_id,
        COALESCE(d.name, 'Unmapped') AS device_name,
        CASE
          WHEN LOWER(COALESCE(d.device_type, '')) = 'storage' THEN 'storage'
          WHEN d.id IS NOT NULL THEN 'san'
          ELSE 'unmapped'
        END AS category
      FROM snmp_traps t
      LEFT JOIN snmp_devices d
        ON d.id = t.device_id OR d.host = t.source_ip

      UNION ALL

      SELECT
        'syslog' AS source,
        s.id AS source_id,
        s.received_at AS event_time,
        LOWER(COALESCE(NULLIF(s.severity_label, ''), 'info')) AS severity,
        s.message AS message,
        s.source_ip AS source_ip,
        COALESCE(s.app_name, 'syslog') AS event_key,
        COALESCE(d.id, s.device_id) AS device_id,
        COALESCE(d.name, s.hostname, 'Unmapped') AS device_name,
        CASE
          WHEN LOWER(COALESCE(d.device_type, '')) = 'storage' THEN 'storage'
          WHEN d.id IS NOT NULL THEN 'san'
          ELSE 'unmapped'
        END AS category
      FROM syslog_events s
      LEFT JOIN snmp_devices d
        ON d.id = s.device_id OR d.host = s.source_ip OR d.name = s.hostname
    `;

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total
       FROM (${baseUnion}) e
       ${whereSql}`,
      bind
    );

    const [rows]: any = await pool.query(
      `SELECT *
       FROM (${baseUnion}) e
       ${whereSql}
       ORDER BY e.event_time DESC
       LIMIT ? OFFSET ?`,
      [...bind, limit, offset]
    );

    res.json({
      page,
      limit,
      total: Number(countRows?.[0]?.total || 0),
      events: rows || [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list SNMP/Syslog events' });
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
    const normalizeStatus = (value: any): 'Up' | 'Down' | 'Initializing' => {
      const status = String(value || '').trim().toLowerCase();
      if (['up', 'online', 'healthy', 'connected', 'active', 'reachable'].includes(status)) return 'Up';
      if (['down', 'offline', 'faulty', 'disconnected', 'inactive', 'unreachable'].includes(status)) return 'Down';
      return 'Initializing';
    };

    const isUptimeAsset = (asset: any) => {
      const explicit = String(asset?.device_category || '').trim().toLowerCase();
      const parent = String(asset?.parent_type || '').trim().toLowerCase();
      return explicit === 'uptime'
        || parent === 'website'
        || parent === 'api endpoint'
        || parent === 'network port'
        || parent === 'docker host'
        || parent === 'docker container';
    };

    const isInfrastructureInventory = (asset: any) => {
      const explicit = String(asset?.device_category || '').trim().toLowerCase();
      return ['servers', 'vms', 'storage', 'san', 'computer'].includes(explicit);
    };

    let assets: any[] = [];
    try {
      const [assetRows]: any = await pool.query('SELECT * FROM assets ORDER BY created_at DESC');
      assets = Array.isArray(assetRows) ? assetRows : [];
    } catch {
      assets = [];
    }

    const uptimeAssets = assets.filter(isUptimeAsset);
    const infraInventoryAssets = assets.filter((asset: any) => isInfrastructureInventory(asset) && !isUptimeAsset(asset));
    const pausedCount = assets.filter((a: any) => String(a?.status || '').toUpperCase() === 'PAUSED').length;

    let infraAgents: any[] = [];
    try {
      if (await hasNewInfraSchema()) {
        const [rows]: any = await pool.query(
          `SELECT id, agent_uuid, agent_name, hostname, machine_type, heartbeat, last_seen_at
           FROM ${infraTable('agents')}
           ORDER BY COALESCE(last_seen_at, updated_at, created_at) DESC`
        );
        infraAgents = (rows || []).map((row: any) => ({
          id: String(row.agent_uuid || row.id),
          name: row.hostname || row.agent_name || String(row.agent_uuid || row.id),
          parent_type: String(row.machine_type || '').toLowerCase() === 'vm' ? 'Infrastructure VM' : 'Infrastructure Server',
          status: normalizeStatus(row.heartbeat),
          timestamp: row.last_seen_at || null,
        }));
      } else {
        const [rows]: any = await pool.query(
          `SELECT id, hostname, status, last_heartbeat_at
           FROM agents
           ORDER BY COALESCE(last_heartbeat_at, created_at) DESC`
        );
        infraAgents = (rows || []).map((row: any) => ({
          id: String(row.id),
          name: row.hostname || String(row.id),
          parent_type: 'Infrastructure Server',
          status: normalizeStatus(row.status),
          timestamp: row.last_heartbeat_at || null,
        }));
      }
    } catch {
      infraAgents = [];
    }

    let databaseTargets: any[] = [];
    try {
      const [rows]: any = await pool.query(
        `SELECT d.target_key, d.target_name, d.target_type, d.ok, d.status, d.latency_ms, d.collected_at, d.payload_json
         FROM database_monitor_logs d
         INNER JOIN (
           SELECT target_key, MAX(collected_at) AS max_collected
           FROM database_monitor_logs
           GROUP BY target_key
         ) latest ON latest.target_key = d.target_key AND latest.max_collected = d.collected_at
         ORDER BY d.collected_at DESC`
      );

      databaseTargets = (rows || []).map((row: any) => {
        const rowPayload = parsePayload(row.payload_json) || null;
        const collectedAt = resolveCollectedAt(row, rowPayload);
        const isStale = collectedAt
          ? Math.max(0, Math.floor((Date.now() - collectedAt.getTime()) / 1000)) > DB_MONITOR_STALE_AFTER_SEC
          : true;
        const agentConnected = String(row.status || '').toLowerCase() === 'connected' && !!row.ok;
        const status = !isStale && agentConnected ? 'Up' : 'Down';
        return {
          id: String(row.target_key || row.target_name || Math.random()),
          name: row.target_name || row.target_key || 'Database Target',
          parent_type: row.target_type || 'Database',
          status,
          timestamp: collectedAt ? collectedAt.toISOString() : null,
          response_time_ms: row.latency_ms == null ? null : Number(row.latency_ms),
        };
      });
    } catch {
      databaseTargets = [];
    }

    let dataCenters: any[] = [];
    try {
      dataCenters = await getDataCenterSummaryRows();
    } catch {
      dataCenters = [];
    }

    let rackHeatmap: any[] = [];
    try {
      const [racks]: any = await pool.query(
        `SELECT id, name, dc_name AS dcName FROM rackpoint_racks ORDER BY dc_name ASC, name ASC`
      );
      const [rackDeviceCounts]: any = await pool.query(
        `SELECT rack_id AS rackId,
                SUM(availability_status = 'reachable') AS reachableCount,
                SUM(availability_status = 'unreachable') AS unreachableCount
         FROM rackpoint_devices
         GROUP BY rack_id`
      );
      const countsByRack = new Map(
        (rackDeviceCounts || []).map((row: any) => [String(row.rackId), {
          up: Number(row.reachableCount || 0),
          down: Number(row.unreachableCount || 0),
        }])
      );

      rackHeatmap = (racks || []).map((rack: any) => {
        const counts = (countsByRack.get(String(rack.id)) || { up: 0, down: 0 }) as { up: number; down: number };
        return {
          id: String(rack.id),
          name: rack.name || String(rack.id),
          parent_type: `Rack${rack.dcName ? ` · ${rack.dcName}` : ''}`,
          status: counts.down > 0 ? 'Down' : counts.up > 0 ? 'Up' : 'Initializing',
          timestamp: null,
          response_time_ms: null,
        };
      });
    } catch {
      rackHeatmap = [];
    }

    const uptimeUp = uptimeAssets.filter((a: any) => normalizeStatus(a.status) === 'Up').length;
    const uptimeDown = uptimeAssets.filter((a: any) => normalizeStatus(a.status) === 'Down').length;
    const uptimeUnknown = uptimeAssets.length - uptimeUp - uptimeDown;

    const infraUp = infraAgents.filter((a: any) => a.status === 'Up').length;
    const infraDown = infraAgents.filter((a: any) => a.status === 'Down').length;
    const infraUnknown = infraAgents.length - infraUp - infraDown + infraInventoryAssets.length;

    const dbUp = databaseTargets.filter((d: any) => d.status === 'Up').length;
    const dbDown = databaseTargets.filter((d: any) => d.status === 'Down').length;
    const dbUnknown = databaseTargets.length - dbUp - dbDown;

    const rackUp = rackHeatmap.filter((r: any) => r.status === 'Up').length;
    const rackDown = rackHeatmap.filter((r: any) => r.status === 'Down').length;
    const rackUnknown = rackHeatmap.length - rackUp - rackDown;

    const monitoredHealthy = infraUp + uptimeUp + dbUp + rackUp;
    const monitoredDown = infraDown + uptimeDown + dbDown + rackDown;
    const monitoredTotal = monitoredHealthy + monitoredDown;
    const totalEstate = infraAgents.length + infraInventoryAssets.length + uptimeAssets.length + databaseTargets.length + dataCenters.length + rackHeatmap.length;

    const latencyValues = [
      ...uptimeAssets
        .map((a: any) => Number(a.last_response_ms))
        .filter((value: number) => Number.isFinite(value) && value > 0),
      ...databaseTargets
        .map((d: any) => Number(d.response_time_ms))
        .filter((value: number) => Number.isFinite(value) && value > 0),
    ];
    const avgLatencyMs = latencyValues.length
      ? Math.round(latencyValues.reduce((sum: number, value: number) => sum + value, 0) / latencyValues.length)
      : null;

    const globalUptimePct = monitoredTotal > 0
      ? ((monitoredHealthy / monitoredTotal) * 100).toFixed(2)
      : null;

    const recentDown = [
      ...infraAgents.filter((a: any) => a.status === 'Down').map((a: any) => ({
        asset_name: a.name,
        parent_type: a.parent_type,
        status: 'Down',
        timestamp: a.timestamp,
        response_time_ms: null,
      })),
      ...databaseTargets.filter((d: any) => d.status === 'Down').map((d: any) => ({
        asset_name: d.name,
        parent_type: d.parent_type,
        status: 'Down',
        timestamp: d.timestamp,
        response_time_ms: d.response_time_ms,
      })),
      ...uptimeAssets
        .filter((a: any) => normalizeStatus(a.status) === 'Down')
        .map((a: any) => ({
          asset_name: a.name,
          parent_type: a.parent_type,
          status: 'Down',
          timestamp: a.last_checked_at,
          response_time_ms: a.last_response_ms,
        })),
      ...rackHeatmap.filter((r: any) => r.status === 'Down').map((r: any) => ({
        asset_name: r.name,
        parent_type: r.parent_type,
        status: 'Down',
        timestamp: null,
        response_time_ms: null,
      })),
    ]
      .sort((a: any, b: any) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, 10);

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
    } catch {
      trend = [];
    }

    const domainSummary = [
      {
        key: 'infrastructure',
        label: 'Infrastructure',
        total: infraAgents.length + infraInventoryAssets.length,
        healthy: infraUp,
        down: infraDown,
        unknown: infraUnknown,
        detail: `${infraUp} online agents · ${infraInventoryAssets.length} inventory assets`,
      },
      {
        key: 'database',
        label: 'Database',
        total: databaseTargets.length,
        healthy: dbUp,
        down: dbDown,
        unknown: dbUnknown,
        detail: `${dbUp} connected · ${dbDown} disconnected`,
      },
      {
        key: 'datacenters',
        label: 'Data Centers',
        total: dataCenters.length,
        healthy: 0,
        down: 0,
        unknown: dataCenters.length,
        detail: `${dataCenters.length} registered facilities`,
      },
      {
        key: 'racks',
        label: 'Racks',
        total: rackHeatmap.length,
        healthy: rackUp,
        down: rackDown,
        unknown: rackUnknown,
        detail: `${rackHeatmap.length} racks across the estate`,
      },
      {
        key: 'uptime',
        label: 'Uptime',
        total: uptimeAssets.length,
        healthy: uptimeUp,
        down: uptimeDown,
        unknown: uptimeUnknown,
        detail: `${uptimeUp} reachable · ${uptimeDown} down`,
      },
    ];

    const heatmapItems = [
      ...infraAgents,
      ...infraInventoryAssets.map((asset: any) => ({
        id: `inv-${asset.id}`,
        name: asset.name,
        parent_type: asset.device_category || asset.parent_type || 'Infrastructure',
        status: normalizeStatus(asset.status),
      })),
      ...databaseTargets,
      ...dataCenters.map((dc: any) => ({
        id: `dc-${dc.id}`,
        name: dc.name,
        parent_type: 'Data Center',
        status: 'Initializing',
      })),
      ...rackHeatmap,
      ...uptimeAssets.map((asset: any) => ({
        id: `uptime-${asset.id}`,
        name: asset.name,
        parent_type: asset.parent_type || 'Uptime',
        status: normalizeStatus(asset.status),
      })),
    ];

    res.json({
      total: totalEstate,
      upCount: monitoredHealthy,
      downCount: monitoredDown,
      pausedCount,
      avgLatencyMs,
      globalUptimePct,
      recentDown,
      trend,
      assets: heatmapItems,
      domains: domainSummary,
      summary: {
        totalEstate,
        monitoredItems: monitoredTotal,
        activeIssues: monitoredDown,
        healthyItems: monitoredHealthy,
        dataCenterCount: dataCenters.length,
        rackCount: rackHeatmap.length,
      },
      lastUpdatedAt: new Date().toISOString(),
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
  startSnmpTrapListener();
  startSyslogListeners();
  // Continuously sync agent Online/Offline status in the DB every 30 s
  syncAgentHeartbeats().catch(() => {});
  setInterval(() => { syncAgentHeartbeats().catch(() => {}); }, 30_000);
});
