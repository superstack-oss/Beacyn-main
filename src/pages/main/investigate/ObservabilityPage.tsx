import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { AlertTriangle, Brain, Gauge, RefreshCw, Radar, ShieldAlert, Siren, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiUrl } from '../../../lib/api';
import { authHeaders, getStoredUser } from '../../../lib/auth';

type Severity = 'critical' | 'warning' | 'info';
type Heat = 'low' | 'moderate' | 'high' | 'critical';

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

type DomainSummary = {
  domain: string;
  healthy: number;
  degraded: number;
  down: number;
  avgUptimePct: number;
  avgResponseMs: number;
};

type AttentionEntity = {
  id: string;
  name: string;
  domain: string;
  status: string;
  riskLevel: 'critical' | 'high' | 'medium';
  riskScore: number;
  likelyCause: string;
  predictedRisk: string;
  lastCheckedAt: string | null;
};

type Anomaly = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  domain: string;
  confidence: number;
};

type Prediction = {
  id: string;
  title: string;
  detail: string;
  horizon: string;
  confidence: number;
};

type ObservabilityResponse = {
  generatedAt: string;
  nextAnalysisAt: string;
  analysisWindowMinutes: number;
  placeholder: {
    isEmpty: boolean;
    title: string;
    message: string;
  };
  summary: {
    overallInfrastructureScore: number;
    overallServiceDisruptionPct: number;
    avgNetworkLatencyMs: number;
    peakNetworkLatencyMs: number;
    operationalSignalHeat: Heat;
    entitiesMonitored: number;
    entitiesNeedingAttention: number;
    activeIncidents: number;
    entitiesWithTelemetry: number;
    entitiesWithTelemetryGap: number;
  };
  operationalSignals: {
    downMonitorEvents1h: number;
    openDiagnosticAlerts: number;
    criticalInfrastructureEvents1h: number;
    highContainerStressEvents1h: number;
    snmpTrapBurstEvents1h: number;
    criticalSyslogEvents1h: number;
  };
  serviceDomains: DomainSummary[];
  entitiesNeedingAttention: AttentionEntity[];
  anomalies: Anomaly[];
  predictions: Prediction[];
  observations: string[];
  issues: Issue[];
  highlights: {
    immediateAttention: string[];
    painPoints: string[];
    keyFindings: string[];
  };
  ai: {
    enabled: boolean;
    used: boolean;
    provider: 'gemini' | 'openai';
    summary: string | null;
    error: string | null;
  };
};

const CACHE_KEY = 'portal-observability-summary-cache-v4';
const AUTO_REFRESH_MS = 60 * 1000;

function fmtTs(value: string | null) {
  if (!value) return 'N/A';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'N/A';
  return dt.toLocaleString('en-GB');
}

function heatClass(heat: Heat) {
  if (heat === 'critical') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (heat === 'high') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (heat === 'moderate') return 'bg-sky-50 text-sky-700 border-sky-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function riskClass(level: AttentionEntity['riskLevel']) {
  if (level === 'critical') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (level === 'high') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-sky-50 text-sky-700 border-sky-200';
}

function anomalyClass(severity: Severity) {
  if (severity === 'critical') return 'bg-rose-50 border-rose-200 text-rose-700';
  if (severity === 'warning') return 'bg-amber-50 border-amber-200 text-amber-700';
  return 'bg-zinc-50 border-zinc-200 text-zinc-700';
}

function parseAiParagraphs(summary?: string | null) {
  if (!summary) return [];
  return summary
    .split('\n\n')
    .map((chunk) => chunk.replace(/\*\*/g, '').trim())
    .filter(Boolean);
}

export default function ObservabilityPage() {
  const [data, setData] = useState<ObservabilityResponse | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as ObservabilityResponse) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(!data);
  const [refreshTick, setRefreshTick] = useState(0);

  const summary = data?.summary ?? {
    overallInfrastructureScore: 0,
    overallServiceDisruptionPct: 0,
    avgNetworkLatencyMs: 0,
    peakNetworkLatencyMs: 0,
    operationalSignalHeat: 'low' as Heat,
    entitiesMonitored: 0,
    entitiesNeedingAttention: 0,
    activeIncidents: 0,
    entitiesWithTelemetry: 0,
    entitiesWithTelemetryGap: 0,
  };

  const placeholder = data?.placeholder ?? {
    isEmpty: false,
    title: '',
    message: '',
  };

  const operationalSignals = data?.operationalSignals ?? {
    downMonitorEvents1h: 0,
    openDiagnosticAlerts: 0,
    criticalInfrastructureEvents1h: 0,
    highContainerStressEvents1h: 0,
    snmpTrapBurstEvents1h: 0,
    criticalSyslogEvents1h: 0,
  };

  const highlights = data?.highlights ?? {
    immediateAttention: [] as string[],
    painPoints: [] as string[],
    keyFindings: [] as string[],
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshTick((v) => v + 1);
    }, AUTO_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      try {
        const force = refreshTick > 0;
        const user = getStoredUser();
        const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
        const params = new URLSearchParams();
        if (force) params.set('force', '1');
        if (isAdmin) params.set('ai', '1');
        const url = apiUrl(`/api/observability/summary${params.toString() ? `?${params.toString()}` : ''}`);
        const res = await fetch(url, {
          headers: authHeaders(),
        });
        const json = (await res.json()) as ObservabilityResponse;
        if (!ignore) {
          setData(json);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(CACHE_KEY, JSON.stringify(json));
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

  const serviceDomainChart = useMemo(
    () => (data?.serviceDomains || []).map((row) => ({
      domain: row.domain,
      healthy: row.healthy,
      degraded: row.degraded,
      down: row.down,
    })),
    [data]
  );

  const signalChart = useMemo(
    () => [
      { name: 'Down events', value: operationalSignals.downMonitorEvents1h },
      { name: 'Open alerts', value: operationalSignals.openDiagnosticAlerts },
      { name: 'Critical infra', value: operationalSignals.criticalInfrastructureEvents1h },
      { name: 'Container stress', value: operationalSignals.highContainerStressEvents1h },
      { name: 'SNMP bursts', value: operationalSignals.snmpTrapBurstEvents1h },
      { name: 'Critical syslog', value: operationalSignals.criticalSyslogEvents1h },
    ],
    [operationalSignals]
  );

  const attentionRiskChart = useMemo(
    () => (data?.entitiesNeedingAttention || []).slice(0, 8).map((item) => ({ name: item.name, score: item.riskScore })),
    [data]
  );

  const aiParagraphs = useMemo(() => parseAiParagraphs(data?.ai?.summary), [data?.ai?.summary]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Card className="border-zinc-200 bg-white/95 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Observability & Risk Intelligence</h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Operational view for monitored uptime, infrastructure, data center, and rack entities. Focused on disruption, anomalies, and predictive risk.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                <Badge variant="outline">Generated: {fmtTs(data?.generatedAt || null)}</Badge>
                <Badge variant="outline">Next update: {fmtTs(data?.nextAnalysisAt || null)}</Badge>
                <Badge variant="outline">Window: {data?.analysisWindowMinutes ?? 60}m</Badge>
                <Badge variant="outline" className={heatClass(summary.operationalSignalHeat)}>
                  Signal Heat: {summary.operationalSignalHeat.toUpperCase()}
                </Badge>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setRefreshTick((v) => v + 1)} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh analysis
            </Button>
          </div>
        </CardContent>
      </Card>

      {placeholder.isEmpty ? (
        <Card className="border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40">
          <CardHeader>
            <CardTitle className="text-base">{placeholder.title}</CardTitle>
            <CardDescription>{placeholder.message}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!placeholder.isEmpty && highlights.immediateAttention.length > 0 ? (
        <Card className="border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Immediate Attention
            </CardTitle>
            <CardDescription>Current critical issues impacting monitored entities.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {highlights.immediateAttention.slice(0, 5).map((item, idx) => (
                <li key={idx} className="rounded-lg border border-rose-200 bg-white/70 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-zinc-950/40 dark:text-rose-200">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/90">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Overall Infrastructure Score</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"><Gauge className="h-5 w-5 text-sky-500" />{loading ? '...' : `${summary.overallInfrastructureScore}/100`}</p>
            <p className="mt-1 text-xs text-zinc-500">Health across uptime + infra + data center + racks</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/90">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Overall Service Disruption</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"><Siren className="h-5 w-5 text-rose-500" />{loading ? '...' : `${Number(summary.overallServiceDisruptionPct).toFixed(1)}%`}</p>
            <p className="mt-1 text-xs text-zinc-500">{summary.activeIncidents} active incidents</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/90">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Network Latency</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{loading ? '...' : `${Number(summary.avgNetworkLatencyMs).toFixed(1)} ms`}</p>
            <p className="mt-1 text-xs text-zinc-500">Peak: {Number(summary.peakNetworkLatencyMs).toFixed(1)} ms</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/90">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Entities Needing Attention</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{loading ? '...' : summary.entitiesNeedingAttention}</p>
            <p className="mt-1 text-xs text-zinc-500">Out of {summary.entitiesMonitored} monitored entities ({summary.entitiesWithTelemetry} with telemetry)</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/90">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Radar className="h-4 w-4 text-indigo-500" />Overall Service Disruption by Domain</CardTitle>
            <CardDescription>Healthy vs degraded vs down entities in each monitored domain.</CardDescription>
          </CardHeader>
          <CardContent className="h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serviceDomainChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="domain" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="healthy" stackId="a" fill="#22c55e" />
                <Bar dataKey="degraded" stackId="a" fill="#f59e0b" />
                <Bar dataKey="down" stackId="a" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/90">
          <CardHeader>
            <CardTitle className="text-base">Operational Signal Heat</CardTitle>
            <CardDescription>Signals driving risk and incident pressure in the last hour.</CardDescription>
          </CardHeader>
          <CardContent className="h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signalChart} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-14} textAnchor="end" interval={0} height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {signalChart.map((item, idx) => (
                    <Cell key={idx} fill={item.value >= 10 ? '#ef4444' : item.value >= 4 ? '#f59e0b' : '#0ea5e9'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/90">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Devices/Monitors/Entities Requiring Attention</CardTitle>
          <CardDescription>Root cause hints and risk outlook for entities most likely to impact reliability.</CardDescription>
        </CardHeader>
        <CardContent>
          {attentionRiskChart.length ? (
            <div className="h-[250px] mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attentionRiskChart} margin={{ top: 8, right: 8, left: 0, bottom: 26 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-15} textAnchor="end" interval={0} height={70} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="score" fill="#f97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          <div className="space-y-3">
            {(data?.entitiesNeedingAttention || []).slice(0, 10).map((entity) => (
              <div key={entity.id} className="rounded-lg border border-zinc-200 bg-white/80 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{entity.name}</p>
                    <p className="text-xs text-zinc-500">{entity.domain} · Status: {entity.status} · Last checked: {fmtTs(entity.lastCheckedAt)}</p>
                  </div>
                  <Badge variant="outline" className={riskClass(entity.riskLevel)}>{entity.riskLevel.toUpperCase()} · {entity.riskScore}</Badge>
                </div>
                <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200"><span className="font-medium">Likely cause:</span> {entity.likelyCause}</p>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200"><span className="font-medium">Prediction:</span> {entity.predictedRisk}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/90">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-sky-500" />Anomalies Detected</CardTitle>
            <CardDescription>Pattern shifts and unusual behavior in monitored entities.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data?.anomalies || []).slice(0, 8).map((item) => (
                <div key={item.id} className={`rounded-md border px-3 py-2 text-sm ${anomalyClass(item.severity)}`}>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs mt-1">{item.detail}</p>
                  <p className="text-xs mt-1 opacity-80">{item.domain} · Confidence: {item.confidence}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/90">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Siren className="h-4 w-4 text-violet-500" />Predicted Issues</CardTitle>
            <CardDescription>Forward-looking risk projection based on current telemetry behavior.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data?.predictions || []).slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2 text-sm text-zinc-700 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-zinc-200">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs mt-1">{item.detail}</p>
                  <p className="text-xs mt-1 opacity-80">{item.horizon} · Confidence: {item.confidence}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/90">
          <CardHeader>
            <CardTitle className="text-base">Pain Points</CardTitle>
            <CardDescription>Operational pressure areas needing immediate focus.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {highlights.painPoints.slice(0, 6).map((item, idx) => (
                <li key={idx} className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/90">
          <CardHeader>
            <CardTitle className="text-base">Key Findings</CardTitle>
            <CardDescription>Most important outcomes from this analysis cycle.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {highlights.keyFindings.slice(0, 6).map((item, idx) => (
                <li key={idx} className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/90">
        <CardHeader>
          <CardTitle className="text-base">In-House Observations</CardTitle>
          <CardDescription>Operational observations generated for this 60-minute analysis window.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {(data?.observations || []).slice(0, 10).map((item, idx) => (
              <li key={idx} className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/90">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4 text-violet-500" />AI Report & Recommendations</CardTitle>
              <CardDescription>Actionable recommendation summary from operational signals, anomalies, and risks.</CardDescription>
            </div>
            <Badge variant="outline">{data?.ai?.used ? `${String(data?.ai.provider || 'ai').toUpperCase()} report` : 'Fallback mode'}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p className="text-sm text-zinc-500">Loading AI report...</p> : null}

          {!loading && data?.ai?.summary ? (
            <div className="space-y-3">
              {aiParagraphs.map((paragraph, idx) => (
                <div key={idx} className="rounded-lg border border-violet-100 bg-violet-50/60 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-950/20">
                  <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-200">{paragraph}</p>
                </div>
              ))}
            </div>
          ) : null}

          {!loading && !data?.ai?.summary ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
              AI analysis is currently unavailable. {data?.ai?.error || 'No AI response returned.'}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
