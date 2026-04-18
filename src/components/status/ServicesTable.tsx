import { useState, useMemo } from 'react';
import { Search, Download, Settings as SettingsIcon, ChevronUp, ChevronDown, ExternalLink, Info, LifeBuoy } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { ResponseTrend } from './ResponseTrend';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ServiceDetailsSheet } from './ServiceDetailsSheet';
import type { Service, ServiceCheck } from '@/types/status';

type SortKey = 'name' | 'status' | 'avg_response_ms' | 'uptime_percentage' | 'type';

interface Props {
  services: Service[];
  checks: Record<string, ServiceCheck[]>;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function exportCSV(services: Service[]) {
  const headers = ['Name', 'Status', 'Type', 'IP / URL', 'Avg Response (ms)', 'Uptime %', 'Category'];
  const rows = services.map((s) => [
    s.name,
    s.status,
    s.type,
    s.ip_or_url,
    s.avg_response_ms,
    s.uptime_percentage,
    s.category,
  ]);
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `status-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ServicesTable({ services, checks }: Props) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [rowsPerPage, setRowsPerPage] = useState<number | 'all'>('all');
  const [page, setPage] = useState(1);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        s.ip_or_url.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q)
    );
  }, [services, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: string | number = a[sortKey];
      let bVal: string | number = b[sortKey];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalRows = sorted.length;
  const pageSize = rowsPerPage === 'all' ? totalRows : rowsPerPage;
  const totalPages = rowsPerPage === 'all' ? 1 : Math.ceil(totalRows / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="w-3 h-3 text-slate-600 dark:text-zinc-400" />
    ) : (
      <ChevronDown className="w-3 h-3 text-slate-600 dark:text-zinc-400" />
    );
  };

  const Th = ({
    label,
    col,
    className = '',
  }: {
    label: string;
    col?: SortKey;
    className?: string;
  }) => (
    <th
      className={`px-4 py-3.5 text-left text-xs font-semibold tracking-widest text-slate-400 dark:text-zinc-500 uppercase select-none whitespace-nowrap ${col ? 'cursor-pointer hover:text-slate-600 dark:hover:text-zinc-300 dark:text-zinc-400' : ''} ${className}`}
      onClick={col ? () => handleSort(col) : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {col && <SortIcon col={col} />}
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Search by name, type, IP, category..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg placeholder:text-slate-400 dark:text-zinc-500 text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-zinc-100/10 focus:border-slate-400 transition-colors"
          />
        </div>
        <div className="ml-auto">
          <button
            onClick={() => exportCSV(filtered)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 hover:border-slate-300 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60">
                <Th label="Name" col="name" className="min-w-[160px]" />
                <Th label="Status" col="status" className="min-w-[130px]" />
                <Th label="Response Trend" className="min-w-[180px]" />
                <Th label="Avg Response" col="avg_response_ms" className="min-w-[120px]" />
                <Th label="Uptime" col="uptime_percentage" className="min-w-[90px]" />
                <Th label="Type" col="type" className="min-w-[100px]" />
                <Th label="Actions" className="min-w-[80px] text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400 dark:text-zinc-500">
                    No services match your search.
                  </td>
                </tr>
              ) : (
                paginated.map((service) => {
                  const serviceChecks = checks[service.id] ?? [];
                  const latest = serviceChecks[serviceChecks.length - 1];
                  const uptimeColor =
                    service.uptime_percentage >= 99
                      ? 'text-emerald-600'
                      : service.uptime_percentage >= 90
                      ? 'text-amber-600'
                      : 'text-red-600';
                  const responseDisplay =
                    service.status === 'down' || service.status === 'maintenance'
                      ? '—'
                      : `${service.avg_response_ms}ms`;

                  return (
                    <tr
                      key={service.id}
                      className="hover:bg-slate-50 dark:hover:bg-zinc-800 dark:bg-zinc-900/60 transition-colors group"
                    >
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
                            {service.name}
                          </p>
                          {service.description && (
                            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5 truncate max-w-[200px]">
                              {service.description}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={service.status} />
                      </td>
                      <td className="px-4 py-4">
                        <ResponseTrend checks={serviceChecks} latest={latest} />
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-medium text-slate-700">
                          {responseDisplay}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-sm font-bold ${uptimeColor}`}>
                          {service.uptime_percentage.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                          {service.type}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="p-1.5 rounded-md text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors outline-none cursor-pointer">
                            <SettingsIcon className="w-4 h-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              disabled={!service.type.toLowerCase().includes('web') && service.type.toLowerCase() !== 'https' && service.type.toLowerCase() !== 'http'}
                              onClick={() => {
                                let url = service.ip_or_url;
                                if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
                                window.open(url, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              <ExternalLink className="w-3.5 h-3.5 mr-2 text-zinc-500" />
                              Open site
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSelectedService(service)}>
                              <Info className="w-3.5 h-3.5 mr-2 text-zinc-500" />
                              Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled>
                              <LifeBuoy className="w-3.5 h-3.5 mr-2 text-zinc-500" />
                              Support
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-900/40">
          <span className="text-xs text-slate-400 dark:text-zinc-500">
            {filtered.length === services.length
              ? `${services.length} services`
              : `${filtered.length} of ${services.length} services`}
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-50 dark:text-zinc-9000">
              <span>Rows per page:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  const val = e.target.value;
                  setRowsPerPage(val === 'all' ? 'all' : parseInt(val));
                  setPage(1);
                }}
                className="text-xs border border-slate-200 dark:border-zinc-800 rounded px-2 py-1 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
              >
                <option value="all">All</option>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="25">25</option>
              </select>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-xs text-slate-50 dark:text-zinc-9000">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 border border-slate-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 border border-slate-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
            <span className="text-xs text-slate-400 dark:text-zinc-500">
              {rowsPerPage === 'all'
                ? `1–${filtered.length} of ${filtered.length}`
                : `${(page - 1) * (rowsPerPage as number) + 1}–${Math.min(page * (rowsPerPage as number), filtered.length)} of ${filtered.length}`}
            </span>
          </div>
        </div>
      </div>
      <ServiceDetailsSheet
        service={selectedService}
        checks={selectedService ? (checks[selectedService.id] || []) : []}
        onClose={() => setSelectedService(null)}
      />
    </div>
  );
}
