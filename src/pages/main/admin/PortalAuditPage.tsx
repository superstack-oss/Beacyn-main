import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, ShieldCheck, RefreshCw, AlertTriangle, Eye, CheckCircle2, Trash2, Settings } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { apiUrl } from '../../../lib/api';
import { authHeaders } from '../../../lib/auth';

type AuditSeverity = 'info' | 'warning' | 'critical';
type AuditOutcome = 'success' | 'failed';

interface PortalAuditEntry {
  id: number;
  event_type: string;
  action: string;
  actor_username: string | null;
  actor_role: string | null;
  target_type: string | null;
  target_id: string | null;
  severity: AuditSeverity;
  outcome: AuditOutcome;
  resolved_at: string | null;
  resolved_by: string | null;
  message: string;
  created_at: string;
}

interface PortalAuditSummary {
  total: number;
  failedCount: number;
  criticalCount: number;
  distinctActors: number;
}

interface PortalSnapshot {
  id: number;
  frontend_url: string;
  backend_url: string;
  frontend_ok: number;
  backend_ok: number;
  portal_uptime_seconds: number | null;
  app_version: string | null;
  db_engine_name: string | null;
  db_engine_version: string | null;
  db_space_bytes: number | null;
  db_signature: string | null;
  db_uptime_seconds: number | null;
  vulnerability_total: number;
  vulnerability_high: number;
  vulnerability_critical: number;
  overall_status: 'healthy' | 'degraded' | 'critical';
  highest_severity: AuditSeverity;
  created_at: string;
}

interface PortalStatus {
  uptimeSeconds: number;
  appVersion: string;
}

interface RuntimeSnapshot {
  id: number;
  db_space_bytes: number | null;
  created_at: string;
}

interface Props {
  onOpenDetails: (id: number) => void;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString();
}

function severityClass(value: AuditSeverity) {
  if (value === 'critical') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (value === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function formatBytes(value: number | null | undefined) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatElapsedTime(seconds: number | null | undefined) {
  const safe = Math.max(0, Math.floor(Number(seconds || 0)));
  if (safe < 3600) {
    const minutes = Math.floor(safe / 60);
    return `${minutes}minute${minutes === 1 ? '' : 's'}`;
  }
  if (safe < 86400) {
    const hours = Math.floor(safe / 3600);
    return `${hours}hour${hours === 1 ? '' : 's'}`;
  }
  const years = Math.floor(safe / (365 * 24 * 60 * 60));
  const remainderAfterYears = safe % (365 * 24 * 60 * 60);
  const months = Math.floor(remainderAfterYears / (30 * 24 * 60 * 60));
  const remainderAfterMonths = remainderAfterYears % (30 * 24 * 60 * 60);
  const days = Math.floor(remainderAfterMonths / 86400);
  return `${days}day${days === 1 ? '' : 's'}, ${months}month${months === 1 ? '' : 's'}, ${years}year${years === 1 ? '' : 's'}`;
}

function runtimeStatusTone(status: 'online' | 'offline') {
  if (status === 'online') {
    return {
      badge: 'border-emerald-200/90 bg-emerald-50/90 text-emerald-700',
      fill: 'from-emerald-500 to-emerald-400',
    };
  }
  return {
    badge: 'border-rose-200/90 bg-rose-50/90 text-rose-700',
    fill: 'from-rose-600 to-rose-500',
  };
}

export default function PortalAuditPage({ onOpenDetails }: Props) {
  const [entries, setEntries] = useState<PortalAuditEntry[]>([]);
  const [summary, setSummary] = useState<PortalAuditSummary>({ total: 0, failedCount: 0, criticalCount: 0, distinctActors: 0 });
  const [latestSnapshot, setLatestSnapshot] = useState<PortalSnapshot | null>(null);
  const [portalStatus, setPortalStatus] = useState<PortalStatus>({ uptimeSeconds: 0, appVersion: '2.0.1' });
  const [runtimeSnapshots, setRuntimeSnapshots] = useState<RuntimeSnapshot[]>([]);
  const [eventType, setEventType] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [actor, setActor] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (eventType !== 'all') params.set('eventType', eventType);
      if (severity !== 'all') params.set('severity', severity);
      if (outcome !== 'all') params.set('outcome', outcome);
      if (actor.trim()) params.set('actor', actor.trim());
      if (query.trim()) params.set('q', query.trim());

      const res = await fetch(apiUrl(`/api/portal-audit?${params.toString()}`), {
        headers: authHeaders(),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load portal audit entries.');
      }

      setEntries(Array.isArray(payload?.events) ? payload.events : []);
      setSummary(payload?.summary || { total: 0, failedCount: 0, criticalCount: 0, distinctActors: 0 });
      setPortalStatus({
        uptimeSeconds: Number(payload?.portalStatus?.uptimeSeconds || 0),
        appVersion: String(payload?.portalStatus?.appVersion || '2.0.1'),
      });
      setLatestSnapshot(payload?.latestSnapshot || null);
      setRuntimeSnapshots(Array.isArray(payload?.runtimeSnapshots) ? payload.runtimeSnapshots : []);
      setTotal(Number(payload?.total || 0));
    } catch {
      setEntries([]);
      setSummary({ total: 0, failedCount: 0, criticalCount: 0, distinctActors: 0 });
      setPortalStatus({ uptimeSeconds: 0, appVersion: '2.0.1' });
      setLatestSnapshot(null);
      setRuntimeSnapshots([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const resolveEntry = async (id: number) => {
    const res = await fetch(apiUrl(`/api/portal-audit/${id}/resolve`), {
      method: 'PATCH',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Failed to resolve');
    await loadAudit();
  };

  const deleteEntry = async (id: number) => {
    const confirmed = window.confirm('Delete this audit entry? This action cannot be undone.');
    if (!confirmed) return;
    const res = await fetch(apiUrl(`/api/portal-audit/${id}`), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete');
    await loadAudit();
  };

  useEffect(() => {
    setPage(1);
  }, [eventType, severity, outcome, actor, query]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await loadAudit();
    };

    run();
    const timer = setInterval(run, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [page, pageSize, eventType, severity, outcome, actor, query]);

  const dbHistory = useMemo(() => {
    const rows = runtimeSnapshots
      .filter((row) => Number(row.db_space_bytes || 0) > 0)
      .slice(0, 8)
      .reverse();
    const maxValue = Math.max(...rows.map((row) => Number(row.db_space_bytes || 0)), 1);
    return rows.map((row) => ({
      id: row.id,
      label: formatDateTime(row.created_at),
      rawDate: row.created_at,
      value: Number(row.db_space_bytes || 0),
      heightPct: Math.max(18, Math.round((Number(row.db_space_bytes || 0) / maxValue) * 100)),
    }));
  }, [runtimeSnapshots]);

  const dbOnline = Boolean(latestSnapshot?.db_engine_name);
  const runtimeStatus: 'online' | 'offline' = dbOnline ? 'online' : 'offline';
  const runtimeTone = runtimeStatusTone(runtimeStatus);
  const latestDbSpace = Number(latestSnapshot?.db_space_bytes || 0);
  const maxDbSpace = Math.max(...runtimeSnapshots.map((row) => Number(row.db_space_bytes || 0)), latestDbSpace, 1);
  const dbBarWidth = Math.max(10, Math.min(100, Math.round((latestDbSpace / maxDbSpace) * 100)));

  return (
    <div className="space-y-6">
      <Card className="bg-white/95 backdrop-blur border-zinc-200 dark:bg-zinc-900/70 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Portal Audit Center</CardTitle>
          <CardDescription>
            Unified timeline of login/logout, operational actions, portal disruptions, and security events.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-xs text-zinc-500">Events (filtered)</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{summary.total}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-xs text-zinc-500">Failed Actions</p>
            <p className="text-xl font-semibold text-rose-700 dark:text-rose-400">{summary.failedCount}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-xs text-zinc-500">Critical Security</p>
            <p className="text-xl font-semibold text-amber-700 dark:text-amber-400">{summary.criticalCount}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-xs text-zinc-500">Active Actors</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{summary.distinctActors}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-xs text-zinc-500">Portal Vulnerabilities</p>
            <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{latestSnapshot?.vulnerability_total ?? 0}</p>
            <p className="text-xs text-zinc-500 mt-1">High/Critical: {(latestSnapshot?.vulnerability_high ?? 0) + (latestSnapshot?.vulnerability_critical ?? 0)}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/95 backdrop-blur border-zinc-200 dark:bg-zinc-900/70 dark:border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Beacyn backend database</CardTitle>
          <CardDescription>
            Latest runtime snapshot for the portal and backend database.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 p-4 md:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Operational Health</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{latestSnapshot?.db_engine_name || 'MySQL'}</p>
                </div>
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300 break-words">
                  {latestSnapshot?.db_engine_version || 'Engine version unavailable'}
                </p>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300 break-all">
                  DB Signature: {latestSnapshot?.db_signature || 'Unavailable'}
                </p>
              </div>

              <div className="min-w-[132px] text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Status</p>
                <p className="mt-2 text-3xl font-semibold text-zinc-950 dark:text-zinc-50 capitalize">{runtimeStatus}</p>
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">DB uptime: {formatElapsedTime(latestSnapshot?.db_uptime_seconds)}</p>
              </div>
            </div>

            <div className="mt-5">
              <div className="h-4 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${runtimeTone.fill} transition-all duration-500`}
                  style={{ width: `${dbBarWidth}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
                <span>DB Space: {formatBytes(latestDbSpace)}</span>
                <span>Last {dbHistory.length || 1} capture{dbHistory.length === 1 ? '' : 's'}</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span>Webapp version: v{latestSnapshot?.app_version || import.meta.env.VITE_APP_VERSION || portalStatus.appVersion}</span>
              <span>Portal uptime: {formatElapsedTime(latestSnapshot?.portal_uptime_seconds ?? portalStatus.uptimeSeconds)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/95 backdrop-blur border-zinc-200 dark:bg-zinc-900/70 dark:border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <select className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm dark:bg-zinc-950 dark:border-zinc-800" value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="all">All Events</option>
            <option value="auth">Auth</option>
            <option value="action">Action</option>
            <option value="security">Security</option>
            <option value="system">System</option>
          </select>

          <select className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm dark:bg-zinc-950 dark:border-zinc-800" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="all">All Severity</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>

          <select className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm dark:bg-zinc-950 dark:border-zinc-800" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="all">All Outcomes</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>

          <Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Actor username" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Action/target/message" />
          <Button variant="outline" onClick={loadAudit} disabled={loading} className="justify-center">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-white/95 backdrop-blur border-zinc-200 dark:bg-zinc-900/70 dark:border-zinc-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Time</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Type</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Action</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Actor</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Severity</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const actorLabel = entry.actor_username || 'system';
                return (
                  <TableRow key={entry.id} className="border-b border-zinc-100/80 dark:border-zinc-800/80 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/30 transition-colors">
                    <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{formatDateTime(entry.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{entry.event_type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium text-zinc-800 dark:text-zinc-200">{entry.action}</TableCell>
                    <TableCell className="text-sm">{actorLabel}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={severityClass(entry.severity)}>
                        {entry.severity === 'critical' ? <ShieldAlert className="h-3.5 w-3.5 mr-1" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                        {entry.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Open actions menu"
                            className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenDetails(entry.id); }} className="gap-2">
                            <Eye className="w-3.5 h-3.5" /> Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!entry.resolved_at) void resolveEntry(entry.id).catch(() => undefined);
                            }}
                            className="gap-2"
                            disabled={Boolean(entry.resolved_at)}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> {entry.resolved_at ? 'Resolved' : 'Resolve'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); void deleteEntry(entry.id).catch(() => undefined); }} className="gap-2">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!entries.length && !loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2 text-zinc-500">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      <span className="text-sm font-medium">No audit events match these filters.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>Next</Button>
        </div>
      </div>
    </div>
  );
}
