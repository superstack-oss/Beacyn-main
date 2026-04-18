import { useEffect, useMemo, useState } from 'react';
import { Accessibility, AlertTriangle, BarChart3, CheckCircle2, Clock3, Gauge, Monitor, RefreshCw, Search, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { apiUrl } from '../../lib/api';

interface PageSpeedDetailsProps {
  monitor: any;
  onBack: () => void;
}

type PageSpeedResponse = {
  ok: boolean;
  status: 'Up' | 'Down';
  latencyMs: number;
  message: string;
  checkedAt: string;
  error?: {
    code?: string;
    explanation?: string;
    raw?: string;
  };
  diagnostics?: Record<string, any>;
};

type Tone = 'good' | 'warning' | 'poor' | 'neutral';

function normalizeScore(value: any) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
}

function prettyLabel(value: string) {
  return String(value || '')
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (m) => m.toUpperCase());
}

function fmtDate(value?: string | null) {
  if (!value) return '—';
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleString();
}

function toneText(tone: Tone) {
  if (tone === 'good') return 'text-emerald-600 dark:text-emerald-400';
  if (tone === 'warning') return 'text-amber-600 dark:text-amber-400';
  if (tone === 'poor') return 'text-rose-600 dark:text-rose-400';
  return 'text-zinc-500 dark:text-zinc-400';
}

function toneDot(tone: Tone) {
  if (tone === 'good') return 'bg-emerald-500';
  if (tone === 'warning') return 'bg-amber-400';
  if (tone === 'poor') return 'bg-rose-500';
  return 'bg-zinc-300 dark:bg-zinc-600';
}

function toneBadge(tone: Tone) {
  if (tone === 'good') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300';
  if (tone === 'poor') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300';
  return 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300';
}

function scoreTone(score: number) {
  if (score >= 90) return 'good';
  if (score >= 50) return 'warning';
  return 'poor';
}

function scoreStroke(score: number) {
  const tone = scoreTone(score);
  if (tone === 'good') return '#22c55e';
  if (tone === 'warning') return '#f59e0b';
  return '#ef4444';
}

function parseMetricValue(value: string) {
  const raw = String(value || '').trim().toLowerCase();
  const numeric = Number.parseFloat(raw.replace(/[^0-9.]/g, ''));
  return { raw, numeric };
}

function getMetricTone(label: string, value: string): { tone: Tone; marker: number } {
  const { raw, numeric } = parseMetricValue(value);
  if (!Number.isFinite(numeric)) return { tone: 'neutral', marker: 35 };

  const isMs = raw.includes('ms');
  const lower = label.toLowerCase();

  if (lower.includes('largest contentful paint')) {
    if (numeric <= 2.5) return { tone: 'good', marker: 74 };
    if (numeric <= 4) return { tone: 'warning', marker: 88 };
    return { tone: 'poor', marker: 97 };
  }
  if (lower.includes('first contentful paint')) {
    if (numeric <= 1.8) return { tone: 'good', marker: 74 };
    if (numeric <= 3) return { tone: 'warning', marker: 88 };
    return { tone: 'poor', marker: 97 };
  }
  if (lower.includes('speed index')) {
    if (numeric <= 3.4) return { tone: 'good', marker: 72 };
    if (numeric <= 5.8) return { tone: 'warning', marker: 88 };
    return { tone: 'poor', marker: 97 };
  }
  if (lower.includes('blocking')) {
    if (numeric <= 200) return { tone: 'good', marker: 70 };
    if (numeric <= 600) return { tone: 'warning', marker: 86 };
    return { tone: 'poor', marker: 97 };
  }
  if (lower.includes('layout shift')) {
    if (numeric <= 0.1) return { tone: 'good', marker: 76 };
    if (numeric <= 0.25) return { tone: 'warning', marker: 90 };
    return { tone: 'poor', marker: 97 };
  }
  if (lower.includes('byte')) {
    if ((isMs && numeric <= 800) || (!isMs && numeric <= 0.8)) return { tone: 'good', marker: 74 };
    if ((isMs && numeric <= 1800) || (!isMs && numeric <= 1.8)) return { tone: 'warning', marker: 88 };
    return { tone: 'poor', marker: 97 };
  }

  return { tone: 'neutral', marker: 55 };
}

function ScoreRing({ score, label, large = false }: { score: number; label: string; large?: boolean }) {
  const size = large ? 170 : 82;
  const stroke = large ? 10 : 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score));
  const dash = circumference - (progress / 100) * circumference;
  const strokeColor = scoreStroke(score);

  return (
    <div className="flex flex-col items-center gap-2 text-center transition-transform duration-200 hover:-translate-y-0.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="transparent" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            fill="transparent"
            stroke={strokeColor}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dash}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-semibold ${large ? 'text-5xl' : 'text-2xl'} ${toneText(scoreTone(score))}`}>{score}</span>
        </div>
      </div>
      <div className={`font-medium ${large ? 'text-2xl' : 'text-sm'} text-zinc-800 dark:text-zinc-100`}>{label}</div>
    </div>
  );
}

function MetricLane({ label, value }: { label: string; value: string }) {
  const { tone, marker } = getMetricTone(label, value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-3 w-3 rounded-full ${toneDot(tone)}`} />
          <span className="text-base font-medium text-zinc-700 dark:text-zinc-200 truncate">{label}</span>
        </div>
        <span className={`text-2xl font-semibold whitespace-nowrap ${toneText(tone)}`}>{value}</span>
      </div>
      <div className="relative pt-2">
        <div className="flex h-2 overflow-hidden rounded-full">
          <div className="w-[82%] bg-emerald-500" />
          <div className="w-[10%] bg-amber-400" />
          <div className="w-[8%] bg-rose-500" />
        </div>
        <span
          className="absolute top-0 h-5 w-[2px] rounded-full bg-zinc-400 dark:bg-zinc-500"
          style={{ left: `calc(${marker}% - 1px)` }}
        />
      </div>
    </div>
  );
}

function AuditAccordionSection({ title, items, emptyText }: { title: string; items: any[]; emptyText: string }) {
  return (
    <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-300">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-zinc-500">{emptyText}</div>
        ) : (
          items.map((item, index) => {
            const tone = item?.scoreDisplayMode === 'notApplicable' ? 'neutral' : scoreTone(normalizeScore(item?.score));
            return (
              <details key={`${item.id || item.title || 'audit'}-${index}`} className="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/60 px-4 py-3 transition-all duration-200 hover:border-zinc-300 hover:shadow-sm dark:hover:border-zinc-700">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${toneDot(tone)}`} />
                    <div className="min-w-0">
                      <div className="text-base font-medium text-zinc-800 dark:text-zinc-100">{item.title || prettyLabel(item.id || 'Audit')}</div>
                      {item.displayValue ? <div className={`mt-1 text-sm ${toneText(tone)}`}>{item.displayValue}</div> : null}
                    </div>
                  </div>
                  <span className="text-xs text-zinc-400 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <div className="pt-3 pl-6 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {item.description || 'No further details were provided for this audit item.'}
                </div>
              </details>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default function PageSpeedDetails({ monitor, onBack }: PageSpeedDetailsProps) {
  const [strategy, setStrategy] = useState<'desktop' | 'mobile'>('desktop');
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<PageSpeedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAudit = async (nextStrategy = strategy) => {
    setLoading(true);
    setError(null);
    try {
      const target = String(monitor?.target_endpoint || '').trim();
      if (!target) throw new Error('No target endpoint configured for this monitor.');

      const res = await fetch(apiUrl(`/api/monitor/pagespeed?url=${encodeURIComponent(target)}&strategy=${nextStrategy}`));
      const data = await res.json();
      if (!res.ok || data?.error?.explanation) {
        throw new Error(data?.error?.explanation || data?.message || 'Failed to run Lighthouse audit');
      }
      setReport(data);
    } catch (err: any) {
      setReport(null);
      setError(err?.message || 'Failed to run Lighthouse audit');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAudit(strategy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitor?.id, strategy]);

  const categories = report?.diagnostics?.categories || {};
  const performanceScore = normalizeScore(categories?.performance);
  const accessibilityScore = normalizeScore(categories?.accessibility);
  const bestPracticesScore = normalizeScore(categories?.bestPractices);
  const seoScore = normalizeScore(categories?.seo);

  const categoryCards = [
    { key: 'performance', title: 'Performance', icon: Gauge, score: performanceScore },
    { key: 'accessibility', title: 'Accessibility', icon: Accessibility, score: accessibilityScore },
    { key: 'best-practices', title: 'Best Practices', icon: ShieldCheck, score: bestPracticesScore },
    { key: 'seo', title: 'SEO', icon: Search, score: seoScore },
  ];

  const metricsMap = report?.diagnostics?.metrics || {};
  const primaryMetrics = [
    { label: 'Largest Contentful Paint (LCP)', value: String(metricsMap?.largestContentfulPaint || '—') },
    { label: 'Total Blocking Time (TBT)', value: String(metricsMap?.totalBlockingTime || '—') },
    { label: 'Cumulative Layout Shift (CLS)', value: String(metricsMap?.cumulativeLayoutShift || '—') },
  ];
  const secondaryMetrics = [
    { label: 'First Contentful Paint (FCP)', value: String(metricsMap?.firstContentfulPaint || '—') },
    { label: 'Time to First Byte (TTFB)', value: String(metricsMap?.serverResponseTime || '—') },
  ];

  const coreVitalsPassed = primaryMetrics.every((metric) => getMetricTone(metric.label, metric.value).tone === 'good');

  const metrics = useMemo(() => {
    const raw = report?.diagnostics?.metrics || {};
    return Object.entries(raw).map(([key, value]) => ({
      key,
      label: prettyLabel(key),
      value: value == null || value === '' ? '—' : String(value),
      tone: getMetricTone(prettyLabel(key), String(value ?? '—')).tone,
    }));
  }, [report]);

  const insights = report?.diagnostics?.insights || [];
  const diagnosticsList = report?.diagnostics?.diagnosticsList || [];
  const passedAudits = report?.diagnostics?.passedAudits || [];
  const otherAudits = report?.diagnostics?.otherAudits || [];

  const reportMeta = [
    { label: 'Captured at', value: fmtDate(report?.diagnostics?.fetchTime || report?.checkedAt), icon: Clock3 },
    { label: 'Emulation', value: strategy === 'desktop' ? 'Desktop Lighthouse run' : 'Mobile Lighthouse run', icon: strategy === 'desktop' ? Monitor : Smartphone },
    { label: 'Target', value: report?.diagnostics?.finalUrl || report?.diagnostics?.requestedUrl || monitor?.target_endpoint || '—', icon: Search },
    { label: 'Runtime', value: report?.latencyMs != null ? `${report.latencyMs}ms` : '—', icon: RefreshCw },
  ];

  const previewImage = report?.diagnostics?.screenshot || report?.diagnostics?.fullPageScreenshot || null;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-blue-500 hover:underline font-medium">Monitor Details</button>
        <span className="text-zinc-400">/</span>
        <span className="text-blue-500 font-medium">PageSpeed</span>
      </div>

      <Card className="overflow-hidden bg-transparent shadow-none border-none">
        <CardContent className="pt-0">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
                <Sparkles className="h-3.5 w-3.5" />
                Lighthouse-style PageSpeed report
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">PageSpeed analysis for {monitor?.name}</h1>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300 break-all">{monitor?.target_endpoint}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-zinc-50 dark:bg-zinc-900/40">
                {(['desktop', 'mobile'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStrategy(value)}
                    className={`px-3 py-1.5 text-xs font-semibold ${strategy === value ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}`}
                  >
                    {prettyLabel(value)}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="shadow-none border-0 px-2 text-zinc-600 dark:text-zinc-300" onClick={() => runAudit(strategy)} disabled={loading}>
                <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Running audit...' : 'Run again'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50/80 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-xs">
        {['Overview', 'Metrics', 'Insights', 'Passed Audits'].map((chip) => (
          <span key={chip} className="rounded-xl border border-zinc-200 bg-transparent px-3 py-1 text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            {chip}
          </span>
        ))}
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800 bg-white/95 shadow-sm dark:bg-zinc-950/85">
        <CardContent className="p-5 md:p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Discover what the page is experiencing</h2>
              <p className="text-sm text-zinc-500">On-demand Lighthouse field-style snapshot for this target.</p>
            </div>
            <Badge variant="outline" className={toneBadge(coreVitalsPassed ? 'good' : 'warning')}>
              Core Web Vitals Assessment: {coreVitalsPassed ? 'Passed' : 'Needs attention'}
            </Badge>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {primaryMetrics.map((metric) => (
              <MetricLane key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </div>

          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <div className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Other notable metrics</div>
            <div className="grid gap-6 md:grid-cols-2">
              {secondaryMetrics.map((metric) => (
                <MetricLane key={metric.label} label={metric.label} value={metric.value} />
              ))}
            </div>
          </div>

          <div className="grid gap-3 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300 md:grid-cols-4">
            {reportMeta.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 text-zinc-500" />
                <div>
                  <div className="text-xs text-zinc-500">{label}</div>
                  <div className="break-all">{loading ? 'Loading...' : value}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800 bg-white/95 shadow-sm dark:bg-zinc-950/85">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl text-zinc-900 dark:text-zinc-50">Diagnose performance issues</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap justify-center gap-6 border-b border-zinc-200 dark:border-zinc-800 pb-6">
            {categoryCards.map(({ key, title, score }) => (
              <ScoreRing key={key} score={score} label={title} />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="flex flex-col items-center justify-center rounded-2xl bg-zinc-50/90 p-6 dark:bg-zinc-900/40">
              <ScoreRing score={performanceScore} label="Performance" large />
              <p className="mt-4 max-w-md text-center text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Values are estimated and may vary. The performance score is calculated directly from the current Lighthouse metrics and surfaced here in a more readable executive view.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-500">
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rose-500" /> 0–49</span>
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-400" /> 50–89</span>
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500" /> 90–100</span>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3 shadow-inner transition-all duration-200 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/40">
              {previewImage ? (
                <img src={previewImage} alt="Page preview" className="h-[320px] w-full rounded-xl object-contain object-top bg-white dark:bg-zinc-950" />
              ) : (
                <div className="flex h-[320px] w-full flex-col justify-between rounded-xl bg-gradient-to-br from-zinc-100 via-white to-zinc-200 p-4 dark:from-zinc-900 dark:via-zinc-950 dark:to-zinc-800">
                  <div className="space-y-2">
                    <div className="h-3 w-28 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                    <div className="h-2 w-40 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
                    <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Live page preview</div>
                    <div className="mt-2 break-all text-xs text-zinc-500">{report?.diagnostics?.finalUrl || monitor?.target_endpoint}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-16 rounded-lg bg-zinc-200/80 dark:bg-zinc-800" />
                    <div className="h-16 rounded-lg bg-zinc-200/80 dark:bg-zinc-800" />
                    <div className="h-16 rounded-lg bg-zinc-200/80 dark:bg-zinc-800" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
            Metrics
          </CardTitle>
          <CardDescription>Key timing signals, rendering behavior, and page execution details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-sm">
            {metrics.length === 0 && !loading ? <div className="text-zinc-500">No metrics available.</div> : null}
            {metrics.map((item) => (
              <div key={item.key} className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className={`h-2.5 w-2.5 rounded-full ${toneDot(item.tone)}`} />
                  {item.label}
                </div>
                <div className={`mt-2 text-3xl font-semibold ${toneText(item.tone)}`}>{loading ? '...' : item.value}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300 md:grid-cols-4">
            <div className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 text-zinc-500" /><span>Initial page load</span></div>
            <div className="flex items-start gap-2"><Monitor className="mt-0.5 h-4 w-4 text-zinc-500" /><span>{strategy === 'desktop' ? 'Emulated desktop run' : 'Emulated mobile run'}</span></div>
            <div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 text-zinc-500" /><span>Single page session</span></div>
            <div className="flex items-start gap-2"><Search className="mt-0.5 h-4 w-4 text-zinc-500" /><span>Using Lighthouse diagnostics</span></div>
          </div>
        </CardContent>
      </Card>

      <AuditAccordionSection title="Insights" items={insights} emptyText="No Lighthouse opportunities were flagged for this run." />

      <AuditAccordionSection title="Diagnostics" items={diagnosticsList} emptyText="No extra diagnostic items were returned for this run." />

      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Passed audits ({passedAudits.length})
          </CardTitle>
          <CardDescription>Checks that completed successfully in the current Lighthouse run.</CardDescription>
        </CardHeader>
        <CardContent>
          {passedAudits.length === 0 && !loading ? (
            <div className="text-sm text-zinc-500">No passed audit list is available.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {passedAudits.map((audit: any, index: number) => (
                <Badge key={`${audit.id || audit.title}-${index}`} variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                  {audit.title || prettyLabel(audit.id || 'Audit')}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AuditAccordionSection title="Additional audits" items={otherAudits} emptyText="No additional audits were returned." />

      {report?.error ? (
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              Error details
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-600 dark:text-zinc-300 space-y-1">
            <div>{report.error.explanation || 'Unknown Lighthouse error'}</div>
            {report.error.raw ? <div className="text-xs text-zinc-500 break-all">{report.error.raw}</div> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
