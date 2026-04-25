import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Activity, AlertTriangle, Brain, Database, Eye, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { apiUrl } from '../../../lib/api';

type Severity = 'critical' | 'warning' | 'info';

type TableStat = {
  name: string;
  available: boolean;
  count1h: number;
  lastSeenAt: string | null;
  notes: string[];
};

type Issue = {
  id: string;
  severity: Severity;
  source: string;
  title: string;
  detail: string;
  metric: string;
  value: number;
  threshold: number;
};

type ObservabilityResponse = {
  generatedAt: string;
  tables: TableStat[];
  metrics: {
    disconnectedDatabases: number;
    unhealthyHealthChecks: number;
    downMonitorEvents: number;
    openDiagnosticAlerts: number;
    avgDbLatencyMs: number;
    criticalSyslogEvents1h?: number;
  };
  observations: string[];
  issues: Issue[];
  ai: {
    enabled: boolean;
    used: boolean;
    provider: 'gemini' | 'openai';
    summary: string | null;
    error: string | null;
  };
};

const OBSERVABILITY_CACHE_KEY = 'portal-observability-summary-cache-v1';

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

function severityClass(severity: Severity) {
  if (severity === 'critical') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (severity === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-zinc-100 text-zinc-700 border-zinc-300';
}

function tableBadge(available: boolean) {
  return available
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-zinc-100 text-zinc-700 border-zinc-300';
}

function fmtTs(value: string | null) {
  if (!value) return 'N/A';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'N/A';
  return dt.toLocaleString('en-GB');
}

type InsightSection = {
  title: string;
  bullets: string[];
  paragraphs: string[];
};

function cleanInsightText(value: string) {
  return value
    .replace(/\*\*/g, '')
    .replace(/^\d+\)\s*/, '')
    .replace(/^[-•*]\s*/, '')
    .trim();
}

function parseInsightSections(summary?: string | null): InsightSection[] {
  if (!summary) return [];

  const lines = summary.split('\n').map((line) => line.trim());
  const sections: InsightSection[] = [];
  let current: InsightSection | null = null;

  const pushCurrent = () => {
    if (current && (current.title || current.bullets.length || current.paragraphs.length)) {
      sections.push(current);
    }
  };

  for (const rawLine of lines) {
    if (!rawLine) continue;

    const isHeader = /^\d+\)\s*(\*\*)?[^:]+(\*\*)?:\s*$/.test(rawLine)
      || /^\*\*[^*]+\*\*:?\s*$/.test(rawLine)
      || (/^[A-Z][A-Za-z\s/&-]+:\s*$/.test(rawLine) && rawLine.length < 80);

    if (isHeader) {
      pushCurrent();
      current = {
        title: cleanInsightText(rawLine).replace(/:$/, ''),
        bullets: [],
        paragraphs: [],
      };
      continue;
    }

    if (!current) {
      current = {
        title: 'Executive Summary',
        bullets: [],
        paragraphs: [],
      };
    }

    const cleaned = cleanInsightText(rawLine);
    if (/^[-•*]\s+/.test(rawLine)) {
      current.bullets.push(cleaned);
    } else {
      current.paragraphs.push(cleaned);
    }
  }

  pushCurrent();
  return sections;
}

export default function ObservabilityPage() {
  const [data, setData] = useState<ObservabilityResponse | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(OBSERVABILITY_CACHE_KEY);
      return raw ? JSON.parse(raw) as ObservabilityResponse : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(!data);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl('/api/observability/summary'));
        const json = await res.json();
        if (!ignore) {
          setData(json);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(OBSERVABILITY_CACHE_KEY, JSON.stringify(json));
          }
        }
      } catch {
        if (!ignore && !data) setData(null);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    if (!data || refreshTick > 0) {
      load();
    }

    return () => {
      ignore = true;
    };
  }, [refreshTick]);

  const counters = useMemo(() => {
    const issues = data?.issues || [];
    return {
      total: issues.length,
      critical: issues.filter((i) => i.severity === 'critical').length,
      warning: issues.filter((i) => i.severity === 'warning').length,
      info: issues.filter((i) => i.severity === 'info').length,
    };
  }, [data]);

  const statCards = [
    {
      label: 'Active Issues',
      value: loading ? '...' : String(counters.total),
      sub: `${counters.critical} critical · ${counters.warning} warning`,
      icon: AlertTriangle,
      tone: counters.critical > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-50',
      iconTone: 'text-rose-500',
    },
    {
      label: 'Disconnected DBs',
      value: loading ? '...' : String(data?.metrics?.disconnectedDatabases ?? 0),
      sub: 'Database connectivity signals',
      icon: Database,
      tone: (data?.metrics?.disconnectedDatabases ?? 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-50',
      iconTone: 'text-sky-500',
    },
    {
      label: 'Health Check Failures',
      value: loading ? '...' : String(data?.metrics?.unhealthyHealthChecks ?? 0),
      sub: 'Active failing health checks',
      icon: ShieldCheck,
      tone: (data?.metrics?.unhealthyHealthChecks ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-50',
      iconTone: 'text-emerald-500',
    },
    {
      label: 'Avg DB Latency',
      value: loading ? '...' : `${Number(data?.metrics?.avgDbLatencyMs || 0).toFixed(1)} ms`,
      sub: 'Database monitor logs · last 1h',
      icon: Activity,
      tone: 'text-zinc-900 dark:text-zinc-50',
      iconTone: 'text-violet-500',
    },
    {
      label: 'Critical Syslog Events',
      value: loading ? '...' : String(data?.metrics?.criticalSyslogEvents1h ?? 0),
      sub: 'Syslog severity 0–2 from infra devices · last 1h',
      icon: Eye,
      tone: (data?.metrics?.criticalSyslogEvents1h ?? 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-50',
      iconTone: 'text-orange-500',
    },
  ];

  const signalBreakdown = [
    { label: 'Down monitor events', value: data?.metrics?.downMonitorEvents ?? 0 },
    { label: 'Diagnostic alerts', value: data?.metrics?.openDiagnosticAlerts ?? 0 },
    { label: 'Critical syslog events', value: data?.metrics?.criticalSyslogEvents1h ?? 0 },
    { label: 'Informational signals', value: counters.info },
    { label: 'Source tables online', value: (data?.tables || []).filter((t) => t.available).length },
  ];

  const aiSections = useMemo(() => parseInsightSections(data?.ai?.summary), [data?.ai?.summary]);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808014_1px,transparent_1px),linear-gradient(to_bottom,#80808014_1px,transparent_1px)] bg-[size:14px_14px] dark:hidden" />
      <div className="pointer-events-none absolute inset-0 -z-10 hidden dark:block bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:14px_14px]" />
      <div className="mx-auto max-w-7xl space-y-6">
        <Card className="overflow-hidden border-zinc-200 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/85">
          <div className="h-1 w-full bg-gradient-to-r from-sky-500 via-violet-500 to-emerald-500" />
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI-Powered Observability
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Observability Command Center</h1>
                  <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-300">
                    Unified health intelligence across database monitors, diagnostics, health checks, and automated anomaly detection.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300">
                    On-demand refresh
                  </Badge>
                  <Badge variant="outline" className="border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                    Last update · {fmtTs(data?.generatedAt || null)}
                  </Badge>
                  <Badge variant="outline" className={data?.ai?.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'}>
                    {data?.ai?.enabled ? `${String(data?.ai?.provider || 'AI').toUpperCase()} enabled` : 'AI disabled'}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setRefreshTick((v) => v + 1)} disabled={loading}>
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  {data ? 'Regenerate Summary' : 'Generate Summary'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {statCards.map(({ label, value, sub, icon: Icon, tone, iconTone }) => (
            <Card key={label} className="border-zinc-200 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/85">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
                    <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900">
                    <Icon className={`h-4 w-4 ${iconTone}`} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-zinc-500">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-zinc-200 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/85">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2"><Brain className="w-4 h-4 text-violet-500" />AI Insight</CardTitle>
                <CardDescription>Executive summary, top risks, likely causes, and guided follow-up from the observability engine.</CardDescription>
              </div>
              <Badge variant="outline" className={data?.ai?.used ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'}>
                {data?.ai?.used ? 'Live summary' : 'Fallback analysis'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-zinc-500">Loading AI summary...</p>
            ) : !data ? (
              <p className="text-sm text-zinc-500">Observability data unavailable.</p>
            ) : data.ai?.used && data.ai.summary ? (
              <div className="space-y-3">
                {aiSections.length > 0 ? aiSections.map((section, idx) => (
                  <div key={`${section.title}-${idx}`} className="rounded-xl border border-violet-100 bg-violet-50/50 p-4 dark:border-violet-900/40 dark:bg-violet-950/20">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{section.title}</h3>
                    {section.paragraphs.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {section.paragraphs.map((paragraph, paragraphIndex) => (
                          <p key={paragraphIndex} className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">{paragraph}</p>
                        ))}
                      </div>
                    ) : null}
                    {section.bullets.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {section.bullets.map((bullet, bulletIndex) => (
                          <li key={bulletIndex} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-500" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )) : (
                  <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4 text-sm leading-6 text-zinc-700 dark:border-violet-900/40 dark:bg-violet-950/20 dark:text-zinc-300">
                    {cleanInsightText(data.ai.summary)}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-zinc-700 dark:text-zinc-200">AI summary is currently unavailable. Live platform observations are shown below.</p>
                <p className="text-xs text-zinc-500">{data.ai?.error || 'AI integration disabled.'}</p>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Platform Observations</h3>
                  <ul className="mt-3 space-y-2">
                    {(data.observations || []).slice(0, 6).map((obs, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <Eye className="mt-0.5 h-3.5 w-3.5 text-zinc-400" />
                        <span>{obs}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/85">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-500" />Signal Breakdown</CardTitle>
            <CardDescription>Operational health across major observability streams.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {signalBreakdown.map((item) => (
                <div key={item.label} className="rounded-lg border border-zinc-200 px-3 py-3 text-sm dark:border-zinc-800">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{item.label}</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">{loading ? '...' : item.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/85">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />Observed Issues</CardTitle>
                <CardDescription>Prioritized incidents surfaced from observability and diagnostics pipelines.</CardDescription>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-900">Critical: {counters.critical}</span>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-900">Warning: {counters.warning}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-zinc-500">Loading observability insights...</p>
            ) : !data || !data.issues.length ? (
              <div className="rounded-lg border-2 border-dashed border-zinc-100 dark:border-zinc-800">
                <EmptyState
                  title="No active issues detected"
                  message="All monitored systems are within thresholds. Issues will appear here when anomalies are detected."
                />
              </div>
            ) : (
              data.issues.map((issue) => (
                <div key={issue.id} className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{issue.title}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{issue.detail}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                        <span className="rounded-full border border-zinc-200 px-2 py-0.5 dark:border-zinc-700">Source: {issue.source}</span>
                        <span className="rounded-full border border-zinc-200 px-2 py-0.5 dark:border-zinc-700">Metric: {issue.metric}</span>
                        <span className="rounded-full border border-zinc-200 px-2 py-0.5 dark:border-zinc-700">Value: {issue.value}</span>
                        <span className="rounded-full border border-zinc-200 px-2 py-0.5 dark:border-zinc-700">Threshold: {issue.threshold}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className={severityClass(issue.severity)}>{issue.severity}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/85">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Database className="w-4 h-4 text-sky-500" />Source Table Health</CardTitle>
            <CardDescription>Coverage, freshness, and ingestion visibility for monitored data sources.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {!loading && (!data?.tables || data.tables.length === 0) && (
                <div className="sm:col-span-2 xl:col-span-3 rounded-lg border-2 border-dashed border-zinc-100 dark:border-zinc-800">
                  <EmptyState
                    title="No source tables available"
                    message="Coverage and freshness data will appear here once monitoring tables are populated."
                  />
                </div>
              )}
              {(data?.tables || []).map((t) => (
                <div key={t.name} className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t.name}</p>
                    <Badge variant="outline" className={tableBadge(t.available)}>{t.available ? 'Available' : 'Missing'}</Badge>
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs text-zinc-500">
                    <p>Rows in last 1h: <span className="font-medium text-zinc-700 dark:text-zinc-200">{t.count1h}</span></p>
                    <p>Last seen: <span className="font-medium text-zinc-700 dark:text-zinc-200">{fmtTs(t.lastSeenAt)}</span></p>
                  </div>
                  {t.notes?.length ? (
                    <ul className="mt-3 space-y-1.5 border-t border-zinc-100 pt-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                      {t.notes.slice(0, 2).map((note, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-zinc-400" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
