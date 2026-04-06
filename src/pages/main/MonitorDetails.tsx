import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { ChevronRight, Mail, Bug, TrendingUp, AlertTriangle, Gauge, Clock, RefreshCw } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, AreaChart, Area, XAxis, CartesianGrid } from 'recharts';
import { apiUrl } from '../../lib/api';

interface MonitorDetailsProps {
  monitor: any;
  onBack: () => void;
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

export default function MonitorDetails({ monitor, onBack }: MonitorDetailsProps) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('Recent');

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/assets/${monitor.id}/stats`));
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server returned ${res.status} — ${text.slice(0, 120)}`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStats(data);
    } catch (err: any) {
      console.error('Failed to fetch stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [monitor.id]);

  const statusColor = stats?.status === 'Up' ? 'bg-emerald-500' : 
                      stats?.status === 'Down' ? 'bg-rose-500' : 'bg-amber-500';

  const uptimeData = stats?.chartData
    ?.filter((d: any) => d.status === 'Up')
    ?.slice(-60)
    ?.map((d: any, i: number) => ({ name: `T${i}`, value: d.value })) || [];

  const downtimeData = stats?.chartData
    ?.filter((d: any) => d.status === 'Down')
    ?.slice(-60)
    ?.map((d: any, i: number) => ({ name: `T${i}`, value: d.value || 1 })) || [];

  const responseChartData = stats?.chartData?.slice(-30) || [];

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
          <button onClick={fetchStats} className="ml-auto shrink-0 underline font-semibold">Retry</button>
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
            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-zinc-600 font-normal" onClick={fetchStats}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="text-zinc-600 font-normal">
            <Mail className="w-4 h-4 mr-2" /> Test notifications
          </Button>
          <Button variant="outline" size="sm" className="text-zinc-600 font-normal">
            <Bug className="w-4 h-4 mr-2" /> Incidents
          </Button>
        </div>
      </div>

      {/* 4 Real Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Active For */}
        <Card className={`border-none shadow-sm rounded-md ${stats?.status === 'Up' ? 'bg-[#3b9f46]' : stats?.status === 'Down' ? 'bg-rose-600' : 'bg-zinc-400'} text-white`}>
          <CardContent className="p-4 flex flex-col justify-center h-24">
            <div className="text-sm font-medium text-white/80 mb-1">Active for</div>
            <div className="text-lg font-semibold tracking-tight leading-tight">
              {loading ? '...' : formatDuration(stats?.activeForMs)}
            </div>
          </CardContent>
        </Card>

        {/* Last Check */}
        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
          <CardContent className="p-4 flex flex-col justify-center h-24">
            <div className="text-sm font-medium text-zinc-500 mb-1">Last check</div>
            <div className="text-2xl font-semibold text-zinc-800 dark:text-zinc-100 tracking-tight">
              {loading ? '...' : (stats?.lastCheckAgo || 'Never')}
            </div>
          </CardContent>
        </Card>

        {/* Last Response Time */}
        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
          <CardContent className="p-4 flex flex-col justify-center h-24">
            <div className="text-sm font-medium text-zinc-500 mb-1">Last response time</div>
            <div className="text-2xl font-semibold text-zinc-800 dark:text-zinc-100 tracking-tight">
              {loading ? '...' : (stats?.lastResponseMs != null ? `${stats.lastResponseMs}ms` : '—')}
            </div>
          </CardContent>
        </Card>

        {/* SSL / Certificate Expiry */}
        <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
          <CardContent className="p-4 flex flex-col justify-center h-24">
            <div className="text-sm font-medium text-zinc-500 mb-1">Certificate expiry</div>
            <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 leading-snug">
              {loading ? '...' : (stats?.sslExpiry || 'N/A')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time range toggle */}
      <div className="flex items-center justify-end gap-3 pt-1">
        <span className="text-xs font-medium text-zinc-500">
          {stats ? `${stats.totalChecks} total checks` : 'Loading...'}
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

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
          <CardContent className="pt-3 px-2">
            <div className="h-28">
              {uptimeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={uptimeData} barCategoryGap={1}>
                    <Bar dataKey="value" fill="#449d44" radius={[1, 1, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                  {loading ? 'Loading...' : 'No uptime data yet'}
                </div>
              )}
            </div>
            {stats?.chartData?.length > 0 && (
              <div className="flex justify-between text-[10px] text-zinc-400 px-3 mt-1">
                <span>{new Date(stats.recentLogs[stats.recentLogs.length - 1]?.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                <span>{new Date(stats.recentLogs[0]?.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
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
          <CardContent className="pt-3 px-2">
            <div className="h-28">
              {downtimeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={downtimeData} barCategoryGap={1}>
                    <Bar dataKey="value" fill="#ef4444" radius={[1, 1, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                  {loading ? 'Loading...' : 'No downtime — great!'}
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
                <Gauge className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
              </div>
              Average response time
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-end h-[160px] relative px-6 pb-3">
            {/* CSS Semi-circle gauge */}
            <div className="relative w-full" style={{ height: '100px' }}>
              <div className="w-full overflow-hidden" style={{ height: '80px' }}>
                <div
                  className="w-full rounded-full border-[20px] border-[#3ebc5e]"
                  style={{
                    height: '160px',
                    borderBottomColor: 'transparent',
                    borderLeftColor: 'transparent',
                    transform: 'rotate(-45deg)',
                    position: 'relative',
                    top: 0
                  }}
                />
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
                <span className="text-base font-bold text-zinc-800 dark:text-white">
                  {loading ? '...' : responseLabel(stats?.avgResponseMs)}
                </span>
                <span className="text-base font-semibold text-zinc-700 dark:text-zinc-200">
                  {loading ? '...' : (stats?.avgResponseMs ? `${stats.avgResponseMs}ms` : '—')}
                </span>
              </div>
            </div>
            <div className="flex justify-between w-full text-[10px] font-semibold text-zinc-500 px-2">
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
          <div className="h-[200px] w-full pr-4 pb-4">
            {responseChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
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
                {loading ? 'Loading response data...' : 'No response data yet — waiting for first check'}
              </div>
            )}
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
            {!loading && stats?.recentLogs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-zinc-400 text-sm">
                  No check history yet — monitoring will begin shortly
                </TableCell>
              </TableRow>
            )}
            {stats?.recentLogs?.map((log: any, i: number) => (
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
      </div>
    </div>
  );
}
