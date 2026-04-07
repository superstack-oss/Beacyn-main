import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Search, Server, Gauge, Settings2, Eye, Bug, PauseCircle, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { apiUrl } from '../../lib/api';

interface InfrastructurePageProps {
  onOpenDetails: (agentId: string) => void;
  onOpenIncidents?: (agentId: string) => void;
  onPause?: (agentId: string) => void;
  onDelete?: (agentId: string) => void;
}

interface ServerListItem {
  agentId: string;
  hostname: string;
  status: string;
  frequencyGHz: number;
  cpuUsagePct: number;
  memoryUsagePct: number;
  diskUsagePct: number;
  issueCount?: number;
  issueSeverity?: 'P1' | 'P2' | 'P3' | null;
}

interface LatestHealthItem {
  agentId: string;
  healthy: boolean;
  score: number | null;
  scoreStatus: 'Info' | 'Warning' | 'Critical' | null;
  latencyMs: number | null;
  checkedAt: string;
}

function statusClass(status: 'Up' | 'Warning' | 'Down') {
  if (status === 'Up') return 'border-emerald-200/90 bg-emerald-50/90 text-emerald-700';
  if (status === 'Warning') return 'border-amber-200/90 bg-amber-50/90 text-amber-700';
  return 'border-rose-200/90 bg-rose-50/90 text-rose-700';
}

function statusDotClass(status: 'Up' | 'Warning' | 'Down') {
  if (status === 'Up') return 'bg-emerald-500';
  if (status === 'Warning') return 'bg-amber-500';
  return 'bg-rose-500';
}

function deriveDisplayStatus(row: ServerListItem, health?: LatestHealthItem): 'Up' | 'Warning' | 'Down' {
  const maxUtil = Math.max(row.cpuUsagePct || 0, row.memoryUsagePct || 0, row.diskUsagePct || 0);
  if (row.status === 'Down') return 'Down';
  if (row.status === 'Delayed') return 'Warning';
  if (health && !health.healthy) return maxUtil >= 95 ? 'Down' : 'Warning';
  if (maxUtil >= 90) return 'Warning';
  return 'Up';
}

function utilizationPalette(value: number) {
  if (value >= 85) return { from: '#ef4444', to: '#dc2626' };
  if (value >= 60) return { from: '#f59e0b', to: '#d97706' };
  return { from: '#22c55e', to: '#16a34a' };
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

export default function InfrastructurePage({ onOpenDetails, onOpenIncidents, onPause, onDelete }: InfrastructurePageProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<ServerListItem[]>([]);
  const [latestHealth, setLatestHealth] = useState<Record<string, LatestHealthItem>>({});
  const [loading, setLoading] = useState(true);

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
          q: search,
        });

        const [serversRes, healthRes] = await Promise.all([
          fetch(apiUrl(`/api/infra/servers?${params.toString()}`)),
          fetch(apiUrl('/api/health/latest')),
        ]);

        const [serversData, healthData] = await Promise.all([
          serversRes.json(),
          healthRes.json(),
        ]);

        const healthMap = Object.fromEntries(
          ((healthData?.health || []) as LatestHealthItem[]).map((h) => [h.agentId, h])
        );

        if (!ignore) {
          setRows(serversData?.servers || []);
          setTotal(Number(serversData?.total || 0));
          setLatestHealth(healthMap);
        }
      } catch {
        if (!ignore) {
          setRows([]);
          setTotal(0);
          setLatestHealth({});
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
  }, [page, search]);

  return (
    <div className="space-y-6">
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-zinc-800 dark:text-zinc-100">
            <Server className="w-4 h-4" /> Infrastructure monitors
            <span className="inline-flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-xs text-zinc-500">
              {total}
            </span>
          </CardTitle>
          <CardDescription className="text-zinc-500">
            Fleet health overview with live utilization and streamlined actions.
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
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500 text-center">Hostname</TableHead>
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
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-zinc-500">Loading infrastructure servers...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-zinc-500">No servers found.</TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const health = latestHealth[row.agentId];
                  const displayStatus = deriveDisplayStatus(row, health);
                  return (
                  <TableRow key={row.agentId} className="border-b border-zinc-100/80 dark:border-zinc-800/80 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/30 transition-colors">
                    <TableCell className="py-3 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => onOpenDetails(row.agentId)}
                        className="font-medium text-zinc-800 dark:text-zinc-100 leading-tight hover:underline"
                      >
                        {row.hostname}
                      </button>
                      <div className="text-[11px] text-zinc-500 mt-0.5">{row.agentId}</div>
                    </TableCell>
                    <TableCell className="py-3 text-center align-middle">
                      <Badge variant="outline" className={`inline-flex items-center gap-1 ${statusClass(displayStatus)} text-[11px] px-2 py-0.5`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(displayStatus)}`} />
                        {displayStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-center align-middle">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                        <Gauge className="w-3 h-3 text-zinc-400" />{row.frequencyGHz.toFixed(2)} GHz
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
                            <Settings2 className="w-3.5 h-3.5" />
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
                          <DropdownMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); onDelete?.(row.agentId); }} className="gap-2">
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
  );
}
