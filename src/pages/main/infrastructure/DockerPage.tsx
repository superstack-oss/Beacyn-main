import { useEffect, useState } from 'react';
import { Container } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Skeleton } from '../../../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { EmptyPlaceholder } from '../../../components/EmptyPlaceholder';
import { apiUrl } from '../../../lib/api';
import { authHeaders } from '../../../lib/auth';

interface DockerPageProps {
  onOpenHost?: (agentId: string) => void;
}

function isDockerAsset(asset: any) {
  const parent = String(asset?.parent_type || '').toLowerCase();
  const sub = String(asset?.sub_type || '').toLowerCase();
  return parent.includes('docker') || sub.includes('docker');
}

export default function DockerPage({ onOpenHost }: DockerPageProps) {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [monitors, setMonitors] = useState<any[]>([]);
  const [containers, setContainers] = useState<any[]>([]);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const [assetsRes, dockerRes] = await Promise.all([
          fetch(apiUrl('/api/assets'), { headers: authHeaders() }),
          fetch(apiUrl('/api/infra/docker'), { headers: authHeaders() }),
        ]);
        const assets = await assetsRes.json().catch(() => []);
        const docker = await dockerRes.json().catch(() => ({ containers: [] }));
        if (ignore) return;
        setMonitors(Array.isArray(assets) ? assets.filter(isDockerAsset) : []);
        setContainers(Array.isArray(docker?.containers) ? docker.containers : []);
      } catch (err) {
        console.error('Error fetching Docker inventory:', err);
        if (!ignore) {
          setMonitors([]);
          setContainers([]);
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
  }, []);

  const q = search.trim().toLowerCase();
  const visibleMonitors = monitors.filter((row) => {
    if (!q) return true;
    return `${row.name || ''} ${row.target_endpoint || ''} ${row.status || ''}`.toLowerCase().includes(q);
  });
  const visibleContainers = containers.filter((row) => {
    if (!q) return true;
    return `${row.hostname || ''} ${row.name || ''} ${row.image || ''} ${row.state || ''}`.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-zinc-800 dark:text-zinc-100">
            <Container className="w-4 h-4" /> Docker monitors
            <span className="inline-flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-xs text-zinc-500 tabular-nums">
              {visibleMonitors.length}
            </span>
          </CardTitle>
          <CardDescription className="text-zinc-500">
            Socket and container checks. A stopped, missing, or unreachable container is reported down and follows the existing alert path.
          </CardDescription>
          <div className="relative pt-1.5 max-w-sm">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search monitors or containers" />
          </div>
        </CardHeader>
        <CardContent className={loading || visibleMonitors.length > 0 ? 'px-0 pt-0 overflow-x-auto' : 'pt-0'}>
          {loading ? (
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={4} className="py-6"><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : visibleMonitors.length === 0 ? (
            <EmptyPlaceholder
              title={q ? 'No matching Docker monitors' : 'No Docker monitors yet'}
              message={q ? `No Docker monitors match "${search.trim()}".` : 'Add a Docker monitor from Inventory to watch sockets and containers.'}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
                  <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Name</TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Target</TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Status</TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Last checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMonitors.map((row) => (
                  <TableRow key={row.id} className="border-b border-zinc-100/80 dark:border-zinc-800/80 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/30 transition-colors">
                    <TableCell className="py-3 font-medium text-zinc-800 dark:text-zinc-100">{row.name}</TableCell>
                    <TableCell className="py-3 text-zinc-600 dark:text-zinc-300">{row.target_endpoint || '—'}</TableCell>
                    <TableCell className="py-3 text-zinc-600 dark:text-zinc-300">{row.status || 'Initializing'}</TableCell>
                    <TableCell className="py-3 text-zinc-600 dark:text-zinc-300 tabular-nums">{row.last_checked_at ? new Date(row.last_checked_at).toLocaleString() : 'Never'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-zinc-800 dark:text-zinc-100">Host containers</CardTitle>
          <CardDescription className="text-zinc-500">Latest container telemetry reported by infrastructure agents.</CardDescription>
        </CardHeader>
        <CardContent className={loading || visibleContainers.length > 0 ? 'px-0 pt-0 overflow-x-auto' : 'pt-0'}>
          {loading ? (
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={6} className="py-6"><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : visibleContainers.length === 0 ? (
            <EmptyPlaceholder
              title={q ? 'No matching containers' : 'No containers yet'}
              message={q ? `No host containers match "${search.trim()}".` : 'Agent telemetry appears here after a host publishes Docker stats.'}
            />
          ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Host</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Container</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Image</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">State</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500 text-right">CPU</TableHead>
                <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500 text-right">Memory</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleContainers.map((row) => (
                <TableRow key={`${row.agentId}-${row.containerId || row.name}`} className="border-b border-zinc-100/80 dark:border-zinc-800/80 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/30 transition-colors">
                  <TableCell className="py-3">
                    {onOpenHost && row.agentId ? (
                      <button type="button" className="font-medium text-zinc-800 dark:text-zinc-100 hover:underline" onClick={() => onOpenHost(String(row.agentId))}>
                        {row.hostname || row.agentName || row.agentId}
                      </button>
                    ) : (
                      <span className="font-medium text-zinc-800 dark:text-zinc-100">{row.hostname || row.agentName || 'Unknown host'}</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-zinc-700 dark:text-zinc-200">{row.name || '—'}</TableCell>
                  <TableCell className="py-3 text-zinc-600 dark:text-zinc-300">{row.image || '—'}</TableCell>
                  <TableCell className="py-3 text-zinc-600 dark:text-zinc-300">{row.status || row.state || 'Unknown'}</TableCell>
                  <TableCell className="py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{row.cpuPercent == null ? '—' : `${Number(row.cpuPercent).toFixed(1)}%`}</TableCell>
                  <TableCell className="py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{row.memoryPercent == null ? '—' : `${Number(row.memoryPercent).toFixed(1)}%`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
