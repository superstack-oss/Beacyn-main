import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Activity, Server, AlertTriangle, Clock, CheckCircle2, TrendingUp, Wifi, Database, Building2, Rows3, Globe2, ShieldAlert } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadialBarChart, RadialBar, PolarAngleAxis, BarChart, Bar } from 'recharts';
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

// ─── Status helpers ──────────────────────────────────────────────────────────
function normalizeHealth(status: string) {
  const s = (status || '').toLowerCase();
  if (['up', 'online', 'healthy', 'connected', 'active', 'reachable'].includes(s)) return 'Up';
  if (['down', 'offline', 'faulty', 'disconnected', 'inactive', 'unreachable'].includes(s)) return 'Down';
  return 'Initializing';
}

function StatusDot({ status }: { status: string }) {
  const s = normalizeHealth(status).toLowerCase();
  const color = s === 'up' ? 'bg-emerald-500' : s === 'down' ? 'bg-rose-500' : 'bg-amber-400';
  return <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0 mt-1`} />;
}

function domainTone(domain: any) {
  if ((domain?.down || 0) > 0) return 'border-rose-200 bg-rose-50/70 text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300';
  if ((domain?.healthy || 0) > 0) return 'border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300';
  return 'border-amber-200 bg-amber-50/70 text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300';
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

function DomainMiniVisualization({ domain }: { domain: any }) {
  const total = Math.max(1, Number(domain?.total || 0));
  const healthy = Number(domain?.healthy || 0);
  const down = Number(domain?.down || 0);
  const unknown = Math.max(0, Number(domain?.unknown || 0));
  const healthyPct = Math.round((healthy / total) * 100);
  const distribution = [
    { name: 'Healthy', value: healthy, fill: '#10b981' },
    { name: 'Attention', value: down, fill: '#f43f5e' },
    { name: 'Inventory', value: unknown, fill: '#f59e0b' },
  ].filter((item) => item.value > 0);
  const variant = domain?.key === 'infrastructure' || domain?.key === 'uptime'
    ? 'radial'
    : domain?.key === 'database' || domain?.key === 'racks'
      ? 'pie'
      : 'bar';

  if (variant === 'radial') {
    return (
      <div className="relative h-[92px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={92}>
          <RadialBarChart data={[{ name: 'Healthy', value: healthyPct, fill: '#10b981' }]} innerRadius="68%" outerRadius="100%" startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={999} background={{ fill: '#e5e7eb' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{healthyPct}%</span>
          <span className="text-[10px] text-zinc-500">healthy</span>
        </div>
      </div>
    );
  }

  if (variant === 'pie') {
    return (
      <div className="h-[92px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={92}>
          <PieChart>
            <Pie data={distribution.length ? distribution : [{ name: 'Inventory', value: 1, fill: '#f59e0b' }]} dataKey="value" innerRadius={20} outerRadius={34} paddingAngle={2} stroke="none">
              {(distribution.length ? distribution : [{ name: 'Inventory', value: 1, fill: '#f59e0b' }]).map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-[92px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={92}>
        <BarChart data={distribution.length ? distribution : [{ name: 'Inventory', value: 1, fill: '#f59e0b' }] }>
          <XAxis dataKey="name" hide />
          <YAxis hide />
          <Tooltip formatter={(value: any, _name: any, item: any) => [value, item?.payload?.name || 'Value']} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {(distribution.length ? distribution : [{ name: 'Inventory', value: 1, fill: '#f59e0b' }]).map((entry, index) => (
              <Cell key={`${entry.name}-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      try {
        const overviewRes = await fetch(apiUrl('/api/overview'));
        const overviewJson = await overviewRes.json();

        if (!ignore) {
          setData(overviewJson);
        }
      } catch {
        if (!ignore) {
          setData(null);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 60_000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  const statCards = useMemo(() => ([
    {
      label: 'Monitored Estate',
      icon: Server,
      value: loading ? '—' : (data?.summary?.totalEstate ?? data?.total ?? 0),
      sub: loading ? '' : `${data?.summary?.monitoredItems ?? 0} live monitored items across the portal`,
      color: 'text-zinc-900 dark:text-zinc-50',
    },
    {
      label: 'Global Uptime',
      icon: Activity,
      value: loading ? '—' : (data?.globalUptimePct != null ? `${data.globalUptimePct}%` : '—'),
      sub: data?.globalUptimePct != null ? 'Blended availability across infra, DB and uptime' : 'No telemetry yet',
      color: Number(data?.globalUptimePct ?? 0) >= 95 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Active Risks',
      icon: ShieldAlert,
      value: loading ? '—' : (data?.summary?.activeIssues ?? data?.downCount ?? 0),
      sub: (data?.summary?.activeIssues ?? data?.downCount ?? 0) > 0 ? 'Items currently needing attention' : 'No active operational risks',
      color: (data?.summary?.activeIssues ?? data?.downCount ?? 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Avg Response Time',
      icon: Clock,
      value: loading ? '—' : (data?.avgLatencyMs != null ? `${data.avgLatencyMs}ms` : '—'),
      sub: data?.avgLatencyMs != null ? 'Across uptime and database checks' : 'Awaiting latency data',
      color: 'text-zinc-900 dark:text-zinc-50',
    },
  ]), [data, loading]);

  const domainIcons: Record<string, any> = {
    infrastructure: Server,
    database: Database,
    datacenters: Building2,
    racks: Rows3,
    uptime: Globe2,
  };

  return (
    <div className="relative">
      <div className="absolute inset-0 -z-10 rounded-xl bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_14px] opacity-60" />
      <div className="space-y-6">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardDescription>
              Enterprise summary across infrastructure, databases, uptime assets, data centers, and rack inventory.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Last refreshed {timeAgo(data?.lastUpdatedAt || null)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1">
              <Server className="w-3.5 h-3.5 text-sky-500" />
              {data?.summary?.healthyItems ?? 0} healthy services
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              {data?.summary?.activeIssues ?? 0} active issues
            </span>
          </CardContent>
        </Card>

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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {(data?.domains || []).map((domain: any) => {
            const Icon = domainIcons[domain.key] || Server;
            return (
              <Card key={domain.key} className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Icon className="w-4 h-4 text-zinc-500" /> {domain.label}
                    </CardTitle>
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${domainTone(domain)}`}>
                      {domain.total}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-zinc-500">{domain.detail}</p>
                  <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50/70 p-2 dark:border-zinc-800 dark:bg-zinc-900/30">
                    <DomainMiniVisualization domain={domain} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Healthy {domain.healthy || 0}</span>
                    <span className="rounded-md bg-rose-50 px-2 py-0.5 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">Attention {domain.down || 0}</span>
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">Inventory {domain.unknown || 0}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" /> Average Response Time Trend
              </CardTitle>
              <span className="text-xs text-zinc-400">Last 24 hours</span>
            </div>
          </CardHeader>
          <CardContent className="h-[280px] min-h-[280px] min-w-0 pt-2">
            {!loading && (!data?.trend || data.trend.length === 0) ? (
              <div className="h-full border-2 border-dashed border-zinc-100 rounded-lg">
                <EmptyState
                  title="No trend data yet"
                  message="Response trends will appear here once live monitoring data is available."
                />
              </div>
            ) : (
              <div className="h-full min-h-[240px] min-w-0 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
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
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          <Card className="lg:col-span-4 border-zinc-200 dark:border-zinc-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Wifi className="w-4 h-4 text-blue-500" /> Estate Health Map
              </CardTitle>
              <CardDescription>Cross-domain view covering infrastructure, databases, uptime assets, data centers, and racks.</CardDescription>
            </CardHeader>
            <CardContent>
              {!loading && (!data?.assets || data.assets.length === 0) ? (
                <div className="border-2 border-dashed border-zinc-100 rounded-lg">
                  <EmptyState
                    title="No operational data yet"
                    message="As assets and agents start reporting, the estate health map will populate here."
                  />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {(data?.assets || []).map((asset: any) => {
                      const state = normalizeHealth(asset.status).toLowerCase();
                      const bg = state === 'up' ? 'bg-emerald-500 hover:bg-emerald-600' : state === 'down' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-amber-400 hover:bg-amber-500';
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
                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" /> Healthy</span>
                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-400" /> Configured / pending telemetry</span>
                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-rose-500" /> Needs attention</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-3 border-zinc-200 dark:border-zinc-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" /> Recent Attention Events
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {!loading && (!data?.recentDown || data.recentDown.length === 0) ? (
                <div className="px-6 pb-4">
                  <div className="border-2 border-dashed border-zinc-100 rounded-lg">
                    <EmptyState
                      title="No active incidents"
                      message="The monitored estate is currently stable. Attention items will appear here when detected."
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-xs text-emerald-600 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> No live service degradation
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-zinc-100">
                      <TableHead className="pl-6 text-xs font-semibold text-zinc-500/80 uppercase tracking-wider">Service</TableHead>
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
    </div>
  );
}
