import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import {
  Search, Download, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Ticket, AlertCircle,
  Clock, CheckCircle2, PauseCircle
} from 'lucide-react';

// ServiceNow tickets — populated via API integration when configured
// Empty until ServiceNow is connected
const SAMPLE_TICKETS: {
  id: string; description: string; group: string;
  status: string; priority: string; createdAt: string;
}[] = [];


const PAGE_SIZE = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────
function ticketAge(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const PRIORITY_STYLES: Record<string, string> = {
  Critical: 'bg-rose-50 text-rose-700 border-rose-200',
  High:     'bg-orange-50 text-orange-700 border-orange-200',
  Medium:   'bg-amber-50 text-amber-700 border-amber-200',
  Low:      'bg-zinc-50 text-zinc-600 border-zinc-200',
};

const PRIORITY_DOT: Record<string, string> = {
  Critical: 'bg-rose-500',
  High:     'bg-orange-500',
  Medium:   'bg-amber-400',
  Low:      'bg-zinc-400',
};

const STATUS_STYLES: Record<string, { cls: string; icon: React.ReactNode }> = {
  'New':         { cls: 'bg-blue-50 text-blue-700 border-blue-200',    icon: <Ticket className="w-3 h-3" /> },
  'In Progress': { cls: 'bg-violet-50 text-violet-700 border-violet-200', icon: <Clock className="w-3 h-3" /> },
  'On Hold':     { cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: <PauseCircle className="w-3 h-3" /> },
  'Resolved':    { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="w-3 h-3" /> },
};

const STATUS_FILTERS = ['All', 'New', 'In Progress', 'On Hold', 'Resolved'];

// ── Stats bar ─────────────────────────────────────────────────────────────────
function statCount(tickets: typeof SAMPLE_TICKETS, status: string) {
  return tickets.filter(t => t.status === status).length;
}

// ── CSV export ────────────────────────────────────────────────────────────────
function downloadCSV(rows: typeof SAMPLE_TICKETS) {
  const headers = ['Ticket ID', 'Description', 'Assigned Group', 'Status', 'Priority', 'Created At', 'Age'];
  const lines = rows.map(r =>
    [r.id, `"${r.description}"`, r.group, r.status, r.priority, r.createdAt, ticketAge(r.createdAt)].join(',')
  );
  const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'incidents.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── Empty state placeholder ───────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Stacked card illustration */}
      <div className="relative w-48 h-28 mb-6 select-none pointer-events-none">
        <div className="absolute bottom-0 left-4 right-4 h-16 bg-zinc-100 rounded-xl shadow-sm rotate-[-4deg]" />
        <div className="absolute bottom-2 left-2 right-2 h-16 bg-zinc-50 rounded-xl shadow border border-zinc-100 rotate-[2deg]" />
        <div className="absolute bottom-4 left-0 right-0 h-16 bg-white rounded-xl shadow border border-zinc-100 flex items-center gap-3 px-4">
          <div className="w-10 h-8 rounded bg-zinc-100 shrink-0" />
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="h-2.5 bg-zinc-200 rounded-full w-3/4" />
            <div className="h-2 bg-zinc-100 rounded-full w-1/2" />
            <div className="h-2 bg-zinc-100 rounded-full w-2/3" />
          </div>
        </div>
      </div>
      <h3 className="text-sm font-semibold text-zinc-700 mb-1">No incidents yet</h3>
      <p className="text-xs text-zinc-400 text-center max-w-xs leading-relaxed">
        ServiceNow tickets will appear here once the integration is configured.
      </p>
      <div className="flex items-center gap-2 mt-4 text-xs text-zinc-400">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        No active incidents — all systems operational
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function IncidentsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);

  const tickets = SAMPLE_TICKETS; // swap with fetched data when ServiceNow is wired

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tickets.filter(t => {
      const matchSearch = !q || t.id.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.group.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'All' || t.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter, tickets]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleFilter = (f: string) => { setStatusFilter(f); setPage(1); };
  const handleSearch = (v: string) => { setSearch(v); setPage(1); };

  return (
    <div className="space-y-5">
      {/* Summary stat chips */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: 'Total',       value: tickets.length,                color: 'bg-zinc-100 text-zinc-700', dot: 'bg-zinc-400' },
          { label: 'New',         value: statCount(tickets, 'New'),         color: 'bg-blue-50 text-blue-700',    dot: 'bg-blue-500' },
          { label: 'In Progress', value: statCount(tickets, 'In Progress'), color: 'bg-violet-50 text-violet-700',dot: 'bg-violet-500' },
          { label: 'On Hold',     value: statCount(tickets, 'On Hold'),     color: 'bg-amber-50 text-amber-700',  dot: 'bg-amber-400' },
          { label: 'Resolved',    value: statCount(tickets, 'Resolved'),    color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
          { label: 'Critical',    value: tickets.filter(t => t.priority === 'Critical').length, color: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
        ].map(({ label, value, color, dot }) => (
          <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${color} border-current/10`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
            {label} <span className="font-bold">{value}</span>
          </div>
        ))}
      </div>

      {/* Main card */}
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-0 pt-5 px-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500" /> ServiceNow Tickets
              </CardTitle>
              <CardDescription className="text-sm mt-0.5">Live incidents synchronized with your ITSM workspace.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <Input
                  value={search}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Search tickets..."
                  className="pl-8 h-9 w-52 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </div>
              {/* Export */}
              <Button
                variant="outline" size="sm"
                className="h-9 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm"
                onClick={() => downloadCSV(filtered)}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
              </Button>
            </div>
          </div>

          {/* Status filter tabs */}
          <div className="flex gap-1 mt-4 border-b border-zinc-100 dark:border-zinc-800">
            {STATUS_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => handleFilter(f)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                  statusFilter === f
                    ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {f}
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  statusFilter === f ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                }`}>
                  {f === 'All' ? tickets.length : statCount(tickets, f)}
                </span>
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-0 pt-0">
          {/* Full empty state when no tickets at all */}
          {tickets.length === 0 ? (
            <div className="border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-b-lg mx-0">
              <EmptyState />
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-zinc-100 dark:border-zinc-800">
                <TableHead className="pl-6 font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Ticket ID</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Description</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Assigned Group</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Status</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Priority</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Created</TableHead>
                <TableHead className="pr-6 font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-zinc-400 text-sm">
                    No tickets match your filter.
                  </TableCell>
                </TableRow>
              )}
              {paginated.map(t => {
                const statusInfo = STATUS_STYLES[t.status] ?? STATUS_STYLES['New'];
                return (
                  <TableRow key={t.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800/60">
                    {/* Ticket ID */}
                    <TableCell className="pl-6 py-4">
                      <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">{t.id}</span>
                    </TableCell>

                    {/* Description */}
                    <TableCell className="py-4 max-w-xs">
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2 leading-snug" title={t.description}>
                        {t.description}
                      </span>
                    </TableCell>

                    {/* Assigned Group */}
                    <TableCell className="py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                        {t.group}
                      </span>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${statusInfo.cls}`}>
                        {statusInfo.icon} {t.status}
                      </span>
                    </TableCell>

                    {/* Priority */}
                    <TableCell className="py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold ${PRIORITY_STYLES[t.priority]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                        {t.priority}
                      </span>
                    </TableCell>

                    {/* Created */}
                    <TableCell className="py-4 text-xs text-zinc-500 whitespace-nowrap">
                      {formatDate(t.createdAt)}
                    </TableCell>

                    {/* Age */}
                    <TableCell className="py-4 pr-6">
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-500 font-mono">
                        <Clock className="w-3 h-3 text-zinc-400 shrink-0" />
                        {ticketAge(t.createdAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          )} {/* end tickets.length > 0 branch */}

          {/* Pagination footer — only shown when there are tickets */}
          {tickets.length > 0 && (
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20">
              <p className="text-xs text-zinc-500">
                {filtered.length === 0
                  ? 'No results'
                  : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} ticket${filtered.length !== 1 ? 's' : ''}`}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(1)}>
                  <ChevronsLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | string)[]>((acc, p, idx, arr) => {
                    if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '…'
                      ? <span key={`ellipsis-${i}`} className="px-1 text-xs text-zinc-400">…</span>
                      : <button key={p} onClick={() => setPage(p as number)} className={`h-8 min-w-[32px] px-2 rounded-md text-xs font-medium transition-colors ${page === p ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>{p}</button>
                  )}
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(totalPages)}>
                  <ChevronsRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
