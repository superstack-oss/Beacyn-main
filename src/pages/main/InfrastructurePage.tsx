import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Search, Server, Cpu, HardDrive, MemoryStick, Gauge } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { apiUrl } from '../../lib/api';

interface InfrastructurePageProps {
  onOpenDetails: (agentId: string) => void;
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

function statusClass(status: string) {
  if (status === 'Up') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Delayed') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

function healthClass(isHealthy: boolean) {
  return isHealthy
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-rose-50 text-rose-700 border-rose-200';
}

function scoreClass(status: 'Info' | 'Warning' | 'Critical' | null) {
  if (status === 'Info') return 'bg-sky-50 text-sky-700 border-sky-200';
  if (status === 'Warning') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Critical') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-zinc-50 text-zinc-700 border-zinc-200';
}

export default function InfrastructurePage({ onOpenDetails }: InfrastructurePageProps) {
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
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="w-4 h-4" /> Infrastructure monitors
          </CardTitle>
          <CardDescription>
            Fleet-wide server health table. Click any server to open full infrastructure details.
          </CardDescription>
          <div className="relative pt-2 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <Input
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              placeholder="Search hostname or agent"
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-zinc-100 dark:border-zinc-800">
                <TableHead className="pl-6">Hostname</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>CPU Utilization %</TableHead>
                <TableHead>Memory Utilization %</TableHead>
                <TableHead>Disk Utilization %</TableHead>
                <TableHead className="pr-6">Actions</TableHead>
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
                  return (
                  <TableRow key={row.agentId} className="cursor-pointer" onClick={() => onOpenDetails(row.agentId)}>
                    <TableCell className="pl-6 font-medium">{row.hostname}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={statusClass(row.status)}>{row.status}</Badge>
                        {health ? (
                          <>
                            <Badge variant="outline" className={healthClass(health.healthy)}>
                              {health.healthy ? 'Healthy' : 'Unhealthy'}
                            </Badge>
                            {health.scoreStatus && (
                              <Badge variant="outline" className={scoreClass(health.scoreStatus)}>
                                {health.scoreStatus}{health.score == null ? '' : ` ${health.score.toFixed(0)}`}
                              </Badge>
                            )}
                            <span className="text-xs text-zinc-500">
                              {health.latencyMs == null
                                ? 'Latency: --'
                                : `Latency: ${health.latencyMs.toFixed(0)} ms`}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-zinc-500">Health: --</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5 text-zinc-400" />{row.frequencyGHz.toFixed(2)} GHz</span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-zinc-400" />{row.cpuUsagePct.toFixed(1)}%</span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5"><MemoryStick className="w-3.5 h-3.5 text-zinc-400" />{row.memoryUsagePct.toFixed(1)}%</span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5 text-zinc-400" />{row.diskUsagePct.toFixed(1)}%</span>
                    </TableCell>
                    <TableCell className="pr-6">
                      <div className="flex items-center gap-2">
                        {row.issueSeverity && (
                          <Badge variant="outline" className={statusClass(row.issueSeverity === 'P1' ? 'Down' : row.issueSeverity === 'P2' ? 'Delayed' : 'Up')}>
                            {row.issueSeverity} Investigate
                          </Badge>
                        )}
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onOpenDetails(row.agentId); }}>
                          View details
                        </Button>
                      </div>
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
