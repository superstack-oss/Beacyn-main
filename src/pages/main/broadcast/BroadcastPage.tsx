import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Link2, Pencil, Plus, Radio, Settings, ShieldCheck, Trash2, Megaphone, Globe, AlertCircle, Info, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../../components/ui/dropdown-menu';
import { apiUrl } from '../../../lib/api';
import { authHeaders } from '../../../lib/auth';

type StatusPageRecord = {
  id: string;
  name: string;
  groupName: string;
  components: string[];
  timezone: string;
  companyName: string;
  pageAddress: string;
  showResponseCharts: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  publicToken: string;
};

type NotificationRecord = {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  is_global: number;
  status_page_id?: string | null;
  is_active: number;
  publish_at?: string | null;
  remove_at?: string | null;
  created_at: string;
};

const monitorOptions = [
  { value: 'servers', label: 'Servers' },
  { value: 'storage', label: 'Storage' },
  { value: 'vms', label: 'VMs' },
  { value: 'san', label: 'SAN' },
  { value: 'database', label: 'Database' },
  { value: 'uptime', label: 'Uptime' },
];

const initialForm = {
  name: '',
  groupName: 'Core Services',
  components: ['servers', 'database', 'uptime'],
  timezone: 'Asia/Kolkata',
  companyName: '',
  pageAddress: '',
  showResponseCharts: true,
};

function formatDate(value?: string | null) {
  if (!value) return 'N/A';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'N/A';
  return dt.toLocaleString();
}

function componentLabel(value: string) {
  const match = monitorOptions.find((item) => item.value === value);
  return match?.label || value;
}

export default function BroadcastPage() {
  const [pages, setPages] = useState<StatusPageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  // Notification State
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  const [showNotifForm, setShowNotifForm] = useState(false);
  const [notifContext, setNotifContext] = useState<{ isGlobal: boolean; pageId: string | null }>({ isGlobal: true, pageId: null });
  const [notifForm, setNotifForm] = useState({ title: '', message: '', severity: 'info', publish_at: '', remove_at: '' });

  const publicUrlFor = (token: string) => {
    if (typeof window === 'undefined') return `#broadcast/public/${token}`;
    return `${window.location.origin}${window.location.pathname}#broadcast/public/${token}`;
  };

  const loadPages = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/status-pages'), { headers: authHeaders() });
      const payload = await res.json().catch(() => ([]));
      if (!res.ok) throw new Error(payload?.error || 'Failed to load status pages');
      setPages(Array.isArray(payload) ? payload : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load status pages');
    } finally {
      setLoading(false);
    }
  };

  const loadNotifications = async () => {
    try {
      const res = await fetch(apiUrl('/api/status-notifications'), { headers: authHeaders() });
      const payload = await res.json().catch(() => ([]));
      if (!res.ok) throw new Error(payload?.error);
      setNotifications(Array.isArray(payload) ? payload : []);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    void loadPages();
    void loadNotifications();
  }, []);

  const handleToggleMonitor = (value: string) => {
    setForm((current) => ({
      ...current,
      components: current.components.includes(value)
        ? current.components.filter((item) => item !== value)
        : [...current.components, value],
    }));
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    setError('');
    if (!form.name.trim() || !form.companyName.trim() || !form.pageAddress.trim() || form.components.length === 0) {
      setError('Please complete the name, monitor selection, company, and page address fields.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(editingId ? apiUrl(`/api/status-pages/${editingId}`) : apiUrl('/api/status-pages'), {
        method: editingId ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Failed to ${editingId ? 'update' : 'create'} status page`);
      resetForm();
      await loadPages();
    } catch (err: any) {
      setError(err?.message || 'Failed to save status page');
    } finally {
      setSaving(false);
    }
  };

  const openNotifForm = (isGlobal: boolean, pageId: string | null = null) => {
    setNotifContext({ isGlobal, pageId });
    setNotifForm({ title: '', message: '', severity: 'info', publish_at: '', remove_at: '' });
    setShowNotifForm(true);
    setShowForm(false);
  };

  const handleNotifSubmit = async () => {
    setError('');
    if (!notifForm.title.trim() || !notifForm.message.trim()) {
      setError('Please provide a title and message.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl('/api/status-notifications'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          title: notifForm.title,
          message: notifForm.message,
          severity: notifForm.severity,
          is_global: notifContext.isGlobal,
          status_page_id: notifContext.pageId,
          publish_at: notifForm.publish_at || null,
          remove_at: notifForm.remove_at || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to create notification');
      setShowNotifForm(false);
      await loadNotifications();
    } catch (err: any) {
      setError(err?.message || 'Failed to create notification');
    } finally {
      setSaving(false);
    }
  };

  const toggleNotifActive = async (id: string, currentActive: number) => {
    try {
      await fetch(apiUrl(`/api/status-notifications/${id}/active`), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ is_active: currentActive ? 0 : 1 }),
      });
      await loadNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteNotif = async (id: string) => {
    const ok = window.confirm('Delete this notification permanently?');
    if (!ok) return;
    try {
      await fetch(apiUrl(`/api/status-notifications/${id}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      await loadNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = (page: StatusPageRecord) => {
    setEditingId(page.id);
    setShowForm(true);
    setForm({
      name: page.name,
      groupName: page.groupName,
      components: page.components,
      timezone: page.timezone,
      companyName: page.companyName,
      pageAddress: page.pageAddress,
      showResponseCharts: page.showResponseCharts,
    });
  };

  const handleDelete = async (page: StatusPageRecord) => {
    const ok = window.confirm(`Delete status page ${page.name}?`);
    if (!ok) return;
    try {
      const res = await fetch(apiUrl(`/api/status-pages/${page.id}`), { method: 'DELETE', headers: authHeaders() });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to delete status page');
      await loadPages();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete status page');
    }
  };

  const handleCopy = async (page: StatusPageRecord) => {
    try {
      await navigator.clipboard.writeText(publicUrlFor(page.publicToken));
      setCopiedId(page.id);
      window.setTimeout(() => setCopiedId(''), 1600);
    } catch {
      setCopiedId('');
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300">
                <Radio className="h-3.5 w-3.5" /> Custom Status Pages
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">Status page manager</h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Create secure public-facing status pages that show only the selected monitored components. Public visitors do not gain any portal access.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => openNotifForm(true)}>
                <Megaphone className="mr-1.5 h-4 w-4" /> Create global notification
              </Button>
              <Button onClick={() => { setShowForm((prev) => !prev); if (!showForm) setEditingId(null); }}>
                <Plus className="mr-1.5 h-4 w-4" /> {showForm ? 'Hide form' : 'Create status page'}
              </Button>

            </div>
          </div>
        </CardContent>
      </Card>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {showNotifForm ? (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/10 dark:bg-emerald-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {notifContext.isGlobal ? <Globe className="h-4 w-4 text-emerald-600" /> : <Megaphone className="h-4 w-4 text-emerald-600" />}
              {notifContext.isGlobal ? 'Create global notification' : 'Create status page notification'}
            </CardTitle>
            <CardDescription>
              {notifContext.isGlobal
                ? 'This banner will be displayed across ALL public status pages.'
                : 'This alert will only be displayed on the selected status page.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={notifForm.title} onChange={(e) => setNotifForm({ ...notifForm, title: e.target.value })} placeholder="e.g. Scheduled Database Maintenance" />
              </div>
              <div className="space-y-2">
                <Label>Severity</Label>
                <select
                  value={notifForm.severity}
                  onChange={(e) => setNotifForm({ ...notifForm, severity: e.target.value as any })}
                  className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300"
                >
                  <option value="info">Info (Blue)</option>
                  <option value="warning">Warning (Amber)</option>
                  <option value="critical">Critical (Red)</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Input value={notifForm.message} onChange={(e) => setNotifForm({ ...notifForm, message: e.target.value })} placeholder="Brief details about the event..." />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Publish At (Optional)</Label>
                <Input type="datetime-local" value={notifForm.publish_at} onChange={(e) => setNotifForm({ ...notifForm, publish_at: e.target.value })} />
                <p className="text-xs text-zinc-500">Leave blank to publish immediately.</p>
              </div>
              <div className="space-y-2">
                <Label>Remove At (Optional)</Label>
                <Input type="datetime-local" value={notifForm.remove_at} onChange={(e) => setNotifForm({ ...notifForm, remove_at: e.target.value })} />
                <p className="text-xs text-zinc-500">Leave blank to keep indefinitely.</p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleNotifSubmit} disabled={saving}>{saving ? 'Publishing...' : 'Publish notification'}</Button>
              <Button variant="outline" onClick={() => setShowNotifForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showForm ? (
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Settings className="h-4 w-4" /> {editingId ? 'Edit status page' : 'Create a custom status page'}</CardTitle>
            <CardDescription>Choose which components are visible and generate a secure public link for external viewers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="status-page-name">Name</Label>
                <Input id="status-page-name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Customer-facing status" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status-page-group">Group</Label>
                <Input id="status-page-group" value={form.groupName} onChange={(e) => setForm((prev) => ({ ...prev, groupName: e.target.value }))} placeholder="Core Services" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status-page-company">Company name</Label>
                <Input id="status-page-company" value={form.companyName} onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="Beacyn Labs." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status-page-timezone">Timezone</Label>
                <Input id="status-page-timezone" value={form.timezone} onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))} placeholder="Asia/Kolkata" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status-page-address">Your status page address</Label>
              <Input id="status-page-address" value={form.pageAddress} onChange={(e) => setForm((prev) => ({ ...prev, pageAddress: e.target.value }))} placeholder="status.company.com" />
              <p className="text-xs text-zinc-500">This is the subdomain or branded address your public status page points to.</p>
            </div>

            <div className="space-y-3">
              <Label>Monitors</Label>
              <div className="flex flex-wrap gap-2">
                {monitorOptions.map((option) => {
                  const active = form.components.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleToggleMonitor(option.value)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${active ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300' : 'border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300'}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" checked={form.showResponseCharts} onChange={(e) => setForm((prev) => ({ ...prev, showResponseCharts: e.target.checked }))} />
              Show response time charts on the public status page
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update page' : 'Create page'}</Button>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Status pages</CardTitle>
          <CardDescription>Name, group, creator, and secure public actions for each custom status page.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-zinc-500">Loading status pages...</div>
          ) : pages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
              No custom status pages yet. Create one to publish a secure read-only health view.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
                    <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Name</TableHead>
                    <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Group</TableHead>
                    <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Created by</TableHead>
                    <TableHead className="py-2 text-[10px] uppercase tracking-wide text-zinc-500">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((page, idx) => (
                    <TableRow
                      key={page.id}
                      className={`border-b border-zinc-100/80 dark:border-zinc-800/80 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/30 transition-colors ${idx % 2 === 1 ? 'bg-zinc-50/40 dark:bg-zinc-900/20' : ''}`}
                    >
                      <TableCell className="py-3 align-middle font-medium text-zinc-800 dark:text-zinc-100">
                        <div>{page.name}</div>
                        <div className="mt-1 text-xs text-zinc-500">{page.pageAddress}</div>
                      </TableCell>
                      <TableCell className="py-3 align-middle text-zinc-600 dark:text-zinc-300">
                        <div className="font-medium">{page.groupName}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {page.components.map((component) => (
                            <Badge key={component} variant="outline" className="text-[10px]">{componentLabel(component)}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 align-middle text-zinc-600 dark:text-zinc-300">
                        <div>{page.createdBy}</div>
                        <div className="text-xs text-zinc-500">{formatDate(page.createdAt)}</div>
                      </TableCell>
                      <TableCell className="py-3 text-center align-middle">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="Open actions menu"
                              className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(page); }} className="gap-2">
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openNotifForm(false, page.id); }} className="gap-2">
                              <Megaphone className="w-3.5 h-3.5" /> Notification
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(page); }} className="gap-2">
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(publicUrlFor(page.publicToken), '_blank', 'noopener,noreferrer'); }} className="gap-2">
                              <ExternalLink className="w-3.5 h-3.5" /> Open public view
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCopy(page); }} className="gap-2">
                              <Copy className="w-3.5 h-3.5" /> {copiedId === page.id ? 'Copied' : 'Copy public link'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="flex flex-col gap-2 p-4 text-sm text-zinc-600 dark:text-zinc-300 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Public links are token-protected and render a read-only status page without portal navigation.</div>
          <div className="flex items-center gap-2 text-xs text-zinc-500"><Link2 className="h-3.5 w-3.5" /> Secure access only</div>
        </CardContent>
      </Card>

      {notifications.length > 0 && (
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Active Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Notification</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Expire</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell>
                        <div className="font-medium text-sm flex items-center gap-2 max-w-[150px] sm:max-w-[250px] md:max-w-[400px] truncate">
                          {n.severity === 'info' && <Info className="w-4 h-4 text-blue-500 shrink-0" />}
                          {n.severity === 'warning' && <TriangleAlert className="w-4 h-4 text-amber-500 shrink-0" />}
                          {n.severity === 'critical' && <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
                          <span className="truncate">{n.title}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={n.is_global ? 'border-indigo-200 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : ''}>
                          {n.is_global ? 'Global' : 'Specific Page'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button onClick={() => toggleNotifActive(n.id, n.is_active)} className={`text-xs font-medium px-2 py-1 rounded-full border transition-colors ${n.is_active ? 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20' : 'border-zinc-200 text-zinc-500 bg-zinc-100 dark:bg-zinc-800 dark:border-zinc-700'}`}>
                          {n.is_active ? 'Live' : 'Hidden'}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-600 dark:text-zinc-400">
                        {n.publish_at && new Date(n.publish_at) > new Date() ? new Date(n.publish_at).toLocaleString() : <span className="text-zinc-400 dark:text-zinc-500">NA</span>}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-600 dark:text-zinc-400">
                        {n.remove_at ? new Date(n.remove_at).toLocaleString() : <span className="text-zinc-400 dark:text-zinc-500">NA</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="Open actions menu"
                              className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-32">
                            <DropdownMenuItem onClick={() => alert(n.message)} className="gap-2 cursor-pointer">
                              <Info className="w-3.5 h-3.5 text-zinc-500" /> Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteNotif(n.id)} className="gap-2 cursor-pointer text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950">
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
