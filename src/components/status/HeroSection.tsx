import { CircleCheck as CheckCircle2, CircleAlert as AlertCircle, Clock, RefreshCw } from 'lucide-react';
import type { ServiceStatus } from '@/types/status';
import hexagonLogo from '../../assets/logos/approved.png';

interface Props {
  avgUptime: number;
  lastUpdated: Date;
  overallStatus: ServiceStatus | 'operational';
  onRefresh: () => void;
  companyName?: string;
  pageAddress?: string;
}

const overallStatusConfig = {
  operational: {
    label: 'All Systems Operational',
    icon: CheckCircle2,
    color: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-emerald-200 dark:border-emerald-500/20',
    dot: 'bg-gradient-to-r from-emerald-400 to-teal-500',
  },
  degraded: {
    label: 'Partial Degradation',
    icon: AlertCircle,
    color: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-amber-200 dark:border-amber-500/20',
    dot: 'bg-gradient-to-r from-amber-400 to-orange-500',
  },
  down: {
    label: 'Service Disruption',
    icon: AlertCircle,
    color: 'text-rose-700 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    border: 'border-rose-200 dark:border-rose-500/20',
    dot: 'bg-gradient-to-r from-rose-500 to-red-600',
  },
  maintenance: {
    label: 'Scheduled Maintenance',
    icon: Clock,
    color: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-amber-200 dark:border-amber-500/20',
    dot: 'bg-gradient-to-r from-amber-400 to-orange-500',
  },
  online: {
    label: 'All Systems Operational',
    icon: CheckCircle2,
    color: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-emerald-200 dark:border-emerald-500/20',
    dot: 'bg-gradient-to-r from-emerald-400 to-teal-500',
  },
};

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export function HeroSection({
  avgUptime,
  lastUpdated,
  overallStatus,
  onRefresh,
  companyName,
  pageAddress,
}: Props) {
  const cfg = overallStatusConfig[overallStatus] ?? overallStatusConfig.operational;

  const uptimeColor =
    avgUptime >= 99
      ? 'text-teal-600 dark:text-teal-400'
      : avgUptime >= 90
        ? 'text-orange-600 dark:text-orange-400'
        : 'text-rose-600 dark:text-rose-400';

  const uptimeArc = (avgUptime / 100) * 251.2;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-8 py-7">
      <div className="flex items-center justify-between flex-wrap gap-6">
        <div className="flex items-center gap-5">
          <div className="w-24 h-24 rounded-2xl bg-transparent flex items-center justify-center shrink-0">
            <img src={hexagonLogo} alt="Logo" className="w-24 h-24 object-contain drop-shadow-sm" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-semibold tracking-widest text-slate-400 dark:text-zinc-500 uppercase">
                Infrastructure
              </p>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
              Public Status Page
            </h1>
            <p className="text-sm text-slate-400 dark:text-zinc-500 mt-0.5">
              {companyName || 'ACME Corp'} | {pageAddress || 'status.acme-corp.io'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-slate-400 dark:text-zinc-500 font-medium uppercase tracking-wide mb-1">
              Last Refreshed
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={onRefresh}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800/80 dark:bg-zinc-800 transition-colors text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 dark:text-zinc-400"
                title="Refresh now"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-medium text-slate-600 dark:text-zinc-400">
                {formatRelativeTime(lastUpdated)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
                <defs>
                  <linearGradient id="circ-up" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#0d9488" />
                  </linearGradient>
                  <linearGradient id="circ-warn" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#ea580c" />
                  </linearGradient>
                  <linearGradient id="circ-down" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fb7185" />
                    <stop offset="100%" stopColor="#e11d48" />
                  </linearGradient>
                </defs>
                <circle
                  cx="44"
                  cy="44"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="7"
                  className="text-slate-100 dark:text-zinc-800"
                />
                <circle
                  cx="44"
                  cy="44"
                  r="40"
                  fill="none"
                  stroke={
                    avgUptime >= 99
                      ? 'url(#circ-up)'
                      : avgUptime >= 90
                        ? 'url(#circ-warn)'
                        : 'url(#circ-down)'
                  }
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${uptimeArc} 251.2`}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-sm font-normal leading-none ${uptimeColor}`}>
                  {avgUptime.toFixed(1)}%
                </span>
              </div>
            </div>
            <span className="text-xs text-slate-400 dark:text-zinc-500 font-normal tracking-wide mt-2">
              Uptime
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
