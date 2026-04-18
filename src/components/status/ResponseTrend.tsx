import type { ServiceCheck } from '@/types/status';

interface Props {
  checks: ServiceCheck[];
  latest?: ServiceCheck;
}

export function ResponseTrend({ checks, latest }: Props) {
  if (!checks || checks.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-end gap-px h-8">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 rounded-sm bg-slate-200"
              style={{ height: '20%' }}
            />
          ))}
        </div>
        <span className="text-xs text-slate-400 dark:text-zinc-500">no data</span>
      </div>
    );
  }

  const last20 = checks.slice(-20);
  const times = last20.map((c) => c.response_time_ms);
  const maxTime = Math.max(...times, 1);

  const barColor = (check: ServiceCheck) => {
    if (check.status === 'down') return '#ef4444';
    if (check.status === 'degraded') return '#f59e0b';
    if (check.status === 'maintenance') return '#3b82f6';
    const rt = check.response_time_ms;
    if (rt === 0) return '#ef4444';
    if (rt < 200) return '#22c55e';
    if (rt < 500) return '#84cc16';
    if (rt < 1000) return '#f59e0b';
    return '#ef4444';
  };

  const latestRt = latest?.response_time_ms ?? 0;
  const latestDisplay =
    latest?.status === 'down' || latest?.status === 'maintenance'
      ? '—'
      : `${latestRt}ms`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-px h-8">
        {last20.map((check, i) => {
          const heightPct =
            check.status === 'down' || check.status === 'maintenance'
              ? 15
              : Math.max(15, (check.response_time_ms / maxTime) * 100);
          return (
            <div
              key={i}
              className="w-1.5 rounded-sm transition-all duration-200 cursor-pointer hover:opacity-80"
              style={{
                height: `${heightPct}%`,
                backgroundColor: barColor(check),
              }}
              title={`${check.response_time_ms}ms — ${check.status}`}
            />
          );
        })}
      </div>
      <span className="text-xs text-slate-50 dark:text-zinc-9000 font-medium">{latestDisplay}</span>
    </div>
  );
}
