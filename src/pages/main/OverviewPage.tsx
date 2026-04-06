import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Activity, Server, AlertTriangle, Clock, CheckCircle2, TrendingUp, Wifi } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiUrl } from '../../lib/api';

// ─── Empty state placeholder ─────────────────────────────────────────────────
function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      {/* Stacked card illustration */}
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

// ─── Status dot ──────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  const color = s === 'up' ? 'bg-emerald-500' : s === 'down' ? 'bg-rose-500' : 'bg-amber-400';
  return <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0 mt-1`} />;
}

// ─── Time formatter ──────────────────────────────────────────────────────────
function timeAgo(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function OverviewPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      fetch(apiUrl('/api/overview'))
        .then(r => r.json())
        .then(d => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  const statCards = [
    {
      label: 'Total Monitored',
      icon: Server,
      value: loading ? '—' : (data?.total ?? 0),
      sub: loading ? '' : `${data?.upCount ?? 0} up · ${data?.downCount ?? 0} down`,
      color: 'text-zinc-900 dark:text-zinc-50',
    },
    {
      label: 'Global Uptime',
      icon: Activity,
      value: loading ? '—' : (data?.globalUptimePct != null ? `${data.globalUptimePct}%` : '—'),
      sub: data?.globalUptimePct != null ? 'Based on all check history' : 'No checks yet',
      color: data?.globalUptimePct >= 95 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600',
    },
    {
      label: 'Assets Down',
      icon: AlertTriangle,
      value: loading ? '—' : (data?.downCount ?? 0),
      sub: data?.downCount > 0 ? 'Requires attention' : 'All healthy',
      color: data?.downCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Avg Response Time',
      icon: Clock,
      value: loading ? '—' : (data?.avgLatencyMs != null ? `${data.avgLatencyMs}ms` : '—'),
      sub: data?.avgLatencyMs != null ? 'Across checked assets' : 'No data yet',
      color: 'text-zinc-900 dark:text-zinc-50',
    },
  ];

  return (
    <div className="space-y-6">

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ label, icon: Icon, value, sub, color }) => (
          <Card key={label} className="border-zinc-200 dark:border-zinc-800 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{label}</CardTitle>
              <Icon className="w-4 h-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold tracking-tight ${color}`}>{value}</div>
              <p className="text-xs text-zinc-500 mt-1.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Latency trend chart */}
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" /> Average Response Time Trend
            </CardTitle>
            <span className="text-xs text-zinc-400">Last 24 hours · auto-refreshes every 60s</span>
          </div>
        </CardHeader>
        <CardContent className="h-[260px] pt-2">
          {!loading && (!data?.trend || data.trend.length === 0) ? (
            <div className="h-full border-2 border-dashed border-zinc-100 rounded-lg">
              <EmptyState
                title="No trend data yet"
                message="Response time trends will appear here once monitoring begins collecting data."
              />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.trend || []}>
                <defs>
                  <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} fontSize={11} tickMargin={8} />
                <YAxis axisLine={false} tickLine={false} fontSize={11} tickMargin={8} unit="ms" />
                <Tooltip
                  formatter={(v: any) => [`${v}ms`, 'Avg Response']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', fontSize: 12, boxShadow: '0 4px 6px -1px rgb(0 0 0/.08)' }}
                />
                <Area type="monotone" dataKey="latency" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorLatency)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bottom row: heatmap + recent down events */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Health Heatmap */}
        <Card className="lg:col-span-4 border-zinc-200 dark:border-zinc-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wifi className="w-4 h-4 text-blue-500" /> Monitor Health Map
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!loading && (!data?.assets || data.assets.length === 0) ? (
              <div className="border-2 border-dashed border-zinc-100 rounded-lg">
                <EmptyState
                  title="No assets registered"
                  message="Add assets from the Inventory page to see their health here."
                />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {(data?.assets || []).map((asset: any) => {
                    const s = (asset.status || '').toLowerCase();
                    const bg = s === 'up' ? 'bg-emerald-500 hover:bg-emerald-600' : s === 'down' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-amber-400 hover:bg-amber-500';
                    return (
                      <div
                        key={asset.id}
                        className={`h-4 w-4 rounded-[3px] ${bg} cursor-pointer transition-all`}
                        title={`${asset.name} (${asset.parent_type}) — ${asset.status || 'Unknown'}`}
                      />
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" /> Up</span>
                  <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-400" /> Initializing</span>
                  <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-rose-500" /> Down</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Down Events */}
        <Card className="lg:col-span-3 border-zinc-200 dark:border-zinc-800 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" /> Recent Down Events
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {!loading && (!data?.recentDown || data.recentDown.length === 0) ? (
              <div className="px-6 pb-4">
                <div className="border-2 border-dashed border-zinc-100 rounded-lg">
                  <EmptyState
                    title="No incidents recorded"
                    message="All monitors are healthy — down events will appear here when detected."
                  />
                </div>
                <div className="flex items-center gap-2 mt-3 text-xs text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> No active incidents
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-zinc-100">
                    <TableHead className="pl-6 text-xs font-semibold text-zinc-500/80 uppercase tracking-wider">Asset</TableHead>
                    <TableHead className="text-xs font-semibold text-zinc-500/80 uppercase tracking-wider">When</TableHead>
                    <TableHead className="pr-4 text-xs font-semibold text-zinc-500/80 uppercase tracking-wider">Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.recentDown || []).map((ev: any, i: number) => (
                    <TableRow key={i} className="border-b border-zinc-50">
                      <TableCell className="pl-6 py-3">
                        <div className="flex items-start gap-2">
                          <StatusDot status={ev.status} />
                          <div>
                            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{ev.asset_name}</div>
                            <div className="text-xs text-zinc-400">{ev.parent_type}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-zinc-500">{timeAgo(ev.timestamp)}</TableCell>
                      <TableCell className="py-3 pr-4 text-xs text-zinc-500 font-mono">
                        {ev.response_time_ms != null ? `${ev.response_time_ms}ms` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
