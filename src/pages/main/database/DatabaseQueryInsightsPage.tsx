import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ArrowLeft, ChartColumn } from 'lucide-react';
import { apiUrl } from '../../../lib/api';

interface QueryInsightsProps {
  targetKey: string | null;
  onBack?: () => void;
}

interface QueryDigest {
  digest?: string;
  avgMs?: number | null;
  totalMs?: number | null;
  count?: number | null;
  errors?: number | null;
  rowsExamined?: number | null;
  noIndexUsed?: number | null;
  noGoodIndexUsed?: number | null;
}

interface DetailResponse {
  targetKey: string;
  latest: {
    targetName: string;
    targetType: string;
    engine: string | null;
    status: string;
    healthCategory: 'Healthy' | 'Warning' | 'Error' | null;
    collectedAt: string;
  };
  diagnostics: Record<string, any> | null;
  capabilityMatrix: Record<string, any> | null;
  qpsTrend: Array<{ time: string; value: number | null }>;
  tpsTrend: Array<{ time: string; value: number | null }>;
}

function fmtNum(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return 'N/A';
  return Number(value).toFixed(digits);
}

function getByPath(obj: any, path: string) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export default function DatabaseQueryInsightsPage({ targetKey, onBack }: QueryInsightsProps) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!targetKey) {
      setDetail(null);
      return;
    }

    let ignore = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl(`/api/databases/${encodeURIComponent(targetKey)}?limit=72`));
        if (!res.ok) throw new Error('details unavailable');
        const data = await res.json();
        if (!ignore) setDetail(data);
      } catch {
        if (!ignore) setDetail(null);
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
  }, [targetKey]);

  const query = detail?.diagnostics?.query || {};
  const topSlowQueries: QueryDigest[] = Array.isArray(query.topSlowQueries) ? query.topSlowQueries : [];
  const topFailedQueries: QueryDigest[] = Array.isArray(query.topFailedQueries) ? query.topFailedQueries : [];
  const topLargeQueries: QueryDigest[] = Array.isArray(query.topLargeQueries) ? query.topLargeQueries : [];
  const allQueries: QueryDigest[] = Array.isArray(query.performanceSchemaTopQueries)
    ? query.performanceSchemaTopQueries
    : (Array.isArray(query.topRunningQueries) ? query.topRunningQueries : []);

  const engineType = String(detail?.latest?.targetType || '').toLowerCase();
  const insightsCapabilityPath = engineType === 'mysql'
    ? 'featureSupported.queryDiagnostics.mysql.topRunningQueries'
    : engineType === 'postgres'
      ? 'featureSupported.queryDiagnostics.postgres.longRunningQueries'
      : engineType === 'mongodb'
        ? 'featureSupported.queryDiagnostics.mongodb.currentOperations'
        : engineType === 'oracle'
          ? 'featureSupported.queryDiagnostics.oracle.topSessions'
          : engineType === 'sqlserver'
            ? 'featureSupported.queryDiagnostics.sqlserver.longRunningQueries'
            : 'featureSupported.queryDiagnostics.mysql.topRunningQueries';
  const isSupported = getByPath(detail?.capabilityMatrix, insightsCapabilityPath) !== false;

  const statCards = [
    { label: 'Top Slow Queries', value: topSlowQueries.length },
    { label: 'Top Failed Queries', value: topFailedQueries.length },
    { label: 'Top Large Queries', value: topLargeQueries.length },
    { label: 'All Queries', value: allQueries.length },
  ];

  const categoryChartData = [
    { name: 'Slow', value: topSlowQueries.length },
    { name: 'Failed', value: topFailedQueries.length },
    { name: 'Large', value: topLargeQueries.length },
    { name: 'All', value: allQueries.length },
  ];

  const avgComparisonData = [
    {
      name: 'Slow',
      avgMs: topSlowQueries.length ? topSlowQueries.reduce((s, q) => s + Number(q.avgMs || 0), 0) / topSlowQueries.length : 0,
    },
    {
      name: 'Large',
      avgMs: topLargeQueries.length ? topLargeQueries.reduce((s, q) => s + Number(q.avgMs || 0), 0) / topLargeQueries.length : 0,
    },
    {
      name: 'All',
      avgMs: allQueries.length ? allQueries.reduce((s, q) => s + Number(q.avgMs || 0), 0) / allQueries.length : 0,
    },
  ];

  const rateTrendData = (detail?.qpsTrend || []).map((p, i) => ({
    time: p.time,
    qps: p.value,
    tps: detail?.tpsTrend?.[i]?.value ?? null,
  }));

  const comparisons = useMemo(() => {
    const slowAvg = topSlowQueries.length ? topSlowQueries.reduce((s, q) => s + Number(q.avgMs || 0), 0) / topSlowQueries.length : 0;
    const largeAvg = topLargeQueries.length ? topLargeQueries.reduce((s, q) => s + Number(q.avgMs || 0), 0) / topLargeQueries.length : 0;
    const failedTotalErrors = topFailedQueries.reduce((s, q) => s + Number(q.errors || 0), 0);
    return {
      slowAvg,
      largeAvg,
      failedTotalErrors,
      slowVsLargeDelta: slowAvg - largeAvg,
    };
  }, [topSlowQueries, topLargeQueries, topFailedQueries]);

  const noDataPlaceholder = 'No data available from the latest snapshots.';

  if (!targetKey) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="py-14 text-center text-sm text-zinc-500">Select a database target from Database list.</CardContent>
      </Card>
    );
  }

  if (loading && !detail) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="py-14 text-center text-sm text-zinc-500">Loading query insights...</CardContent>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="py-14 text-center text-sm text-zinc-500">Query insights unavailable.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to databases
          </button>
        ) : <span />}
        <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">
          <ChartColumn className="w-3.5 h-3.5 mr-1" />
          {detail.latest.targetName || detail.targetKey}
        </Badge>
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Query-Level Metrics (Insights)</CardTitle>
          <CardDescription>Top Slow Queries, Top Failed Queries, Top Large Queries, All Queries, Stats, Charts, and Comparison.</CardDescription>
        </CardHeader>
        <CardContent>
          {!isSupported ? (
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-4 text-sm text-zinc-500">Not supported on this engine</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-4">
              {statCards.map((item) => (
                <div key={item.label} className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">{item.label}</p>
                  <p className="text-2xl font-bold mt-1">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isSupported ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Query Category Distribution</CardTitle>
              <CardDescription>Count comparison across slow, failed, large, and total query sets.</CardDescription>
            </CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} />
                  <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} width={38} />
                  <Tooltip formatter={(value) => `${value}`} contentStyle={{ borderRadius: 10, border: '1px solid #d4d4d8' }} />
                  <Bar dataKey="value" fill="#0284c7" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Average Latency Comparison</CardTitle>
              <CardDescription>Average query time across top slow, large, and all query pools.</CardDescription>
            </CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={avgComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} />
                  <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} width={42} />
                  <Tooltip formatter={(value) => `${fmtNum(Number(value))} ms`} contentStyle={{ borderRadius: 10, border: '1px solid #d4d4d8' }} />
                  <Bar dataKey="avgMs" fill="#16a34a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Query Rate Trend</CardTitle>
              <CardDescription>QPS and TPS trend alignment from recent snapshots.</CardDescription>
            </CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={rateTrendData}>
                  <defs>
                    <linearGradient id="queryInsightsQpsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="queryInsightsTpsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} />
                  <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#71717a' }} width={38} />
                  <Tooltip formatter={(value, name) => value == null ? 'N/A' : `${name}: ${value}`} contentStyle={{ borderRadius: 10, border: '1px solid #d4d4d8' }} />
                  <Area type="monotone" dataKey="qps" stroke="#0284c7" fill="url(#queryInsightsQpsGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="tps" stroke="#16a34a" fill="url(#queryInsightsTpsGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {isSupported ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Top Slow Queries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {topSlowQueries.slice(0, 10).map((q, idx) => (
                <p key={`slow-${idx}`} className="truncate" title={q.digest}>{idx + 1}. {q.digest || noDataPlaceholder} ({fmtNum(q.avgMs)} ms)</p>
              ))}
              {!topSlowQueries.length ? <p className="text-zinc-500">{noDataPlaceholder}</p> : null}
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Top Failed Queries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {topFailedQueries.slice(0, 10).map((q, idx) => (
                <p key={`failed-${idx}`} className="truncate" title={q.digest}>{idx + 1}. {q.digest || noDataPlaceholder} (errors: {q.errors ?? 0})</p>
              ))}
              {!topFailedQueries.length ? <p className="text-zinc-500">{noDataPlaceholder}</p> : null}
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Top Large Queries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {topLargeQueries.slice(0, 10).map((q, idx) => (
                <p key={`large-${idx}`} className="truncate" title={q.digest}>{idx + 1}. {q.digest || noDataPlaceholder} (rows: {q.rowsExamined ?? 0})</p>
              ))}
              {!topLargeQueries.length ? <p className="text-zinc-500">{noDataPlaceholder}</p> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {isSupported ? (
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">All Queries</CardTitle>
            <CardDescription>Unified digest-level list used for query-level analysis.</CardDescription>
          </CardHeader>
          <CardContent>
            {!allQueries.length ? (
              <div className="py-4 text-sm text-zinc-500">{noDataPlaceholder}</div>
            ) : (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="max-h-[360px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-b border-zinc-100 dark:border-zinc-800 sticky top-0 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-sm z-10">
                        <TableHead className="pl-4 font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Query</TableHead>
                        <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase text-right">Frequency</TableHead>
                        <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase text-right">Avg Ms</TableHead>
                        <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase text-right">Total Ms</TableHead>
                        <TableHead className="pr-4 font-semibold text-xs tracking-wider text-zinc-500/80 uppercase text-right">No Index</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allQueries.map((q, idx) => (
                        <TableRow key={`${idx}-${q.digest || 'query'}`} className={`border-b border-zinc-100 dark:border-zinc-800/60 ${idx % 2 === 0 ? 'bg-zinc-50/20 dark:bg-zinc-900/15' : ''}`}>
                          <TableCell className="pl-4 py-3 max-w-[560px] truncate" title={q.digest}>{q.digest || noDataPlaceholder}</TableCell>
                          <TableCell className="text-right tabular-nums py-3">{q.count ?? 'N/A'}</TableCell>
                          <TableCell className="text-right tabular-nums py-3">{fmtNum(q.avgMs)}</TableCell>
                          <TableCell className="text-right tabular-nums py-3">{fmtNum(q.totalMs)}</TableCell>
                          <TableCell className="pr-4 text-right tabular-nums py-3">{Number(q.noIndexUsed || 0) + Number(q.noGoodIndexUsed || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {isSupported ? (
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Comparison And Stats</CardTitle>
            <CardDescription>Cross-check between slow, large, and failed query groups.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-zinc-500">Avg Slow Query Time</p>
              <p className="font-semibold mt-1">{fmtNum(comparisons.slowAvg)} ms</p>
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-zinc-500">Avg Large Query Time</p>
              <p className="font-semibold mt-1">{fmtNum(comparisons.largeAvg)} ms</p>
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-zinc-500">Slow vs Large Delta</p>
              <p className="font-semibold mt-1">{fmtNum(comparisons.slowVsLargeDelta)} ms</p>
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-zinc-500">Total Failed Errors</p>
              <p className="font-semibold mt-1">{comparisons.failedTotalErrors}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
