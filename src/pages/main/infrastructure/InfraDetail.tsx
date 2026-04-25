import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Button } from '../../../components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '../../../components/ui/sheet';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Cpu, HardDrive, Info, MemoryStick, Network, Server, Thermometer, ArrowLeft, ShieldCheck, AlertTriangle, Activity, Layers3, Microchip, ScanSearch, Binary, Waves } from 'lucide-react';
import { apiUrl } from '../../../lib/api';

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="relative w-48 h-28 mb-6 select-none pointer-events-none">
        <div className="absolute bottom-0 left-4 right-4 h-16 bg-zinc-100 rounded-xl shadow-sm rotate-[-4deg]" />
        <div className="absolute bottom-2 left-2 right-2 h-16 bg-zinc-50 rounded-xl shadow border border-zinc-100 rotate-[2deg]" />
        <div className="absolute bottom-4 left-0 right-0 h-16 bg-white rounded-xl shadow border border-zinc-100 flex items-center gap-3 px-4">
          <div className="w-10 h-8 rounded bg-zinc-100 shrink-0" />
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="h-2.5 bg-zinc-200 rounded-full w-3/4" />
            <div className="h-2 bg-zinc-100 rounded-full w-1/2" />
            <div className="h-2 bg-zinc-100 rounded-full w-2/3" />
          </div>
        </div>
      </div>
      <h3 className="text-sm font-semibold text-zinc-700 mb-1">{title}</h3>
      <p className="text-xs text-zinc-400 text-center max-w-xs">{message}</p>
    </div>
  );
}

interface TrendPoint {
  time: string;
  value: number;
}

interface DiskMount {
  mountpoint: string;
  filesystem: string;
  usedPct: number;
  usedBytes: number;
  availBytes: number;
  sizeBytes: number;
  readBytes?: number;
  writeBytes?: number;
  healthStatus?: string | null;
  smartSummary?: string | null;
}

interface InodeMount {
  mountpoint: string;
  filesystem: string;
  usedPct: number;
  used: number | null;
  free: number | null;
  inodes: number | null;
}

interface NetworkInterface {
  name: string;
  addresses: Array<{ family: string; address: string; internal: boolean }>;
  macAddress?: string | null;
  mtu?: number | null;
  bytesSent?: number;
  bytesRecv?: number;
  packetsSent?: number;
  packetsRecv?: number;
  errorsIn?: number;
  errorsOut?: number;
  dropIn?: number;
  dropOut?: number;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string | null;
  state: string | null;
  status: string | null;
  cpuPercent: number | null;
  memoryPercent: number | null;
  netRxBytes: number;
  netTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  pids: number | null;
}

interface ServerDetail {
  agentId: string;
  host: {
    hostname: string;
    platform: string;
    os: string;
    osVersion: string;
    uptimeSeconds: number;
    collectedAt: string;
    status: string;
    agentName?: string | null;
    serialNumber?: string | null;
    kernelVersion?: string | null;
    architecture?: string | null;
    virtualizationType?: string | null;
    machineType?: string | null;
    firstSeenAt?: string | null;
    lastSeenAt?: string | null;
  };
  performance: {
    cpuUsagePct: number;
    memoryUsagePct: number;
    networkUsagePct: number;
    diskUsagePct: number;
    latencyMs?: number | null;
    throughputMbps?: number | null;
    bandwidthMbps?: number | null;
    iops?: number | null;
    diskReadThroughputMBps?: number | null;
    diskWriteThroughputMBps?: number | null;
  };
  cpu: {
    load: number[];
    cores: number;
    physicalCores: number;
    logicalCores: number;
    usagePct: number;
    frequencyMHz: number | null;
    temperatureC: number | null;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usedPct: number;
    swapTotal: number;
    swapUsed: number;
    swapFree: number;
    swapUsedPct: number;
  };
  cpuTrend: TrendPoint[];
  memoryTrend: TrendPoint[];
  networkTrend: TrendPoint[];
  diskMounts: DiskMount[];
  inodeMounts: InodeMount[];
  networkInterfaces: NetworkInterface[];
  issues?: Array<{
    ticket_id: string;
    metric_type: string;
    resource_key: string;
    severity: 'P1' | 'P2' | 'P3';
    current_value: number | null;
    threshold_value: number | null;
    description: string;
  }>;
  health?: {
    serverHealthy: boolean;
    score: number | null;
    scoreStatus: 'Info' | 'Warning' | 'Critical' | null;
    majorIssueReasons: string[];
    scoringComponents?: Record<string, { weight: number; status: string; metrics: Record<string, any> }>;
    cpuUsagePct: number | null;
    memoryUsagePct: number | null;
    cpuTemperatureC: number | null;
    networkLatencyMs: number | null;
    networkDownloadMbps: number | null;
    networkRxMbps: number | null;
    networkTxMbps: number | null;
    failedServicesCount: number;
    hungProcessCount: number;
    checkedAt: string;
  } | null;
  healthTrend?: Array<{
    time: string;
    latencyMs: number | null;
    downloadMbps: number | null;
    rxMbps: number | null;
    txMbps: number | null;
  }>;
  performanceTrend?: Array<{
    time: string;
    latencyMs: number | null;
    throughputMbps: number | null;
    bandwidthMbps: number | null;
    iops: number | null;
    diskUsagePct: number | null;
  }>;
  docker?: {
    enabled: boolean;
    total: number;
    running: number;
    error: string | null;
    statusText: string;
    containers: DockerContainer[];
  } | null;
}

interface InfraDetailProps {
  agentId: string | null;
  onBack?: () => void;
}

function formatBytes(value: number): string {
  if (!value || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / Math.pow(1024, i);
  return `${size.toFixed(size >= 100 ? 0 : 1)}${units[i]}`;
}

function formatUptime(seconds: number): string {
  if (!seconds || seconds < 0) return '0m';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatMetric(value: number | null | undefined, unit: string, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return 'Not Available';
  return `${value.toFixed(digits)} ${unit}`;
}

function hasChartData(data: Array<Record<string, any>> | undefined, key = 'value') {
  return Array.isArray(data) && data.some((point) => typeof point?.[key] === 'number' && Number.isFinite(point[key]));
}

function ChartPlaceholder({ message = 'Data Not Available', compact = false }: { message?: string; compact?: boolean }) {
  return (
    <div className={`flex items-center justify-center rounded-md border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/20 text-zinc-400 ${compact ? 'h-[84px]' : 'h-[220px]'}`}>
      <span className="text-sm">{message}</span>
    </div>
  );
}

function MetricChartCard({
  title,
  value,
  data,
  color,
  dataKey = 'value',
}: {
  title: string;
  value: string;
  data: Array<Record<string, any>>;
  color: string;
  dataKey?: string;
}) {
  return (
    <Card className="min-w-0 border-zinc-200 dark:border-zinc-800">
      <CardContent className="pt-5 min-w-0">
        <p className="text-xs uppercase tracking-wider text-zinc-500">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        <div className="mt-3 h-[84px] w-full min-w-0">
          {hasChartData(data, dataKey) ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={80}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id={`mini-${title.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.15} />
                <XAxis dataKey="time" hide />
                <YAxis hide />
                <Tooltip />
                <Area type="monotone" dataKey={dataKey} stroke={color} fillOpacity={1} fill={`url(#mini-${title.replace(/\s+/g, '-')})`} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ChartPlaceholder compact />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function statusClass(status: string) {
  if (status === 'Online' || status === 'Up' || status === 'Healthy') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Delayed' || status === 'Warning') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

function scoreStatusClass(status: 'Info' | 'Warning' | 'Critical' | null) {
  if (status === 'Info') return 'bg-sky-50 text-sky-700 border-sky-200';
  if (status === 'Warning') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Critical') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-zinc-50 text-zinc-700 border-zinc-200';
}

function componentStatusClass(status: string) {
  if (status === 'Healthy') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Warning') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Critical') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-zinc-50 text-zinc-700 border-zinc-200';
}

function labelizeComponent(name: string) {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (m) => m.toUpperCase())
    .trim();
}

function summarizeMetrics(metrics: Record<string, any> | undefined) {
  if (!metrics || typeof metrics !== 'object') return 'No metrics';
  const parts = Object.entries(metrics)
    .filter(([, value]) => typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean')
    .slice(0, 3)
    .map(([key, value]) => `${key}=${String(value)}`);
  if (!parts.length) return 'Detailed metrics available';
  return parts.join(' | ');
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value.replace('%', '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = toSafeNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTrend(points: any): TrendPoint[] {
  return Array.isArray(points)
    ? points.map((point: any) => ({
        time: String(point?.time || ''),
        value: toSafeNumber(point?.value, 0),
      }))
    : [];
}

function normalizeDetailResponse(raw: any): ServerDetail {
  const host = raw?.host || raw || {};
  const performance = raw?.performance || {};
  const cpu = raw?.cpu || {};
  const memory = raw?.memory || {};
  const issues = Array.isArray(raw?.issues) ? raw.issues : [];
  const diskMounts = Array.isArray(raw?.diskMounts) ? raw.diskMounts : [];
  const inodeMounts = Array.isArray(raw?.inodeMounts) ? raw.inodeMounts : [];
  const networkInterfaces = Array.isArray(raw?.networkInterfaces) ? raw.networkInterfaces : [];
  const health = raw?.health && typeof raw.health === 'object' ? raw.health : null;
  const heartbeat = host?.heartbeat ?? raw?.heartbeat ?? null;
  const heartbeatActive = String(heartbeat || '').toLowerCase() === 'active';
  const rawStatus = String(host?.status || raw?.status || 'Down');
  const normalizedStatus = heartbeatActive ? 'Online' : rawStatus === 'Up' ? 'Online' : rawStatus;

  return {
    agentId: String(raw?.agentId || raw?.agent_id || ''),
    host: {
      hostname: String(host?.hostname || raw?.hostname || 'Unknown host'),
      platform: String(host?.platform || raw?.platform || 'Unknown'),
      os: String(host?.os || raw?.os || host?.platform || 'Unknown'),
      osVersion: String(host?.osVersion || raw?.osVersion || raw?.platform_version || 'Unknown'),
      uptimeSeconds: toSafeNumber(host?.uptimeSeconds ?? raw?.uptimeSeconds, 0),
      collectedAt: String(host?.collectedAt || raw?.captured_at || new Date().toISOString()),
      status: normalizedStatus,
      agentName: host?.agentName ? String(host.agentName) : null,
      serialNumber: host?.serialNumber ? String(host.serialNumber) : null,
      kernelVersion: host?.kernelVersion ? String(host.kernelVersion) : null,
      architecture: host?.architecture ? String(host.architecture) : null,
      virtualizationType: host?.virtualizationType ? String(host.virtualizationType) : null,
      machineType: host?.machineType ? String(host.machineType) : null,
      firstSeenAt: host?.firstSeenAt ? String(host.firstSeenAt) : null,
      lastSeenAt: host?.lastSeenAt ? String(host.lastSeenAt) : null,
    },
    performance: {
      cpuUsagePct: toSafeNumber(performance?.cpuUsagePct ?? performance?.cpu_usage_percent ?? raw?.cpuUsagePct, 0),
      memoryUsagePct: toSafeNumber(performance?.memoryUsagePct ?? performance?.memory_used_percent ?? raw?.memoryUsagePct, 0),
      networkUsagePct: toSafeNumber(performance?.networkUsagePct ?? performance?.network_usage_percent ?? raw?.networkUsagePct, 0),
      diskUsagePct: toSafeNumber(performance?.diskUsagePct ?? performance?.disk_used_percent ?? raw?.diskUsagePct, 0),
      latencyMs: toNullableNumber(performance?.latencyMs),
      throughputMbps: toNullableNumber(performance?.throughputMbps),
      bandwidthMbps: toNullableNumber(performance?.bandwidthMbps),
      iops: toNullableNumber(performance?.iops),
      diskReadThroughputMBps: toNullableNumber(performance?.diskReadThroughputMBps),
      diskWriteThroughputMBps: toNullableNumber(performance?.diskWriteThroughputMBps),
    },
    cpu: {
      load: Array.isArray(cpu?.load) ? cpu.load.map((value: any) => toSafeNumber(value, 0)) : [],
      cores: toSafeNumber(cpu?.cores ?? cpu?.logicalCores, 0),
      physicalCores: toSafeNumber(cpu?.physicalCores ?? cpu?.cores, 0),
      logicalCores: toSafeNumber(cpu?.logicalCores ?? cpu?.cores, 0),
      usagePct: toSafeNumber(cpu?.usagePct ?? cpu?.usagePercent, 0),
      frequencyMHz: toNullableNumber(cpu?.frequencyMHz),
      temperatureC: toNullableNumber(cpu?.temperatureC),
    },
    memory: {
      total: toSafeNumber(memory?.total ?? memory?.totalBytes, 0),
      used: toSafeNumber(memory?.used ?? memory?.usedBytes, 0),
      free: toSafeNumber(memory?.free ?? memory?.availableBytes, 0),
      usedPct: toSafeNumber(memory?.usedPct ?? memory?.usedPercent, 0),
      swapTotal: toSafeNumber(memory?.swapTotal ?? memory?.swapTotalBytes, 0),
      swapUsed: toSafeNumber(memory?.swapUsed ?? memory?.swapUsedBytes, 0),
      swapFree: toSafeNumber(memory?.swapFree, 0),
      swapUsedPct: toSafeNumber(memory?.swapUsedPct ?? memory?.swapUsedPercent, 0),
    },
    cpuTrend: normalizeTrend(raw?.cpuTrend),
    memoryTrend: normalizeTrend(raw?.memoryTrend),
    networkTrend: normalizeTrend(raw?.networkTrend),
    diskMounts: diskMounts.map((item: any) => ({
      mountpoint: String(item?.mountpoint || 'unknown'),
      filesystem: String(item?.filesystem || item?.fs_type || 'unknown'),
      usedPct: toSafeNumber(item?.usedPct ?? item?.used_percent ?? item?.usedPercent, 0),
      usedBytes: toSafeNumber(item?.usedBytes ?? item?.used_bytes, 0),
      availBytes: toSafeNumber(item?.availBytes ?? item?.avail_bytes ?? item?.free_bytes, 0),
      sizeBytes: toSafeNumber(item?.sizeBytes ?? item?.size_bytes ?? item?.total_bytes, 0),
      readBytes: toSafeNumber(item?.readBytes ?? item?.read_bytes, 0),
      writeBytes: toSafeNumber(item?.writeBytes ?? item?.write_bytes, 0),
      healthStatus: item?.healthStatus ? String(item.healthStatus) : (item?.health_status ? String(item.health_status) : null),
      smartSummary: item?.smartSummary ? String(item.smartSummary) : (item?.smart_summary ? String(item.smart_summary) : null),
    })),
    inodeMounts: inodeMounts.map((item: any) => ({
      mountpoint: String(item?.mountpoint || 'unknown'),
      filesystem: String(item?.filesystem || item?.fs_type || 'unknown'),
      usedPct: toSafeNumber(item?.usedPct ?? item?.used_percent ?? item?.inode_used_percent, 0),
      used: toNullableNumber(item?.used),
      free: toNullableNumber(item?.free),
      inodes: toNullableNumber(item?.inodes),
    })),
    networkInterfaces: networkInterfaces.map((item: any) => ({
      name: String(item?.name || item?.interface_name || 'unknown'),
      macAddress: item?.macAddress ? String(item.macAddress) : (item?.mac_address ? String(item.mac_address) : null),
      mtu: toNullableNumber(item?.mtu),
      bytesSent: toSafeNumber(item?.bytesSent ?? item?.bytes_sent, 0),
      bytesRecv: toSafeNumber(item?.bytesRecv ?? item?.bytes_recv, 0),
      packetsSent: toSafeNumber(item?.packetsSent ?? item?.packets_sent, 0),
      packetsRecv: toSafeNumber(item?.packetsRecv ?? item?.packets_recv, 0),
      errorsIn: toSafeNumber(item?.errorsIn ?? item?.errors_in, 0),
      errorsOut: toSafeNumber(item?.errorsOut ?? item?.errors_out, 0),
      dropIn: toSafeNumber(item?.dropIn ?? item?.drop_in, 0),
      dropOut: toSafeNumber(item?.dropOut ?? item?.drop_out, 0),
      addresses: Array.isArray(item?.addresses)
        ? item.addresses.map((address: any) => ({
            family: String(address?.family || (String(address?.address || address).includes(':') ? 'IPv6' : 'IPv4')),
            address: String(address?.address || address || ''),
            internal: Boolean(address?.internal),
          }))
        : [],
    })),
    issues: (() => {
      const seen = new Set<string>();
      return issues
        .map((issue: any, index: number) => {
          const severityRaw = String(issue?.severity || '').toUpperCase();
          const severity = severityRaw === 'CRITICAL' ? 'P1' : severityRaw === 'WARNING' ? 'P2' : (severityRaw === 'P1' || severityRaw === 'P2' || severityRaw === 'P3' ? severityRaw : 'P3');
          return {
            ticket_id: String(issue?.ticket_id || issue?.ticketId || `HE-${index + 1}`),
            metric_type: String(issue?.metric_type || issue?.metricType || issue?.check_name || 'health'),
            resource_key: String(issue?.resource_key || issue?.resourceKey || 'system'),
            severity: severity as 'P1' | 'P2' | 'P3',
            current_value: toNullableNumber(issue?.current_value ?? issue?.currentValue),
            threshold_value: toNullableNumber(issue?.threshold_value ?? issue?.thresholdValue),
            description: String(issue?.description || issue?.message || ''),
          };
        })
        .filter((issue: { severity: string; metric_type: string; resource_key: string; description: string }) => {
          const key = `${issue.severity}|${issue.metric_type}|${issue.resource_key}|${issue.description}`.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    })(),
    health: health
      ? {
          serverHealthy: Boolean(health?.serverHealthy),
          score: toNullableNumber(health?.score),
          scoreStatus: health?.scoreStatus === 'Info' || health?.scoreStatus === 'Warning' || health?.scoreStatus === 'Critical' ? health.scoreStatus : null,
          majorIssueReasons: Array.isArray(health?.majorIssueReasons) ? health.majorIssueReasons.map(String) : [],
          scoringComponents: health?.scoringComponents && typeof health.scoringComponents === 'object' ? health.scoringComponents : {},
          cpuUsagePct: toNullableNumber(health?.cpuUsagePct),
          memoryUsagePct: toNullableNumber(health?.memoryUsagePct),
          cpuTemperatureC: toNullableNumber(health?.cpuTemperatureC),
          networkLatencyMs: toNullableNumber(health?.networkLatencyMs),
          networkDownloadMbps: toNullableNumber(health?.networkDownloadMbps),
          networkRxMbps: toNullableNumber(health?.networkRxMbps),
          networkTxMbps: toNullableNumber(health?.networkTxMbps),
          failedServicesCount: toSafeNumber(health?.failedServicesCount, 0),
          hungProcessCount: toSafeNumber(health?.hungProcessCount, 0),
          checkedAt: String(health?.checkedAt || ''),
        }
      : null,
    healthTrend: Array.isArray(raw?.healthTrend)
      ? raw.healthTrend.map((point: any) => ({
          time: String(point?.time || ''),
          latencyMs: toNullableNumber(point?.latencyMs),
          downloadMbps: toNullableNumber(point?.downloadMbps),
          rxMbps: toNullableNumber(point?.rxMbps),
          txMbps: toNullableNumber(point?.txMbps),
        }))
      : [],
    performanceTrend: Array.isArray(raw?.performanceTrend)
      ? raw.performanceTrend.map((point: any) => ({
          time: String(point?.time || ''),
          latencyMs: toNullableNumber(point?.latencyMs),
          throughputMbps: toNullableNumber(point?.throughputMbps),
          bandwidthMbps: toNullableNumber(point?.bandwidthMbps),
          iops: toNullableNumber(point?.iops),
          diskUsagePct: toNullableNumber(point?.diskUsagePct),
        }))
      : [],
    docker: raw?.docker && typeof raw.docker === 'object'
      ? {
          enabled: Boolean(raw.docker.enabled),
          total: toSafeNumber(raw.docker.total, 0),
          running: toSafeNumber(raw.docker.running, 0),
          error: raw.docker.error ? String(raw.docker.error) : null,
          statusText: String(raw.docker.statusText || raw.docker.error || 'Docker not running or Not Available'),
          containers: Array.isArray(raw.docker.containers)
            ? raw.docker.containers.map((container: any, index: number) => ({
                id: String(container?.id || container?.container_identifier || index),
                name: String(container?.name || container?.container_name || 'container'),
                image: container?.image ? String(container.image) : (container?.image_name ? String(container.image_name) : null),
                state: container?.state ? String(container.state) : (container?.state_name ? String(container.state_name) : null),
                status: container?.status ? String(container.status) : (container?.status_text ? String(container.status_text) : null),
                cpuPercent: toNullableNumber(container?.cpuPercent ?? container?.cpu_percent),
                memoryPercent: toNullableNumber(container?.memoryPercent ?? container?.memory_percent),
                netRxBytes: toSafeNumber(container?.netRxBytes ?? container?.net_rx_bytes, 0),
                netTxBytes: toSafeNumber(container?.netTxBytes ?? container?.net_tx_bytes, 0),
                blockReadBytes: toSafeNumber(container?.blockReadBytes ?? container?.block_read_bytes, 0),
                blockWriteBytes: toSafeNumber(container?.blockWriteBytes ?? container?.block_write_bytes, 0),
                pids: toNullableNumber(container?.pids),
              }))
            : [],
        }
      : null,
  };
}

export default function InfraDetail({ agentId, onBack }: InfraDetailProps) {
  const [detail, setDetail] = useState<ServerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [diskMount, setDiskMount] = useState('/');
  const [inodeMount, setInodeMount] = useState('/');

  // Syslog events for this host
  type SyslogEvent = {
    source: string;
    source_id: number;
    event_time: string;
    severity: string;
    message: string | null;
    source_ip: string;
    event_key: string;
    device_name: string;
  };
  const [syslogEvents, setSyslogEvents] = useState<SyslogEvent[]>([]);
  const [syslogLoading, setSyslogLoading] = useState(false);
  const [syslogHours, setSyslogHours] = useState(24);

  useEffect(() => {
    if (!agentId) {
      setDetail(null);
      return;
    }

    let ignore = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl(`/api/infra/servers/${encodeURIComponent(agentId)}?limit=72`));
        if (!res.ok) throw new Error('details unavailable');
        const data = normalizeDetailResponse(await res.json());
        if (!ignore) {
          setDetail(data);
          setDiskMount((prev) => data.diskMounts.some((d) => d.mountpoint === prev) ? prev : (data.diskMounts[0]?.mountpoint || '/'));
          setInodeMount((prev) => data.inodeMounts.some((d) => d.mountpoint === prev) ? prev : (data.inodeMounts[0]?.mountpoint || '/'));
        }
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
  }, [agentId]);

  // Load syslog events for this host
  useEffect(() => {
    if (!detail?.host?.hostname) return;
    let ignore = false;
    const loadSyslogs = async () => {
      setSyslogLoading(true);
      try {
        const hostname = encodeURIComponent(detail.host.hostname);
        const res = await fetch(apiUrl(`/api/snmp/events?source=syslog&hours=${syslogHours}&limit=50&q=${hostname}`));
        const json = await res.json();
        if (!ignore) setSyslogEvents(Array.isArray(json?.events) ? json.events : []);
      } catch {
        if (!ignore) setSyslogEvents([]);
      } finally {
        if (!ignore) setSyslogLoading(false);
      }
    };
    loadSyslogs();
    return () => { ignore = true; };
  }, [detail?.host?.hostname, syslogHours]);

  const selectedDisk = useMemo(
    () => detail?.diskMounts.find((d) => d.mountpoint === diskMount) || detail?.diskMounts[0] || null,
    [detail, diskMount]
  );

  const selectedInode = useMemo(
    () => detail?.inodeMounts.find((d) => d.mountpoint === inodeMount) || detail?.inodeMounts[0] || null,
    [detail, inodeMount]
  );

  const networkRows = useMemo(
    () => (detail?.networkInterfaces || []).flatMap((ni) =>
      (ni.addresses || []).map((a, idx) => ({
        key: `${ni.name}-${idx}`,
        name: ni.name,
        family: a.family,
        address: a.address,
        scope: a.internal ? 'Internal' : 'External',
      }))
    ),
    [detail]
  );

  const performanceSeries = useMemo(() => {
    const rows = detail?.performanceTrend || [];
    return {
      latency: rows.map((point) => ({ time: point.time, value: point.latencyMs })),
      throughput: rows.map((point) => ({ time: point.time, value: point.throughputMbps })),
      bandwidth: rows.map((point) => ({ time: point.time, value: point.bandwidthMbps })),
      iops: rows.map((point) => ({ time: point.time, value: point.iops })),
      disk: rows.map((point) => ({ time: point.time, value: point.diskUsagePct })),
    };
  }, [detail]);

  if (!agentId) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="p-0">
          <div className="border-2 border-dashed border-zinc-100 rounded-lg m-4">
            <EmptyState
              title="No server selected"
              message="Select a server from the Infrastructure list to view its full details and metrics."
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading && !detail) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="py-14 text-center text-sm text-zinc-500">Loading server details...</CardContent>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="p-0">
          <div className="border-2 border-dashed border-zinc-100 rounded-lg m-4">
            <EmptyState
              title="Server details unavailable"
              message="Could not load data for this server. It may be offline or the agent may not be reporting."
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950/70  p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back to servers
              </button>
            )}
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{detail.host.hostname}</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Infrastructure detail view with live system, network, disk, and Docker telemetry.</p>
            </div>
          </div>
          <Badge variant="outline" className={`${statusClass(detail.host.status)} px-3 py-1 text-xs font-semibold`}>
            Status: {detail.host.status}
          </Badge>
        </div>
      </div>

      <Card className="border-zinc-200/80 dark:border-zinc-800 shadow-sm bg-white/90 dark:bg-zinc-950/60">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Health Snapshot</CardTitle>
            <CardDescription>
              Latest health and operational posture for this server.
            </CardDescription>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Info className="w-3.5 h-3.5" /> Check info
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-2xl p-0">
              <SheetHeader className="border-b border-zinc-200 dark:border-zinc-800">
                <SheetTitle>Health Check Parameters And DB Signals</SheetTitle>
                <SheetDescription>
                  Component-wise checks and latest stored metrics for this server.
                </SheetDescription>
              </SheetHeader>
              <div className="p-4 space-y-3 overflow-y-auto h-[calc(100%-88px)]">
                {!detail.health?.scoringComponents || Object.keys(detail.health.scoringComponents).length === 0 ? (
                  <p className="text-sm text-zinc-500">No scoring component details available yet.</p>
                ) : (
                  <div className="overflow-x-auto border rounded-md border-zinc-200 dark:border-zinc-800">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Parameter</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Weight</TableHead>
                          <TableHead>Latest performance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(detail.health.scoringComponents).map(([name, comp]) => (
                          <TableRow key={name}>
                            <TableCell className="font-medium">{labelizeComponent(name)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={componentStatusClass(comp?.status || '')}>
                                {comp?.status || 'Unknown'}
                              </Badge>
                            </TableCell>
                            <TableCell>{comp?.weight ?? '-'}</TableCell>
                            <TableCell className="text-xs text-zinc-600 dark:text-zinc-300 max-w-[420px]">{summarizeMetrics(comp?.metrics)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </CardHeader>
        <CardContent>
          {!detail.health ? (
            <p className="text-sm text-zinc-500">No health-check data recorded yet.</p>
          ) : (
            <div className="space-y-5 text-sm">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-gradient-to-r from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-900 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Operational Health</p>
                    <div className="mt-1 flex items-center gap-2">
                      <ShieldCheck className={`w-4 h-4 ${detail.health.serverHealthy ? 'text-emerald-600' : 'text-rose-600'}`} />
                      <p className="text-xl font-bold">{detail.health.serverHealthy ? 'Healthy' : 'Unhealthy'}</p>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">Major incidents only: critical services down, hardware faults, failing SMART disks.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Overall Score</p>
                    <p className="text-2xl font-bold">{detail.health.score == null ? 'N/A' : detail.health.score.toFixed(2)}</p>
                    <div className="mt-1 flex justify-end">
                      <Badge variant="outline" className={scoreStatusClass(detail.health.scoreStatus)}>
                        {detail.health.scoreStatus || 'Unknown'}
                      </Badge>
                    </div>
                  </div>
                </div>
                {detail.health.score != null && (
                  <div className="mt-3">
                    <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-2 ${detail.health.score >= 90 ? 'bg-sky-500' : detail.health.score >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${Math.max(0, Math.min(100, detail.health.score))}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">Score bands: 90-100 Info, 70-89 Warning, below 70 Critical</p>
                  </div>
                )}
              </div>

              {!!detail.health.majorIssueReasons?.length && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                  <div className="flex items-center gap-2 text-rose-700 font-medium">
                    <AlertTriangle className="w-4 h-4" /> Major incident reasons
                  </div>
                  <ul className="mt-1 text-xs text-rose-700 list-disc list-inside space-y-0.5">
                    {detail.health.majorIssueReasons.map((reason, idx) => (
                      <li key={`${reason}-${idx}`}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
                  <p className="text-xs uppercase tracking-wider text-zinc-500 flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> Network Signals</p>
                  <div className="mt-2 space-y-1.5">
                    <p><span className="text-zinc-500">Latency:</span> <span className="font-semibold">{detail.health.networkLatencyMs == null ? 'N/A' : `${detail.health.networkLatencyMs.toFixed(2)} ms`}</span></p>
                    <p><span className="text-zinc-500">Download:</span> <span className="font-semibold">{detail.health.networkDownloadMbps == null ? 'N/A' : `${detail.health.networkDownloadMbps.toFixed(2)} Mbps`}</span></p>
                    <p><span className="text-zinc-500">RX/TX:</span> <span className="font-semibold">{detail.health.networkRxMbps == null ? 'N/A' : `${detail.health.networkRxMbps.toFixed(2)}`} / {detail.health.networkTxMbps == null ? 'N/A' : `${detail.health.networkTxMbps.toFixed(2)}`} Mbps</span></p>
                  </div>
                </div>

                <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Resource Signals</p>
                  <div className="mt-2 space-y-1.5">
                    <p><span className="text-zinc-500">CPU:</span> <span className="font-semibold">{detail.health.cpuUsagePct == null ? 'N/A' : `${detail.health.cpuUsagePct.toFixed(1)}%`}</span></p>
                    <p><span className="text-zinc-500">Memory:</span> <span className="font-semibold">{detail.health.memoryUsagePct == null ? 'N/A' : `${detail.health.memoryUsagePct.toFixed(1)}%`}</span></p>
                    <p><span className="text-zinc-500">CPU Temp:</span> <span className="font-semibold">{detail.health.cpuTemperatureC == null ? 'N/A' : `${detail.health.cpuTemperatureC.toFixed(1)} C`}</span></p>
                  </div>
                </div>

                <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Service Reliability</p>
                  <div className="mt-2 space-y-1.5">
                    <p><span className="text-zinc-500">Failed services:</span> <span className="font-semibold">{detail.health.failedServicesCount}</span></p>
                    <p><span className="text-zinc-500">Hung jobs:</span> <span className="font-semibold">{detail.health.hungProcessCount}</span></p>
                    <p><span className="text-zinc-500">Checked at:</span> <span className="font-semibold">{detail.health.checkedAt ? new Date(detail.health.checkedAt).toLocaleString('en-GB') : 'N/A'}</span></p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-200/80 dark:border-zinc-800 shadow-sm bg-white/90 dark:bg-zinc-950/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">System Configuration</CardTitle>
          <CardDescription>Compact host, OS, and hardware details from the latest snapshot.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
          {[
            { label: 'Hostname', value: detail.host.hostname || 'N/A', icon: Server },
            { label: 'Agent Name', value: detail.host.agentName || 'N/A', icon: Info },
            { label: 'OS', value: detail.host.os || 'N/A', icon: Info },
            { label: 'OS Build', value: detail.host.osVersion || 'N/A', icon: Binary },
            { label: 'Platform', value: detail.host.platform || 'N/A', icon: Layers3 },
            { label: 'Uptime', value: formatUptime(detail.host.uptimeSeconds), icon: Activity },
            { label: 'Last Seen', value: detail.host.lastSeenAt ? new Date(detail.host.lastSeenAt).toLocaleString('en-GB') : 'N/A', icon: ScanSearch },
            { label: 'Updated', value: detail.host.collectedAt ? new Date(detail.host.collectedAt).toLocaleString('en-GB') : 'N/A', icon: ScanSearch },
            { label: 'Physical CPU', value: `${detail.cpu.physicalCores || 'N/A'} cores`, icon: Cpu },
            { label: 'Logical CPU', value: `${detail.cpu.logicalCores || detail.cpu.cores || 'N/A'} cores`, icon: Microchip },
            { label: 'CPU Frequency', value: detail.cpu.frequencyMHz ? `${(detail.cpu.frequencyMHz / 1000).toFixed(2)} GHz` : 'N/A', icon: Activity },
            { label: 'RAM', value: formatBytes(detail.memory.total), icon: MemoryStick },
            { label: 'Swap', value: formatBytes(detail.memory.swapTotal), icon: Layers3 },
            { label: 'Serial Number', value: detail.host.serialNumber || 'Not Available', icon: ScanSearch },
            { label: 'Architecture', value: detail.host.architecture || 'N/A', icon: Binary },
            { label: 'Kernel', value: detail.host.kernelVersion || 'N/A', icon: Cpu },
            { label: 'Virtualization', value: detail.host.virtualizationType || 'N/A', icon: Layers3 },
            { label: 'Machine Type', value: detail.host.machineType || 'N/A', icon: Server },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 p-2.5">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-zinc-500">
                  <Icon className="w-3.5 h-3.5" />
                  <p>{item.label}</p>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100 break-words">{item.value}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-xs uppercase tracking-wider text-zinc-500">Resource utilization</p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricChartCard title="CPU Utilization" value={`${detail.performance.cpuUsagePct.toFixed(1)}%`} data={detail.cpuTrend} color="#8b5cf6" />
        <MetricChartCard title="Memory Utilization" value={`${detail.performance.memoryUsagePct.toFixed(1)}%`} data={detail.memoryTrend} color="#22c55e" />
        <MetricChartCard title="Network Utilization" value={`${detail.performance.networkUsagePct.toFixed(1)}%`} data={detail.networkTrend} color="#0ea5e9" />
        <MetricChartCard title="Disk Utilization" value={`${detail.performance.diskUsagePct.toFixed(1)}%`} data={performanceSeries.disk} color="#f59e0b" />
      </div>

      <p className="text-xs uppercase tracking-wider text-zinc-500">Performance signals</p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricChartCard title="Latency" value={formatMetric(detail.performance.latencyMs, 'ms')} data={performanceSeries.latency} color="#f59e0b" />
        <MetricChartCard title="Throughput" value={formatMetric(detail.performance.throughputMbps, 'Mbps')} data={performanceSeries.throughput} color="#10b981" />
        <MetricChartCard title="Bandwidth" value={formatMetric(detail.performance.bandwidthMbps, 'Mbps')} data={performanceSeries.bandwidth} color="#0ea5e9" />
        <MetricChartCard title="IOPS" value={detail.performance.iops == null ? 'Not Available' : `${detail.performance.iops.toFixed(2)}`} data={performanceSeries.iops} color="#ef4444" />
      </div>

      <p className="text-xs uppercase tracking-wider text-zinc-500">CPU and memory metrics</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0 border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Cpu className="w-4 h-4" /> CPU Metrics</CardTitle>
            <CardDescription>
              Physical: {detail.cpu.physicalCores || 'N/A'} · Virtual: {detail.cpu.logicalCores || detail.cpu.cores} · Frequency: {detail.cpu.frequencyMHz ? `${(detail.cpu.frequencyMHz / 1000).toFixed(2)} GHz` : 'N/A'}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[220px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              <AreaChart data={detail.cpuTrend}>
                <defs>
                  <linearGradient id="infraCpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} fontSize={12} />
                <YAxis axisLine={false} tickLine={false} fontSize={12} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#8b5cf6" fillOpacity={1} fill="url(#infraCpuGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><MemoryStick className="w-4 h-4" /> Memory Metrics</CardTitle>
            <CardDescription>
              Physical: {formatBytes(detail.memory.total)} · Used: {formatBytes(detail.memory.used)} · SWAP: {formatBytes(detail.memory.swapUsed)} / {formatBytes(detail.memory.swapTotal)}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[220px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              <AreaChart data={detail.memoryTrend}>
                <defs>
                  <linearGradient id="infraMemGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} fontSize={12} />
                <YAxis axisLine={false} tickLine={false} fontSize={12} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#22c55e" fillOpacity={1} fill="url(#infraMemGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs uppercase tracking-wider text-zinc-500">Network performance</p>

      <div className="grid gap-6 lg:grid-cols-2 min-w-0">
        <Card className="min-w-0 border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Network Throughput Trend</CardTitle>
            <CardDescription>RX/TX and external download speed in Mbps</CardDescription>
          </CardHeader>
          <CardContent className="h-[220px] min-w-0">
            {hasChartData(detail.healthTrend as Array<Record<string, any>>, 'rxMbps') || hasChartData(detail.healthTrend as Array<Record<string, any>>, 'txMbps') ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                <AreaChart data={detail.healthTrend}>
                  <defs>
                    <linearGradient id="healthRxGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="healthTxGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} fontSize={12} />
                  <YAxis axisLine={false} tickLine={false} fontSize={12} unit="Mbps" />
                  <Tooltip />
                  <Area type="monotone" dataKey="rxMbps" stroke="#10b981" fillOpacity={1} fill="url(#healthRxGrad)" />
                  <Area type="monotone" dataKey="txMbps" stroke="#0ea5e9" fillOpacity={1} fill="url(#healthTxGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ChartPlaceholder />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Network Latency Trend</CardTitle>
            <CardDescription>Ping latency over recent health checks</CardDescription>
          </CardHeader>
          <CardContent className="h-[220px] min-w-0">
            {hasChartData(detail.healthTrend as Array<Record<string, any>>, 'latencyMs') ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                <AreaChart data={detail.healthTrend}>
                  <defs>
                    <linearGradient id="healthLatencyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} fontSize={12} />
                  <YAxis axisLine={false} tickLine={false} fontSize={12} unit="ms" />
                  <Tooltip />
                  <Area type="monotone" dataKey="latencyMs" stroke="#f59e0b" fillOpacity={1} fill="url(#healthLatencyGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ChartPlaceholder />
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs uppercase tracking-wider text-zinc-500">Thermal status</p>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Thermometer className="w-4 h-4" /> CPU Temperature</CardTitle>
          <CardDescription>
            {detail.cpu.temperatureC == null ? 'Temperature sensor not available on this host.' : `${detail.cpu.temperatureC.toFixed(1)} C`}
          </CardDescription>
        </CardHeader>
      </Card>

      <p className="text-xs uppercase tracking-wider text-zinc-500">Disk monitoring</p>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2"><HardDrive className="w-4 h-4" /> Disk Monitoring</CardTitle>
            <CardDescription>Mountpoint usage from latest snapshot</CardDescription>
          </div>
          <div className="w-[220px]">
            <Select value={diskMount} onValueChange={setDiskMount}>
              <SelectTrigger><SelectValue placeholder="Select mountpoint" /></SelectTrigger>
              <SelectContent>
                {detail.diskMounts.map((m) => (
                  <SelectItem key={m.mountpoint} value={m.mountpoint}>{m.mountpoint}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {selectedDisk ? (
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
              <div><p className="text-zinc-500">Used</p><p className="text-2xl font-bold">{Math.round(selectedDisk.usedPct)}%</p></div>
              <div><p className="text-zinc-500">Remaining</p><p className="text-2xl font-bold">{formatBytes(selectedDisk.availBytes)}</p></div>
              <div><p className="text-zinc-500">Filesystem</p><p className="text-base font-medium break-all">{selectedDisk.filesystem}</p></div>
              <div><p className="text-zinc-500">Health</p><p className="text-base font-medium">{selectedDisk.healthStatus || 'N/A'}</p></div>
              <div><p className="text-zinc-500">Read Bytes</p><p className="text-base font-medium">{formatBytes(selectedDisk.readBytes || 0)}</p></div>
              <div><p className="text-zinc-500">Write Bytes</p><p className="text-base font-medium">{formatBytes(selectedDisk.writeBytes || 0)}</p></div>
              <div className="md:col-span-2"><p className="text-zinc-500">SMART Summary</p><p className="text-sm font-medium">{selectedDisk.smartSummary || 'Not Available'}</p></div>
            </div>
          ) : <p className="text-sm text-zinc-500">No disk data available.</p>}
        </CardContent>
      </Card>

      <p className="text-xs uppercase tracking-wider text-zinc-500">Inode monitoring</p>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-lg">Inode Monitoring</CardTitle>
            <CardDescription>Inode consumption by mountpoint</CardDescription>
          </div>
          <div className="w-[220px]">
            <Select value={inodeMount} onValueChange={setInodeMount}>
              <SelectTrigger><SelectValue placeholder="Select mountpoint" /></SelectTrigger>
              <SelectContent>
                {detail.inodeMounts.map((m) => (
                  <SelectItem key={m.mountpoint} value={m.mountpoint}>{m.mountpoint}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {selectedInode ? (
            <div className="grid md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-zinc-500">Used %</p><p className="text-xl font-bold">{Math.round(selectedInode.usedPct)}%</p></div>
              <div><p className="text-zinc-500">Used</p><p className="text-xl font-bold">{selectedInode.used == null ? 'N/A' : selectedInode.used.toLocaleString()}</p></div>
              <div><p className="text-zinc-500">Free</p><p className="text-xl font-bold">{selectedInode.free == null ? 'N/A' : selectedInode.free.toLocaleString()}</p></div>
              <div><p className="text-zinc-500">Total Inodes</p><p className="text-xl font-bold">{selectedInode.inodes?.toLocaleString() || 'N/A'}</p></div>
            </div>
          ) : <p className="text-sm text-zinc-500">No inode data available.</p>}
        </CardContent>
      </Card>

      <p className="text-xs uppercase tracking-wider text-zinc-500">Network interfaces</p>

      <Card className="min-w-0 border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Network className="w-4 h-4" /> Network Monitoring</CardTitle>
          <CardDescription>Interface activity trend and latest addresses</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              <AreaChart data={detail.networkTrend}>
                <defs>
                  <linearGradient id="infraNetGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} fontSize={12} />
                <YAxis axisLine={false} tickLine={false} fontSize={12} />
                <Tooltip />
                <Area type="step" dataKey="value" stroke="#0ea5e9" fillOpacity={1} fill="url(#infraNetGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto border rounded-md border-zinc-200 dark:border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Interface</TableHead>
                  <TableHead>Family</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>RX</TableHead>
                  <TableHead>TX</TableHead>
                  <TableHead>Packets</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!networkRows.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-sm text-zinc-500 py-6 text-center">
                      No network interface addresses reported in the latest snapshot.
                    </TableCell>
                  </TableRow>
                ) : (
                  networkRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.family}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[420px] truncate">{row.address}</TableCell>
                      <TableCell>{row.scope}</TableCell>
                      <TableCell>{formatBytes(detail.networkInterfaces.find((ni) => ni.name === row.name)?.bytesRecv || 0)}</TableCell>
                      <TableCell>{formatBytes(detail.networkInterfaces.find((ni) => ni.name === row.name)?.bytesSent || 0)}</TableCell>
                      <TableCell>{((detail.networkInterfaces.find((ni) => ni.name === row.name)?.packetsRecv || 0) + (detail.networkInterfaces.find((ni) => ni.name === row.name)?.packetsSent || 0)).toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs uppercase tracking-wider text-zinc-500">Docker monitoring</p>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Docker Monitoring</CardTitle>
          <CardDescription>Container runtime summary and latest per-container stats.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Docker Status</p><p className="font-semibold mt-1">{detail.docker?.statusText || 'Docker not running or Not Available'}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Containers</p><p className="font-semibold mt-1">{detail.docker?.total ?? 0}</p></div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"><p className="text-zinc-500">Running</p><p className="font-semibold mt-1">{detail.docker?.running ?? 0}</p></div>
          </div>

          {!detail.docker?.containers?.length ? (
            <p className="text-sm text-zinc-500">{detail.docker?.error || 'Docker not running or Not Available'}</p>
          ) : (
            <div className="overflow-x-auto border rounded-md border-zinc-200 dark:border-zinc-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>CPU</TableHead>
                    <TableHead>Memory</TableHead>
                    <TableHead>Network</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.docker.containers.map((container) => (
                    <TableRow key={container.id}>
                      <TableCell className="font-medium">{container.name}</TableCell>
                      <TableCell>{container.image || 'N/A'}</TableCell>
                      <TableCell>{container.status || container.state || 'Unknown'}</TableCell>
                      <TableCell>{container.cpuPercent == null ? 'N/A' : `${container.cpuPercent.toFixed(1)}%`}</TableCell>
                      <TableCell>{container.memoryPercent == null ? 'N/A' : `${container.memoryPercent.toFixed(1)}%`}</TableCell>
                      <TableCell>{formatBytes(container.netRxBytes)} / {formatBytes(container.netTxBytes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs uppercase tracking-wider text-zinc-500">Active issues</p>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Status And Active Issues</CardTitle>
          <CardDescription>Auto-generated investigate tickets linked to this server.</CardDescription>
        </CardHeader>
        <CardContent>
          {!detail.issues?.length ? (
            <p className="text-sm text-zinc-500">No active investigate tickets for this server.</p>
          ) : (
            <div className="space-y-2">
              {detail.issues.map((issue) => (
                <div key={issue.ticket_id} className="flex flex-wrap items-center gap-2 text-sm border rounded-md border-zinc-200 dark:border-zinc-800 px-3 py-2">
                  <Badge variant="outline" className={statusClass(issue.severity === 'P1' ? 'Down' : issue.severity === 'P2' ? 'Delayed' : 'Up')}>
                    {issue.severity}
                  </Badge>
                  <span className="font-mono text-xs">{issue.ticket_id}</span>
                  <span className="text-zinc-600 dark:text-zinc-300">{issue.metric_type.toUpperCase()} ({issue.resource_key})</span>
                  {issue.current_value != null || issue.threshold_value != null ? (
                    <span className="text-zinc-500">{issue.current_value == null ? 'N/A' : `${Number(issue.current_value).toFixed(1)}%`} ({issue.threshold_value == null ? 'N/A' : `${issue.threshold_value}%`})</span>
                  ) : issue.description ? (
                    <span className="text-zinc-500">{issue.description}</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs uppercase tracking-wider text-zinc-500">Syslog events</p>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Waves className="w-4 h-4 text-sky-500" /> Syslog Events
            </CardTitle>
            <CardDescription>
              RFC 3164/5424 syslog messages received from this host in the last {syslogHours}h.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            {[6, 24, 48].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setSyslogHours(h)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  syslogHours === h
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {syslogLoading ? (
            <p className="text-sm text-zinc-500">Loading syslog events...</p>
          ) : syslogEvents.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No syslog events received from <span className="font-mono">{detail.host.hostname}</span> in the last {syslogHours}h.
              {' '}To enable, configure this host to forward syslog to <span className="font-mono">{'<server>:5514'}</span>.
            </p>
          ) : (
            <div className="overflow-x-auto border rounded-md border-zinc-200 dark:border-zinc-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>App / Process</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syslogEvents.map((ev) => {
                    const sevCls =
                      ev.severity === 'critical'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : ev.severity === 'warning'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-zinc-100 text-zinc-600 border-zinc-200';
                    return (
                      <TableRow key={`${ev.source}-${ev.source_id}`}>
                        <TableCell className="text-xs whitespace-nowrap text-zinc-500">
                          {new Date(ev.event_time).toLocaleString('en-GB')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={sevCls}>{ev.severity}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-zinc-600 dark:text-zinc-300">{ev.event_key || '—'}</TableCell>
                        <TableCell className="text-sm text-zinc-700 dark:text-zinc-200 max-w-lg truncate">{ev.message || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
