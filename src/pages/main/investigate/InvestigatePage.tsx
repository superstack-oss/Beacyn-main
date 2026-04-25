import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { Search, AlertTriangle, CheckCircle2, Eye, ExternalLink, Server, Settings, Trash2, CheckCheck, Clock3, ArrowLeft, FileText, MessageSquareText, Workflow } from 'lucide-react';
import { apiUrl } from '../../../lib/api';

interface InvestigatePageProps {
  onOpenServer: (agentId: string) => void;
}

type TicketState = 'In progress' | 'ServiceNow' | 'Canceled' | 'Resolved' | 'Closed Un-resolved';

interface Ticket {
  ticket_id: string;
  agent_id: string;
  hostname: string;
  metric_type: string;
  resource_key: string;
  severity: 'P1' | 'P2' | 'P3';
  current_value: number;
  threshold_value: number;
  status: 'Open' | 'Resolved';
  description: string;
  work_notes?: string | null;
  ticket_state?: TicketState | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  service_now_incident?: string | null;
  service_now_status?: 'Created' | 'Failed' | null;
}

interface TicketActivity {
  id: number;
  ticket_id: string;
  note_text?: string | null;
  ticket_state?: TicketState | null;
  actor_username?: string | null;
  actor_role?: string | null;
  note_source?: 'manual-note' | 'status-change' | 'system';
  created_at: string;
}

function severityClass(severity: string) {
  if (severity === 'P1') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (severity === 'P2') return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function statusClass(status: Ticket['status']) {
  if (status === 'Resolved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-sky-50 text-sky-700 border-sky-200';
}

function ticketStateClass(state: TicketState) {
  if (state === 'Resolved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (state === 'ServiceNow') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (state === 'Canceled') return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  if (state === 'Closed Un-resolved') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function normalizeTicketState(ticket: Partial<Ticket> | null | undefined): TicketState {
  if (ticket?.ticket_state) return ticket.ticket_state;
  if (ticket?.service_now_incident) return 'ServiceNow';
  if (ticket?.status === 'Resolved') return 'Resolved';
  return 'In progress';
}

function metricLabel(metric: string) {
  return String(metric || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDateTime(value?: string | null) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString();
}

function formatDuration(from?: string | null, to?: string | null) {
  if (!from) return 'N/A';
  const start = new Date(from);
  const end = to ? new Date(to) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'N/A';

  const diffMinutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  const days = Math.floor(diffMinutes / 1440);
  const hours = Math.floor((diffMinutes % 1440) / 60);
  const minutes = diffMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function slaHoursForSeverity(severity: Ticket['severity']) {
  if (severity === 'P1') return 4;
  if (severity === 'P2') return 8;
  return 24;
}

function formatBreachTime(createdAt?: string | null, severity?: Ticket['severity']) {
  if (!createdAt || !severity) return 'N/A';
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 'N/A';
  created.setHours(created.getHours() + slaHoursForSeverity(severity));
  return created.toLocaleString();
}

function deriveTicketCaller(ticket: Ticket, activities: TicketActivity[]) {
  return activities.find((activity) => activity.actor_username)?.actor_username || (ticket.service_now_incident ? 'System Administrator' : 'PulseIQ Monitor');
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
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
      <h3 className="text-sm font-semibold text-zinc-700 mb-1 dark:text-zinc-200">{title}</h3>
      <p className="text-xs text-zinc-400 text-center max-w-xs leading-relaxed">{message}</p>
      <div className="flex items-center gap-2 mt-4 text-xs text-zinc-400">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        No active issues right now
      </div>
    </div>
  );
}

export default function InvestigatePage({ onOpenServer }: InvestigatePageProps) {
  const [status, setStatus] = useState<'Open' | 'Resolved' | 'All'>('Open');
  const [search, setSearch] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketDetail, setTicketDetail] = useState<Ticket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [workNotes, setWorkNotes] = useState('');
  const [ticketState, setTicketState] = useState<TicketState>('In progress');
  const [activities, setActivities] = useState<TicketActivity[]>([]);
  const [notesSaving, setNotesSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadTickets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status,
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(apiUrl(`/api/investigate?${params.toString()}`));
      const data = await res.json();
      const nextTickets = data?.tickets || [];
      setTickets(nextTickets);
      setTotal(Number(data?.total || 0));
      setSelectedTicket((current) => nextTickets.find((ticket: Ticket) => ticket.ticket_id === current?.ticket_id) || null);
    } catch {
      setTickets([]);
      setTotal(0);
      setSelectedTicket(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [status, search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        if (ignore) return;
        await loadTickets();
      } catch {
        if (!ignore) {
          setTickets([]);
          setSelectedTicket(null);
          setLoading(false);
        }
      }
    };

    load();
    const id = setInterval(load, 60_000);
    return () => {
      ignore = true;
      clearInterval(id);
    };
  }, [status, search, page]);

  const loadTicketDetail = async (ticketId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/investigate/${encodeURIComponent(ticketId)}`));
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load ticket details.');
      }
      const nextTicket = payload.ticket as Ticket;
      setTicketDetail(nextTicket);
      setTicketState(normalizeTicketState(nextTicket));
      setActivities(Array.isArray(payload.activities) ? payload.activities as TicketActivity[] : []);
    } catch (err: any) {
      window.alert(err?.message || 'Failed to load ticket details.');
      setTicketDetail(null);
      setActivities([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetails = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setWorkNotes('');
    setTicketState(normalizeTicketState(ticket));
    setActivities([]);
    await loadTicketDetail(ticket.ticket_id);
  };

  const canOpenServer = (ticket: Ticket) => Boolean(ticket.agent_id) && ticket.metric_type !== 'uptime' && ticket.metric_type !== 'database_availability';

  const openSnowIncident = async (ticket: Ticket) => {
    try {
      const res = await fetch(apiUrl(`/api/investigate/${encodeURIComponent(ticket.ticket_id)}/servicenow-url`));
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.url) {
        throw new Error(payload?.error || 'ServiceNow incident is not available for this ticket.');
      }
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      window.alert(err?.message || 'Failed to open ServiceNow incident.');
    }
  };

  const resolveTicket = async (ticket: Ticket) => {
    if (ticket.status === 'Resolved') return;
    setActionLoadingId(ticket.ticket_id);
    try {
      const res = await fetch(apiUrl(`/api/investigate/${encodeURIComponent(ticket.ticket_id)}/resolve`), {
        method: 'PATCH',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to resolve ticket.');
      }
      await loadTickets();
      if (selectedTicket?.ticket_id === ticket.ticket_id) {
        await loadTicketDetail(ticket.ticket_id);
      }
    } catch (err: any) {
      window.alert(err?.message || 'Failed to resolve ticket.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const deleteTicket = async (ticket: Ticket) => {
    const confirmed = window.confirm(`Delete ticket ${ticket.ticket_id}? This will remove the investigate record.`);
    if (!confirmed) return;

    setActionLoadingId(ticket.ticket_id);
    try {
      const res = await fetch(apiUrl(`/api/investigate/${encodeURIComponent(ticket.ticket_id)}`), {
        method: 'DELETE',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to delete ticket.');
      }
      if (selectedTicket?.ticket_id === ticket.ticket_id) {
        setSelectedTicket(null);
        setTicketDetail(null);
        setWorkNotes('');
        setTicketState('In progress');
        setActivities([]);
      }
      await loadTickets();
    } catch (err: any) {
      window.alert(err?.message || 'Failed to delete ticket.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const saveWorkNotes = async () => {
    if (!selectedTicket) return;
    setNotesSaving(true);
    try {
      const noteDraft = workNotes.trim();
      const res = await fetch(apiUrl(`/api/investigate/${encodeURIComponent(selectedTicket.ticket_id)}/work-notes`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workNotes: noteDraft, ticketState }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to save work notes.');
      }
      setWorkNotes('');
      await loadTickets();
      await loadTicketDetail(selectedTicket.ticket_id);
    } catch (err: any) {
      window.alert(err?.message || 'Failed to save work notes.');
    } finally {
      setNotesSaving(false);
    }
  };

  if (selectedTicket) {
    const activeTicket = ticketDetail || selectedTicket;
    const activeTicketState = ticketState || normalizeTicketState(activeTicket);
    const workflowOptions: TicketState[] = ['In progress', 'ServiceNow', 'Canceled', 'Resolved', 'Closed Un-resolved'];
    const callerName = deriveTicketCaller(activeTicket, activities);

    return (
      <div className="relative">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setSelectedTicket(null);
                setTicketDetail(null);
                setWorkNotes('');
                setTicketState('In progress');
                setActivities([]);
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to tickets
            </button>

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <button
                type="button"
                disabled={!canOpenServer(activeTicket)}
                onClick={() => onOpenServer(activeTicket.agent_id)}
                className="inline-flex items-center gap-1.5 text-zinc-600 transition hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                <Server className="w-3.5 h-3.5" />
                Open Server
              </button>
              <button
                type="button"
                disabled={!activeTicket.service_now_incident}
                onClick={() => openSnowIncident(activeTicket)}
                className="inline-flex items-center gap-1.5 text-zinc-600 transition hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open SNOW Incident
              </button>
            </div>
          </div>

          <Card className="border-zinc-200 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/85">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-zinc-500" />
                    Ticket Info
                  </CardTitle>
                  <CardDescription>Compact incident summary for quick triage and review.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={severityClass(activeTicket.severity)}>{activeTicket.severity}</Badge>
                  <Badge variant="outline" className={statusClass(activeTicket.status)}>{activeTicket.status}</Badge>
                  <Badge variant="outline" className={ticketStateClass(activeTicketState)}>{activeTicketState}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="grid gap-x-4 gap-y-2 text-sm md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Ticket Number</p>
                    <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">{activeTicket.ticket_id}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Ticket Caller</p>
                    <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">{callerName}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Host</p>
                    <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">{activeTicket.hostname}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Metric</p>
                    <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-100">{metricLabel(activeTicket.metric_type)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Issue Description</p>
                <p className="mt-1 text-sm leading-6 text-zinc-800 dark:text-zinc-200">{activeTicket.description}</p>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Threshold Breach</p>
                  <div className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                    <div className="flex items-center justify-between gap-3">
                      <span>Resource</span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{activeTicket.resource_key}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Current</span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{Number(activeTicket.current_value).toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Threshold</span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{Number(activeTicket.threshold_value).toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>ServiceNow</span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100 text-right">{activeTicket.service_now_incident || (activeTicket.service_now_status === 'Failed' ? 'Creation failed' : 'Not created')}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Timeline</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <Clock3 className="w-4 h-4 mt-0.5 text-zinc-400" />
                      <div>
                        <p className="text-zinc-900 dark:text-zinc-100">Created</p>
                        <p className="text-xs text-zinc-500">{formatDateTime(activeTicket.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock3 className="w-4 h-4 mt-0.5 text-zinc-400" />
                      <div>
                        <p className="text-zinc-900 dark:text-zinc-100">Last updated</p>
                        <p className="text-xs text-zinc-500">{formatDateTime(activeTicket.updated_at)}</p>
                      </div>
                    </div>
                    {activeTicket.resolved_at ? (
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500" />
                        <div>
                          <p className="text-zinc-900 dark:text-zinc-100">Resolved</p>
                          <p className="text-xs text-zinc-500">{formatDateTime(activeTicket.resolved_at)}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/85">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Workflow className="w-4 h-4 text-zinc-500" />Ticket Workflow</CardTitle>
                  <CardDescription>Update the working state and add the latest investigation note.</CardDescription>
                </div>
                <div className="min-w-[220px] space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Ticket State</label>
                  <select
                    value={activeTicketState}
                    onChange={(event) => setTicketState(event.target.value as TicketState)}
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  >
                    {workflowOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="w-4 h-4 text-zinc-400" />
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">Work Notes</p>
                </div>
                <textarea
                  value={workNotes}
                  onChange={(event) => setWorkNotes(event.target.value)}
                  rows={5}
                  placeholder="Add the latest investigation update. The input clears after posting."
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">Each update is saved and added to the activity stream.</p>
                  <Button size="sm" onClick={saveWorkNotes} disabled={notesSaving || detailLoading}>
                    {notesSaving ? 'Updating...' : 'Update Ticket'}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={activeTicket.status === 'Resolved' || actionLoadingId === activeTicket.ticket_id}
                  onClick={() => resolveTicket(activeTicket)}
                >
                  Mark Resolved
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-rose-600 border-rose-200 hover:bg-rose-50"
                  disabled={actionLoadingId === activeTicket.ticket_id}
                  onClick={() => deleteTicket(activeTicket)}
                >
                  Delete Ticket
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/85">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-zinc-500" />Activity Stream</CardTitle>
                  <CardDescription>Recent investigation updates and workflow changes.</CardDescription>
                </div>
                <p className="text-xs text-zinc-500">Activities: {activities.length}</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                <span>SLA: {slaHoursForSeverity(activeTicket.severity)}h</span>
                <span>Breach time: {formatBreachTime(activeTicket.created_at, activeTicket.severity)}</span>
                <span>Ticket age: {formatDuration(activeTicket.created_at, activeTicket.resolved_at || undefined)}</span>
              </div>
            </CardHeader>
            <CardContent>
              {detailLoading && !ticketDetail ? (
                <div className="py-10 text-center text-sm text-zinc-500">Loading ticket details...</div>
              ) : activities.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/70 px-5 py-6 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300">
                  No work-note or state activity has been logged yet for this ticket.
                </div>
              ) : (
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <div key={activity.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{activity.actor_username || 'System Administrator'}</p>
                          <p className="text-xs text-zinc-500">{formatDateTime(activity.created_at)}</p>
                        </div>
                        {activity.ticket_state ? (
                          <Badge variant="outline" className={ticketStateClass(activity.ticket_state)}>{activity.ticket_state}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{activity.note_text || 'State updated without an additional note.'}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808014_1px,transparent_1px),linear-gradient(to_bottom,#80808014_1px,transparent_1px)] bg-[size:14px_14px] dark:hidden" />
      <div className="pointer-events-none absolute inset-0 -z-10 hidden dark:block bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:14px_14px]" />
      <div className="space-y-6">
        <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Investigate Tickets</CardTitle>
              <CardDescription>Auto-generated investigation tickets from infrastructure utilization thresholds.</CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search host, ticket, metric"
                className="pl-8"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            {(['Open', 'Resolved', 'All'] as const).map((s) => (
              <Button key={s} variant={status === s ? 'default' : 'outline'} size="sm" onClick={() => setStatus(s)}>
                {s}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          {loading ? (
            <div className="py-14 text-center text-sm text-zinc-500">Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="border-2 border-dashed border-zinc-100 rounded-lg m-6">
              <EmptyState
                title={search ? 'No matching tickets' : `No ${status === 'All' ? '' : `${status.toLowerCase()} `}investigation tickets`}
                message={search
                  ? 'Try adjusting the hostname, ticket id, or metric search terms.'
                  : 'Tickets will appear automatically when CPU, Memory, Network, or Disk utilization crosses defined thresholds.'}
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-zinc-100 dark:border-zinc-800">
                    <TableHead className="pl-6">Ticket</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-6 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((t) => {
                    const workflowState = normalizeTicketState(t);
                    return (
                    <TableRow
                      key={t.ticket_id}
                      className="cursor-pointer border-b border-zinc-100/80 dark:border-zinc-800/80 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/30"
                      onClick={() => openDetails(t)}
                    >
                      <TableCell className="pl-6 py-4">
                        <div>
                          <div className="font-mono text-xs text-zinc-600 dark:text-zinc-300">{t.ticket_id}</div>
                          <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{t.hostname}</p>
                          <p className="mt-1 text-xs text-zinc-500 line-clamp-1">
                            {metricLabel(t.metric_type)} on {t.resource_key}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={severityClass(t.severity)}>{t.severity}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ticketStateClass(workflowState)}>{workflowState}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusClass(t.status)}>{t.status}</Badge>
                      </TableCell>
                      <TableCell className="pr-6 text-right" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="Open ticket actions"
                              className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem className="gap-2" onClick={() => openDetails(t)}>
                              <Eye className="w-3.5 h-3.5" /> Details
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2" disabled={!canOpenServer(t)} onClick={() => onOpenServer(t.agent_id)}>
                              <Server className="w-3.5 h-3.5" /> Open server
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2" disabled={!t.service_now_incident} onClick={() => openSnowIncident(t)}>
                              <ExternalLink className="w-3.5 h-3.5" /> Open Snow Incident
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2" disabled={t.status === 'Resolved' || actionLoadingId === t.ticket_id} onClick={() => resolveTicket(t)}>
                              <CheckCheck className="w-3.5 h-3.5" /> Resolved
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="gap-2 text-rose-600 focus:text-rose-600" disabled={actionLoadingId === t.ticket_id} onClick={() => deleteTicket(t)}>
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    );})}
                </TableBody>
              </Table>

              <div className="px-6 py-3 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-100 dark:border-zinc-800">
                <span>
                  {total === 0
                    ? 'No results'
                    : `Showing ${(page - 1) * pageSize + 1} - ${Math.min(page * pageSize, total)} of ${total}`}
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(1)}>First</Button>
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
                  <span>Page {page} of {totalPages}</span>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>Last</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
        </Card>
      </div>
    </div>
  );
}
