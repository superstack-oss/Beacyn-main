import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { ArrowLeft, Database, HardDrive, ShieldCheck, Cpu, Clock3 } from 'lucide-react';
import { apiUrl } from '../../../lib/api';

interface DatabaseDetailsProps {
  targetKey: string | null;
  onBack?: () => void;
}

interface DatabaseDetailResponse {
  targetKey: string;
  overview: {
    osPlatform: string | null;
    osDistro: string | null;
    osVersion: string | null;
    hostname: string | null;
    totalTargets: number | null;
    healthyTargets: number | null;
    unhealthyTargets: number | null;
    installedEngines: Record<string, boolean> | null;
    overallHealth: 'Healthy' | 'Warning' | 'Error' | null;
  };
  latest: {
    targetName: string;
    targetType: string;
    engine: string | null;
    version: string | null;
    ok: boolean;
    status: string;
    healthCategory: 'Healthy' | 'Warning' | 'Error' | null;
    healthReason: string | null;
    nodeRole: string | null;
    nodeState: string | null;
    databaseUptimeSec: number | null;
    totalDatabases: number | null;
    totalTables: number | null;
    totalSpaceMb: number | null;
    usedSpaceMb: number | null;
    freeSpaceMb: number | null;
    usedPct: number | null;
    latencyMs: number | null;
    activeSessions: number | null;
    slowQueries: number | null;
    lockCount: number | null;
    replicationLagSec: number | null;
    osPlatform: string | null;
    osDistro: string | null;
    osVersion: string | null;
    collectedAt: string;
  };
  inventory: {
    totalDatabases: number;
    databases: Array<{ id: string; dbName?: string; tableCount: number; sizeMb: number; healthCategory?: 'Healthy' | 'Warning' | 'Error'; healthReason?: string }>;
  } | null;
  node: Record<string, any> | null;
  performance: Record<string, any> | null;
  diagnostics: Record<string, any> | null;
  system: Record<string, any> | null;
  capabilityMatrix: Record<string, any> | null;
  space: Record<string, any> | null;
  asm: { diskgroups?: Array<{ id: string; totalMb: number; freeMb: number; usedPct: number | null }> } | null;
  latencyTrend: Array<{ time: string; value: number | null }>;
  sessionsTrend: Array<{ time: string; value: number | null }>;
  qpsTrend: Array<{ time: string; value: number | null }>;
  tpsTrend: Array<{ time: string; value: number | null }>;
  connectionsTrend: Array<{ time: string; value: number | null }>;
  memoryTrend: Array<{ time: string; value: number | null }>;
  cpuTrend: Array<{ time: string; value: number | null }>;
  diskTrend: Array<{ time: string; value: number | null }>;
  bufferPoolUsageTrend: Array<{ time: string; value: number | null }>;
  queryCacheHitTrend: Array<{ time: string; value: number | null }>;
}

function statusClass(status: string) {
  if (status === 'Connected') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Unavailable') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

function healthClass(status: 'Healthy' | 'Warning' | 'Error' | null) {
  if (status === 'Healthy') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Warning') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Error') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-zinc-50 text-zinc-700 border-zinc-200';
}

function boolClass(value: boolean | null | undefined) {
  if (value == null) return 'bg-zinc-50 text-zinc-700 border-zinc-200';
  return value ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200';
}

function metricState(value: number | null, type: string): { label: string; cls: string } {
  if (value == null) return { label: 'Not configured', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (type === 'latency') return value <= 50 ? { label: 'Good', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' } : value <= 200 ? { label: 'Moderate', cls: 'bg-amber-50 text-amber-700 border-amber-200' } : { label: 'High', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
  if (type === 'sessions') return value <= 10 ? { label: 'Low', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' } : value <= 100 ? { label: 'Normal', cls: 'bg-amber-50 text-amber-700 border-amber-200' } : { label: 'High', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
  if (type === 'slowQueries') return value === 0 ? { label: 'Excellent', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' } : { label: 'Warning', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (type === 'locks') return value === 0 ? { label: 'No contention', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' } : { label: 'Contention', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: 'Info', cls: 'bg-sky-50 text-sky-700 border-sky-200' };
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== '';
}

function getByPath(obj: any, path: string) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function metricSupportState(
  detail: DatabaseDetailResponse,
  value: unknown,
  capabilityPath: string,
  supportedEngines?: Array<'mysql' | 'postgres' | 'mongodb' | 'oracle'>
) {
  const engine = String(detail.latest.targetType || '').toLowerCase() as 'mysql' | 'postgres' | 'mongodb' | 'oracle';
  if (supportedEngines && !supportedEngines.includes(engine)) {
    return { label: 'Not supported on this engine', cls: 'bg-zinc-50 text-zinc-700 border-zinc-200' };
  }
  const supported = getByPath(detail.capabilityMatrix, capabilityPath);
  if (supported === true || hasValue(value)) {
    return { label: 'Supported', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  return { label: 'Not available (permission/version)', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
}

function fmtMbFromBytes(bytes: number | null | undefined) {
  if (bytes == null) return 'N/A';
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fmtValue(value: string | number | boolean | null | undefined) {
  if (value == null || value === '') return 'N/A';
  return String(value);
}

function fmtNum(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return 'N/A';
  return Number(value).toFixed(digits);
}

function fmtSeconds(seconds: number | null | undefined) {
  if (seconds == null || seconds < 0) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/* function engineLabel(engine: string) {
  if (engine === 'postgres') return 'PostgreSQL';
  if (!engine) return 'Unknown';
  return engine.charAt(0).toUpperCase() + engine.slice(1);
} */

function formatShortTime(value: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function DatabaseDetails({ targetKey, onBack }: DatabaseDetailsProps) {
  const [detail, setDetail] = useState<DatabaseDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!targetKey) {
      setDetail(null);
      return;
    }

    let ignore = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl(`/api/databases/${encodeURIComponent(targetKey)}?limit=72`));
        if (!res.ok) throw new Error('details unavailable');
        const data = await res.json();
        if (!ignore) setDetail(data);
      } catch {
        if (!ignore) setDetail(null);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, 60_000);
    return () => {
      ignore = true;
      clearInterval(id);
    };
  }, [targetKey]);

  if (!targetKey) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="py-14 text-center text-sm text-zinc-500">Select a database target from Database list.</CardContent>
      </Card>
    );
  }

  if (loading && !detail) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="py-14 text-center text-sm text-zinc-500">Loading database details...</CardContent>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="py-14 text-center text-sm text-zinc-500">Database details unavailable.</CardContent>
      </Card>
    );
  }

  const latencyState = metricState(detail.performance?.latencyMs ?? null, 'latency');
  const sessionsState = metricState(detail.performance?.activeSessions ?? null, 'sessions');
  const slowQueryState = metricState(detail.performance?.slowQueries ?? null, 'slowQueries');
  const lockState = metricState(detail.performance?.locks ?? null, 'locks');
  const replicationLagState = metricState((detail.node?.replicationLagSec as number | null | undefined) ?? detail.latest.replicationLagSec ?? null, 'latency');
  const latencySupport = metricSupportState(detail, detail.performance?.latencyMs, 'featureSupported.connectionHealthClassification');
  const sessionSupport = metricSupportState(detail, detail.performance?.activeSessions, 'featureSupported.connectionHealthClassification');
  const slowSupport = metricSupportState(detail, detail.performance?.slowQueries, 'featureSupported.queryDiagnostics.mysql.slowQuerySampling', ['mysql']);
  const lockSupport = metricSupportState(detail, detail.performance?.locks, 'featureSupported.connectionHealthClassification');
  const inventorySizeTotal = detail.inventory?.databases?.reduce((sum, db) => sum + Number(db.sizeMb || 0), 0) || 0;
  const chartNum = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const queryPerformanceTrendData = detail.qpsTrend.map((p, i) => ({
    time: p.time,
    qps: p.value,
    tps: detail.tpsTrend?.[i]?.value ?? null,
  }));
  const connectionsThreadsChartData = [
    { name: 'Active Conn', value: chartNum(detail.performance?.activeConnections ?? detail.performance?.threadsConnected) },
    { name: 'Max Conn', value: chartNum(detail.performance?.maxConnections) },
    { name: 'Threads Run', value: chartNum(detail.performance?.threadsRunning) },
    { name: 'Threads Conn', value: chartNum(detail.performance?.threadsConnected) },
    { name: 'Conn Err', value: chartNum(detail.performance?.connectionErrors) },
  ];
  const innodbStorageChartData = [
    { name: 'Reads/s', value: chartNum(detail.performance?.innodb?.readsPerSec) },
    { name: 'Writes/s', value: chartNum(detail.performance?.innodb?.writesPerSec) },
    { name: 'Pg Read/s', value: chartNum(detail.performance?.innodb?.pagesReadPerSec) },
    { name: 'Pg Write/s', value: chartNum(detail.performance?.innodb?.pagesWrittenPerSec) },
    { name: 'Buf Hit %', value: chartNum(detail.performance?.bufferCacheHitPct) },
  ];
  const cacheMemoryTrendData = detail.memoryTrend.map((p, i) => ({
    time: p.time,
    memory: p.value,
    cpu: detail.cpuTrend?.[i]?.value ?? null,
    bufferPool: detail.bufferPoolUsageTrend?.[i]?.value ?? null,
    queryCache: detail.queryCacheHitTrend?.[i]?.value ?? null,
  }));

  return (
    <div className="space-y-7 db-premium-page db-premium-details">
      <div className="flex items-center justify-between">
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to databases
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`db-premium-badge ${statusClass(detail.latest.status)}`}>{detail.latest.status}</Badge>
          <Badge variant="outline" className={`db-premium-badge ${healthClass(detail.latest.healthCategory || detail.overview.overallHealth)}`}>{detail.latest.healthCategory || detail.overview.overallHealth || 'Unknown'}</Badge>
        </div>
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Database Health Snapshot</CardTitle>
          <CardDescription>Latest connectivity, engine, uptime, and inventory health for this target.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">Target</p>
                <p className="text-xl font-bold mt-1">{detail.latest.targetName || detail.targetKey}</p>
                <p className="text-xs text-zinc-500 mt-1">{detail.latest.engine || detail.latest.targetType} {detail.latest.version ? `v${detail.latest.version}` : ''}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`db-premium-badge ${statusClass(detail.latest.status)}`}>{detail.latest.status}</Badge>
                <Badge variant="outline" className={`db-premium-badge ${healthClass(detail.latest.healthCategory || detail.overview.overallHealth)}`}>{detail.latest.healthCategory || detail.overview.overallHealth || 'Unknown'}</Badge>
                <Badge variant="outline" className={`db-premium-badge ${boolClass(detail.latest.ok)}`}>{detail.latest.ok ? 'Reachable' : 'Unreachable'}</Badge>
              </div>
            </div>
            {detail.latest.healthCategory && detail.latest.healthCategory !== 'Healthy' ? (
              <div className="mt-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 text-sm">
                <p className="text-zinc-500">Issue</p>
                <p className="font-medium mt-1">{detail.latest.healthReason || 'Reason not provided by probe.'}</p>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500 flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" /> Uptime</p>
              <p className="text-xl font-bold mt-1">{fmtSeconds(detail.latest.databaseUptimeSec)}</p>
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500 flex items-center gap-1"><Database className="w-3.5 h-3.5" /> Databases</p>
              <p className="text-xl font-bold mt-1">{detail.latest.totalDatabases ?? 'N/A'}</p>
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500 flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> Active Sessions</p>
              <p className="text-xl font-bold mt-1">{detail.latest.activeSessions ?? 'N/A'}</p>
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-xs uppercase tracking-wider text-zinc-500 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Last Collected</p>
              <p className="text-sm font-semibold mt-1">{new Date(detail.latest.collectedAt).toLocaleString('en-GB')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Host Diagnostics</CardTitle>
          <CardDescription>OS-level pressure indicators collected with the database snapshot.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-zinc-500">CPU Load %</p>
            <p className="font-semibold mt-1">{detail.system?.cpu?.loadPct == null ? 'N/A' : `${detail.system.cpu.loadPct}%`}</p>
            <Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.system?.cpu?.loadPct, 'featureSupported.systemDiagnostics.cpuLoadAvg').cls}`}>
              {metricSupportState(detail, detail.system?.cpu?.loadPct, 'featureSupported.systemDiagnostics.cpuLoadAvg').label}
            </Badge>
          </div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-zinc-500">Memory Used %</p>
            <p className="font-semibold mt-1">{detail.system?.memory?.usedPct == null ? 'N/A' : `${detail.system.memory.usedPct}%`}</p>
            <Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.system?.memory?.usedPct, 'featureSupported.systemDiagnostics.memoryUsagePct').cls}`}>
              {metricSupportState(detail, detail.system?.memory?.usedPct, 'featureSupported.systemDiagnostics.memoryUsagePct').label}
            </Badge>
          </div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-zinc-500">Disk Used %</p>
            <p className="font-semibold mt-1">{detail.system?.disk?.usedPct == null ? 'N/A' : `${detail.system.disk.usedPct}%`}</p>
            <Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.system?.disk?.usedPct, 'featureSupported.systemDiagnostics.diskUsagePct').cls}`}>
              {metricSupportState(detail, detail.system?.disk?.usedPct, 'featureSupported.systemDiagnostics.diskUsagePct').label}
            </Badge>
          </div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-zinc-500">Host Pressure</p>
            <p className="font-semibold mt-1">{detail.system?.hostPressure || 'N/A'}</p>
            <Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.system?.hostPressure, 'featureSupported.systemDiagnostics.hostPressureIndicator').cls}`}>
              {metricSupportState(detail, detail.system?.hostPressure, 'featureSupported.systemDiagnostics.hostPressureIndicator').label}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Info Summary</CardTitle>
          <CardDescription>OS, engine, node health, and space details in one consolidated card.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="font-semibold mb-2">OS Details</p>
            <p><span className="text-zinc-500">Platform:</span> {detail.overview.osPlatform || detail.latest.osPlatform || 'N/A'}</p>
            <p><span className="text-zinc-500">Distribution:</span> {detail.overview.osDistro || detail.latest.osDistro || 'N/A'}</p>
            <p><span className="text-zinc-500">Version:</span> {detail.overview.osVersion || detail.latest.osVersion || 'N/A'}</p>
            <p><span className="text-zinc-500">Hostname:</span> {detail.overview.hostname || 'N/A'}</p>
          </div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="font-semibold mb-2">Engine Details</p>
            <p><span className="text-zinc-500">Engine:</span> {detail.latest.engine || detail.latest.targetType}</p>
            <p><span className="text-zinc-500">Version:</span> {detail.latest.version || 'N/A'}</p>
            <p><span className="text-zinc-500">Node Role:</span> {detail.latest.nodeRole || 'N/A'}</p>
            <p><span className="text-zinc-500">Node State:</span> {detail.latest.nodeState || 'N/A'}</p>
          </div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="font-semibold mb-2">Node And Health</p>
            <p><span className="text-zinc-500">Role:</span> {detail.latest.nodeRole || 'N/A'}</p>
            <p><span className="text-zinc-500">Node State:</span> {detail.latest.nodeState || 'N/A'}</p>
            <p><span className="text-zinc-500">Replication Lag:</span> {detail.latest.replicationLagSec == null ? 'N/A' : `${detail.latest.replicationLagSec}s`}</p>
            <p><span className="text-zinc-500">Last Collected:</span> {new Date(detail.latest.collectedAt).toLocaleString('en-GB')}</p>
          </div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="font-semibold mb-2">Space Summary</p>
            <p><span className="text-zinc-500">Total:</span> {detail.latest.totalSpaceMb == null ? 'N/A' : `${detail.latest.totalSpaceMb.toFixed(2)} MB`}</p>
            <p><span className="text-zinc-500">Used:</span> {detail.latest.usedSpaceMb == null ? 'N/A' : `${detail.latest.usedSpaceMb.toFixed(2)} MB`}</p>
            <p><span className="text-zinc-500">Free:</span> {detail.latest.freeSpaceMb == null ? 'N/A' : `${detail.latest.freeSpaceMb.toFixed(2)} MB`}</p>
            <p><span className="text-zinc-500">Used %:</span> {detail.latest.usedPct == null ? 'N/A' : `${detail.latest.usedPct.toFixed(2)}%`}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Latency</p>
            <p className="text-2xl font-bold mt-1">{detail.performance?.latencyMs == null ? 'N/A' : `${detail.performance.latencyMs} ms`}</p>
            <Badge variant="outline" className={`mt-2 ${latencyState.cls}`}>{latencyState.label}</Badge>
            <Badge variant="outline" className={`mt-2 ml-2 ${latencySupport.cls}`}>{latencySupport.label}</Badge>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Active Sessions</p>
            <p className="text-2xl font-bold mt-1">{detail.performance?.activeSessions ?? 'N/A'}</p>
            <Badge variant="outline" className={`mt-2 ${sessionsState.cls}`}>{sessionsState.label}</Badge>
            <Badge variant="outline" className={`mt-2 ml-2 ${sessionSupport.cls}`}>{sessionSupport.label}</Badge>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Slow Queries</p>
            <p className="text-2xl font-bold mt-1">{detail.performance?.slowQueries ?? 'N/A'}</p>
            <Badge variant="outline" className={`mt-2 ${slowQueryState.cls}`}>{slowQueryState.label}</Badge>
            <Badge variant="outline" className={`mt-2 ml-2 ${slowSupport.cls}`}>{slowSupport.label}</Badge>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Lock Contention</p>
            <p className="text-2xl font-bold mt-1">{detail.performance?.locks ?? detail.latest.lockCount ?? 'N/A'}</p>
            <Badge variant="outline" className={`mt-2 ${lockState.cls}`}>{lockState.label}</Badge>
            <Badge variant="outline" className={`mt-2 ml-2 ${lockSupport.cls}`}>{lockSupport.label}</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Inventory section - only show if inventory data is available */}

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Database Inventory</CardTitle>
          <CardDescription>Per-database table count, size, and health classification.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!detail.inventory?.databases?.length ? (
            <div className="py-10 text-center text-sm text-zinc-500">No inventory data available.</div>
          ) : (
            <>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Total Databases</p>
                <p className="text-2xl font-bold mt-1">{detail.inventory.totalDatabases}</p>
              </div>
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Total Tables</p>
                <p className="text-2xl font-bold mt-1">{detail.inventory.databases.reduce((s, d) => s + Number(d.tableCount || 0), 0)}</p>
              </div>
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Total Inventory Size</p>
                <p className="text-2xl font-bold mt-1">{inventorySizeTotal.toFixed(2)} MB</p>
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="max-h-[360px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-zinc-100 dark:border-zinc-800 sticky top-0 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-sm z-10">
                      <TableHead className="pl-4 font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Database Name</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase text-right">Tables</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase text-right">Size (MB)</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase text-right">Inventory Share</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Issue</TableHead>
                      <TableHead className="pr-4 font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Health</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.inventory.databases.map((db, idx) => {
                      const pct = inventorySizeTotal > 0 ? Math.min(100, Math.max(0, (Number(db.sizeMb || 0) / inventorySizeTotal) * 100)) : 0;
                      return (
                        <TableRow key={db.id} className={`border-b border-zinc-100 dark:border-zinc-800/60 group ${idx % 2 === 0 ? 'bg-zinc-50/20 dark:bg-zinc-900/15' : ''} hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition-colors`}>
                          <TableCell className="pl-4 font-semibold text-zinc-800 dark:text-zinc-200 py-4">{db.dbName || db.id}</TableCell>
                          <TableCell className="text-right tabular-nums py-4">{db.tableCount}</TableCell>
                          <TableCell className="text-right tabular-nums py-4">{Number(db.sizeMb || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums py-4">{pct.toFixed(1)}%</TableCell>
                          <TableCell className="max-w-[420px] truncate" title={db.healthReason || ''}>
                            {db.healthReason || 'No issue detected'}
                          </TableCell>
                          <TableCell className="pr-4">
                            <Badge variant="outline" className={`db-premium-badge ${healthClass(db.healthCategory || null)}`}>{db.healthCategory || 'Unknown'}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-zinc-50 dark:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800/60 font-medium">
                      <TableCell className="pl-4 font-semibold py-4">Total</TableCell>
                      <TableCell className="text-right tabular-nums py-4">{detail.inventory.databases.reduce((s, d) => s + Number(d.tableCount || 0), 0)}</TableCell>
                      <TableCell className="text-right tabular-nums py-4">{inventorySizeTotal.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums py-4">100.0%</TableCell>
                      <TableCell className="max-w-[420px] truncate" title={detail.latest.healthReason || ''}>
                        {detail.latest.healthReason || 'No issue detected'}
                      </TableCell>
                      <TableCell className="pr-4">
                        <Badge variant="outline" className={`db-premium-badge ${healthClass(detail.latest.healthCategory || detail.overview.overallHealth)}`}>{detail.latest.healthCategory || detail.overview.overallHealth || 'Unknown'}</Badge>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Database className="w-4 h-4" /> Node Status And Health</CardTitle>
          <CardDescription>High availability and replication indicators for this monitored target.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 text-sm">
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Role</p><p className="font-semibold mt-1">{fmtValue(detail.node?.role || detail.latest.nodeRole)}</p><Badge variant="outline" className="mt-2 bg-sky-50 text-sky-700 border-sky-200">Info</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Node State</p><p className="font-semibold mt-1">{fmtValue(detail.node?.nodeState || detail.latest.nodeState)}</p><Badge variant="outline" className={`mt-2 ${healthClass(detail.latest.healthCategory || detail.overview.overallHealth)}`}>{detail.latest.healthCategory || detail.overview.overallHealth || 'Unknown'}</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Heartbeat</p><p className="font-semibold mt-1">{fmtValue(detail.node?.heartbeat)}</p><Badge variant="outline" className="mt-2 bg-sky-50 text-sky-700 border-sky-200">Info</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Connection Health</p><p className="font-semibold mt-1">{fmtValue(detail.node?.connectionHealth)}</p><Badge variant="outline" className={`mt-2 ${boolClass(detail.latest.ok)}`}>{detail.latest.ok ? 'Connected' : 'Disconnected'}</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Replication Lag</p><p className="font-semibold mt-1">{detail.node?.replicationLagSec == null ? (detail.latest.replicationLagSec == null ? 'N/A' : `${detail.latest.replicationLagSec}s`) : `${detail.node.replicationLagSec}s`}</p><Badge variant="outline" className={`mt-2 ${replicationLagState.cls}`}>{replicationLagState.label}</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Replica IO</p><p className="font-semibold mt-1">{fmtValue(detail.node?.replicaIoRunning)}</p><Badge variant="outline" className="mt-2 bg-sky-50 text-sky-700 border-sky-200">Info</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Replica SQL</p><p className="font-semibold mt-1">{fmtValue(detail.node?.replicaSqlRunning)}</p><Badge variant="outline" className="mt-2 bg-sky-50 text-sky-700 border-sky-200">Info</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Failover Status</p><p className="font-semibold mt-1">{fmtValue(detail.node?.failoverStatus)}</p><Badge variant="outline" className="mt-2 bg-sky-50 text-sky-700 border-sky-200">Info</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Cluster Quorum</p><p className="font-semibold mt-1">{fmtValue(detail.node?.clusterQuorum)}</p><Badge variant="outline" className="mt-2 bg-sky-50 text-sky-700 border-sky-200">Info</Badge></div>
        </CardContent>
      </Card>

      {/* Performance trends and charts - only show if we have some data points to display */}
      
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Latencyss Trend</CardTitle>
            <CardDescription>Connection/query latency over recent runs.</CardDescription>
          </CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={detail.latencyTrend}>
                <defs>
                  <linearGradient id="dbLatencyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.42} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="time" tickFormatter={formatShortTime} axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#71717a' }} />
                <YAxis axisLine={false} tickLine={false} fontSize={12} unit="ms" tick={{ fill: '#71717a' }} width={36} />
                <Tooltip
                  formatter={(value) => value == null ? 'N/A' : `${value} ms`}
                  labelFormatter={(label) => `Time: ${formatShortTime(String(label))}`}
                  contentStyle={{ borderRadius: 10, border: '1px solid #d4d4d8', boxShadow: '0 8px 28px rgba(15,23,42,0.08)' }}
                />
                <Area type="monotone" dataKey="value" stroke="#0284c7" strokeWidth={2} fillOpacity={1} fill="url(#dbLatencyGrad)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Sessions Trend</CardTitle>
            <CardDescription>Session/connections trend over recent runs.</CardDescription>
          </CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={detail.sessionsTrend}>
                <defs>
                  <linearGradient id="dbSessionsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.42} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="time" tickFormatter={formatShortTime} axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#71717a' }} />
                <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#71717a' }} width={34} />
                <Tooltip
                  formatter={(value) => value == null ? 'N/A' : `${value}`}
                  labelFormatter={(label) => `Time: ${formatShortTime(String(label))}`}
                  contentStyle={{ borderRadius: 10, border: '1px solid #d4d4d8', boxShadow: '0 8px 28px rgba(15,23,42,0.08)' }}
                />
                <Area type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2} fillOpacity={1} fill="url(#dbSessionsGrad)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Query Performance Chart</CardTitle>
            <CardDescription>Time-series view of QPS and TPS, aligned with trend charts.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={queryPerformanceTrendData}>
                <defs>
                  <linearGradient id="dbQpsPerfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dbTpsPerfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="time" tickFormatter={formatShortTime} axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} />
                <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} width={36} />
                <Tooltip
                  formatter={(value, name) => value == null ? 'N/A' : `${name}: ${value}`}
                  labelFormatter={(label) => `Time: ${formatShortTime(String(label))}`}
                  contentStyle={{ borderRadius: 10, border: '1px solid #d4d4d8', boxShadow: '0 8px 28px rgba(15,23,42,0.08)' }}
                />
                <Area type="monotone" dataKey="qps" stroke="#0284c7" fill="url(#dbQpsPerfGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="tps" stroke="#16a34a" fill="url(#dbTpsPerfGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">QPS/TPS Trend</CardTitle>
            <CardDescription>Small time-series trend from historical snapshots.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={detail.qpsTrend.map((p, i) => ({
                  time: p.time,
                  qps: p.value,
                  tps: detail.tpsTrend?.[i]?.value ?? null,
                }))}
              >
                <defs>
                  <linearGradient id="dbQpsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dbTpsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="time" tickFormatter={formatShortTime} axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} />
                <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} width={36} />
                <Tooltip
                  formatter={(value, name) => value == null ? 'N/A' : `${name}: ${value}`}
                  labelFormatter={(label) => `Time: ${formatShortTime(String(label))}`}
                  contentStyle={{ borderRadius: 10, border: '1px solid #d4d4d8', boxShadow: '0 8px 28px rgba(15,23,42,0.08)' }}
                />
                <Area type="monotone" dataKey="qps" stroke="#0284c7" fill="url(#dbQpsGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="tps" stroke="#16a34a" fill="url(#dbTpsGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Connections And Threads Chart</CardTitle>
            <CardDescription>Connection pressure and thread activity in one chart.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={connectionsThreadsChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} />
                <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} width={38} />
                <Tooltip formatter={(value) => `${value}`} contentStyle={{ borderRadius: 10, border: '1px solid #d4d4d8', boxShadow: '0 8px 28px rgba(15,23,42,0.08)' }} />
                <Bar dataKey="value" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Connections Trend</CardTitle>
            <CardDescription>Historical active-connections trend from the details endpoint.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={detail.connectionsTrend}>
                <defs>
                  <linearGradient id="dbConnGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ea580c" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="time" tickFormatter={formatShortTime} axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} />
                <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} width={36} />
                <Tooltip
                  formatter={(value) => value == null ? 'N/A' : `${value}`}
                  labelFormatter={(label) => `Time: ${formatShortTime(String(label))}`}
                  contentStyle={{ borderRadius: 10, border: '1px solid #d4d4d8', boxShadow: '0 8px 28px rgba(15,23,42,0.08)' }}
                />
                <Area type="monotone" dataKey="value" stroke="#ea580c" fill="url(#dbConnGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">InnoDB And Storage Engine Chart</CardTitle>
            <CardDescription>Read/write, page churn, and buffer-hit behavior at a glance.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={innodbStorageChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} />
                <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} width={38} />
                <Tooltip formatter={(value) => `${value}`} contentStyle={{ borderRadius: 10, border: '1px solid #d4d4d8', boxShadow: '0 8px 28px rgba(15,23,42,0.08)' }} />
                <Bar dataKey="value" fill="#ea580c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Cache And Memory Chart</CardTitle>
            <CardDescription>Time-series view of memory/cache behavior aligned with trend style.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cacheMemoryTrendData}>
                <defs>
                  <linearGradient id="dbMemTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dbBufTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="time" tickFormatter={formatShortTime} axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} />
                <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} width={36} />
                <Tooltip
                  formatter={(value, name) => value == null ? 'N/A' : `${name}: ${value}`}
                  labelFormatter={(label) => `Time: ${formatShortTime(String(label))}`}
                  contentStyle={{ borderRadius: 10, border: '1px solid #d4d4d8', boxShadow: '0 8px 28px rgba(15,23,42,0.08)' }}
                />
                <Area type="monotone" dataKey="memory" stroke="#7c3aed" fill="url(#dbMemTrendGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="bufferPool" stroke="#0ea5e9" fill="url(#dbBufTrendGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Performance Metrics</CardTitle>
          <CardDescription>Detailed telemetry in a visual card layout.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 text-sm">
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Threads Running</p><p className="font-semibold mt-1">{detail.performance?.threadsRunning ?? 'N/A'}</p></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Threads Connected</p><p className="font-semibold mt-1">{detail.performance?.threadsConnected ?? 'N/A'}</p></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Questions</p><p className="font-semibold mt-1">{detail.performance?.questions ?? 'N/A'}</p></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Uptime</p><p className="font-semibold mt-1">{detail.performance?.uptimeSec == null ? 'N/A' : `${detail.performance.uptimeSec} sec`}</p></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Wait Events</p><p className="font-semibold mt-1">{detail.performance?.waitEvents ?? 'N/A'}</p></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Buffer Cache Hit</p><p className="font-semibold mt-1">{detail.performance?.bufferCacheHitPct == null ? 'N/A' : `${detail.performance.bufferCacheHitPct}%`}</p></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Transactions/sec</p><p className="font-semibold mt-1">{detail.performance?.transactionsPerSec ?? 'N/A'}</p></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Bytes Received</p><p className="font-semibold mt-1">{fmtMbFromBytes(detail.performance?.bytesReceived ?? null)}</p></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Bytes Sent</p><p className="font-semibold mt-1">{fmtMbFromBytes(detail.performance?.bytesSent ?? null)}</p></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Connection Utilization</p><p className="font-semibold mt-1">{detail.performance?.connectionUtilizationPct == null ? 'N/A' : `${detail.performance.connectionUtilizationPct}%`}</p><Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.performance?.connectionUtilizationPct, 'featureSupported.dbLevel.connectionSaturationDetection').cls}`}>{metricSupportState(detail, detail.performance?.connectionUtilizationPct, 'featureSupported.dbLevel.connectionSaturationDetection').label}</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Error Rate</p><p className="font-semibold mt-1">{detail.performance?.errorRatePct == null ? 'N/A' : `${detail.performance.errorRatePct}%`}</p><Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.performance?.errorRatePct, 'featureSupported.dbLevel.errorRateIndicators').cls}`}>{metricSupportState(detail, detail.performance?.errorRatePct, 'featureSupported.dbLevel.errorRateIndicators').label}</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">QPS</p><p className="font-semibold mt-1">{detail.performance?.qps ?? detail.performance?.qpsRate ?? 'N/A'}</p><Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.performance?.qps ?? detail.performance?.qpsRate, 'featureSupported.metrics.mysql.qps', ['mysql']).cls}`}>{metricSupportState(detail, detail.performance?.qps ?? detail.performance?.qpsRate, 'featureSupported.metrics.mysql.qps', ['mysql']).label}</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Cache Hit Ratio</p><p className="font-semibold mt-1">{detail.performance?.cacheHitRatioPct == null ? 'N/A' : `${detail.performance.cacheHitRatioPct}%`}</p><Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.performance?.cacheHitRatioPct, 'featureSupported.metrics.postgres.cacheHitRatio', ['postgres']).cls}`}>{metricSupportState(detail, detail.performance?.cacheHitRatioPct, 'featureSupported.metrics.postgres.cacheHitRatio', ['postgres']).label}</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Deadlocks</p><p className="font-semibold mt-1">{detail.performance?.deadlocks ?? 'N/A'}</p><Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.performance?.deadlocks, 'featureSupported.metrics.postgres.deadlocks', ['postgres']).cls}`}>{metricSupportState(detail, detail.performance?.deadlocks, 'featureSupported.metrics.postgres.deadlocks', ['postgres']).label}</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Mongo Read/s</p><p className="font-semibold mt-1">{detail.performance?.opcounters?.readsPerSec ?? 'N/A'}</p><Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.performance?.opcounters?.readsPerSec, 'featureSupported.metrics.mongodb.opcounters', ['mongodb']).cls}`}>{metricSupportState(detail, detail.performance?.opcounters?.readsPerSec, 'featureSupported.metrics.mongodb.opcounters', ['mongodb']).label}</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Mongo Write/s</p><p className="font-semibold mt-1">{detail.performance?.opcounters?.writesPerSec ?? 'N/A'}</p><Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.performance?.opcounters?.writesPerSec, 'featureSupported.metrics.mongodb.opcounters', ['mongodb']).cls}`}>{metricSupportState(detail, detail.performance?.opcounters?.writesPerSec, 'featureSupported.metrics.mongodb.opcounters', ['mongodb']).label}</Badge></div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Oracle Redo Log Usage</p><p className="font-semibold mt-1">{detail.performance?.redoLogUsagePct == null ? 'N/A' : `${detail.performance.redoLogUsagePct}%`}</p><Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.performance?.redoLogUsagePct, 'featureSupported.metrics.oracle.redoLogUsage', ['oracle']).cls}`}>{metricSupportState(detail, detail.performance?.redoLogUsagePct, 'featureSupported.metrics.oracle.redoLogUsage', ['oracle']).label}</Badge></div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Query Performance Metrics</CardTitle>
            <CardDescription>QPS, TPS, query latency percentiles, and slow-query pressure.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">QPS</p><p className="font-semibold mt-1">{detail.performance?.qps ?? detail.performance?.qpsRate ?? 'N/A'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">TPS</p><p className="font-semibold mt-1">{detail.performance?.transactionsPerSec ?? detail.performance?.transactionsPerSecRate ?? 'N/A'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Latency Avg (ms)</p><p className="font-semibold mt-1">{fmtNum(detail.performance?.queryLatencyMs?.avg ?? detail.performance?.latencyMs ?? null)}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Latency P95/P99 (ms)</p><p className="font-semibold mt-1">{fmtNum(detail.performance?.queryLatencyMs?.p95)} / {fmtNum(detail.performance?.queryLatencyMs?.p99)}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Slow Queries</p><p className="font-semibold mt-1">{detail.performance?.slowQueries ?? 'N/A'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Questions</p><p className="font-semibold mt-1">{detail.performance?.questions ?? 'N/A'}</p></div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Connections And Threads</CardTitle>
            <CardDescription>Connection pool pressure, saturation risk, and thread activity.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Active Connections</p><p className="font-semibold mt-1">{detail.performance?.activeConnections ?? detail.performance?.threadsConnected ?? 'N/A'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Max Connections</p><p className="font-semibold mt-1">{detail.performance?.maxConnections ?? 'N/A'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Threads Running</p><p className="font-semibold mt-1">{detail.performance?.threadsRunning ?? 'N/A'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Threads Connected</p><p className="font-semibold mt-1">{detail.performance?.threadsConnected ?? 'N/A'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Connection Errors</p><p className="font-semibold mt-1">{detail.performance?.connectionErrors ?? 'N/A'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Connection Utilization</p><p className="font-semibold mt-1">{detail.performance?.connectionUtilizationPct == null ? 'N/A' : `${detail.performance.connectionUtilizationPct}%`}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">InnoDB And Storage Engine Metrics</CardTitle>
            <CardDescription>Buffer efficiency, reads/writes, disk IO, and page churn.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Buffer Pool Hit Ratio</p><p className="font-semibold mt-1">{detail.performance?.bufferCacheHitPct == null ? 'N/A' : `${detail.performance.bufferCacheHitPct}%`}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Reads vs Writes (/s)</p><p className="font-semibold mt-1">{fmtNum(detail.performance?.innodb?.readsPerSec)} / {fmtNum(detail.performance?.innodb?.writesPerSec)}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Disk IO Read/Write (KB/s)</p><p className="font-semibold mt-1">{fmtNum((detail.performance?.innodb?.diskReadBytesPerSec ?? 0) / 1024)} / {fmtNum((detail.performance?.innodb?.diskWrittenBytesPerSec ?? 0) / 1024)}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Row Lock Time (ms)</p><p className="font-semibold mt-1">{detail.performance?.lockWaitMs ?? detail.performance?.waitEvents ?? 'N/A'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Pages Read/Written (/s)</p><p className="font-semibold mt-1">{fmtNum(detail.performance?.innodb?.pagesReadPerSec)} / {fmtNum(detail.performance?.innodb?.pagesWrittenPerSec)}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Buffer Pool Usage</p><p className="font-semibold mt-1">{detail.performance?.innodb?.bufferPoolUsagePct == null ? 'N/A' : `${detail.performance.innodb.bufferPoolUsagePct}%`}</p></div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Locks And Contention</CardTitle>
            <CardDescription>Blocking risk indicators and transaction wait pressure.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Row Locks</p><p className="font-semibold mt-1">{detail.diagnostics?.locks?.rowLocks ?? detail.performance?.locks ?? 'N/A'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Lock Wait Time (ms)</p><p className="font-semibold mt-1">{detail.diagnostics?.locks?.lockWaitTimeMs ?? detail.performance?.lockWaitMs ?? 'N/A'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Deadlocks</p><p className="font-semibold mt-1">{detail.diagnostics?.locks?.deadlocks ?? detail.performance?.deadlocks ?? 'N/A'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Transactions Waiting</p><p className="font-semibold mt-1">{detail.diagnostics?.locks?.transactionsWaiting ?? detail.performance?.transactionsWaiting ?? 'N/A'}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Table And Index Metrics</CardTitle>
            <CardDescription>Heavy tables, growth trend, index quality, and full-scan signals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Largest Table</p><p className="font-semibold mt-1">{detail.diagnostics?.table?.topTablesBySize?.[0] ? `${detail.diagnostics.table.topTablesBySize[0].schemaName}.${detail.diagnostics.table.topTablesBySize[0].tableName}` : 'N/A'}</p></div>
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Largest Table Size</p><p className="font-semibold mt-1">{detail.diagnostics?.table?.topTablesBySize?.[0] ? `${fmtNum(detail.diagnostics.table.topTablesBySize[0].sizeMb)} MB` : 'N/A'}</p></div>
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Top Growth Table</p><p className="font-semibold mt-1">{detail.diagnostics?.table?.topGrowthTables?.[0]?.table || 'N/A'}</p></div>
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Growth Rate (MB/h)</p><p className="font-semibold mt-1">{fmtNum(detail.diagnostics?.table?.topGrowthTables?.[0]?.growthRateMbPerHour ?? null)}</p></div>
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Full Table Scans</p><p className="font-semibold mt-1">{detail.diagnostics?.index?.fullTableScans ?? detail.performance?.fullTableScans ?? 'N/A'}</p></div>
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">No Index Used</p><p className="font-semibold mt-1">{detail.diagnostics?.index?.noIndexUsedQueries ?? 'N/A'}</p></div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Cache And Memory Metrics</CardTitle>
            <CardDescription>Buffer pool usage, query-cache behavior, and memory pressure.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Buffer Pool Usage %</p><p className="font-semibold mt-1">{detail.performance?.innodb?.bufferPoolUsagePct == null ? 'N/A' : `${detail.performance.innodb.bufferPoolUsagePct}%`}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Buffer Pool Data (MB)</p><p className="font-semibold mt-1">{fmtNum((detail.performance?.innodb?.bufferPoolBytesData ?? 0) / 1024 / 1024)}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Query Cache</p><p className="font-semibold mt-1">{detail.performance?.cache?.queryCacheEnabled ? 'Enabled' : 'Disabled/N.A.'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Query Cache Hit Ratio</p><p className="font-semibold mt-1">{detail.performance?.cache?.queryCacheHitRatioPct == null ? 'N/A' : `${detail.performance.cache.queryCacheHitRatioPct}%`}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Host Memory Used %</p><p className="font-semibold mt-1">{detail.performance?.memory?.hostMemoryUsedPct == null ? (detail.system?.memory?.usedPct == null ? 'N/A' : `${detail.system.memory.usedPct}%`) : `${detail.performance.memory.hostMemoryUsedPct}%`}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Host Memory Used (MB)</p><p className="font-semibold mt-1">{fmtNum(detail.performance?.memory?.hostMemoryUsedMb ?? detail.system?.memory?.usedMb ?? null)}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Query-Level Metrics (Insights)</CardTitle>
          <CardDescription>Performance Schema digest-level query execution, frequency, and index usage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-zinc-500">Top Slow Queries</p>
              <div className="mt-2 space-y-1">
                {(detail.diagnostics?.query?.topSlowQueries || []).slice(0, 5).map((q: any, idx: number) => (
                  <p key={`slow-${idx}`} className="truncate" title={q.digest}>{idx + 1}. {q.digest || 'N/A'} ({fmtNum(q.avgMs)} ms)</p>
                ))}
                {!(detail.diagnostics?.query?.topSlowQueries || []).length ? <p className="text-zinc-500">N/A</p> : null}
              </div>
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-zinc-500">Top Failed Queries</p>
              <div className="mt-2 space-y-1">
                {(detail.diagnostics?.query?.topFailedQueries || []).slice(0, 5).map((q: any, idx: number) => (
                  <p key={`failed-${idx}`} className="truncate" title={q.digest}>{idx + 1}. {q.digest || 'N/A'} (errors: {q.errors ?? 0})</p>
                ))}
                {!(detail.diagnostics?.query?.topFailedQueries || []).length ? <p className="text-zinc-500">N/A</p> : null}
              </div>
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-zinc-500">Top Large Queries</p>
              <div className="mt-2 space-y-1">
                {(detail.diagnostics?.query?.topLargeQueries || []).slice(0, 5).map((q: any, idx: number) => (
                  <p key={`large-${idx}`} className="truncate" title={q.digest}>{idx + 1}. {q.digest || 'N/A'} (rows: {q.rowsExamined ?? 0})</p>
                ))}
                {!(detail.diagnostics?.query?.topLargeQueries || []).length ? <p className="text-zinc-500">N/A</p> : null}
              </div>
            </div>
          </div>

          {!detail.diagnostics?.query?.performanceSchemaTopQueries?.length ? (
            <div className="py-4 text-sm text-zinc-500">Performance Schema query digest data is unavailable for this target.</div>
          ) : (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="max-h-[320px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-zinc-100 dark:border-zinc-800 sticky top-0 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-sm z-10">
                      <TableHead className="pl-4 font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Query</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase text-right">Frequency</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase text-right">Avg Ms</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase text-right">Total Ms</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase text-right">No Index</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.diagnostics.query.performanceSchemaTopQueries.map((q: any, idx: number) => (
                      <TableRow key={`${idx}-${q.digest}`} className={`border-b border-zinc-100 dark:border-zinc-800/60 ${idx % 2 === 0 ? 'bg-zinc-50/20 dark:bg-zinc-900/15' : ''}`}>
                        <TableCell className="pl-4 py-3 max-w-[520px] truncate" title={q.digest}>{q.digest || 'N/A'}</TableCell>
                        <TableCell className="text-right tabular-nums py-3">{q.count ?? 'N/A'}</TableCell>
                        <TableCell className="text-right tabular-nums py-3">{fmtNum(q.avgMs)}</TableCell>
                        <TableCell className="text-right tabular-nums py-3">{fmtNum(q.totalMs)}</TableCell>
                        <TableCell className="text-right tabular-nums py-3">{(Number(q.noIndexUsed || 0) + Number(q.noGoodIndexUsed || 0)) || 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><HardDrive className="w-4 h-4" /> Space Utilization</CardTitle>
          <CardDescription>Raw space metrics collected from engine-specific probes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Total DB Size</p><p className="text-xl font-bold mt-1">{detail.space?.totalMb == null ? 'N/A' : `${detail.space.totalMb} MB`}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Used Space</p><p className="text-xl font-bold mt-1">{detail.space?.usedMb == null ? 'N/A' : `${detail.space.usedMb} MB`}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Free Space</p><p className="text-xl font-bold mt-1">{detail.space?.freeMb == null ? 'N/A' : `${detail.space.freeMb} MB`}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Used %</p><p className="text-xl font-bold mt-1">{detail.space?.usedPct == null ? 'N/A' : `${detail.space.usedPct}%`}</p></div>
          </div>
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Datafile Growth</p><p className="font-semibold mt-1">{detail.space?.datafileGrowthMb == null ? 'N/A' : `${detail.space.datafileGrowthMb} MB`}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Index Bloat</p><p className="font-semibold mt-1">{detail.space?.indexBloatPct == null ? 'N/A' : `${detail.space.indexBloatPct}%`}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Log Usage</p><p className="font-semibold mt-1">{detail.space?.logUsagePct == null ? 'N/A' : `${detail.space.logUsagePct}%`}</p></div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Query Diagnostics</CardTitle>
          <CardDescription>Top slow or blocking operations based on engine capabilities.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-zinc-500">Long/Slow Queries</p>
            <p className="font-semibold mt-1">{(detail.diagnostics?.query?.slowQuerySampling?.length ?? detail.diagnostics?.query?.longRunningQueries?.length ?? detail.diagnostics?.query?.currentOperations?.length ?? 0)}</p>
            <Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.diagnostics?.query?.slowQuerySampling ?? detail.diagnostics?.query?.longRunningQueries ?? detail.diagnostics?.query?.currentOperations, 'featureSupported.queryDiagnostics.mysql.slowQuerySampling', ['mysql']).cls}`}>
              {metricSupportState(detail, detail.diagnostics?.query?.slowQuerySampling ?? detail.diagnostics?.query?.longRunningQueries ?? detail.diagnostics?.query?.currentOperations, 'featureSupported.queryDiagnostics.mysql.slowQuerySampling', ['mysql']).label}
            </Badge>
          </div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-zinc-500">Blocking Queries</p>
            <p className="font-semibold mt-1">{detail.diagnostics?.query?.blockingQueries?.length ?? 'N/A'}</p>
            <Badge variant="outline" className={`mt-2 ${metricSupportState(detail, detail.diagnostics?.query?.blockingQueries, 'featureSupported.queryDiagnostics.postgres.blockingQueries', ['postgres']).cls}`}>
              {metricSupportState(detail, detail.diagnostics?.query?.blockingQueries, 'featureSupported.queryDiagnostics.postgres.blockingQueries', ['postgres']).label}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {detail.asm?.diskgroups?.length ? (
        <>
          <p className="text-xs uppercase tracking-wider text-zinc-500">9. ASM Disk Groups</p>
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">ASM Disk Groups</CardTitle>
              <CardDescription>Anonymous ASM group utilization from Oracle telemetry.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {detail.asm.diskgroups.map((g) => (
                <div key={g.id} className="rounded-md border border-zinc-200 dark:border-zinc-800 p-4">
                  <p className="font-semibold">{g.id}</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p><span className="text-zinc-500">Total:</span> {g.totalMb.toFixed(2)} MB</p>
                    <p><span className="text-zinc-500">Free:</span> {g.freeMb.toFixed(2)} MB</p>
                    <p><span className="text-zinc-500">Used %:</span> {g.usedPct == null ? 'N/A' : `${g.usedPct.toFixed(2)}%`}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
