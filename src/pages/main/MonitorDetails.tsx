import { Fragment, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { ChevronRight, Bug, TrendingUp, AlertTriangle, Gauge, Clock, RefreshCw, Network, ShieldCheck, Globe, Server, MailCheck, Info } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, AreaChart, Area, XAxis, CartesianGrid } from 'recharts';
import { apiUrl } from '../../lib/api';

interface MonitorDetailsProps {
  monitor: any;
  onBack: () => void;
}

interface ErrorGuideEntry {
  id: string;
  errorName: string;
  errorCode: string;
  keywords: string[];
  causes: string[];
  troubleshooting: string[];
}

interface ActiveTicket {
  ticket_id: string;
  agent_id: string;
  hostname: string;
  metric_type: string;
  resource_key: string;
  severity: 'P1' | 'P2' | 'P3' | string;
  status: string;
  description: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

// Format milliseconds into "Xd Xh Xm Xs"
function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const totalSecs = Math.floor(ms / 1000);
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

// Response time quality label
function responseLabel(ms: number): string {
  if (ms === 0 || ms == null) return '—';
  if (ms < 200) return 'Excellent';
  if (ms < 500) return 'Good';
  if (ms < 1000) return 'Fair';
  return 'Slow';
}

function renderMaybeMs(v: any): string {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return `${Math.round(Number(v))}ms`;
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

function useCountUp(target: number | null, durationMs = 650, reduceMotion = false) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const end = Number(target ?? 0);
    if (!Number.isFinite(end)) {
      setValue(0);
      return;
    }

    if (reduceMotion) {
      setValue(end);
      return;
    }

    let raf = 0;
    const startValue = value;
    const diff = end - startValue;
    const t0 = performance.now();

    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      // Ease-out cubic for subtle animation.
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(startValue + diff * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs, reduceMotion]);

  return value;
}

function clamp(num: number, min: number, max: number) {
  return Math.max(min, Math.min(max, num));
}

function InfoHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        title={text}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 bg-white dark:bg-zinc-900"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-72 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-lg p-2.5 text-[11px] leading-5 text-zinc-600 dark:text-zinc-300">
          {text}
        </div>
      )}
    </div>
  );
}

function getTracerouteHint(diagnostics: any): string | null {
  const hops = diagnostics?.traceroute?.hops || [];
  if (!hops.length) {
    return 'No traceroute hops were returned from this probe. This can indicate strict filtering, blocked ICMP/UDP probes, or a hard-down endpoint.';
  }

  const lastHop = String(hops[hops.length - 1] || '');
  const hopNoMatch = lastHop.match(/^(\d+)/);
  const ipMatch = lastHop.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  const hopNo = hopNoMatch?.[1] || '?';
  const ip = ipMatch?.[1] || 'unknown IP';
  return `Traceroute reached hop ${hopNo} (${ip}) before failure symptoms. Validate routing, ACLs, or gateway policy near this segment.`;
}

function selectErrorGuide(entries: ErrorGuideEntry[], diagnostics: any, recentLogs: any[]): ErrorGuideEntry | null {
  const latestDown = (recentLogs || []).find((l: any) => String(l?.status || '').toLowerCase() === 'down');
  const text = [
    diagnostics?.availability?.errorCode,
    diagnostics?.availability?.errorMessage,
    diagnostics?.availability?.message,
    latestDown?.message,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!text) return null;

  let winner: ErrorGuideEntry | null = null;
  let bestScore = 0;
  for (const entry of entries || []) {
    const hits = (entry.keywords || []).reduce((acc, kw) => acc + (text.includes(String(kw).toLowerCase()) ? 1 : 0), 0);
    if (hits > bestScore) {
      bestScore = hits;
      winner = entry;
    }
  }

  return bestScore > 0 ? winner : null;
}

export default function MonitorDetails({ monitor, onBack }: MonitorDetailsProps) {
  const [stats, setStats] = useState<any>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('Recent');
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [checksPage, setChecksPage] = useState(1);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [rootCauseFilter, setRootCauseFilter] = useState('ALL');
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);

  const [ruleThreshold, setRuleThreshold] = useState('high');
  const [ruleConsecutive, setRuleConsecutive] = useState(3);
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [errorGuideEntries, setErrorGuideEntries] = useState<ErrorGuideEntry[]>([]);
  const [incidentsOpen, setIncidentsOpen] = useState(false);
  const [activeTickets, setActiveTickets] = useState<ActiveTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);

  const fetchStats = async (forceInitial = false) => {
    if (forceInitial || !stats) setInitialLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(apiUrl(`/api/assets/${monitor.id}/stats`));
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server returned ${res.status} — ${text.slice(0, 120)}`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStats(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch stats:', err);
      setError(err.message);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  };

  const fetchDiagnosticsHistory = async (page = 1, category = rootCauseFilter) => {
    setHistoryLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: '10' });
      if (category && category !== 'ALL') q.set('category', category);
      const res = await fetch(apiUrl(`/api/assets/${monitor.id}/diagnostics/history?${q.toString()}`));
      if (!res.ok) throw new Error(`History request failed (${res.status})`);
      const data = await res.json();
      setHistoryRows(data.history || []);
      setHistoryPage(data.page || 1);
      setHistoryTotalPages(data.totalPages || 1);
      setHistoryTotal(data.total || 0);
      setExpandedHistoryId(null);
    } catch (err: any) {
      setError((prev) => prev || err.message || 'Failed to load diagnostics history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchAlertRules = async () => {
    try {
      const res = await fetch(apiUrl(`/api/assets/${monitor.id}/diagnostics/alerts/rules`));
      if (!res.ok) return;
      const data = await res.json();
      const rules = data?.rules || [];
      const chosen = rules.find((r: any) => r.asset_id === monitor.id) || rules[0];
      if (chosen) {
        setRuleThreshold(String(chosen.severity_threshold || 'high'));
        setRuleConsecutive(Number(chosen.consecutive_runs || 3));
        setRuleEnabled(Boolean(chosen.enabled));
      }
    } catch {
      // Non-blocking: rules panel is optional.
    }
  };

  const saveAlertRule = async () => {
    setRuleSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/assets/${monitor.id}/diagnostics/alerts/rules`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          severityThreshold: ruleThreshold,
          consecutiveRuns: ruleConsecutive,
          enabled: ruleEnabled,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to save alert rule (${res.status}) — ${text.slice(0, 120)}`);
      }
      await fetchStats();
    } catch (err: any) {
      setError(err.message || 'Failed to save diagnostics alert rule');
    } finally {
      setRuleSaving(false);
    }
  };

  const fetchActiveTickets = async () => {
    setTicketsLoading(true);
    setTicketsError(null);
    try {
      const res = await fetch(apiUrl(`/api/assets/${monitor.id}/incidents/active`));
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch incidents (${res.status}) — ${text.slice(0, 120)}`);
      }
      const data = await res.json();
      setActiveTickets(Array.isArray(data?.activeTickets) ? data.activeTickets : []);
    } catch (err: any) {
      setTicketsError(err.message || 'Failed to fetch active incidents');
    } finally {
      setTicketsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(true);
    const interval = setInterval(fetchStats, 30_000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [monitor.id]);

  useEffect(() => {
    fetchDiagnosticsHistory(1, rootCauseFilter);
    fetchAlertRules();
  }, [monitor.id, rootCauseFilter]);

  useEffect(() => {
    const loadErrorGuide = async () => {
      try {
        const res = await fetch('/error-knowledge-base.json');
        if (!res.ok) return;
        const data = await res.json();
        setErrorGuideEntries(Array.isArray(data?.entries) ? data.entries : []);
      } catch {
        setErrorGuideEntries([]);
      }
    };
    loadErrorGuide();
  }, []);

  useEffect(() => {
    if (incidentsOpen) fetchActiveTickets();
  }, [incidentsOpen, monitor.id]);

  const normalizedStatus = String(stats?.status || '').toLowerCase();
  const statusColor = normalizedStatus === 'up' ? 'bg-emerald-500' : 
                      normalizedStatus === 'down' ? 'bg-rose-500' : 'bg-amber-500';

  const allLogs = stats?.recentLogs || [];
  const now = Date.now();
  const rangeMs =
    timeRange === 'Day' ? 24 * 60 * 60 * 1000 :
    timeRange === 'Week' ? 7 * 24 * 60 * 60 * 1000 :
    timeRange === 'Month' ? 30 * 24 * 60 * 60 * 1000 :
    null;

  const filteredLogsDesc = rangeMs
    ? allLogs.filter((l: any) => {
        const ts = new Date(l.timestamp).getTime();
        return Number.isFinite(ts) && now - ts <= rangeMs;
      })
    : allLogs.slice(0, 60);

  const filteredLogsAsc = [...filteredLogsDesc].reverse();

  const uptimeData = filteredLogsAsc
    .filter((d: any) => String(d.status).toLowerCase() === 'up')
    .slice(-60)
    .map((d: any, i: number) => ({ name: `T${i}`, value: d.response_time_ms || 1 }));

  const downtimeData = filteredLogsAsc
    .filter((d: any) => String(d.status).toLowerCase() === 'down')
    .slice(-60)
    .map((d: any, i: number) => ({ name: `T${i}`, value: 1 + Math.min(99, Number(d.response_time_ms || 0)) }));

  const responseChartData = filteredLogsAsc
    .slice(-30)
    .map((l: any) => ({
      time: new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: l.response_time_ms || 0,
      status: l.status,
    }));
  const diagnostics = stats?.diagnostics;
  const summary = diagnostics?.summary;
  const selectedGuide = selectErrorGuide(errorGuideEntries, diagnostics, stats?.recentLogs || []);
  const tracerouteHint = getTracerouteHint(diagnostics);
  const prefersReducedMotion = usePrefersReducedMotion();
  const animatedLastResponseMs = useCountUp(stats?.lastResponseMs != null ? Number(stats.lastResponseMs) : 0, 600, prefersReducedMotion);
  const animatedAvgResponseMs = useCountUp(stats?.avgResponseMs != null ? Number(stats.avgResponseMs) : 0, 700, prefersReducedMotion);
  const checksPageSize = 10;
  const totalCheckPages = Math.max(1, Math.ceil((filteredLogsDesc.length || 0) / checksPageSize));
  const pagedLogs = filteredLogsDesc.slice((checksPage - 1) * checksPageSize, checksPage * checksPageSize);

  useEffect(() => {
    if (checksPage > totalCheckPages) {
      setChecksPage(totalCheckPages);
    }
  }, [checksPage, totalCheckPages]);

  const severityClass = (sev: string) => {
    if (sev === 'critical') return 'border-rose-300 text-rose-800 bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:bg-rose-950/40';
    if (sev === 'high') return 'border-orange-300 text-orange-800 bg-orange-50 dark:border-orange-900 dark:text-orange-300 dark:bg-orange-950/40';
    if (sev === 'medium') return 'border-amber-300 text-amber-800 bg-amber-50 dark:border-amber-900 dark:text-amber-300 dark:bg-amber-950/40';
    if (sev === 'low') return 'border-emerald-300 text-emerald-800 bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:bg-emerald-950/40';
    return 'border-zinc-300 text-zinc-700 bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:bg-zinc-900/40';
  };

  const runDiagnosticsNow = async () => {
    setRunningDiagnostics(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/assets/${monitor.id}/diagnostics/run`), { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Diagnostics run failed (${res.status}) — ${text.slice(0, 120)}`);
      }
      const payload = await res.json();
      setStats((prev: any) => ({
        ...(prev || {}),
        diagnostics: payload.diagnostics,
        snapshotComparison: payload.snapshotComparison,
        activeAlerts: payload.activeAlerts || [],
      }));
      await fetchDiagnosticsHistory(1, rootCauseFilter);
    } catch (err: any) {
      setError(err.message || 'Diagnostics execution failed');
    } finally {
      setRunningDiagnostics(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-blue-500 hover:underline font-medium">Uptime</button>
        <ChevronRight className="w-4 h-4 text-zinc-400" />
        <span className="text-blue-500 font-medium">Details</span>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <span className="font-semibold">Failed to load stats:</span>
          <span className="break-all">{error}</span>
          <button onClick={() => fetchStats(false)} className="ml-auto shrink-0 underline font-semibold">Retry</button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">{monitor.name}</h1>
          <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 flex-wrap">
            <span className={`w-3.5 h-3.5 rounded-full ${statusColor}`}></span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 break-all">{monitor.target_endpoint}</span>
            <span className="text-zinc-400">•</span>
            <span className="text-sm">Checking every 1 minute</span>
            {(initialLoading || refreshing) && <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-zinc-600 font-normal" onClick={() => fetchStats(false)}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="text-zinc-700 font-medium" onClick={runDiagnosticsNow} disabled={runningDiagnostics}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${runningDiagnostics ? 'animate-spin' : ''}`} />
            {runningDiagnostics ? 'Running diagnostics...' : 'Run full diagnostics now'}
          </Button>
          <Button variant="outline" size="sm" className="text-zinc-600 font-normal" onClick={() => setIncidentsOpen(true)}>
            <Bug className="w-4 h-4 mr-2" /> Incidents
          </Button>
        </div>
      </div>

      <Sheet open={incidentsOpen} onOpenChange={setIncidentsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0">
          <SheetHeader className="border-b border-zinc-200 dark:border-zinc-800">
            <SheetTitle>Active tickets</SheetTitle>
            <SheetDescription>
              Open incident tickets for {monitor.name}
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 space-y-3 overflow-y-auto">
            {ticketsLoading && (
              <div className="text-sm text-zinc-500">Loading active tickets...</div>
            )}
            {!ticketsLoading && ticketsError && (
              <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50/80 dark:bg-rose-950/30 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                {ticketsError}
              </div>
            )}
            {!ticketsLoading && !ticketsError && activeTickets.length === 0 && (
              <div className="text-sm text-zinc-500">No active tickets for this monitor.</div>
            )}
            {!ticketsLoading && !ticketsError && activeTickets.length > 0 && (
              <div className="space-y-2">
                {activeTickets.map((ticket) => (
                  <div key={ticket.ticket_id} className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{ticket.ticket_id}</div>
                      <span className="text-[11px] uppercase tracking-wide px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300">
                        {ticket.severity || 'unknown'}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{ticket.description || 'No description available.'}</div>
                    <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      Host: {ticket.hostname || '—'} | Agent: {ticket.agent_id || '—'}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Metric: {ticket.metric_type || '—'} | Resource: {ticket.resource_key || '—'}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Last seen: {ticket.last_seen_at ? new Date(ticket.last_seen_at).toLocaleString() : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* 4 Real Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Active For */}
        <Card className={`border-none shadow-sm rounded-md transition-colors duration-500 ${stats?.status === 'Up' ? 'bg-[#3b9f46]' : stats?.status === 'Down' ? 'bg-rose-600' : 'bg-zinc-400'} text-white`}>
          <CardContent className="p-4 flex flex-col justify-center h-24">
            <div className="text-sm font-medium text-white/80 mb-1">Active for</div>
            <div className="text-lg font-semibold tracking-tight leading-tight">
              {initialLoading ? '...' : formatDuration(stats?.activeForMs)}
            </div>
          </CardContent>
        </Card>

        {/* Last Check */}
        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
          <CardContent className="p-4 flex flex-col justify-center h-24">
            <div className="text-sm font-medium text-zinc-500 mb-1">Last check</div>
            <div className="text-2xl font-semibold text-zinc-800 dark:text-zinc-100 tracking-tight">
              {initialLoading ? '...' : (stats?.lastCheckAgo || 'Never')}
            </div>
          </CardContent>
        </Card>

        {/* Last Response Time */}
        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
          <CardContent className="p-4 flex flex-col justify-center h-24">
            <div className="text-sm font-medium text-zinc-500 mb-1">Last response time</div>
            <div className="text-2xl font-semibold text-zinc-800 dark:text-zinc-100 tracking-tight transition-colors duration-500">
              {initialLoading ? '...' : (stats?.lastResponseMs != null ? `${Math.round(animatedLastResponseMs)}ms` : '—')}
            </div>
          </CardContent>
        </Card>

        {/* SSL / Certificate Expiry */}
        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
          <CardContent className="p-4 flex flex-col justify-center h-24">
            <div className="text-sm font-medium text-zinc-500 mb-1">Certificate expiry</div>
            <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 leading-snug">
              {initialLoading ? '...' : (stats?.sslExpiry || 'N/A')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time range toggle */}
      <div className="flex items-center justify-end gap-3 pt-1">
        <span className="text-xs font-medium text-zinc-500">
          {stats ? `${filteredLogsDesc.length} checks in ${timeRange}` : 'Loading...'}
        </span>
        <div className="flex bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden shadow-sm">
          {['Recent', 'Day', 'Week', 'Month'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-5 py-1.5 text-xs font-semibold border-r last:border-r-0 border-zinc-200 dark:border-zinc-800 transition-colors
                ${timeRange === range
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50'
                  : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}
            >{range}</button>
          ))}
        </div>
      </div>

      {/* 3-column Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

        {/* Uptime Bar Chart */}
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <div className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700">
                <TrendingUp className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
              </div>
              Uptime
            </CardTitle>
            <div className="text-xs text-zinc-500 mt-1">Total checks: {stats?.upChecks ?? '—'}</div>
          </CardHeader>
          <CardContent className="pt-3 px-2 pb-3 h-[200px] flex flex-col">
            <div className="flex-1 min-h-[170px] min-w-0 w-full">
              {uptimeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={112}>
                  <BarChart data={uptimeData} barCategoryGap={1}>
                    <Bar dataKey="value" fill="#449d44" radius={[1, 1, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                  {initialLoading ? 'Loading...' : 'No uptime data in selected range'}
                </div>
              )}
            </div>
            {filteredLogsDesc.length > 0 && (
              <div className="flex justify-between text-[10px] text-zinc-400 px-3 mt-2">
                <span>{new Date(filteredLogsDesc[filteredLogsDesc.length - 1]?.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                <span>{new Date(filteredLogsDesc[0]?.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Downtime */}
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <div className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700">
                <AlertTriangle className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
              </div>
              Downtime
            </CardTitle>
            <div className="text-xs text-zinc-500 mt-1">Total checks: {stats?.downChecks ?? '—'}</div>
          </CardHeader>
          <CardContent className="pt-3 px-2 pb-3 h-[200px] flex flex-col">
            <div className="flex-1 min-h-[170px] min-w-0 w-full">
              {downtimeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={112}>
                  <BarChart data={downtimeData} barCategoryGap={1}>
                    <Bar dataKey="value" fill="#ef4444" radius={[1, 1, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                  {initialLoading ? 'Loading...' : 'No downtime in selected range'}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Average Response Gauge */}
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <div className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700">
                <Gauge className="w-3.5 h-2.5 text-zinc-600 dark:text-zinc-400" />
              </div>
              Average response time
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-end h-[230px] relative px-5 pb-3">
            <div className="relative w-full max-w-[640px] mx-auto" style={{ height: '194px' }}>
              {(() => {
                const ms = Number(stats?.avgResponseMs || 0);
                const clamped = clamp(ms, 0, 2000);
                const progress = clamped / 2000;
                const radius = 142;
                const cx = 210;
                const cy = 164;
                const halfCirc = Math.PI * radius;
                const dashOffset = halfCirc * (1 - progress);
                const theta = Math.PI * (1 - progress);
                const markerX = cx + radius * Math.cos(theta);
                const markerY = cy - radius * Math.sin(theta);
                return (
                  <svg viewBox="0 0 420 180" className="w-full h-full" aria-hidden="true">
                    <defs>
                      <linearGradient id="avgGaugeTrack" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#d1fae5" />
                        <stop offset="100%" stopColor="#86efac" />
                      </linearGradient>
                      <linearGradient id="avgGaugeValue" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#2e7d32" />
                        <stop offset="100%" stopColor="#1f6f2a" />
                      </linearGradient>
                    </defs>
                    <path
                      d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
                      fill="none"
                      stroke="url(#avgGaugeTrack)"
                      strokeWidth="22"
                      strokeLinecap="round"
                    />
                    <path
                      d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
                      fill="none"
                      stroke="url(#avgGaugeValue)"
                      strokeWidth="22"
                      strokeLinecap="round"
                      strokeDasharray={halfCirc}
                      strokeDashoffset={dashOffset}
                      className={prefersReducedMotion ? '' : 'transition-[stroke-dashoffset] duration-700 ease-out'}
                    />
                    <circle cx={markerX} cy={markerY} r="5.5" fill="#14532d" opacity={progress > 0 ? 1 : 0} />
                  </svg>
                );
              })()}
              <div className="absolute inset-0 flex flex-col items-center justify-center pt-10">
                <span className="text-base font-bold text-zinc-800 dark:text-white">
                  {initialLoading ? '...' : responseLabel(animatedAvgResponseMs)}
                </span>
                <span className="text-base font-semibold text-zinc-700 dark:text-zinc-200">
                  {initialLoading ? '...' : (stats?.avgResponseMs ? `${Math.round(animatedAvgResponseMs)}ms` : '—')}
                </span>
              </div>
            </div>
            <div className="flex justify-between w-full text-[10px] font-semibold text-zinc-500 px-2 mt-1">
              <span>Low</span>
              <span>High</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Response Time Chart */}
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
        <CardHeader className="py-4 border-b border-zinc-100 dark:border-zinc-800">
          <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
            <div className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700">
              <Clock className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
            </div>
            Response times
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-4">
          <div className="h-[200px] min-h-[200px] min-w-0 w-full pr-4 pb-4">
            {responseChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                <AreaChart data={responseChartData}>
                  <defs>
                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.4} />
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#71717a' }}
                    dy={10}
                    minTickGap={40}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorVal)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-zinc-400">
                {initialLoading ? 'Loading response data...' : 'No response data in selected range'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Advanced Diagnostics */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-700 dark:text-zinc-300 uppercase">Advanced diagnostics</h2>
          <span className="text-xs text-zinc-500">Network, DNS, mail auth, security, performance</span>
        </div>

        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-semibold uppercase ${severityClass(summary?.severity || 'info')}`}>
                Severity: {summary?.severity || 'info'}
              </span>
              <span className="inline-flex px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-600 dark:text-zinc-300">
                Monitor status: {diagnostics?.availability?.status || 'Unknown'}
              </span>
              <span className="inline-flex px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-600 dark:text-zinc-300">
                Probe kind: {diagnostics?.availability?.kind || 'unknown'}
              </span>
            </div>
            <div className="text-sm text-zinc-700 dark:text-zinc-200">
              <span className="font-semibold">Probable cause:</span> {summary?.probableCause || 'No probable cause available yet.'}
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/70 dark:bg-zinc-900/40 text-xs space-y-2">
              <div className="font-semibold text-zinc-700 dark:text-zinc-200">Error details and troubleshooting</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <div className="text-zinc-500">Error</div>
                  <div className="text-zinc-700 dark:text-zinc-300">{selectedGuide?.errorName || diagnostics?.availability?.errorMessage || 'No active error detected'}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Error code</div>
                  <div className="text-zinc-700 dark:text-zinc-300">{selectedGuide?.errorCode || diagnostics?.availability?.errorCode || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Scope</div>
                  <div className="text-zinc-700 dark:text-zinc-300">{diagnostics?.target?.category || 'Generic monitor'}</div>
                </div>
              </div>

              {selectedGuide ? (
                <>
                  <div>
                    <div className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">Likely causes</div>
                    <div className="space-y-1 text-zinc-600 dark:text-zinc-300">
                      {selectedGuide.causes.map((c) => (
                        <div key={c}>- {c}</div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">Troubleshooting steps</div>
                    <div className="space-y-1 text-zinc-600 dark:text-zinc-300">
                      {selectedGuide.troubleshooting.map((s) => (
                        <div key={s}>- {s}</div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-zinc-600 dark:text-zinc-300">
                  No specific error pattern matched yet. Keep collecting checks and rerun diagnostics for a more precise recommendation.
                </div>
              )}

              {diagnostics?.availability?.status === 'Down' && tracerouteHint && (
                <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2 text-zinc-600 dark:text-zinc-300">
                  {tracerouteHint}
                </div>
              )}
            </div>
            {stats?.activeAlerts?.length > 0 && (
              <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50/80 dark:bg-rose-950/30 p-2 text-xs text-rose-700 dark:text-rose-300 space-y-1">
                <div className="font-semibold">Active diagnostics alerts</div>
                {stats.activeAlerts.map((a: any) => (
                  <div key={a.id}>
                    {a.summary} (rule: {a.severity_threshold} x{a.consecutive_runs})
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2 grid grid-cols-1 md:grid-cols-5 gap-2 text-xs items-end">
              <div>
                <div className="text-zinc-500 mb-1">Alert threshold</div>
                <select value={ruleThreshold} onChange={(e) => setRuleThreshold(e.target.value)} className="w-full border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 bg-white dark:bg-zinc-900">
                  {['critical', 'high', 'medium', 'low'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div className="text-zinc-500 mb-1">Consecutive runs</div>
                <input type="number" min={1} max={10} value={ruleConsecutive} onChange={(e) => setRuleConsecutive(Math.max(1, Number(e.target.value || 1)))} className="w-full border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 bg-white dark:bg-zinc-900" />
              </div>
              <div className="md:col-span-2 flex items-center gap-2 pt-5">
                <input id="rule-enabled" type="checkbox" checked={ruleEnabled} onChange={(e) => setRuleEnabled(e.target.checked)} />
                <label htmlFor="rule-enabled" className="text-zinc-600 dark:text-zinc-300">Enable alert rule</label>
              </div>
              <div className="md:text-right">
                <Button size="sm" variant="outline" onClick={saveAlertRule} disabled={ruleSaving}>
                  {ruleSaving ? 'Saving...' : 'Save rule'}
                </Button>
              </div>
            </div>
            {(stats?.snapshotComparison?.latest || stats?.snapshotComparison?.lastGood) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2 bg-zinc-50/70 dark:bg-zinc-900/40">
                  <div className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">Current snapshot</div>
                  <div>Severity: {stats?.snapshotComparison?.latest?.severity || '—'}</div>
                  <div>Status: {stats?.snapshotComparison?.latest?.monitor_status || '—'}</div>
                  <div className="text-zinc-500">{stats?.snapshotComparison?.latest?.probable_cause || 'No details available'}</div>
                </div>
                <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2 bg-zinc-50/70 dark:bg-zinc-900/40">
                  <div className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">Last known good</div>
                  <div>Severity: {stats?.snapshotComparison?.lastGood?.severity || '—'}</div>
                  <div>Status: {stats?.snapshotComparison?.lastGood?.monitor_status || '—'}</div>
                  <div className="text-zinc-500">{stats?.snapshotComparison?.lastGood?.probable_cause || 'No healthy baseline snapshot yet'}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  <Network className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                  Traceroute
                </CardTitle>
                <InfoHint text="Traceroute maps network hops between the probe and target. It helps identify where packet loss or latency increases along the path." />
              </div>
            </CardHeader>
            <CardContent className="pt-2 text-xs space-y-2">
              <div className="text-zinc-500">{initialLoading ? 'Loading...' : (diagnostics?.traceroute?.summary || diagnostics?.traceroute?.error || 'No traceroute data')}</div>
              {diagnostics?.traceroute?.notice && (
                <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/50 p-2 text-zinc-600 dark:text-zinc-300">
                  {diagnostics.traceroute.notice}
                </div>
              )}
              <div className="max-h-40 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-2 font-mono text-[11px] leading-5 text-zinc-600 dark:text-zinc-300">
                {(diagnostics?.traceroute?.hops?.length
                  ? diagnostics.traceroute.hops
                  : ['No hops available']
                ).map((hop: string, i: number) => (
                  <div key={i}>{hop}</div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                  Domain DNS validation
                </CardTitle>
                <InfoHint text="DNS validation checks whether authoritative records resolve consistently (A/AAAA/CNAME/NS/SOA/TXT/CAA). Misconfigurations here commonly cause outages." />
              </div>
            </CardHeader>
            <CardContent className="pt-2 text-xs space-y-2 text-zinc-600 dark:text-zinc-300">
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded border text-[11px] font-semibold ${diagnostics?.dns?.valid ? 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900' : 'border-amber-200 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900'}`}>
                  {diagnostics?.dns?.valid ? 'Valid' : 'Needs attention'}
                </span>
                <span className="text-zinc-500 break-all">Host: {diagnostics?.target?.host || '—'}</span>
              </div>
              <div>A: {(diagnostics?.dns?.records?.a || []).slice(0, 3).join(', ') || '—'}</div>
              <div>AAAA: {(diagnostics?.dns?.records?.aaaa || []).slice(0, 2).join(', ') || '—'}</div>
              <div>CNAME: {(diagnostics?.dns?.records?.cname || []).slice(0, 2).join(', ') || '—'}</div>
              <div>SOA NS: {diagnostics?.dns?.records?.soa?.nsname || '—'}</div>
              {(diagnostics?.dns?.issues || []).length > 0 && (
                <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/30 p-2 text-amber-800 dark:text-amber-300">
                  {(diagnostics?.dns?.issues || []).join(' | ')}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  <MailCheck className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                  MX, NS, DMARC
                </CardTitle>
                <InfoHint text="MX/NS/DMARC checks validate mail routing and domain authentication posture. These signals help identify email reachability and spoofing-policy gaps." />
              </div>
            </CardHeader>
            <CardContent className="pt-2 text-xs space-y-2 text-zinc-600 dark:text-zinc-300">
              <div>NS: {(diagnostics?.ns?.records || []).slice(0, 4).join(', ') || '—'}</div>
              <div>MX records: {(diagnostics?.mx?.records || []).length || 0}</div>
              <div className="space-y-1">
                {(diagnostics?.mx?.connectivity?.length
                  ? diagnostics.mx.connectivity
                  : [{ host: 'No MX connectivity data', ok: false }]
                ).map((m: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded border border-zinc-200 dark:border-zinc-800 px-2 py-1">
                    <span className="truncate pr-2">{m.host}</span>
                    <span className={m.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                      {m.ok ? `Open (${renderMaybeMs(m.latencyMs)})` : (m.error || 'Failed')}
                    </span>
                  </div>
                ))}
              </div>
              {diagnostics?.mx?.notice && (
                <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/50 p-2 text-zinc-600 dark:text-zinc-300">
                  {diagnostics.mx.notice}
                </div>
              )}
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2">
                <div className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">DMARC</div>
                <div>Valid: {diagnostics?.dmarc?.valid ? 'Yes' : 'No'}</div>
                <div>Policy: {diagnostics?.dmarc?.policy || '—'}</div>
                <div>Pct: {diagnostics?.dmarc?.pct || '—'}</div>
                <div className="break-all">RUA: {diagnostics?.dmarc?.rua || '—'}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                  Security checks
                </CardTitle>
                <InfoHint text="Security checks validate HTTPS/TLS and key response-security headers. Missing or weak controls can increase risk and sometimes break client connectivity." />
              </div>
            </CardHeader>
            <CardContent className="pt-2 text-xs space-y-2 text-zinc-600 dark:text-zinc-300">
              <div className="flex items-center gap-2">
                <span className="inline-flex px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 font-semibold">
                  Score: {diagnostics?.security?.score ?? '—'}
                </span>
                <span>HTTPS: {diagnostics?.security?.https ? 'Yes' : 'No'}</span>
              </div>
              <div>Status code: {diagnostics?.security?.statusCode ?? '—'}</div>
              <div>TLS expires in: {diagnostics?.security?.tls?.daysRemaining != null ? `${diagnostics.security.tls.daysRemaining} days` : '—'}</div>
              <div>
                Missing headers: {(diagnostics?.security?.missingHeaders || []).length > 0
                  ? diagnostics.security.missingHeaders.join(', ')
                  : 'None'}
              </div>
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2">
                <div className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">Header snapshot</div>
                <div>HSTS: {diagnostics?.security?.headers?.hsts ? 'Present' : 'Missing'}</div>
                <div>CSP: {diagnostics?.security?.headers?.csp ? 'Present' : 'Missing'}</div>
                <div>X-Frame-Options: {diagnostics?.security?.headers?.xFrameOptions ? 'Present' : 'Missing'}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <Server className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              Performance breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
              {[
                ['DNS', renderMaybeMs(diagnostics?.performance?.dnsMs)],
                ['TCP', renderMaybeMs(diagnostics?.performance?.tcpMs)],
                ['TLS', renderMaybeMs(diagnostics?.performance?.tlsMs)],
                ['TTFB', renderMaybeMs(diagnostics?.performance?.ttfbMs)],
                ['Total', renderMaybeMs(diagnostics?.performance?.totalMs)],
                ['Bytes', diagnostics?.performance?.bytes != null ? `${diagnostics.performance.bytes}` : '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2 bg-zinc-50/60 dark:bg-zinc-900/40">
                  <div className="text-zinc-500 mb-1">{label}</div>
                  <div className="font-semibold text-zinc-700 dark:text-zinc-200">{value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
        <CardHeader className="pb-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Diagnostics history timeline</CardTitle>
            <div className="flex items-center gap-1 flex-wrap">
              {['ALL', 'DNS', 'Network', 'TLS', 'App', 'Policy'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setRootCauseFilter(cat)}
                  className={`px-2 py-1 rounded border text-[11px] font-semibold ${rootCauseFilter === cat
                    ? 'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20">
                <TableHead className="text-xs uppercase text-zinc-500/80">Time</TableHead>
                <TableHead className="text-xs uppercase text-zinc-500/80">Severity</TableHead>
                <TableHead className="text-xs uppercase text-zinc-500/80">Category</TableHead>
                <TableHead className="text-xs uppercase text-zinc-500/80">Source</TableHead>
                <TableHead className="text-xs uppercase text-zinc-500/80">Probable cause</TableHead>
                <TableHead className="text-xs uppercase text-zinc-500/80">Diff</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!historyLoading && historyRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-zinc-400 text-sm">No diagnostics history available for this filter yet.</TableCell>
                </TableRow>
              )}
              {historyRows.map((row: any) => (
                <Fragment key={row.id}>
                  <TableRow key={row.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <TableCell className="text-xs text-zinc-500">{new Date(row.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-semibold uppercase">{row.severity}</TableCell>
                    <TableCell className="text-xs">{row.rootCauseCategory}</TableCell>
                    <TableCell className="text-xs">{row.triggerSource}</TableCell>
                    <TableCell className="text-xs text-zinc-600 dark:text-zinc-300">{row.probableCause}</TableCell>
                    <TableCell className="text-xs">
                      <button className="underline text-zinc-600 dark:text-zinc-300" onClick={() => setExpandedHistoryId((v) => (v === row.id ? null : row.id))}>
                        {expandedHistoryId === row.id ? 'Hide diff' : 'View diff'}
                      </button>
                    </TableCell>
                  </TableRow>
                  {expandedHistoryId === row.id && (
                    <TableRow key={`${row.id}-diff`} className="bg-zinc-50/60 dark:bg-zinc-900/40">
                      <TableCell colSpan={6} className="text-xs text-zinc-600 dark:text-zinc-300">
                        <div className="space-y-1 py-1">
                          {(row.diff || []).map((d: string, i: number) => (
                            <div key={i}>- {d}</div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between pt-3 text-xs text-zinc-500">
            <span>{historyTotal} snapshots</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchDiagnosticsHistory(Math.max(1, historyPage - 1), rootCauseFilter)} disabled={historyPage <= 1 || historyLoading}>Prev</Button>
              <span>Page {historyPage} / {historyTotalPages}</span>
              <Button variant="outline" size="sm" onClick={() => fetchDiagnosticsHistory(Math.min(historyTotalPages, historyPage + 1), rootCauseFilter)} disabled={historyPage >= historyTotalPages || historyLoading}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Check History Table */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20">
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Status</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Date & Time</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Message</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Response Time</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Status Code</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!initialLoading && filteredLogsDesc.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-zinc-400 text-sm">
                  No check history yet — monitoring will begin shortly
                </TableCell>
              </TableRow>
            )}
            {pagedLogs.map((log: any, i: number) => (
              <TableRow key={i} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800">
                <TableCell className="py-3">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-semibold shadow-sm
                    ${log.status === 'Up'
                      ? 'border-zinc-100 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
                      : 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400'}`}>
                    <span className={`w-2 h-2 rounded-full ${log.status === 'Up' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    {log.status}
                  </div>
                </TableCell>
                <TableCell className="py-3 text-zinc-500 text-sm">
                  {new Date(log.timestamp).toLocaleString('en-US', {
                    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </TableCell>
                <TableCell className="py-3 text-zinc-600 dark:text-zinc-400 text-sm">{log.message}</TableCell>
                <TableCell className="py-3 text-zinc-600 dark:text-zinc-400 text-sm">
                  {log.response_time_ms != null ? `${log.response_time_ms}ms` : '—'}
                </TableCell>
                <TableCell className="py-3 text-zinc-600 dark:text-zinc-400 text-sm">{log.status_code || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
          <span>
            Showing {filteredLogsDesc.length === 0 ? 0 : ((checksPage - 1) * checksPageSize + 1)}-
            {Math.min(checksPage * checksPageSize, filteredLogsDesc.length)} of {filteredLogsDesc.length}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setChecksPage((p) => Math.max(1, p - 1))} disabled={checksPage <= 1}>Prev</Button>
            <span>Page {checksPage} / {totalCheckPages}</span>
            <Button variant="outline" size="sm" onClick={() => setChecksPage((p) => Math.min(totalCheckPages, p + 1))} disabled={checksPage >= totalCheckPages}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
