import { useClock } from '@/hooks/useClock';
import globeVideo from '../../assets/video/globe.mp4';

export function ClockCard() {
  const time = useClock();

  const timeStr = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const dateStr = time.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div
      className="border border-slate-200 dark:border-zinc-800 rounded-xl p-6 flex flex-col justify-between relative overflow-hidden bg-slate-900 shadow-inner"
    >
      <div className="absolute inset-0 z-0 opacity-40 mix-blend-screen pointer-events-none">
        <video
          className="w-full h-full object-cover"
          src={globeVideo}
          autoPlay
          loop
          muted
          playsInline
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/60 to-transparent z-0 pointer-events-none" />

      <div className="relative z-10">
        <p className="text-xs font-semibold tracking-widest text-slate-300 dark:text-zinc-400 uppercase">
          Server Time
        </p>
        <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
          {tz.toUpperCase().replace(/_/g, ' ')}
        </p>
      </div>

      <div className="relative z-10 mt-4 drop-shadow-md">
        <p className="text-4xl font-bold tracking-tight text-white tabular-nums">
          {timeStr}
        </p>
        <p className="text-sm text-slate-200 mt-1.5">{dateStr}</p>
      </div>

      <div className="relative z-10 mt-4 pt-4 border-t border-white/10 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span className="text-xs text-slate-300">Live — updating every 30s</span>
        </div>
      </div>
    </div>
  );
}
