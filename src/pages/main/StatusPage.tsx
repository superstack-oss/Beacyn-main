import { useEffect, useMemo, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { AnnouncementBanner } from '../../components/status/AnnouncementBanner';
import { HeroSection } from '../../components/status/HeroSection';
import { StatusGaugeCard } from '../../components/status/StatusGauge';
import { UptimeChartCard } from '../../components/status/UptimeChartCard';
import { ClockCard } from '../../components/status/ClockCard';
import { ServicesTable } from '../../components/status/ServicesTable';
import type { ServiceStatus, Service, Incident, ServiceCheck } from '../../types/status';
import { Skeleton } from '../../components/ui/skeleton';
import { apiUrl } from '../../lib/api';

type ServiceHealth = {
  id: string | number;
  group: string;
  name: string;
  endpoint: string;
  status: string;
  uptimePct: number;
  avgResponseMs: number | null;
  lastCheckedAt: string | null;
  incident: string | null;
  history: Array<{ ok: boolean; down: boolean }>;
  responseHistory?: number[];
  ip?: string;
};

type PublicPayload = {
  page: {
    id: string;
    name: string;
    groupName: string;
    timezone: string;
    companyName: string;
    pageAddress: string;
    showResponseCharts: boolean;
    createdAt: string;
  };
  services: ServiceHealth[];
  notifications: Incident[];
  generatedAt: string;
  overall: {
    label: string;
    avgUptime: number;
    total: number;
  };
};

function statusTone(status: string) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'up' || normalized === 'online' || normalized === 'connected' || normalized === 'operational') return 'good';
  if (normalized === 'down' || normalized === 'offline' || normalized === 'disconnected') return 'poor';
  return 'warn';
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function StatusPage({ publicToken }: { publicToken: string }) {
  const [data, setData] = useState<PublicPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'light';
  });

  const toggleTheme = () => {
    setTheme(t => {
      const next = t === 'light' ? 'dark' : 'light';
      if (next === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      return next;
    });
  };

  const loadData = async () => {
    if (!publicToken) {
      setError('A secure public status page link is required.');
      setLoading(false);
      return;
    }
    setError('');
    try {
      const res = await fetch(apiUrl(`/api/status-pages/public/${publicToken}`));
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to load public status page');
      setData(payload as PublicPayload);
    } catch (err: any) {
      setError(err?.message || 'Failed to load public status page');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    const id = window.setInterval(loadData, 60000);
    return () => window.clearInterval(id);
  }, [publicToken]);

  const { services, checks, statusCounts, avgUptime, healthScore } = useMemo(() => {
    if (!data) return { services: [], checks: {}, statusCounts: { online: 0, down: 0, degraded: 0, maintenance: 0 }, avgUptime: 100, healthScore: 100 };

    const mappedServices: Service[] = [];
    const mappedChecks: Record<string, ServiceCheck[]> = {};
    const counts = { online: 0, down: 0, degraded: 0, maintenance: 0 };
    let uptimeSum = 0;

    data.services.forEach(s => {
      const tone = statusTone(s.status);
      const svcStatus: ServiceStatus = tone === 'good' ? 'online' : tone === 'poor' ? 'down' : 'degraded';
      counts[svcStatus]++;
      uptimeSum += s.uptimePct;

      const svc: Service = {
        id: s.id.toString(),
        name: s.name,
        type: s.group || 'Server',
        ip_or_url: s.ip || s.endpoint || '—',
        status: svcStatus,
        avg_response_ms: s.avgResponseMs || 0,
        uptime_percentage: s.uptimePct,
        uptime_history: Array(30).fill(s.uptimePct),
        category: s.group || 'General',
        created_at: s.lastCheckedAt || new Date().toISOString(),
        updated_at: s.lastCheckedAt || new Date().toISOString(),
      };
      mappedServices.push(svc);

      const svcChecks: ServiceCheck[] = [];
      if (s.responseHistory) {
        s.responseHistory.forEach((rt, idx) => {
          svcChecks.push({
            id: `${svc.id}-${idx}`,
            service_id: svc.id,
            response_time_ms: rt,
            status: rt > 0 ? 'online' : 'down',
            checked_at: new Date(Date.now() - (s.responseHistory!.length - 1 - idx) * 60000).toISOString()
          });
        });
      }
      mappedChecks[svc.id] = svcChecks;
    });

    return {
      services: mappedServices,
      checks: mappedChecks,
      statusCounts: counts,
      avgUptime: mappedServices.length > 0 ? uptimeSum / mappedServices.length : 100,
      healthScore: mappedServices.length > 0 ? (counts.online / mappedServices.length) * 100 : 100
    };
  }, [data]);

  const overallStatus: ServiceStatus | 'operational' =
    statusCounts.down > 0
      ? 'down'
      : statusCounts.degraded > 0
        ? 'degraded'
        : statusCounts.maintenance > 0
          ? 'maintenance'
          : 'operational';

  const incidents: Incident[] = data?.notifications || [];

  const lastUpdated = new Date(data?.generatedAt || Date.now());

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-zinc-900 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 dark:text-zinc-50 relative overflow-hidden transition-colors duration-300 flex flex-col"
    >
      {/* Box-Grid Background */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(100,100,120,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,100,120,0.10) 1px, transparent 1px)',
          backgroundSize: '12px 12px',
        }}
      />

      <div className="relative z-10 flex-grow">
        <AnnouncementBanner incidents={incidents} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}

          {loading && !data ? (
            <LoadingSkeleton />
          ) : data ? (
            <>
              <HeroSection
                avgUptime={avgUptime}
                lastUpdated={lastUpdated}
                overallStatus={overallStatus}
                onRefresh={loadData}
                companyName={data.page.companyName}
                pageAddress={data.page.pageAddress}
              />



              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatusGaugeCard
                  healthScore={healthScore}
                  statusCounts={statusCounts}
                  total={services.length}
                />
                <ClockCard />
                <UptimeChartCard services={services} avgUptime={avgUptime} />

              </div>

              <ServicesTable services={services} checks={checks} />
            </>
          ) : null}
        </div>

        <footer className="bg-transparent dark:bg-transparent">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-zinc-500">
              &copy; {new Date().getFullYear()} {data?.page.companyName || 'ACME Corp'}. All rights reserved.
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-500 text-center">
              Public read-only service health view.{' '}
              <span className="font-medium text-slate-500 dark:text-zinc-500">
                Last refresh {formatRelativeTime(lastUpdated)}
              </span>
            </p>
            <div className="flex items-center text-center gap-4">
              <span className="text-xs text-slate-500 dark:text-zinc-500">
                Powered by <span className="font-semibold text-slate-600 dark:text-zinc-400 dark:text-zinc-300">Beacyn Labs.</span>
              </span>

              {/* Theme Toggle Button */}
              <button
                className="relative inline-flex h-6 w-11 items-center rounded-full bg-slate-200 dark:bg-zinc-800 border-none cursor-pointer shadow-inner focus:outline-none"
                onClick={toggleTheme}
                aria-label="Toggle theme"
              >
                <span className={`flex h-4 w-4 items-center justify-center transform rounded-full bg-white dark:bg-zinc-900 shadow transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`}>
                  {theme === 'dark' ? <Moon className="w-2.5 h-2.5 text-slate-800 dark:text-zinc-200" /> : <Sun className="w-2.5 h-2.5 text-amber-500" />}
                </span>
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
