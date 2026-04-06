import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '../../components/ui/sheet';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Cpu, HardDrive, Info, MemoryStick, Network, Server, Thermometer, ArrowLeft, ShieldCheck, AlertTriangle, Activity } from 'lucide-react';

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
}

interface InodeMount {
  mountpoint: string;
  filesystem: string;
  usedPct: number;
  used: number;
  free: number;
  inodes: number | null;
}

interface NetworkInterface {
  name: string;
  addresses: Array<{ family: string; address: string; internal: boolean }>;
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
  };
  performance: {
    cpuUsagePct: number;
    memoryUsagePct: number;
    networkUsagePct: number;
    diskUsagePct: number;
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
    current_value: number;
    threshold_value: number;
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

function statusClass(status: string) {
  if (status === 'Up') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Delayed') return 'bg-amber-50 text-amber-700 border-amber-200';
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

export default function InfraDetail({ agentId, onBack }: InfraDetailProps) {
  const [detail, setDetail] = useState<ServerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [diskMount, setDiskMount] = useState('/');
  const [inodeMount, setInodeMount] = useState('/');

  useEffect(() => {
    if (!agentId) {
      setDetail(null);
      return;
    }

    let ignore = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`http://localhost:3001/api/infra/servers/${encodeURIComponent(agentId)}?limit=72`);
        if (!res.ok) throw new Error('details unavailable');
        const data: ServerDetail = await res.json();
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

  const selectedDisk = useMemo(
    () => detail?.diskMounts.find((d) => d.mountpoint === diskMount) || detail?.diskMounts[0] || null,
    [detail, diskMount]
  );

  const selectedInode = useMemo(
    () => detail?.inodeMounts.find((d) => d.mountpoint === inodeMount) || detail?.inodeMounts[0] || null,
    [detail, inodeMount]
  );

  if (!agentId) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="py-14 text-center text-sm text-zinc-500">Select a server from Infrastructure list.</CardContent>
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
        <CardContent className="py-14 text-center text-sm text-zinc-500">Server details unavailable.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to servers
          </Button>
        )}
        <Badge variant="outline" className={statusClass(detail.host.status)}>
          Status: {detail.host.status}
        </Badge>
      </div>

      <p className="text-xs uppercase tracking-wider text-zinc-500">1. Health Check Snapshot</p>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Health Check Snapshot</CardTitle>
            <CardDescription>
              Latest health-check execution for this host.
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
                <SheetTitle>Health Check Parameters</SheetTitle>
                <SheetDescription>
                  Component-wise checks and latest performance result for this server.
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
                    <p><span className="text-zinc-500">Checked at:</span> <span className="font-semibold">{new Date(detail.health.checkedAt).toLocaleString('en-GB')}</span></p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs uppercase tracking-wider text-zinc-500">2. System Details</p>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Info className="w-4 h-4" /> OS Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-zinc-500">OS:</span> {detail.host.os}</p>
            <p><span className="text-zinc-500">Version:</span> {detail.host.osVersion}</p>
            <p><span className="text-zinc-500">Platform:</span> {detail.host.platform}</p>
            <p><span className="text-zinc-500">Updated:</span> {new Date(detail.host.collectedAt).toLocaleString('en-GB')}</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Server className="w-4 h-4" /> Host Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-zinc-500">Hostname:</span> {detail.host.hostname}</p>
            <p><span className="text-zinc-500">Agent ID:</span> {detail.agentId}</p>
            <p><span className="text-zinc-500">Uptime:</span> {formatUptime(detail.host.uptimeSeconds)}</p>
            <p><span className="text-zinc-500">Since last reboot:</span> {formatUptime(detail.host.uptimeSeconds)}</p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs uppercase tracking-wider text-zinc-500">3. System Configuration</p>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">System Configuration</CardTitle>
          <CardDescription>Hardware and host configuration from latest snapshot.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 text-sm">
          <div><p className="text-zinc-500">Physical CPU</p><p className="text-base font-semibold">{detail.cpu.physicalCores || 'N/A'} cores</p></div>
          <div><p className="text-zinc-500">Logical CPU</p><p className="text-base font-semibold">{detail.cpu.logicalCores || detail.cpu.cores || 'N/A'} cores</p></div>
          <div><p className="text-zinc-500">CPU Frequency</p><p className="text-base font-semibold">{detail.cpu.frequencyMHz ? `${(detail.cpu.frequencyMHz / 1000).toFixed(2)} GHz` : 'N/A'}</p></div>
          <div><p className="text-zinc-500">RAM</p><p className="text-base font-semibold">{formatBytes(detail.memory.total)}</p></div>
          <div><p className="text-zinc-500">Swap</p><p className="text-base font-semibold">{formatBytes(detail.memory.swapTotal)}</p></div>
          <div><p className="text-zinc-500">Serial Number</p><p className="text-base font-semibold">Not reported</p></div>
          <div><p className="text-zinc-500">Platform</p><p className="text-base font-semibold">{detail.host.platform}</p></div>
          <div><p className="text-zinc-500">OS Build</p><p className="text-base font-semibold">{detail.host.osVersion || 'N/A'}</p></div>
        </CardContent>
      </Card>

      <p className="text-xs uppercase tracking-wider text-zinc-500">4. CPU, Memory, Network And Disk Utilization</p>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'CPU', value: `${detail.performance.cpuUsagePct.toFixed(1)}%` },
          { label: 'Memory', value: `${detail.performance.memoryUsagePct.toFixed(1)}%` },
          { label: 'Network', value: `${detail.performance.networkUsagePct.toFixed(1)}%` },
          { label: 'Disk', value: `${detail.performance.diskUsagePct.toFixed(1)}%` },
        ].map((item) => (
          <Card key={item.label} className="border-zinc-200 dark:border-zinc-800">
            <CardContent className="pt-5">
              <p className="text-xs uppercase tracking-wider text-zinc-500">{item.label} Utilization</p>
              <p className="text-2xl font-bold mt-1">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs uppercase tracking-wider text-zinc-500">4.1 CPU Metrics And Memory Metrics</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Cpu className="w-4 h-4" /> CPU Metrics</CardTitle>
            <CardDescription>
              Physical: {detail.cpu.physicalCores || 'N/A'} · Virtual: {detail.cpu.logicalCores || detail.cpu.cores} · Frequency: {detail.cpu.frequencyMHz ? `${(detail.cpu.frequencyMHz / 1000).toFixed(2)} GHz` : 'N/A'}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
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

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><MemoryStick className="w-4 h-4" /> Memory Metrics</CardTitle>
            <CardDescription>
              Physical: {formatBytes(detail.memory.total)} · Used: {formatBytes(detail.memory.used)} · SWAP: {formatBytes(detail.memory.swapUsed)} / {formatBytes(detail.memory.swapTotal)}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
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

      <p className="text-xs uppercase tracking-wider text-zinc-500">5. Network Throughput Trend And Network Latency Trend</p>

      {detail.healthTrend && detail.healthTrend.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Network Throughput Trend</CardTitle>
              <CardDescription>RX/TX and external download speed in Mbps</CardDescription>
            </CardHeader>
            <CardContent className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
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
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Network Latency Trend</CardTitle>
              <CardDescription>Ping latency over recent health checks</CardDescription>
            </CardHeader>
            <CardContent className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
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
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-xs uppercase tracking-wider text-zinc-500">6. CPU Temperature</p>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Thermometer className="w-4 h-4" /> CPU Temperature</CardTitle>
          <CardDescription>
            {detail.cpu.temperatureC == null ? 'Temperature sensor not available on this host.' : `${detail.cpu.temperatureC.toFixed(1)} C`}
          </CardDescription>
        </CardHeader>
      </Card>

      <p className="text-xs uppercase tracking-wider text-zinc-500">7. Disk Monitoring</p>

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
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div><p className="text-zinc-500">Used</p><p className="text-2xl font-bold">{Math.round(selectedDisk.usedPct)}%</p></div>
              <div><p className="text-zinc-500">Remaining</p><p className="text-2xl font-bold">{formatBytes(selectedDisk.availBytes)}</p></div>
              <div><p className="text-zinc-500">Filesystem</p><p className="text-base font-medium break-all">{selectedDisk.filesystem}</p></div>
            </div>
          ) : <p className="text-sm text-zinc-500">No disk data available.</p>}
        </CardContent>
      </Card>

      <p className="text-xs uppercase tracking-wider text-zinc-500">8. Inode Monitoring</p>

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
              <div><p className="text-zinc-500">Used</p><p className="text-xl font-bold">{selectedInode.used.toLocaleString()}</p></div>
              <div><p className="text-zinc-500">Free</p><p className="text-xl font-bold">{selectedInode.free.toLocaleString()}</p></div>
              <div><p className="text-zinc-500">Total Inodes</p><p className="text-xl font-bold">{selectedInode.inodes?.toLocaleString() || 'N/A'}</p></div>
            </div>
          ) : <p className="text-sm text-zinc-500">No inode data available.</p>}
        </CardContent>
      </Card>

      <p className="text-xs uppercase tracking-wider text-zinc-500">9. Network Monitoring</p>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Network className="w-4 h-4" /> Network Monitoring</CardTitle>
          <CardDescription>Interface activity trend and latest addresses</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.networkInterfaces.flatMap((ni) =>
                  (ni.addresses || []).map((a, idx) => (
                    <TableRow key={`${ni.name}-${idx}`}>
                      <TableCell className="font-medium">{ni.name}</TableCell>
                      <TableCell>{a.family}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[420px] truncate">{a.address}</TableCell>
                      <TableCell>{a.internal ? 'Internal' : 'External'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs uppercase tracking-wider text-zinc-500">10. Status And Active Issues</p>

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
                  <span className="text-zinc-500">{Number(issue.current_value).toFixed(1)}% ({issue.threshold_value}%)</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
