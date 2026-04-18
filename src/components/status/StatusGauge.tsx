interface Props {
  healthScore: number;
  statusCounts: {
    online: number;
    down: number;
    degraded: number;
    maintenance: number;
  };
  total: number;
}

export function StatusGaugeCard({ healthScore, statusCounts, total }: Props) {
  const pct = Math.min(100, Math.max(0, healthScore));

  const cx = 100;
  const cy = 98;
  const r = 72;

  const arcColor =
    pct >= 90
      ? 'url(#grad-online)'
      : pct >= 70
      ? 'url(#grad-degraded)'
      : pct >= 40
      ? 'url(#grad-degraded)'
      : 'url(#grad-down)';

  const endX = cx - r * Math.cos((Math.PI * pct) / 100);
  const endY = cy - r * Math.sin((Math.PI * pct) / 100);
  const largeArc = 0;

  const needleAngle = Math.PI * (1 - pct / 100);
  const needleLen = 52;
  const needleX = cx + needleLen * Math.cos(needleAngle);
  const needleY = cy - needleLen * Math.sin(needleAngle);

  const overallLabel =
    pct >= 90
      ? 'Operational'
      : pct >= 70
      ? 'Partial Outage'
      : pct >= 40
      ? 'Degraded'
      : 'Major Outage';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 flex flex-col">
      <p className="text-xs font-semibold tracking-widest text-slate-400 dark:text-zinc-500 uppercase mb-4">
        System Status
      </p>

      <div className="flex-1 flex flex-col items-center justify-center">
        <svg viewBox="0 0 200 115" className="w-full max-w-[200px]">
          <defs>
            <linearGradient id="grad-online" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#0d9488" />
            </linearGradient>
            <linearGradient id="grad-degraded" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
            <linearGradient id="grad-down" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#e11d48" />
            </linearGradient>
          </defs>
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="currentColor" className="text-slate-200 dark:text-zinc-800"
            strokeWidth="13"
            strokeLinecap="round"
          />
          {pct > 0 && (
            <path
              d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`}
              fill="none"
              stroke={arcColor}
              strokeWidth="13"
              strokeLinecap="round"
            />
          )}
          <line
            x1={cx}
            y1={cy}
            x2={needleX}
            y2={needleY}
            stroke="currentColor" className="text-red-500 dark:text-red-400"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r="5" fill="currentColor" className="text-slate-800 dark:text-zinc-200" />
          <circle cx={cx} cy={cy} r="2.5" fill="white" />
        </svg>

        <p className="text-2xl font-bold text-slate-800 dark:text-zinc-200 -mt-2">{overallLabel}</p>
        <p className="text-sm text-slate-400 dark:text-zinc-500 mt-1">
          {statusCounts.online}/{total} services operational
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-zinc-800/80">
        <Stat
          label="Online"
          value={statusCounts.online}
          color="text-teal-600 dark:text-teal-400"
        />
        <Stat label="Down" value={statusCounts.down} color="text-rose-600 dark:text-rose-400" />
        <Stat
          label="Degraded"
          value={statusCounts.degraded}
          color="text-orange-500 dark:text-orange-400"
        />
        <Stat
          label="Maintenance"
          value={statusCounts.maintenance}
          color="text-amber-500 dark:text-amber-400"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-lg font-bold ${color}`}>{value}</span>
      <span className="text-xs text-slate-400 dark:text-zinc-500">{label}</span>
    </div>
  );
}
