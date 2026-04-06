import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Search, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface InvestigatePageProps {
  onOpenServer: (agentId: string) => void;
}

interface Ticket {
  ticket_id: string;
  agent_id: string;
  hostname: string;
  metric_type: string;
  resource_key: string;
  severity: 'P1' | 'P2' | 'P3';
  current_value: number;
  threshold_value: number;
  status: 'Open' | 'Resolved';
  description: string;
  created_at: string;
  updated_at: string;
  service_now_incident?: string | null;
  service_now_status?: 'Created' | 'Failed' | null;
}

function severityClass(severity: string) {
  if (severity === 'P1') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (severity === 'P2') return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
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
      <h3 className="text-sm font-semibold text-zinc-700 mb-1 dark:text-zinc-200">No investigation tickets</h3>
      <p className="text-xs text-zinc-400 text-center max-w-xs leading-relaxed">
        Tickets will appear automatically when CPU, Memory, Network, or Disk utilization crosses defined thresholds.
      </p>
      <div className="flex items-center gap-2 mt-4 text-xs text-zinc-400">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        No active issues right now
      </div>
    </div>
  );
}

export default function InvestigatePage({ onOpenServer }: InvestigatePageProps) {
  const [status, setStatus] = useState<'Open' | 'Resolved' | 'All'>('Open');
  const [search, setSearch] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          status,
          q: search,
          page: '1',
          pageSize: '100',
        });
        const res = await fetch(`http://localhost:3001/api/investigate?${params.toString()}`);
        const data = await res.json();
        if (!ignore) setTickets(data?.tickets || []);
      } catch {
        if (!ignore) setTickets([]);
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
  }, [status, search]);

  return (
    <div className="space-y-6">
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Investigate Tickets</CardTitle>
              <CardDescription>Auto-generated investigation tickets from infrastructure utilization thresholds.</CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search host, ticket, metric"
                className="pl-8"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            {(['Open', 'Resolved', 'All'] as const).map((s) => (
              <Button key={s} variant={status === s ? 'default' : 'outline'} size="sm" onClick={() => setStatus(s)}>
                {s}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          {loading ? (
            <div className="py-14 text-center text-sm text-zinc-500">Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <EmptyState />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-zinc-100 dark:border-zinc-800">
                  <TableHead className="pl-6">Ticket</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Current %</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>ServiceNow</TableHead>
                  <TableHead className="pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow key={t.ticket_id}>
                    <TableCell className="pl-6 font-mono text-xs">{t.ticket_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={severityClass(t.severity)}>{t.severity}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{t.hostname}</TableCell>
                    <TableCell>{t.metric_type.toUpperCase()} ({t.resource_key})</TableCell>
                    <TableCell>{Number(t.current_value).toFixed(1)}%</TableCell>
                    <TableCell>{t.status}</TableCell>
                    <TableCell>
                      {t.service_now_incident ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          {t.service_now_incident}
                        </Badge>
                      ) : t.service_now_status === 'Failed' ? (
                        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Failed</Badge>
                      ) : (
                        <span className="text-xs text-zinc-400">Not created</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-6">
                      {t.metric_type === 'uptime' || t.metric_type === 'database_availability' ? (
                        <span className="text-xs text-zinc-400">N/A</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => onOpenServer(t.agent_id)}>
                          Open server
                        </Button>
                      )}
                    </TableCell>
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
