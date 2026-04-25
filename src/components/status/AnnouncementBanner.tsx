import { TriangleAlert as AlertTriangle, Info, CircleAlert as AlertCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Incident } from '@/types/status';

const severityConfig = {
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    icon: Info,
    iconColor: 'text-blue-500',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
  },
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    icon: AlertCircle,
    iconColor: 'text-red-500',
  },
};

interface Props {
  incidents: Incident[];
  currentPageId?: string;
  intervalMs?: number;
}

export function AnnouncementBanner({ incidents, currentPageId, intervalMs = 5000 }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Filter logic: Include Global + Specific Individual + Non-dismissed
  const visible = incidents.filter((i) => {
    if (dismissed.has(i.id)) return false;
    
    // Explicit global or missing metadata (treat as global backwards compatibility)
    if (i.isGlobal || (i.isGlobal === undefined && !i.pageId)) return true;
    
    // Match specific page
    if (currentPageId && i.pageId === currentPageId) return true;
    
    return false;
  });

  // Safe index capping
  useEffect(() => {
    if (currentIndex >= visible.length && visible.length > 0) {
      setCurrentIndex(0);
    }
  }, [visible.length, currentIndex]);

  // Reset expansion state when rotating to a new banner
  useEffect(() => {
    setIsExpanded(false);
  }, [currentIndex]);

  // Rotator loop (Pause if hovering, expanding, or <= 1 banner)
  useEffect(() => {
    if (visible.length <= 1) return;
    if (isPaused || isExpanded) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % visible.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [visible.length, isPaused, isExpanded, intervalMs]);

  if (visible.length === 0) return null;

  const incident = visible[currentIndex] || visible[0];
  const cfg = severityConfig[incident.severity] || severityConfig.info;
  const Icon = cfg.icon;
  const isLongMessage = incident.message && incident.message.length > 120;

  return (
    <div 
      className={`relative overflow-hidden transition-all duration-300 border-b ${cfg.bg} ${cfg.border}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        key={`${incident.id}-${currentIndex}`} // Forces re-render animation upon swap
        className={`px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-500 ${cfg.text}`}
      >
        <div className="max-w-7xl mx-auto flex items-start gap-3">
          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.iconColor}`} />
          
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-[13px] tracking-wide">{incident.title}</span>
              {visible.length > 1 && (
                <span className="text-[10px] opacity-70 uppercase tracking-wider font-semibold rounded-sm px-1 border border-current">
                  {currentIndex + 1} / {visible.length}
                </span>
              )}
            </div>
            
            <div className="relative w-full">
              {/* Fix height to h-10 (40px) which is exactly 2 lines of text-sm (line-height:20px). If expanded, allow it to stretch. */}
              <div className={`text-sm leading-5 opacity-90 transition-all duration-300 ${isExpanded ? 'h-auto' : 'h-10 line-clamp-2'}`}>
                {incident.message}
              </div>
              
              {/* Overlay inline Show More at bottom right */}
              {isLongMessage && !isExpanded && (
                <div className={`absolute bottom-0 right-0 ${cfg.bg} pl-6 before:content-[''] before:absolute before:left-[-24px] before:top-0 before:w-6 before:h-full before:bg-gradient-to-r before:from-transparent before:to-${cfg.bg.replace('bg-', '')}`}>
                  <button 
                    onClick={() => setIsExpanded(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider opacity-80 hover:opacity-100 transition-opacity whitespace-nowrap"
                  >
                    Show More <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Render "Show Less" conventionally underneath when expanded */}
            {isLongMessage && isExpanded && (
              <div className="mt-1">
                <button 
                  onClick={() => setIsExpanded(false)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider opacity-80 hover:opacity-100 transition-opacity"
                >
                  Show Less <ChevronUp className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          
          <button
            onClick={() => setDismissed((prev) => new Set([...prev, incident.id]))}
            className={`shrink-0 opacity-60 hover:opacity-100 transition-opacity p-1`}
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
