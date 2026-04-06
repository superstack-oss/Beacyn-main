import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Search, Database } from 'lucide-react';

interface DatabasePageProps {
  onOpenDetails: (targetKey: string) => void;
}

interface DatabaseListItem {
  targetKey: string;
  targetName: string;
  targetType: string;
  engine: string | null;
  version: string | null;
  ok: boolean;
  status: string;
  healthCategory: 'Healthy' | 'Warning' | 'Error' | null;
  totalDatabases: number | null;
  totalTables: number | null;
  usedPct: number | null;
  totalSpaceMb: number | null;
  latencyMs: number | null;
  activeSessions: number | null;
  collectedAt: string;
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

export default function DatabasePage({ onOpenDetails }: DatabasePageProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'All' | 'Connected' | 'Down' | 'Unavailable'>('All');
  const [rows, setRows] = useState<DatabaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const summary = useMemo(() => {
    const connected = rows.filter((r) => r.status === 'Connected').length;
    const healthy = rows.filter((r) => r.healthCategory === 'Healthy').length;
    const warning = rows.filter((r) => r.healthCategory === 'Warning').length;
    const errored = rows.filter((r) => r.healthCategory === 'Error' || r.status === 'Down').length;
    const totalDbs = rows.reduce((sum, r) => sum + Number(r.totalDatabases || 0), 0);
    const totalSpace = rows.reduce((sum, r) => sum + Number(r.totalSpaceMb || 0), 0);
    const latest = rows.reduce((latestAt, r) => {
      const ts = new Date(r.collectedAt).getTime();
      return Number.isFinite(ts) && ts > latestAt ? ts : latestAt;
    }, 0);

    return { connected, healthy, warning, errored, totalDbs, totalSpace, latest };
  }, [rows]);

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

        const res = await fetch(`http://localhost:3001/api/databases?${params.toString()}`);
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
  }, [search, status, page]);

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
            {(['All', 'Connected', 'Down', 'Unavailable'] as const).map((s) => (
              <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} onClick={() => { setPage(1); setStatus(s); }}>
                {s}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-0 pt-0">
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
                <TableHead className="db-premium-colhead">Last Collected</TableHead>
                <TableHead className="pr-6 db-premium-colhead">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-zinc-500">Loading database monitors...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-zinc-500">No database targets found.</TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.targetKey} className="cursor-pointer hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40 transition-colors" onClick={() => onOpenDetails(row.targetKey)}>
                  <TableCell className="pl-6">
                    <div>
                      <p className="font-medium">{row.engine || row.targetType.toUpperCase()}</p>
                      <p className="text-xs text-zinc-500">{row.version || 'Version unknown'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`db-premium-badge ${statusClass(row.status)}`}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`db-premium-badge ${healthClass(row.healthCategory)}`}>{row.healthCategory || 'Unknown'}</Badge>
                  </TableCell>
                  <TableCell>{row.totalDatabases ?? '-'} / {row.totalTables ?? '-'}</TableCell>
                  <TableCell>{row.totalSpaceMb == null ? 'N/A' : `${row.totalSpaceMb.toFixed(1)} MB`}</TableCell>
                  <TableCell>
                    <div>
                      <p>{row.latencyMs == null ? 'N/A' : `${row.latencyMs.toFixed(1)} ms`}</p>
                      <p className="text-xs text-zinc-500">Sessions: {row.activeSessions ?? 'N/A'}</p>
                    </div>
                  </TableCell>
                  <TableCell>{new Date(row.collectedAt).toLocaleString('en-GB')}</TableCell>
                  <TableCell className="pr-6">
                    <Button size="sm" variant="outline" className="db-premium-action" onClick={(e) => { e.stopPropagation(); onOpenDetails(row.targetKey); }}>
                      View details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
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
        </CardContent>
      </Card>
    </div>
  );
}
