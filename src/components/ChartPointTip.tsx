import type { TooltipContentProps } from 'recharts';

export function ChartPointTip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const point = entry?.payload as { time?: string; status?: string } | undefined;
  const raw = entry?.value;
  const numeric = Array.isArray(raw) ? raw[0] : raw;
  const ms = numeric == null || numeric === '' ? null : Number(numeric);
  const title = point?.time || (label != null ? String(label) : '');

  return (
    <div className="pointer-events-none rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
      {title ? <div className="font-medium text-zinc-800 dark:text-zinc-100">{title}</div> : null}
      <div className={`${title ? 'mt-0.5' : ''} tabular-nums text-zinc-600 dark:text-zinc-300`}>
        {Number.isFinite(ms) ? `${Math.round(ms as number)} ms` : '—'}
      </div>
      {point?.status ? <div className="text-[11px] capitalize text-zinc-500">{point.status}</div> : null}
    </div>
  );
}

export function chartTipProps() {
  return {
    content: ChartPointTip,
    allowEscapeViewBox: { x: true, y: true } as const,
    wrapperStyle: { zIndex: 40, outline: 'none', width: 'max-content' } as const,
    isAnimationActive: false as const,
  };
}
