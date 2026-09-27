import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { Search, Database, Settings, Eye, Bug, Download, Trash2 } from 'lucide-react';
import { EmptyPlaceholder } from '../../../components/EmptyPlaceholder';
import { apiUrl } from '../../../lib/api';

interface DatabasePageProps {
  onOpenDetails: (targetKey: string) => void;
  onOpenIncidents?: (targetKey: string) => void;
  onDelete?: (targetKey: string) => void;
}

interface DatabaseListItem {
  targetKey: string;
  targetName: string;
  targetType: string;
  engine: string | null;
  version: string | null;
  ok: boolean;
  status: 'Connected' | 'Disconnected' | string;
  rawStatus?: string;
  isStale?: boolean;
  checkpointAgeSec?: number | null;
  healthCategory: 'Healthy' | 'Warning' | 'Error' | null;
  totalDatabases: number | null;
  totalTables: number | null;
  usedPct: number | null;
  totalSpaceMb: number | null;
  latencyMs: number | null;
  activeSessions: number | null;
  dbSignature?: string | null;
  collectedAt: string;
}

function statusClass(status: string) {
  if (status === 'Connected') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-zinc-100 text-zinc-700 border-zinc-300';
}

function healthClass(status: 'Healthy' | 'Warning' | 'Error' | null) {
  if (status === 'Healthy') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Warning') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Error') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-zinc-50 text-zinc-700 border-zinc-200';
}

function progressTone(value: number) {
  if (value >= 85) return 'bg-rose-500';
  if (value >= 60) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function fmtCheckpointAge(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return 'N/A';
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

function latencyPct(ms?: number | null) {
  if (ms == null || !Number.isFinite(ms)) return 0;
  return Math.max(0, Math.min(100, (ms / 1000) * 100));
}

export default function DatabasePage({ onOpenDetails, onOpenIncidents, onDelete }: DatabasePageProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'All' | 'Connected' | 'Disconnected'>('All');
  const [rows, setRows] = useState<DatabaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const summary = useMemo(() => {
    const connected = rows.filter((r) => r.status === 'Connected').length;
    const healthy = rows.filter((r) => r.healthCategory === 'Healthy').length;
    const warning = rows.filter((r) => r.healthCategory === 'Warning').length;
    const errored = rows.filter((r) => r.healthCategory === 'Error' || r.status === 'Disconnected').length;
    const totalDbs = rows.reduce((sum, r) => sum + Number(r.totalDatabases || 0), 0);
    const totalSpace = rows.reduce((sum, r) => sum + Number(r.totalSpaceMb || 0), 0);
    const latest = rows.reduce((latestAt, r) => {
      const ts = new Date(r.collectedAt).getTime();
      return Number.isFinite(ts) && ts > latestAt ? ts : latestAt;
    }, 0);

    return { connected, healthy, warning, errored, totalDbs, totalSpace, latest };
  }, [rows]);

  const handleDelete = async (targetKey: string, label: string) => {
    const ok = window.confirm(`Delete ${label}? This removes monitor history for this target.`);
    if (!ok) return;

    try {
      if (onDelete) {
        onDelete(targetKey);
      } else {
        const res = await fetch(apiUrl(`/api/databases/${encodeURIComponent(targetKey)}`), { method: 'DELETE' });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Delete failed (${res.status})`);
        }
      }
      setReloadTick((v) => v + 1);
    } catch (err: any) {
      window.alert(err?.message || 'Failed to delete database monitor logs.');
    }
  };

  const handleDownloadReport = async (targetKey: string) => {
    try {
      const res = await fetch(apiUrl(`/api/databases/${encodeURIComponent(targetKey)}?limit=120`));
      if (!res.ok) {
        throw new Error(`Download failed (${res.status})`);
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${targetKey.replace(/[^a-zA-Z0-9_-]+/g, '_')}-report.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      window.alert(err?.message || 'Unable to download report.');
    }
  };

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: search,
          status,
          page: String(page),
          pageSize: String(pageSize),
        });

        const res = await fetch(apiUrl(`/api/databases?${params.toString()}`));
        const data = await res.json();

        if (!ignore) {
          setRows(data?.databases || []);
          setTotal(Number(data?.total || 0));
        }
      } catch {
        if (!ignore) {
          setRows([]);
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
  }, [search, status, page, reloadTick]);

  return (
    <div className="space-y-7 db-premium-page db-premium-list">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Fleet Health</p>
            <p className="text-2xl font-bold mt-1">{summary.healthy} healthy</p>
            <p className="text-xs text-zinc-500 mt-1">{summary.warning} warning, {summary.errored} error</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Connectivity</p>
            <p className="text-2xl font-bold mt-1">{summary.connected}/{rows.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Connected targets on this page</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Inventory</p>
            <p className="text-2xl font-bold mt-1">{summary.totalDbs}</p>
            <p className="text-xs text-zinc-500 mt-1">Total databases in current page scope</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Storage + Last Sync</p>
            <p className="text-2xl font-bold mt-1">{summary.totalSpace.toFixed(1)} MB</p>
            <p className="text-xs text-zinc-500 mt-1">{summary.latest ? new Date(summary.latest).toLocaleString('en-GB') : 'No samples yet'}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2"><Database className="w-4 h-4" /> Databases</CardTitle>
              <CardDescription>Live database fleet status, inventory, space, and performance snapshots.</CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                placeholder="Search engine, type, target"
                className="pl-8"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            {(['All', 'Connected', 'Disconnected'] as const).map((s) => (
              <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} onClick={() => { setPage(1); setStatus(s); }}>
                {s}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className={loading || rows.length > 0 ? 'px-0 pt-0' : 'pt-0'}>
          {!loading && rows.length === 0 ? (
            <EmptyPlaceholder
              title={search || status !== 'All' ? 'No matching databases' : 'No databases yet'}
              message={search || status !== 'All' ? 'No database targets match the current filters.' : 'Add a database monitor from Inventory to start collecting health, space, and latency.'}
            />
          ) : (
          <>
          <div className="db-premium-table-wrap">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-zinc-100 dark:border-zinc-800">
                <TableHead className="pl-6 db-premium-colhead">Engine</TableHead>
                <TableHead className="db-premium-colhead">Status</TableHead>
                <TableHead className="db-premium-colhead">Health</TableHead>
                <TableHead className="db-premium-colhead">DBs / Tables</TableHead>
                <TableHead className="db-premium-colhead">Space</TableHead>
                <TableHead className="db-premium-colhead">Latency</TableHead>
                <TableHead className="db-premium-colhead">Last Check</TableHead>
                <TableHead className="pr-6 db-premium-colhead">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-zinc-500">Loading database monitors...</TableCell>
                </TableRow>
              ) : rows.map((row) => {
                const stale = !!row.isStale || row.status === 'Disconnected';
                return (
                <TableRow
                  key={row.targetKey}
                  className={`cursor-pointer transition-colors ${stale ? 'opacity-55 grayscale bg-zinc-100/70 dark:bg-zinc-900/50' : 'hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40'}`}
                  onClick={() => onOpenDetails(row.targetKey)}
                >
                  <TableCell className="pl-6">
                    <div>
                      <p className="font-medium">{row.engine || row.targetType.toUpperCase()}</p>
                      <p className="text-xs text-zinc-500">{row.version || 'Version unknown'}</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{row.dbSignature || row.targetKey}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`db-premium-badge ${statusClass(row.status)}`}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`db-premium-badge ${healthClass(row.healthCategory)}`}>{row.healthCategory || 'Unknown'}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{row.totalDatabases ?? '-'}</span> / {row.totalTables ?? '-'}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{row.totalSpaceMb == null ? 'N/A' : `${row.totalSpaceMb.toFixed(1)} MB`}</p>
                      <div className="mt-1.5 h-1.5 w-24 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                        <div
                          className={`h-full ${progressTone(Number(row.usedPct || 0))}`}
                          style={{ width: `${Math.max(0, Math.min(100, Number(row.usedPct || 0)))}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{row.latencyMs == null ? 'N/A' : `${row.latencyMs.toFixed(1)} ms`}</p>
                      <p className="text-xs text-zinc-500">Sessions: {row.activeSessions ?? 'N/A'}</p>
                      <div className="mt-1.5 h-1.5 w-24 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                        <div
                          className={`h-full ${progressTone(latencyPct(row.latencyMs))}`}
                          style={{ width: `${latencyPct(row.latencyMs)}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{new Date(row.collectedAt).toLocaleString('en-GB')}</p>
                      <p className="text-xs text-zinc-500">{fmtCheckpointAge(row.checkpointAgeSec)}</p>
                    </div>
                  </TableCell>
                  <TableCell className="pr-6">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Open actions menu"
                          className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {!stale && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenDetails(row.targetKey); }} className="gap-2">
                            <Eye className="w-3.5 h-3.5" /> Details
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenIncidents?.(row.targetKey); }} className="gap-2">
                          <Bug className="w-3.5 h-3.5" /> Incidents
                        </DropdownMenuItem>
                        {!stale && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void handleDownloadReport(row.targetKey); }} className="gap-2">
                            <Download className="w-3.5 h-3.5" /> Download report
                          </DropdownMenuItem>
                        )}
                        {!stale && <DropdownMenuSeparator />}
                        <DropdownMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); void handleDelete(row.targetKey, row.targetName); }} className="gap-2">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );})}
            </TableBody>
          </Table>
          </div>

          <div className="px-6 py-3 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-100 dark:border-zinc-800">
            <span>Showing {(page - 1) * pageSize + (rows.length ? 1 : 0)} - {(page - 1) * pageSize + rows.length} of {total}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
              <span>Page {page} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
            </div>
          </div>
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
