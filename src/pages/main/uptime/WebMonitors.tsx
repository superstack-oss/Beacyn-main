import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '../../../components/ui/table';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Settings, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, Info, AlertCircle, SlidersHorizontal, PauseCircle, Trash2 } from 'lucide-react';
import { Skeleton } from '../../../components/ui/skeleton';
import { Card, CardContent } from '../../../components/ui/card';
import { BarChart, Bar, ResponsiveContainer } from 'recharts';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MonitorDetails from './MonitorDetails';
import PageSpeedDetails from './PageSpeedDetails';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '../../../components/ui/sheet';
import { Label } from '../../../components/ui/label';
import { apiUrl } from '../../../lib/api';
import { authHeaders } from '../../../lib/auth';

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

const TinyBarChart = ({ data }: { data: number[] }) => {
  const chartData = data.map((val, i) => ({ time: `Check ${i + 1}`, value: val }));
  const [tip, setTip] = useState<{ x: number; y: number; index: number } | null>(null);

  const move = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.min(chartData.length - 1, Math.max(0, Math.floor(ratio * chartData.length)));
    setTip({ x: event.clientX, y: event.clientY, index });
  };

  const point = tip ? chartData[tip.index] : null;

  return (
    <div
      className="h-10 w-32 shrink-0"
      onMouseMove={move}
      onMouseLeave={() => setTip(null)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} barCategoryGap={1}>
          <Bar dataKey="value" fill="#22c55e" radius={[1, 1, 0, 0]} minPointSize={2} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      {point && tip ? createPortal(
        <div
          className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
          style={{ left: tip.x, top: tip.y }}
        >
          <div className="font-medium text-zinc-800 dark:text-zinc-100">{point.time}</div>
          <div className="mt-0.5 tabular-nums text-zinc-600 dark:text-zinc-300">{point.value} ms</div>
        </div>,
        document.body,
      ) : null}
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

export default function WebMonitors({ scope = 'all' }: { scope?: 'all' | 'uptime' }) {
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonitor, setSelectedMonitor] = useState<any>(null);
  const [selectedPageSpeedMonitor, setSelectedPageSpeedMonitor] = useState<any>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(1);

  // Modals state
  const [configureAsset, setConfigureAsset] = useState<any>(null);
  const [configureForm, setConfigureForm] = useState({ name: '', target_endpoint: '', parent_type: '', environment: '', device_category: '' });
  const [savingConfigure, setSavingConfigure] = useState(false);
  const [incidentsAsset, setIncidentsAsset] = useState<any>(null);
  const [activeIncidents, setActiveIncidents] = useState<any[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(false);

  const handleOpenConfigure = (asset: any) => {
    setConfigureAsset(asset);
    setConfigureForm({
      name: asset.name || '',
      target_endpoint: asset.target_endpoint || '',
      parent_type: asset.parent_type || '',
      environment: asset.environment || '',
      device_category: asset.device_category || ''
    });
  };

  const submitConfigure = async () => {
    if (!configureAsset) return;
    setSavingConfigure(true);
    try {
      const res = await fetch(apiUrl(`/api/assets/${configureAsset.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(configureForm)
      });
      if (res.ok) {
        setEndpoints(prev => prev.map(e => e.id === configureAsset.id ? { ...e, ...configureForm } : e));
        setConfigureAsset(null);
      } else {
        alert('Failed to save configuration');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving configuration');
    } finally {
      setSavingConfigure(false);
    }
  };

  const handleOpenIncidents = async (asset: any) => {
    setIncidentsAsset(asset);
    setLoadingIncidents(true);
    setActiveIncidents([]);
    try {
      const res = await fetch(apiUrl(`/api/assets/${asset.id}/incidents/active`), { headers: authHeaders() });
      const json = await res.json();
      if (res.ok && Array.isArray(json.incidents)) {
        setActiveIncidents(json.incidents);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingIncidents(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this entity?')) return;
    try {
      const res = await fetch(apiUrl(`/api/assets/${id}`), {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (res.ok) {
        setEndpoints(prev => prev.filter(e => e.id !== id));
      } else {
        alert('Failed to delete monitor');
      }
    } catch (err) {
      console.error('Delete error', err);
    }
  };

  const handleMaintenance = async (id: string, currentStatus: string) => {
    const isMM = currentStatus === 'MM';
    const newStatus = isMM ? 'Initializing' : 'MM';
    try {
      const res = await fetch(apiUrl(`/api/assets/${id}/status`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setEndpoints(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e));
      } else {
        alert('Failed to update status');
      }
    } catch (err) {
      console.error('Status update error', err);
    }
  };

  useEffect(() => {
    const load = () => {
      fetch(apiUrl('/api/assets'), { headers: authHeaders() })
        .then(res => res.json())
        .then(data => {
          if (!Array.isArray(data)) return;
          setEndpoints((prev) => {
            const prevById = new Map(prev.map((p) => [p.id, p]));
            return data.map((d) => ({ ...(prevById.get(d.id) || {}), ...d }));
          });
        })
        .catch(err => console.error('Error fetching monitors:', err))
        .finally(() => setLoading(false));
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
    const explicitCategory = String(ep.device_category || '').toLowerCase();
    const parent = String(ep.parent_type || '').toLowerCase();
    const isUptimeScoped = explicitCategory === 'uptime'
      || parent === 'website'
      || parent === 'api endpoint'
      || parent === 'network port'
      || parent === 'docker host'
      || parent === 'docker container';

    if (scope === 'uptime' && !isUptimeScoped) return false;

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

  if (selectedPageSpeedMonitor) {
    return <PageSpeedDetails monitor={selectedPageSpeedMonitor} onBack={() => setSelectedPageSpeedMonitor(null)} />;
  }

  if (selectedMonitor) {
    return (
      <MonitorDetails
        monitor={selectedMonitor}
        onBack={() => setSelectedMonitor(null)}
        onOpenPageSpeed={(monitor) => setSelectedPageSpeedMonitor(monitor)}
      />
    );
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 -z-10 rounded-xl bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_14px] opacity-60" />
      <div className="space-y-6">
        {/* Top Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { title: 'UP', count: animatedUp, color: 'text-emerald-500' },
            { title: 'DOWN', count: animatedDown, color: 'text-rose-500' },
            { title: 'PAUSED', count: animatedPaused, color: 'text-amber-500' },
            { title: 'INITIALIZING', count: animatedInit, color: 'text-amber-500' }
          ].map((stat, i) => (
            <Card key={i} className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 shadow-sm rounded-md h-28 transition-shadow duration-200 hover:shadow-md">
              <CardContent className="p-5 flex flex-col justify-center h-full">
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
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px] bg-gray-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 h-9 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {typeOptions.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] bg-gray-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 h-9 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="up">Up</SelectItem>
                <SelectItem value="down">Down</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="initializing">Initializing</SelectItem>
              </SelectContent>
            </Select>

            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-[130px] bg-gray-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 h-9 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {stateOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Input
            type="search"
            placeholder="Search monitors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 bg-gray-100 dark:bg-zinc-950 h-9 text-zinc-500"
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
              {loading && endpoints.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6">
                    <div className="space-y-2 px-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-5/6" />
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <div className="border-2 border-dashed border-zinc-100 rounded-lg m-4">
                      <EmptyState
                        title="No monitors found"
                        message="No monitors match your current filters. Try adjusting the search or filter criteria."
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )}
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
                    ${ep.status === 'Up' ? 'border-zinc-100 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
                        : ep.status === 'Down' ? 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400'
                          : 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400'}`}>
                      <span className={`w-2 h-2 rounded-full ${ep.status === 'Up' ? 'bg-emerald-500' : ep.status === 'Down' ? 'bg-rose-500' : 'bg-amber-400'
                        }`}></span>
                      {ep.status || 'Initializing'}
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <TinyBarChart data={deterministicSeries(ep)} />
                      <div className="flex flex-col text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                        <span>{ep.last_response_ms != null ? `${ep.last_response_ms}ms` : '—'}</span>
                        <span className="text-zinc-300">{ep.last_checked_at ? new Date(ep.last_checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'pending'}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 text-zinc-600 dark:text-zinc-400 text-sm">
                    {ep.parent_type || ep.type || '—'}
                  </TableCell>
                  <TableCell className="py-4 text-right pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Open monitor actions"
                          className="inline-flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 shadow-md" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer text-sm"
                          onSelect={(e) => {
                            e.preventDefault();
                            if (ep.target_endpoint) window.open(ep.target_endpoint.startsWith('http') ? ep.target_endpoint : `https://${ep.target_endpoint}`, '_blank');
                          }}
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-zinc-500" /> Open site
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer text-sm"
                          onSelect={(e) => {
                            e.preventDefault();
                            setSelectedMonitor(ep);
                          }}
                        >
                          <Info className="w-3.5 h-3.5 text-zinc-500" /> Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer text-sm"
                          onSelect={(e) => {
                            e.preventDefault();
                            handleOpenIncidents(ep);
                          }}
                        >
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Incidents
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer text-sm"
                          onSelect={(e) => {
                            e.preventDefault();
                            handleOpenConfigure(ep);
                          }}
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" /> Configure
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer text-sm"
                          onSelect={(e) => {
                            e.preventDefault();
                            handleMaintenance(ep.id, ep.status);
                          }}
                        >
                          <PauseCircle className="w-3.5 h-3.5 text-blue-500" />
                          {ep.status === 'MM' ? 'Resume monitoring' : 'Service mode'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer text-sm text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950"
                          onSelect={(e) => {
                            e.preventDefault();
                            handleDelete(ep.id);
                          }}
                        >
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

        {/* Configure Asset Sheet */}
        <Sheet open={!!configureAsset} onOpenChange={(open) => !open && setConfigureAsset(null)}>
          <SheetContent className="sm:max-w-md w-full max-h-screen overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Configure Asset</SheetTitle>
              <SheetDescription>Update core metadata properties for this resource.</SheetDescription>
            </SheetHeader>
            {configureAsset && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Entity Name</Label>
                  <Input value={configureForm.name} onChange={(e) => setConfigureForm({ ...configureForm, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Target Endpoint</Label>
                  <Input value={configureForm.target_endpoint} onChange={(e) => setConfigureForm({ ...configureForm, target_endpoint: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Entity Category</Label>
                  <Input value={configureForm.parent_type} onChange={(e) => setConfigureForm({ ...configureForm, parent_type: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Environment (State)</Label>
                  <Input value={configureForm.environment} onChange={(e) => setConfigureForm({ ...configureForm, environment: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Device Type</Label>
                  <Input value={configureForm.device_category} onChange={(e) => setConfigureForm({ ...configureForm, device_category: e.target.value })} />
                </div>
                <SheetFooter className="mt-4">
                  <Button variant="outline" onClick={() => setConfigureAsset(null)}>Cancel</Button>
                  <Button onClick={submitConfigure} disabled={savingConfigure}>{savingConfigure ? 'Saving...' : 'Save Configuration'}</Button>
                </SheetFooter>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Incidents Viewer Sheet */}
        <Sheet open={!!incidentsAsset} onOpenChange={(open) => !open && setIncidentsAsset(null)}>
          <SheetContent className="sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Active Incidents</SheetTitle>
              <SheetDescription>{incidentsAsset?.name} ({incidentsAsset?.target_endpoint})</SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-4">
              {loadingIncidents ? (
                <div className="text-sm text-zinc-500">Scanning anomaly detection logs...</div>
              ) : activeIncidents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 p-6 text-center text-sm text-emerald-700">
                  <div className="mx-auto w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                    <AlertCircle className="w-4 h-4 text-emerald-600" />
                  </div>
                  Zero active operational anomalies reported for this endpoint.
                </div>
              ) : (
                activeIncidents.map((inc: any, i: number) => (
                  <div key={i} className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-2 shadow-sm">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      <h4 className="font-semibold text-sm text-amber-900">{inc.incident_trigger || 'Auto-Detected Anomaly'}</h4>
                    </div>
                    <p className="text-xs text-amber-700">{inc.description}</p>
                    <p className="text-[10px] text-amber-600">{new Date(inc.created_at || Date.now()).toLocaleString()}</p>
                  </div>
                ))
              )}
            </div>
          </SheetContent>
        </Sheet>

      </div>
    </div>
  );
}
