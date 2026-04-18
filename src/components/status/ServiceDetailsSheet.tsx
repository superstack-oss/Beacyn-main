import { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { StatusBadge } from './StatusBadge';
import { Clock, Activity, Target } from 'lucide-react';
import type { Service, ServiceCheck } from '@/types/status';
import { ResponseTrend } from './ResponseTrend';

interface Props {
  service: Service | null;
  checks: ServiceCheck[];
  onClose: () => void;
}

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rMins = minutes % 60;
  return `${hours}h ${rMins}m`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    month: 'short',
    day: 'numeric',
  });
}

export function ServiceDetailsSheet({ service, checks, onClose }: Props) {
  const isDown = service?.status === 'down';
  
  // Compute how long it's been down
  const currentDownDuration = useMemo(() => {
    if (!service || service.status !== 'down' || !checks.length) return null;
    let downStart = new Date(checks[checks.length - 1].checked_at).getTime();
    for (let i = checks.length - 1; i >= 0; i--) {
      if (checks[i].status === 'down') {
        downStart = new Date(checks[i].checked_at).getTime();
      } else {
        break;
      }
    }
    return formatDuration(Date.now() - downStart);
  }, [service, checks]);

  // Compute downtime history blocks (start and end times of down periods)
  const downtimeHistory = useMemo(() => {
    if (!checks.length) return [];
    const incidents: { start: string, end: string | null }[] = [];
    let currentIncident: { start: string, end: string | null } | null = null;

    for (let i = 0; i < checks.length; i++) {
      const check = checks[i];
      if (check.status === 'down') {
        if (!currentIncident) {
          currentIncident = { start: check.checked_at, end: null };
        }
      } else if (check.status === 'online') {
        if (currentIncident) {
          currentIncident.end = check.checked_at;
          incidents.push(currentIncident);
          currentIncident = null;
        }
      }
    }
    if (currentIncident) incidents.push(currentIncident);
    return incidents.reverse();
  }, [checks]);

  if (!service) return null;

  return (
    <Sheet open={!!service} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[400px] sm:w-[540px] px-0 pb-0 flex flex-col">
        <div className="px-6 relative shrink-0">
          <SheetHeader className="pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-start justify-between">
              <div>
                <SheetTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-100 mb-1">
                  {service.name}
                </SheetTitle>
                <SheetDescription className="text-sm">
                  {service.type} Service Monitor
                </SheetDescription>
              </div>
              <StatusBadge status={service.status} />
            </div>
            
            <div className="flex flex-col gap-2 mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 opacity-70" />
                <span className="font-mono text-xs truncate py-0.5 px-1.5 rounded-md bg-zinc-100 dark:bg-zinc-900">
                  {service.ip_or_url}
                </span>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-8">
          
          {isDown && currentDownDuration ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900/40 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shrink-0">
                  <Activity className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-rose-800 dark:text-rose-300">Currently Offline</h4>
                  <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">
                    Service has been down for <span className="font-semibold">{currentDownDuration}</span>.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4">
              <div className="text-xs tracking-wider font-semibold text-zinc-500 uppercase mb-1">Overall Uptime</div>
              <div className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-zinc-200">
                {service.uptime_percentage.toFixed(2)}%
              </div>
            </div>
            <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4">
              <div className="text-xs tracking-wider font-semibold text-zinc-500 uppercase mb-1">Avg Response</div>
              <div className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-zinc-200">
                {service.status === 'down' ? '—' : `${service.avg_response_ms}ms`}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">
              Recent Performance
            </h3>
            <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4">
              <ResponseTrend checks={checks} latest={checks[checks.length - 1]} />
              <div className="flex justify-between mt-3 text-[10px] text-zinc-400 uppercase font-semibold">
                <span>Older</span>
                <span>Now</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Incident Timeline
            </h3>
            
            {downtimeHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/40 px-4 py-8 text-center">
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  No downtime recorded in available history.
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {downtimeHistory.map((incident, idx) => {
                  const duration = incident.end
                    ? formatDuration(new Date(incident.end).getTime() - new Date(incident.start).getTime())
                    : 'Ongoing';
                  
                  return (
                    <div key={idx} className="flex gap-4 group">
                      <div className="relative flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-rose-500 ring-4 ring-rose-50 dark:ring-rose-950/50 relative z-10" />
                        {idx !== downtimeHistory.length - 1 && (
                          <div className="w-px h-full bg-zinc-200 dark:bg-zinc-800 absolute top-3" />
                        )}
                      </div>
                      <div className="pb-4 pt-0.5">
                        <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-none">
                          {duration === 'Ongoing' ? 'Current Outage' : 'Service Outage'}
                        </h4>
                        <div className="text-xs font-medium text-zinc-500 mt-1.5 flex items-center gap-1.5 flex-wrap">
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">{duration}</span>
                          <span className="opacity-50">•</span>
                          <span>{formatTime(incident.start)}</span>
                          {incident.end && (
                            <>
                              <span className="opacity-50">to</span>
                              <span>{formatTime(incident.end)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
        </div>
      </SheetContent>
    </Sheet>
  );
}
