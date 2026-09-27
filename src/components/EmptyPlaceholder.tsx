import { Plus } from 'lucide-react';
import { Button } from './ui/button';

interface EmptyPlaceholderProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyPlaceholder({ title, message, actionLabel, onAction }: EmptyPlaceholderProps) {
  return (
    <div className="rounded-xl border-2 border-dashed border-zinc-200/80 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-900/20">
      <div className="flex flex-col items-center justify-center px-4 py-12">
        <div className="relative mb-6 h-28 w-48 select-none pointer-events-none">
          <div className="absolute bottom-0 left-4 right-4 h-16 rotate-[-4deg] rounded-xl bg-zinc-100 shadow-sm dark:bg-zinc-800" />
          <div className="absolute bottom-2 left-2 right-2 h-16 rotate-[2deg] rounded-xl border border-zinc-100 bg-zinc-50 shadow dark:border-zinc-800 dark:bg-zinc-900" />
          <div className="absolute bottom-4 left-0 right-0 flex h-16 items-center gap-3 rounded-xl border border-zinc-100 bg-white px-4 shadow dark:border-zinc-800 dark:bg-zinc-950">
            <div className="h-8 w-10 shrink-0 rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="h-2.5 w-3/4 rounded-full bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-2 w-1/2 rounded-full bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-2 w-2/3 rounded-full bg-zinc-100 dark:bg-zinc-800" />
            </div>
          </div>
        </div>
        <h3 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">{title}</h3>
        <p className="max-w-xs text-center text-xs text-zinc-400">{message}</p>
      </div>
      {actionLabel && onAction ? (
        <div className="-mt-4 flex justify-center pb-8">
          <Button type="button" onClick={onAction} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
