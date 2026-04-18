import { TriangleAlert as AlertTriangle, Info, CircleAlert as AlertCircle, X } from 'lucide-react';
import { useState } from 'react';
import type { Incident } from '@/types/status';

const severityConfig = {
  info: {
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    icon: Info,
    iconColor: 'text-blue-500',
  },
  warning: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
  },
  critical: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-800',
    icon: AlertCircle,
    iconColor: 'text-red-500',
  },
};

interface Props {
  incidents: Incident[];
}

export function AnnouncementBanner({ incidents }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = incidents.filter((i) => !dismissed.has(i.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-0">
      {visible.map((incident) => {
        const cfg = severityConfig[incident.severity];
        const Icon = cfg.icon;
        return (
          <div
            key={incident.id}
            className={`border-b ${cfg.bg} ${cfg.text} px-4 py-3`}
          >
            <div className="max-w-7xl mx-auto flex items-start gap-3">
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.iconColor}`} />
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-sm">{incident.title}</span>
                <span className="text-sm opacity-80 ml-2">{incident.message}</span>
              </div>
              <button
                onClick={() =>
                  setDismissed((prev) => new Set([...prev, incident.id]))
                }
                className={`shrink-0 opacity-60 hover:opacity-100 transition-opacity`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
