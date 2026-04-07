import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Settings, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, Info, AlertCircle, SlidersHorizontal, PauseCircle, Trash2 } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { BarChart, Bar, ResponsiveContainer } from 'recharts';
import { useState, useEffect } from 'react';
import MonitorDetails from './MonitorDetails';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { apiUrl } from '../../lib/api';

const TinyBarChart = ({ data }: { data: number[] }) => {
  const chartData = data.map((val, i) => ({ name: `T${i}`, value: val }));
  return (
    <div className="h-10 w-32 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} barCategoryGap={1}>
          <Bar dataKey="value" fill="#22c55e" radius={[1, 1, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

function deterministicSeries(ep: any) {
  const seedBase = Number(String(ep?.id || '0').replace(/\D/g, '').slice(-6) || 1);
  const base = Math.max(10, Number(ep?.last_response_ms || 80));
  return Array.from({ length: 20 }, (_, i) => {
    const wave = Math.sin((i + (seedBase % 11)) / 2.6) * 9;
    const drift = ((seedBase + i * 17) % 7) - 3;
    const v = Math.round(base + wave + drift);
    return Math.max(5, Math.min(2500, v));
  });
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return reduced;
}

function useCountUp(target: number, durationMs = 550, reduceMotion = false) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const end = Number(target || 0);
    if (reduceMotion) {
      setValue(end);
      return;
    }
    let raf = 0;
    const from = value;
    const diff = end - from;
    const t0 = performance.now();

    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + diff * eased);
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs, reduceMotion]);

  return Math.round(value);
}

export default function WebMonitors() {
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState<any>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = () => {
      fetch(apiUrl('/api/assets'))
        .then(res => res.json())
        .then(data => {
          if (!Array.isArray(data)) return;
          setEndpoints((prev) => {
            const prevById = new Map(prev.map((p) => [p.id, p]));
            return data.map((d) => ({ ...(prevById.get(d.id) || {}), ...d }));
          });
        })
        .catch(err => console.error('Error fetching monitors:', err));
    };
    load();
    const interval = setInterval(load, 30_000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const upCount = endpoints.filter(e => e.status?.toUpperCase() === 'UP').length;
  const downCount = endpoints.filter(e => e.status?.toUpperCase() === 'DOWN').length;
  const pausedCount = endpoints.filter(e => e.status?.toUpperCase() === 'PAUSED').length;
  const initCount = endpoints.filter(e => !e.status || e.status?.toUpperCase() === 'INITIALIZING').length;
  const prefersReducedMotion = usePrefersReducedMotion();
  const animatedUp = useCountUp(upCount, 550, prefersReducedMotion);
  const animatedDown = useCountUp(downCount, 550, prefersReducedMotion);
  const animatedPaused = useCountUp(pausedCount, 550, prefersReducedMotion);
  const animatedInit = useCountUp(initCount, 550, prefersReducedMotion);

  const typeOptions = Array.from(new Set(endpoints.map((e) => String(e.parent_type || e.type || 'Unknown'))));
  const stateOptions = Array.from(new Set(endpoints.map((e) => String(e.environment || 'Unknown'))));

  const filtered = endpoints.filter((ep) => {
    const epType = String(ep.parent_type || ep.type || 'Unknown');
    const epStatus = String(ep.status || 'Initializing').toLowerCase();
    const epState = String(ep.environment || 'Unknown');
    const q = search.trim().toLowerCase();

    if (typeFilter !== 'all' && epType !== typeFilter) return false;
    if (statusFilter !== 'all' && epStatus !== statusFilter) return false;
    if (stateFilter !== 'all' && epState !== stateFilter) return false;
    if (q) {
      const hay = `${ep.name || ''} ${ep.target_endpoint || ''} ${ep.id || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paged = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, statusFilter, stateFilter, search, rowsPerPage]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (selectedMonitor) {
    return <MonitorDetails monitor={selectedMonitor} onBack={() => setSelectedMonitor(null)} />;
  }

  return (
    <div className="space-y-6">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: 'UP', count: animatedUp, color: 'text-emerald-500' },
          { title: 'DOWN', count: animatedDown, color: 'text-rose-500' },
          { title: 'PAUSED', count: animatedPaused, color: 'text-amber-500' },
          { title: 'INITIALIZING', count: animatedInit, color: 'text-amber-500' }
        ].map((stat, i) => (
          <Card key={i} className="relative overflow-hidden bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 shadow-sm rounded-md h-28">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_14px] opacity-60"></div>
            <CardContent className="relative p-5 flex flex-col justify-center h-full">
              <div className="text-xs font-semibold text-zinc-500/80 dark:text-zinc-400 tracking-wide mb-1.5">{stat.title}</div>
              <div className={`text-4xl sm:text-5xl font-light tracking-tight transition-colors duration-500 ${stat.color}`}>
                {stat.count}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select defaultValue="type">
            <SelectTrigger className="w-[140px] bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 h-9 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" onSelect={() => setTypeFilter('all')}>All types</SelectItem>
              {typeOptions.map((t) => (
                <SelectItem key={t} value={t} onSelect={() => setTypeFilter(t)}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select defaultValue="status">
            <SelectTrigger className="w-[120px] bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 h-9 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" onSelect={() => setStatusFilter('all')}>All</SelectItem>
              <SelectItem value="up" onSelect={() => setStatusFilter('up')}>Up</SelectItem>
              <SelectItem value="down" onSelect={() => setStatusFilter('down')}>Down</SelectItem>
              <SelectItem value="paused" onSelect={() => setStatusFilter('paused')}>Paused</SelectItem>
              <SelectItem value="initializing" onSelect={() => setStatusFilter('initializing')}>Initializing</SelectItem>
            </SelectContent>
          </Select>

          <Select defaultValue="state">
            <SelectTrigger className="w-[130px] bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 h-9 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" onSelect={() => setStateFilter('all')}>All states</SelectItem>
              {stateOptions.map((s) => (
                <SelectItem key={s} value={s} onSelect={() => setStateFilter(s)}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Input 
          type="search" 
          placeholder="Search monitors..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 bg-white dark:bg-zinc-950 h-9 text-zinc-500"
        />
      </div>

      {/* Data Table */}
      <div className="border border-zinc-100 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-950 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-zinc-100 dark:border-zinc-800">
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80">NAME</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80">STATUS</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80">RESPONSE TIME</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80">TYPE</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 text-right pr-6">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((ep, i) => (
              <TableRow 
                key={i} 
                className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800 group cursor-pointer"
                onClick={() => setSelectedMonitor(ep)}
              >
                <TableCell className="font-medium text-zinc-800 dark:text-zinc-300 py-4">
                  {ep.name}
                </TableCell>
                <TableCell className="py-4">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-semibold shadow-sm
                    ${ ep.status === 'Up' ? 'border-zinc-100 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
                      : ep.status === 'Down' ? 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400'
                      : 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400' }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      ep.status === 'Up' ? 'bg-emerald-500' : ep.status === 'Down' ? 'bg-rose-500' : 'bg-amber-400'
                    }`}></span>
                    {ep.status || 'Initializing'}
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex items-center gap-3">
                    <TinyBarChart data={deterministicSeries(ep)} />
                    <div className="flex flex-col text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                      <span>{ep.last_response_ms != null ? `${ep.last_response_ms}ms` : '—'}</span>
                      <span className="text-zinc-300">{ep.last_checked_at ? new Date(ep.last_checked_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'pending'}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-4 text-zinc-600 dark:text-zinc-400 text-sm">
                  {ep.parent_type || ep.type || '—'}
                </TableCell>
                <TableCell className="py-4 text-right pr-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={(e) => e.stopPropagation()}
                        className="h-8 w-8 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border-zinc-100 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900"
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 shadow-md">
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer text-sm"
                        onSelect={(e) => e.preventDefault()}
                        onClick={() => ep.target_endpoint && window.open(
                          ep.target_endpoint.startsWith('http') ? ep.target_endpoint : `https://${ep.target_endpoint}`, '_blank'
                        )}
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-zinc-500" /> Open site
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer text-sm"
                        onSelect={(e) => e.preventDefault()}
                        onClick={() => setSelectedMonitor(ep)}
                      >
                        <Info className="w-3.5 h-3.5 text-zinc-500" /> Details
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 cursor-pointer text-sm">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Incidents
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 cursor-pointer text-sm">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" /> Configure
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 cursor-pointer text-sm">
                        <PauseCircle className="w-3.5 h-3.5 text-blue-500" /> Pause
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="gap-2 cursor-pointer text-sm text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Table Footer / Pagination */}
        <div className="flex items-center justify-end px-5 py-4 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-6 text-sm text-zinc-600 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="text-xs">Rows per page:</span>
              <Select defaultValue="10">
                <SelectTrigger className="h-8 w-[65px] text-xs border-zinc-100 shadow-sm bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10" onSelect={() => setRowsPerPage(10)}>10</SelectItem>
                  <SelectItem value="20" onSelect={() => setRowsPerPage(20)}>20</SelectItem>
                  <SelectItem value="50" onSelect={() => setRowsPerPage(50)}>50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="text-xs">
              {filtered.length === 0 ? 0 : ((page - 1) * rowsPerPage + 1)}-{Math.min(page * rowsPerPage, filtered.length)} of {filtered.length}
            </div>
            
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-xs" className={`h-8 w-8 ${page <= 1 ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={page <= 1} onClick={() => setPage(1)}>
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon-xs" className={`h-8 w-8 ${page <= 1 ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon-xs" className={`h-8 w-8 ${page >= totalPages ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon-xs" className={`h-8 w-8 ${page >= totalPages ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
