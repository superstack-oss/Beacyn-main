import { Construction } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ComingSoonPageProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  accentColor?: string; // tailwind bg class e.g. 'bg-violet-500'
}

export default function ComingSoonPage({
  title,
  description,
  icon: Icon = Construction,
  accentColor = 'bg-zinc-900 dark:bg-zinc-100',
}: ComingSoonPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      {/* Glowing blob backdrop */}
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-full blur-3xl opacity-10 scale-150 bg-violet-400 dark:bg-violet-600" />
        <div className={`relative w-16 h-16 rounded-2xl ${accentColor} flex items-center justify-center shadow-lg`}>
          <Icon className="w-8 h-8 text-white dark:text-zinc-900" />
        </div>
      </div>

      {/* "Coming soon" badge */}
      <span className="inline-flex items-center gap-1.5 px-3 py-1 mb-4 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        Coming Soon
      </span>

      <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">{title}</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed">{description}</p>

      {/* Decorative placeholder grid */}
      <div className="mt-10 grid grid-cols-3 gap-3 w-full max-w-md opacity-20 pointer-events-none select-none">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-12 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
