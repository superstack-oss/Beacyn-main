import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Search, Server, Gauge, Settings, Eye, Bug, PauseCircle, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
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

interface InfrastructurePageProps {
  onOpenDetails: (agentId: string) => void;
  onOpenIncidents?: (agentId: string) => void;
  onPause?: (agentId: string) => void;
  onDelete?: (agentId: string) => void;
  view?: 'servers' | 'vms' | 'storage' | 'san' | 'computer';
}

interface AssetListItem {
  id: string;
  name: string;
  parent_type?: string | null;
  sub_type?: string | null;
  target_endpoint?: string | null;
  status?: string | null;
  environment?: string | null;
  device_category?: string | null;
  last_checked_at?: string | null;
}

interface ServerListItem {
  agentId: string;
  serialNumber?: string | null;
  hostname: string;
  platform?: string;
  os?: string;
  osVersion?: string;
  machineType?: string;
  status: 'Online' | 'Down' | 'Healthy' | 'Warning' | 'Faulty' | 'Delayed' | string;
  heartbeat?: string | null;
  isStale?: boolean;
  isAlive?: boolean;
  frequencyGHz: number;
  cpuUsagePct: number;
  memoryUsagePct: number;
  diskUsagePct: number;
  issueCount?: number;
  issueSeverity?: 'P1' | 'P2' | 'P3' | null;
  uptimeSeconds?: number;
  lastCollectedAt?: string | null;
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value.replace('%', '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizeServerListItem(row: any): ServerListItem {
  const machineTypeRaw = String(row?.machineType || row?.machine_type || '').toLowerCase();
  const frequencyGHz = toSafeNumber(
    row?.frequencyGHz ?? row?.frequency_ghz ?? (toSafeNumber(row?.cpu_frequency_mhz ?? row?.frequencyMHz, 0) / 1000),
    0
  );
  const statusRaw = String(row?.status || 'Down');
  const heartbeat = row?.heartbeat == null ? null : String(row.heartbeat);
  const heartbeatActive = heartbeat ? heartbeat.toLowerCase() === 'active' : null;
  const isAlive = heartbeatActive == null ? (row?.isAlive == null ? statusRaw.toLowerCase() !== 'down' : Boolean(row.isAlive)) : heartbeatActive;
  const status = isAlive ? 'Online' : (['Warning', 'Faulty', 'Delayed'].includes(statusRaw) ? statusRaw : 'Down');

  return {
    agentId: String(row?.agentId || row?.agent_id || row?.agent_uuid || row?.id || ''),
    serialNumber: row?.serialNumber ?? row?.serial_number ?? null,
    hostname: String(row?.hostname || row?.host || row?.agent_name || row?.name || 'Unknown host'),
    platform: row?.platform ?? row?.os ?? undefined,
    os: row?.os ?? row?.platform ?? undefined,
    osVersion: row?.osVersion ?? row?.platform_version ?? undefined,
    machineType: machineTypeRaw === 'vm' ? 'VM' : machineTypeRaw === 'baremetal' ? 'Physical' : (row?.machineType || 'Physical'),
    status,
    heartbeat,
    isStale: heartbeatActive == null ? Boolean(row?.isStale) : !heartbeatActive,
    isAlive,
    frequencyGHz: Number(frequencyGHz.toFixed(2)),
    cpuUsagePct: Number(toSafeNumber(row?.cpuUsagePct ?? row?.cpu_usage_percent ?? row?.cpu_usage ?? row?.cpuUsagePercent, 0).toFixed(2)),
    memoryUsagePct: Number(toSafeNumber(row?.memoryUsagePct ?? row?.memory_used_percent ?? row?.memory_used ?? row?.memoryUsagePercent, 0).toFixed(2)),
    diskUsagePct: Number(toSafeNumber(row?.diskUsagePct ?? row?.disk_used_percent ?? row?.diskUsagePercent, 0).toFixed(2)),
    issueCount: toSafeNumber(row?.issueCount ?? row?.open_count, 0),
    issueSeverity: row?.issueSeverity ?? null,
    uptimeSeconds: toSafeNumber(row?.uptimeSeconds ?? row?.uptime_seconds, 0),
    lastCollectedAt: row?.lastCollectedAt ?? row?.last_seen_at ?? row?.collected_at ?? null,
  };
}

function statusClass(status: 'Online' | 'Healthy' | 'Warning' | 'Down' | 'Faulty' | 'Delayed') {
  if (status === 'Online' || status === 'Healthy') return 'border-emerald-200/90 bg-emerald-50/90 text-emerald-700';
  if (status === 'Warning' || status === 'Delayed') return 'border-amber-200/90 bg-amber-50/90 text-amber-700';
  if (status === 'Faulty') return 'border-fuchsia-200/90 bg-fuchsia-50/90 text-fuchsia-700';
  return 'border-rose-200/90 bg-rose-50/90 text-rose-700';
}

function statusDotClass(status: 'Online' | 'Healthy' | 'Warning' | 'Down' | 'Faulty' | 'Delayed') {
  if (status === 'Online' || status === 'Healthy') return 'bg-emerald-500';
  if (status === 'Warning' || status === 'Delayed') return 'bg-amber-500';
  if (status === 'Faulty') return 'bg-fuchsia-500';
  return 'bg-rose-500';
}

function utilizationPalette(value: number) {
  if (value >= 85) return { from: '#ef4444', to: '#dc2626' };
  if (value >= 60) return { from: '#f59e0b', to: '#d97706' };
  return { from: '#22c55e', to: '#16a34a' };
}

function normalizeAssetCategory(asset: AssetListItem): 'servers' | 'vms' | 'storage' | 'san' | 'computer' | 'uptime' {
  const explicit = String(asset.device_category || '').trim().toLowerCase();
  if (['servers', 'vms', 'storage', 'san', 'computer', 'uptime'].includes(explicit)) {
    return explicit as 'servers' | 'vms' | 'storage' | 'san' | 'computer' | 'uptime';
  }

  const parent = String(asset.parent_type || '').toLowerCase();
  const sub = String(asset.sub_type || '').toLowerCase();
  const name = String(asset.name || '').toLowerCase();

  if (parent === 'storage') return 'storage';
  if (parent === 'switch' || sub.includes('brocade') || sub.includes('connextrix')) return 'san';
  if (parent === 'computer' || sub.includes('apple') || sub.includes('dell') || sub.includes('acer')) return 'computer';
  if (parent === 'website' || parent === 'api endpoint' || parent === 'network port' || parent === 'docker host' || parent === 'docker container') return 'uptime';
  if (parent === 'server' && (sub.includes('vm') || name.includes('vm-') || name.startsWith('vm '))) return 'vms';
  return 'servers';
}

function infraTitle(view: 'servers' | 'vms' | 'storage' | 'san' | 'computer') {
  if (view === 'servers') return 'Servers: HP ProLiant, ESXi';
  if (view === 'vms') return 'VMs';
  if (view === 'storage') return 'Storage';
  if (view === 'san') return 'SAN: Brocade';
  return 'Computer: Apple, HP, Dell, Acer';
}

function CircularUtilization({ value, idKey }: { value: number; idKey: string }) {
  const safe = Math.max(0, Math.min(100, Number(value || 0)));
  const radius = 30;
  const size = 72;
  const stroke = 5;
  const circumference = 2 * Math.PI * radius; 
  const offset = circumference * (1 - safe / 100);
  const palette = utilizationPalette(safe);
  const gradientId = `util-grad-${idKey.replace(/[^a-z0-9-_]/gi, '')}`;

  return (
    <div className="relative inline-flex h-[72px] w-[72px] items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={palette.from} />
            <stop offset="100%" stopColor={palette.to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e4e4e7" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <div className="absolute h-9 w-9 rounded-full bg-white dark:bg-zinc-950" />
      <span className="absolute text-xs font-semibold text-zinc-900 dark:text-zinc-100">{safe.toFixed(1)}%</span>
    </div>
  );
}

export default function InfrastructurePage({ onOpenDetails, onOpenIncidents, onPause, onDelete, view = 'servers' }: InfrastructurePageProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<ServerListItem[]>([]);
  const [assetRows, setAssetRows] = useState<AssetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  const isAgentInfraView = view === 'servers' || view === 'vms';

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      try {
        if (isAgentInfraView) {
          const params = new URLSearchParams({
            page: String(page),
            pageSize: String(pageSize),
            q: search,
          });
          if (view === 'servers') params.set('machineType', 'physical');
          if (view === 'vms') params.set('machineType', 'vm');

          const serversRes = await fetch(apiUrl(`/api/infra/servers?${params.toString()}`));
          const serversData = await serversRes.json();
          const list = Array.isArray(serversData?.servers)
            ? serversData.servers
            : Array.isArray(serversData)
              ? serversData
              : [];

          if (!ignore) {
            setRows(list.map(normalizeServerListItem));
            setTotal(Number(serversData?.total ?? list.length));
            setAssetRows([]);
          }
        } else {
          const res = await fetch(apiUrl('/api/assets'));
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          const filteredByView = list.filter((asset: AssetListItem) => normalizeAssetCategory(asset) === view);
          const q = String(search || '').trim().toLowerCase();
          const filtered = q
            ? filteredByView.filter((asset: AssetListItem) => {
              const hay = `${asset.name || ''} ${asset.parent_type || ''} ${asset.sub_type || ''} ${asset.target_endpoint || ''} ${asset.id || ''}`.toLowerCase();
              return hay.includes(q);
            })
            : filteredByView;

          const start = (page - 1) * pageSize;
          const end = start + pageSize;
          if (!ignore) {
            setAssetRows(filtered.slice(start, end));
            setTotal(filtered.length);
            setRows([]);
          }
        }
      } catch {
        if (!ignore) {
          setRows([]);
          setAssetRows([]);
          setTotal(0);
        }
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
  }, [isAgentInfraView, page, pageSize, reloadTick, search, view]);

  const handleDelete = async (agentId: string, hostLabel: string) => {
    const ok = window.confirm(`Delete ${hostLabel}? This will permanently remove this server and all related collected data.`);
    if (!ok) return;

    try {
      if (onDelete) {
        onDelete(agentId);
      } else {
        const res = await fetch(apiUrl(`/api/infra/servers/${encodeURIComponent(agentId)}`), { method: 'DELETE' });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Delete failed (${res.status})`);
        }
      }
      setReloadTick((v) => v + 1);
    } catch (err: any) {
      window.alert(err?.message || 'Failed to delete server entry.');
    }
  };

  if (!isAgentInfraView) {
    return (
      <div className="relative">
        <div className="absolute inset-0 -z-10 rounded-xl bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_14px] opacity-60" />
        <div className="space-y-6">
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-zinc-800 dark:text-zinc-100">
              <Server className="w-4 h-4" /> {infraTitle(view)}
              <span className="inline-flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-xs text-zinc-500">
                {total}
              </span>
            </CardTitle>
            <CardDescription className="text-zinc-500">
              Category-organized infrastructure inventory.
            </CardDescription>
            <div className="relative pt-1.5 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                placeholder="Search devices"
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="px-0 pt-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
                  <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Name</TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Type</TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Target</TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Status</TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Last Checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-zinc-500">Loading assets...</TableCell>
                  </TableRow>
                ) : assetRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <div className="border-2 border-dashed border-zinc-100 rounded-lg m-4">
                        <EmptyState
                          title="No devices in this category"
                          message="No devices have been registered under this category yet. Add assets from the Inventory page."
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  assetRows.map((row) => (
                    <TableRow key={row.id} className="border-b border-zinc-100/80 dark:border-zinc-800/80 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/30 transition-colors">
                      <TableCell className="py-3 align-middle font-medium text-zinc-800 dark:text-zinc-100">{row.name}</TableCell>
                      <TableCell className="py-3 align-middle text-zinc-600 dark:text-zinc-300">{row.parent_type}{row.sub_type ? ` (${row.sub_type})` : ''}</TableCell>
                      <TableCell className="py-3 align-middle text-zinc-600 dark:text-zinc-300">{row.target_endpoint || '-'}</TableCell>
                      <TableCell className="py-3 align-middle text-zinc-600 dark:text-zinc-300">{row.status || 'Initializing'}</TableCell>
                      <TableCell className="py-3 align-middle text-zinc-600 dark:text-zinc-300">{row.last_checked_at ? new Date(row.last_checked_at).toLocaleString() : 'Never'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="px-6 py-3 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-100 dark:border-zinc-800">
              <span>Showing {(page - 1) * pageSize + (assetRows.length ? 1 : 0)} - {(page - 1) * pageSize + assetRows.length} of {total}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
                <span>Page {page} of {totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
              </div>
            </div>
          </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 -z-10 rounded-xl bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_14px] opacity-60" />
      <div className="space-y-6">
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-zinc-800 dark:text-zinc-100">
            <Server className="w-4 h-4" /> {view === 'vms' ? 'Virtual Machine monitors' : 'Infrastructure monitors'}
            <span className="inline-flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-xs text-zinc-500">
              {total}
            </span>
          </CardTitle>
          <CardDescription className="text-zinc-500">
            {view === 'vms'
              ? 'Fleet health overview for virtual machines with live utilization.'
              : 'Fleet health overview with live utilization and streamlined actions.'}
          </CardDescription>
          <div className="relative pt-1.5 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <Input
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              placeholder="Search hostname or agent"
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="px-0 pt-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500 text-left">Hostname</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500 text-center">Machine Type</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500 text-center">Status</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500 text-center">Frequency</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500 text-center">CPU</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500 text-center">Memory</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500 text-center">Disk</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-zinc-500">Loading infrastructure servers...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <div className="border-2 border-dashed border-zinc-100 rounded-lg m-4">
                      <EmptyState
                        title="No servers found"
                        message="No infrastructure servers are reporting in. Deploy the agent on your servers to start monitoring."
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const displayStatus = (row.isAlive
                    ? 'Online'
                    : (['Warning', 'Faulty', 'Delayed'].includes(String(row.status)) ? row.status : 'Down')) as 'Online' | 'Down' | 'Warning' | 'Faulty' | 'Delayed';
                  const machineType = String(row.machineType || (view === 'vms' ? 'VM' : 'Physical')).toLowerCase() === 'vm' ? 'VM' : 'Physical';
                  return (
                  <TableRow key={row.agentId} className={`border-b border-zinc-100/80 dark:border-zinc-800/80 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/30 transition-colors ${row.isStale ? 'opacity-55 grayscale' : ''}`}>
                    <TableCell className="py-3 align-middle text-left">
                      <button
                        type="button"
                        onClick={() => onOpenDetails(row.agentId)}
                        className="font-medium text-zinc-800 dark:text-zinc-100 leading-tight hover:underline text-left"
                      >
                        {row.hostname || row.agentId}
                      </button>
                      <div className="text-[11px] text-zinc-500 mt-0.5">Asset ID: {row.agentId || 'Unavailable'}</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        {row.lastCollectedAt ? `Last seen: ${new Date(row.lastCollectedAt).toLocaleString()}` : 'Awaiting first snapshot'}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-center align-middle">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${machineType === 'VM'
                        ? 'border-violet-200/90 bg-violet-50/90 text-violet-700 dark:border-violet-800/90 dark:bg-violet-950/40 dark:text-violet-300'
                        : 'border-sky-200/90 bg-sky-50/90 text-sky-700 dark:border-sky-800/90 dark:bg-sky-950/40 dark:text-sky-300'} `}>
                        {machineType}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-center align-middle">
                      <Badge variant="outline" className={`inline-flex items-center gap-1 ${statusClass(displayStatus)} text-[11px] px-2 py-0.5`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(displayStatus)}`} />
                        {displayStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-center align-middle">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                        <Gauge className="w-3 h-3 text-zinc-400" />{row.frequencyGHz > 0 ? `${row.frequencyGHz.toFixed(2)} GHz` : 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-center align-middle">
                      <CircularUtilization value={row.cpuUsagePct} idKey={`${row.agentId}-cpu`} />
                    </TableCell>
                    <TableCell className="py-2 text-center align-middle">
                      <CircularUtilization value={row.memoryUsagePct} idKey={`${row.agentId}-mem`} />
                    </TableCell>
                    <TableCell className="py-2 text-center align-middle">
                      <CircularUtilization value={row.diskUsagePct} idKey={`${row.agentId}-disk`} />
                    </TableCell>
                    <TableCell className="py-3 text-center align-middle">
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
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenDetails(row.agentId); }} className="gap-2">
                            <Eye className="w-3.5 h-3.5" /> Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenIncidents?.(row.agentId); }} className="gap-2">
                            <Bug className="w-3.5 h-3.5" /> Incidents
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPause?.(row.agentId); }} className="gap-2">
                            <PauseCircle className="w-3.5 h-3.5" /> Pause
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); void handleDelete(row.agentId, row.hostname); }} className="gap-2">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="px-6 py-3 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-100 dark:border-zinc-800">
            <span>Showing {(page - 1) * pageSize + (rows.length ? 1 : 0)} - {(page - 1) * pageSize + rows.length} of {total}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
              <span>Page {page} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
            </div>
          </div>
        </CardContent>
        </Card>
      </div>
    </div>
  );
}
