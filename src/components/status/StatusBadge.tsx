import { cn } from '@/lib/utils';
import type { ServiceStatus } from '@/types/status';

const config: Record<
  ServiceStatus,
  { label: string; dot: string; badge: string }
> = {
  online: {
    label: 'ONLINE',
    dot: 'bg-gradient-to-r from-emerald-400 to-teal-500',
    badge: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20',
  },
  down: {
    label: 'DOWN',
    dot: 'bg-gradient-to-r from-rose-500 to-red-600',
    badge: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20',
  },
  degraded: {
    label: 'DEGRADED',
    dot: 'bg-gradient-to-r from-amber-400 to-orange-500',
    badge: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20',
  },
  maintenance: {
    label: 'MAINTENANCE',
    dot: 'bg-gradient-to-r from-amber-400 to-orange-500',
    badge: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20',
  },
};

interface Props {
  status: ServiceStatus;
  className?: string;
}

export function StatusBadge({ status, className }: Props) {
  const { label, dot, badge } = config[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide',
        badge,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
      {label}
    </span>
  );
}
