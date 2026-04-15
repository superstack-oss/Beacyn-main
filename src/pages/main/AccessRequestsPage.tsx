import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { apiUrl } from '../../lib/api';
import { authHeaders, getStoredUser } from '../../lib/auth';
import { Check, Clock3, MessageSquareText, Settings, UserCheck, UserRound, UserX, X } from 'lucide-react';

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
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
      <h3 className="text-sm font-semibold text-zinc-700 mb-1">{title}</h3>
      <p className="text-xs text-zinc-400 text-center max-w-xs">{message}</p>
    </div>
  );
}

type RequestStatus = 'pending' | 'approved' | 'rejected';

interface AccessRequest {
  id: number;
  full_name: string | null;
  employee_id: string | null;
  contact_number: string | null;
  email: string;
  role: string;
  team: string | null;
  company: string | null;
  manager_name: string | null;
  manager_email: string | null;
  account_status: RequestStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

const FILTERS: Array<{ key: RequestStatus; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

function formatDate(value: string | null): string {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString();
}

function statusBadgeClass(status: RequestStatus): string {
  if (status === 'approved') return 'border-emerald-200 text-emerald-700 bg-emerald-50';
  if (status === 'rejected') return 'border-rose-200 text-rose-700 bg-rose-50';
  return 'border-amber-200 text-amber-700 bg-amber-50';
}

function roleLabel(role: string): string {
  const value = String(role || '').toLowerCase();
  if (value === 'admin') return 'Administrator';
  if (value === 'superuser') return 'SuperUser';
  return 'Staff';
}

export default function AccessRequestsPage() {
  const currentUser = getStoredUser();
  const isAdmin = currentUser?.role === 'admin';

  const [statusFilter, setStatusFilter] = useState<RequestStatus>('pending');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  const selected = useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId]
  );

  const loadRequests = async (status: RequestStatus) => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl(`/api/auth/requests?status=${status}`), { headers: authHeaders() });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to load requests');
      }
      const data = await res.json();
      const rows = Array.isArray(data) ? (data as AccessRequest[]) : [];
      setRequests(rows);
      setSelectedId((prev) => (rows.some((r) => r.id === prev) ? prev : null));
      if (!rows.some((r) => r.id === selectedId)) {
        setIsDetailOpen(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load requests');
      setRequests([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests(statusFilter);
  }, [statusFilter]);

  const approveRequest = async (id: number) => {
    try {
      const res = await fetch(apiUrl(`/api/auth/requests/${id}/approve`), {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to approve request');
      }
      await loadRequests(statusFilter);
    } catch (err: any) {
      window.alert(err?.message || 'Failed to approve request');
    }
  };

  const rejectRequest = async (id: number) => {
    const reason = rejectComment.trim();
    if (!reason) {
      setRejectError('Please provide rejection comments before submitting.');
      return;
    }

    setSubmittingReject(true);
    setRejectError('');
    try {
      const res = await fetch(apiUrl(`/api/auth/requests/${id}/reject`), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to reject request');
      }
      setRejectingId(null);
      setRejectComment('');
      await loadRequests(statusFilter);
    } catch (err: any) {
      setRejectError(err?.message || 'Failed to reject request');
    } finally {
      setSubmittingReject(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808014_1px,transparent_1px),linear-gradient(to_bottom,#80808014_1px,transparent_1px)] bg-[size:14px_14px] dark:hidden" />
        <div className="pointer-events-none absolute inset-0 -z-10 hidden dark:block bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:14px_14px]" />
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Admin access is required to review account requests.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808014_1px,transparent_1px),linear-gradient(to_bottom,#80808014_1px,transparent_1px)] bg-[size:14px_14px] dark:hidden" />
      <div className="pointer-events-none absolute inset-0 -z-10 hidden dark:block bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:14px_14px]" />
      <div className="space-y-4 max-w-7xl">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((filter) => (
              <Button
                key={filter.key}
                size="sm"
                variant={statusFilter === filter.key ? 'default' : 'outline'}
                className="h-8 text-xs"
                onClick={() => setStatusFilter(filter.key)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-zinc-500">Click a request row to view full details and audit timeline.</p>
        </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
        {loading ? (
          <p className="p-4 text-sm text-zinc-500">Loading requests...</p>
        ) : error ? (
          <p className="p-4 text-sm text-rose-600">{error}</p>
        ) : requests.length === 0 ? (
          <div className="border-2 border-dashed border-zinc-100 rounded-lg m-4">
            <EmptyState
              title={`No ${statusFilter} requests`}
              message={
                statusFilter === 'pending'
                  ? 'All access requests have been reviewed. Nothing awaiting action.'
                  : statusFilter === 'approved'
                  ? 'No approved requests to display at this time.'
                  : 'No rejected requests to display at this time.'
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role / Team</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow
                  key={req.id}
                  onClick={() => {
                    setSelectedId(req.id);
                    setIsDetailOpen(true);
                  }}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{req.full_name || req.email}</p>
                      <p className="text-xs text-zinc-500">{req.email}</p>
                      <p className="text-xs text-zinc-500">Emp ID: {req.employee_id || 'N/A'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{roleLabel(req.role)}</p>
                    <p className="text-xs text-zinc-500">{req.team || 'No Team'}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`capitalize ${statusBadgeClass(req.account_status)}`}>
                      {req.account_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-600 dark:text-zinc-400">{formatDate(req.created_at)}</TableCell>
                  <TableCell className="text-right">
                    {req.account_status === 'pending' ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Open access request actions"
                            className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              approveRequest(req.id);
                            }}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Approve
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2 text-rose-600 focus:text-rose-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRejectingId(req.id);
                              setRejectComment('');
                              setRejectError('');
                            }}
                          >
                            <UserX className="h-3.5 w-3.5" />
                            Reject
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="text-xs text-zinc-500">Reviewed</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        </div>

        {isDetailOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setIsDetailOpen(false)}>
          <div
            className="w-full max-w-2xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Audit Trail and Full Details</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{selected.full_name || selected.email}</p>
              </div>
              <button
                type="button"
                className="text-zinc-400 hover:text-zinc-600"
                onClick={() => setIsDetailOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Requester</p>
                <p className="mt-1 text-sm font-semibold">{selected.full_name || selected.email}</p>
                <p className="text-xs text-zinc-500">{selected.email} • {selected.contact_number || 'No Contact'}</p>
                <p className="text-xs text-zinc-500">{selected.company || 'No Company'} • {roleLabel(selected.role)} • {selected.team || 'No Team'}</p>
              </div>

              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Registration Details</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-zinc-500">Employee ID</p>
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">{selected.employee_id || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Contact Number</p>
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">{selected.contact_number || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Manager Name</p>
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">{selected.manager_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Manager Email</p>
                    <p className="font-medium text-zinc-800 dark:text-zinc-200 break-all">{selected.manager_email || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Timeline</p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Clock3 className="h-4 w-4 mt-0.5 text-zinc-400" />
                    <div>
                      <p className="text-sm">Request submitted</p>
                      <p className="text-xs text-zinc-500">{formatDate(selected.created_at)}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    {selected.account_status === 'approved' ? (
                      <UserCheck className="h-4 w-4 mt-0.5 text-emerald-500" />
                    ) : selected.account_status === 'rejected' ? (
                      <UserX className="h-4 w-4 mt-0.5 text-rose-500" />
                    ) : (
                      <Clock3 className="h-4 w-4 mt-0.5 text-amber-500" />
                    )}
                    <div>
                      <p className="text-sm capitalize">Status: {selected.account_status}</p>
                      <p className="text-xs text-zinc-500">
                        {selected.reviewed_at ? `Reviewed by ${selected.reviewed_by || 'Admin'} on ${formatDate(selected.reviewed_at)}` : 'Awaiting admin review'}
                      </p>
                      {selected.account_status === 'rejected' && selected.rejection_reason ? (
                        <p className="mt-1 text-xs text-rose-600">Comment: {selected.rejection_reason}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {selected.account_status === 'pending' && (
                <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-3 text-xs text-zinc-500 flex items-center gap-2">
                  <UserRound className="h-4 w-4" />
                  Request is pending action. Use Approve or Reject from the table.
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {rejectingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
              <div>
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Reject Access Request</h4>
                <p className="text-xs text-zinc-500 mt-0.5">Rejection comments are required and will appear in the audit trail.</p>
              </div>
              <button
                type="button"
                className="text-zinc-400 hover:text-zinc-600"
                onClick={() => {
                  setRejectingId(null);
                  setRejectComment('');
                  setRejectError('');
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 py-3 space-y-2">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Rejection Comment</label>
              <textarea
                value={rejectComment}
                onChange={(e) => {
                  setRejectComment(e.target.value);
                  if (rejectError) setRejectError('');
                }}
                rows={4}
                placeholder="Add clear rejection reason for the requester..."
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500 flex items-center gap-1">
                  <MessageSquareText className="h-3.5 w-3.5" />
                  This comment is mandatory.
                </p>
                <p className="text-[11px] text-zinc-400">{rejectComment.trim().length} chars</p>
              </div>
              {rejectError ? <p className="text-xs text-rose-600">{rejectError}</p> : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejectingId(null);
                  setRejectComment('');
                  setRejectError('');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white"
                disabled={submittingReject}
                onClick={() => rejectRequest(rejectingId)}
              >
                {submittingReject ? 'Rejecting...' : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
