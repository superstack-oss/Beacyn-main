import type { Service } from '@/types/status';

interface Props {
  services: Service[];
  avgUptime: number;
}

export function UptimeChartCard({ services, avgUptime }: Props) {
  const aggregated: number[] = [];

  const histLen = 30;
  for (let i = 0; i < histLen; i++) {
    const vals = services
      .map((s) => (Array.isArray(s.uptime_history) ? s.uptime_history[i] : null))
      .filter((v): v is number => v !== null && v !== undefined);
    if (vals.length > 0) {
      aggregated.push(vals.reduce((a, b) => a + b, 0) / vals.length);
    } else {
      aggregated.push(100);
    }
  }

  const maxVal = Math.max(...aggregated, 1);

  const barGradient = (val: number) => {
    if (val >= 95) return 'linear-gradient(to top, #0d9488, #34d399)';
    if (val >= 80) return 'linear-gradient(to top, #ea580c, #fbbf24)';
    return 'linear-gradient(to top, #e11d48, #fb7185)';
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 flex flex-col">
      <p className="text-xs font-semibold tracking-widest text-slate-400 dark:text-zinc-500 uppercase mb-1">
        Average Uptime
      </p>
      <p className="text-4xl font-bold text-slate-900 dark:text-zinc-100 mt-1 mb-5">
        {avgUptime.toFixed(2)}%
      </p>

      <div className="flex-1 flex items-end gap-[3px] h-[72px]">
        {aggregated.map((val, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <div
              className="w-full rounded-sm transition-all duration-300"
              style={{
                height: `${Math.max(10, (val / maxVal) * 100)}%`,
                background: barGradient(val),
                opacity: 0.85,
              }}
              title={`Day ${i + 1}: ${val.toFixed(1)}%`}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-between mt-2">
        <span className="text-xs text-slate-400 dark:text-zinc-500">30 days ago</span>
        <span className="text-xs text-slate-400 dark:text-zinc-500">Today</span>
      </div>
    </div>
  );
}
