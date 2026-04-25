import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from '../../components/ui/sheet';
import { Plus, Search, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Settings, Trash2, PauseCircle, RefreshCw } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { apiUrl } from '../../lib/api';
import { authHeaders } from '../../lib/auth';

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

const PAGE_SIZE = 10;

function timeAgo(ts: string | null | undefined): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Returns true only if the agent sent a heartbeat within the last 2 minutes. */
function agentIsActive(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 2 * 60 * 1000;
}

function normalizeAgentStatus(status: unknown, lastSeenAt?: string | null): string {
  // Client-side freshness check — matches the server-side 2-minute threshold.
  // If the server already returned 'Online'/'Offline', trust it directly.
  const raw = String(status || '').toLowerCase();
  if (raw === 'online') return 'Online';
  if (raw === 'offline') return 'Offline';
  // Legacy / fallback: derive from lastSeenAt staleness
  return agentIsActive(lastSeenAt) ? 'Online' : 'Offline';
}

function snmpStatusClass(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'up') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900';
  if (s === 'degraded') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900';
  if (s === 'down') return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-900';
  return 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800';
}

type InventoryScope = 'all' | 'snmp' | 'agent' | 'uptime';

export default function InventoryPage({ scope = 'all' }: { scope?: InventoryScope }) {
  const [inventory, setInventory] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'user' | 'auto'>('all');
  const [page, setPage] = useState(1);

  // Form state
  const [newMonitorType, setNewMonitorType] = useState('Ping');
  const [newDeviceCategory, setNewDeviceCategory] = useState('');
  const [newName, setNewName] = useState('');
  const [newEndpoint, setNewEndpoint] = useState('');
  const [newPortHost, setNewPortHost] = useState('');
  const [newPort, setNewPort] = useState('');
  const [newEnvironment, setNewEnvironment] = useState('Production');

  const resetForm = () => {
    setNewMonitorType('Ping');
    setNewDeviceCategory('');
    setNewName('');
    setNewEndpoint('');
    setNewPortHost('');
    setNewPort('');
    setNewEnvironment('Production');
  };

  // SNMP device form state
  const [snmpName, setSnmpName] = useState('');
  const [snmpVendor, setSnmpVendor] = useState('');
  const [snmpHost, setSnmpHost] = useState('');
  const [snmpPort, setSnmpPort] = useState('161');
  const [snmpVersion, setSnmpVersion] = useState<'2c' | '3'>('2c');
  const [snmpDeviceType, setSnmpDeviceType] = useState<'storage' | 'san'>('storage');
  const [snmpCommunity, setSnmpCommunity] = useState('public');
  const [snmpUsername, setSnmpUsername] = useState('');
  const [snmpAuthProto, setSnmpAuthProto] = useState('SHA');
  const [snmpAuthKey, setSnmpAuthKey] = useState('');
  const [snmpPrivProto, setSnmpPrivProto] = useState('AES');
  const [snmpPrivKey, setSnmpPrivKey] = useState('');
  const [snmpSaving, setSnmpSaving] = useState(false);
  const [pollingDeviceId, setPollingDeviceId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const resetSnmpForm = () => {
    setSnmpName(''); setSnmpVendor(''); setSnmpHost(''); setSnmpPort('161');
    setSnmpVersion('2c'); setSnmpDeviceType('storage'); setSnmpCommunity('public');
    setSnmpUsername(''); setSnmpAuthProto('SHA'); setSnmpAuthKey('');
    setSnmpPrivProto('AES'); setSnmpPrivKey('');
  };

  const monitorTypes = ['Ping', 'HTTP(S)', 'Docker', 'Port', 'Game', 'gRPC', 'WebSocket', 'API Endpoint'];

  const deviceCategories: Record<string, string[]> = {
    'Ping': ['Server', 'VM', 'Storage', 'Switch', 'Appliance', 'Device/IP'],
    'HTTP(S)': ['Website'],
    'Docker': ['Docker container'],
    'Port': ['Port'],
    'Game': ['Minecraft', 'Source Engine', 'Unreal', 'Valheim', 'Rust', 'Other'],
    'gRPC': ['gRPC'],
    'WebSocket': ['WebSocket'],
    'API Endpoint': ['API Endpoint'],
  };

  useEffect(() => {
    const isUptimeAsset = (item: any) => {
      const explicit = String(item?.device_category || '').toLowerCase();
      const parent = String(item?.parent_type || '').toLowerCase();
      return explicit === 'uptime'
        || parent === 'ping'
        || parent === 'http(s)'
        || parent === 'docker'
        || parent === 'port'
        || parent === 'game'
        || parent === 'grpc'
        || parent === 'websocket'
        || parent === 'api endpoint';
    };

    const load = async () => {
      if (scope === 'agent') {
        const res = await fetch(apiUrl('/api/agents'));
        const data = await res.json();
        if (!Array.isArray(data)) return;
        setInventory(data.map((agent: any) => ({
          id: String(agent.agentUuid || agent.id || '-'),
          name: agent.hostname || agent.agentName || agent.agent_name || '-',
          hostname: agent.hostname || '-',
          agent_name: agent.agentName || agent.agent_name || '-',
          parent_type: 'Auto-detect',
          sub_type: null,
          target_endpoint: agent.targetEndpoint || agent.hostname || '-',
          environment: 'Auto-detected',
          heartbeat: agent.heartbeat || null,
          status: normalizeAgentStatus(agent.heartbeat || agent.status, agent.lastSeenAt || agent.lastHeartbeatAt),
          last_checked_at: agent.lastSeenAt || agent.lastHeartbeatAt || null,
          source: 'Auto Detected',
        })));
        return;
      }

      if (scope === 'snmp') {
        const res = await fetch(apiUrl('/api/snmp/devices'));
        const data = await res.json();
        if (!Array.isArray(data)) return;
        setInventory(data.map((d: any) => ({
          id: d.id,
          name: d.name,
          parent_type: 'SNMP Device',
          sub_type: [d.vendor, d.device_type].filter(Boolean).join(' ').trim() || null,
          target_endpoint: `${d.host}:${d.port}`,
          environment: 'User Configured',
          status: d.status || 'Unknown',
          last_checked_at: d.last_polled_at || null,
          source: 'User Added',
        })));
        return;
      }

      const res = await fetch(apiUrl('/api/assets'));
      const data = await res.json();
      if (!Array.isArray(data)) return;
      if (scope === 'uptime') {
        setInventory(data.filter(isUptimeAsset).map((item: any) => ({ ...item, source: 'User Added' })));
        return;
      }
      setInventory(data.map((item: any) => ({ ...item, source: 'User Added' })));
    };

    load().then(() => setLastRefreshed(new Date())).catch(err => console.error('Error fetching assets:', err));
  }, [scope]);

  const canAddAsset = scope === 'uptime';
  const canAddSnmpDevice = scope === 'snmp';
  const isSnmpScope = scope === 'snmp';
  const isAgentScope = scope === 'agent';

  const agentStatusClass = (status: string) => {
    const value = String(status || '').toLowerCase();
    return value === 'online'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900'
      : 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800';
  };

  // Filtered + paginated data
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return inventory.filter((item) => {
      const source = String(item.source || '').toLowerCase();
      const sourceMatches = sourceFilter === 'all'
        || (sourceFilter === 'user' && source !== 'auto detected')
        || (sourceFilter === 'auto' && source === 'auto detected');
      if (!sourceMatches) return false;

      if (!q) return true;
      return String(item.name || '').toLowerCase().includes(q)
        || String(item.id || '').toLowerCase().includes(q)
        || String(item.agent_name || '').toLowerCase().includes(q)
        || String(item.hostname || '').toLowerCase().includes(q)
        || String(item.parent_type || '').toLowerCase().includes(q)
        || String(item.target_endpoint || '').toLowerCase().includes(q)
        || String(item.environment || '').toLowerCase().includes(q)
        || String(item.status || '').toLowerCase().includes(q)
        || source.includes(q);
    });
  }, [inventory, search, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1); }, [search, sourceFilter]);

  // CSV download
  const downloadCSV = () => {
    const headers = isAgentScope
      ? ['Asset ID', 'Hostname', 'Agent Name', 'Target / Endpoint', 'Type', 'Status', 'Last Checked']
      : ['Asset ID', 'Name', 'Type', 'Sub-Type', 'Target / Endpoint', 'Environment', 'Source', 'Status', 'Last Checked'];
    const rows = filtered.map(item => isAgentScope
      ? [
          item.id,
          item.hostname || item.name || '',
          item.agent_name || '',
          item.target_endpoint || '',
          item.parent_type || 'Auto-detect',
          item.status || '',
          item.last_checked_at ? new Date(item.last_checked_at).toLocaleString() : 'Never',
        ]
      : [
          item.id,
          item.name,
          item.parent_type || '',
          item.sub_type || '',
          item.target_endpoint || '',
          item.environment || '',
          item.source || 'User Added',
          item.status || '',
          item.last_checked_at ? new Date(item.last_checked_at).toLocaleString() : 'Never',
        ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulseiq-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string) => {
    const label = isSnmpScope ? 'SNMP device' : isAgentScope ? 'agent' : 'asset';
    if (!confirm(`Delete this ${label} and all its related data? This cannot be undone.`)) return;
    try {
      let res: Response;
      if (isSnmpScope) {
        res = await fetch(apiUrl(`/api/snmp/devices/${encodeURIComponent(id)}`), { method: 'DELETE', headers: authHeaders() });
      } else if (isAgentScope) {
        res = await fetch(apiUrl(`/api/agents/${encodeURIComponent(id)}`), { method: 'DELETE', headers: authHeaders() });
      } else {
        res = await fetch(apiUrl(`/api/assets/${encodeURIComponent(id)}`), { method: 'DELETE', headers: authHeaders() });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        alert((body.error as string) || `Failed to delete ${label} (${res.status})`);
        return;
      }
      setInventory(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Delete failed. Check your connection and try again.');
    }
  };

  const handleSuspend = async (id: string, currentStatus: string) => {
    const newStatus = String(currentStatus).toUpperCase() === 'PAUSED' ? 'Active' : 'Paused';
    if (!confirm(`Are you sure you want to ${newStatus === 'Paused' ? 'suspend' : 'resume'} this asset?`)) return;
    try {
      const res = await fetch(apiUrl(`/api/assets/${id}/status`), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        alert((body.error as string) || `Failed to update asset status (${res.status})`);
        return;
      }
      setInventory(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
    } catch (err) {
      console.error('Failed to suspend:', err);
    }
  };

  const downloadTemplate = () => {
    const csv = "Name,Monitor Type,Device Category,Endpoint,Environment\nMy App,HTTP(S),Website,https://example.com,Production\n";
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'asset_template.csv';
    a.click(); URL.revokeObjectURL(url);
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return alert('File is empty or missing data rows');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const validRows = [];
      for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          const asset: any = {};
          headers.forEach((h, idx) => { asset[h] = cols[idx]; });
          validRows.push(asset);
      }
      let added = 0;
      for (const row of validRows) {
          if (!row['name'] || !row['monitor type'] || !row['endpoint']) continue;
          try {
            await fetch(apiUrl('/api/assets'), {
               method: 'POST',
               headers: authHeaders(),
               body: JSON.stringify({
                  name: row['name'],
                  parent_type: row['monitor type'],
                  sub_type: row['device category'] || null,
                  target_endpoint: row['endpoint'],
                  environment: row['environment'] || 'Production',
                  device_category: 'uptime'
               })
            });
            added++;
          } catch(e) { console.error('Bulk upload row failure:',row,e); }
      }
      alert(`Bulk upload finished! Imported ${added} assets.`);
      window.location.reload();
    };
    reader.readAsText(file);
  };

  const envColor = (env: string) => {
    const e = (env || '').toLowerCase();
    if (e === 'production') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900';
    if (e === 'staging') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900';
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900';
  };

  const handleRefreshInventory = async () => {
    setRefreshing(true);
    try {
      if (isSnmpScope) {
        const res = await fetch(apiUrl('/api/snmp/devices'));
        const data = await res.json();
        if (Array.isArray(data)) {
          setInventory(data.map((d: any) => ({
            id: d.id,
            name: d.name,
            parent_type: 'SNMP Device',
            sub_type: [d.vendor, d.device_type].filter(Boolean).join(' ').trim() || null,
            target_endpoint: `${d.host}:${d.port}`,
            environment: 'User Configured',
            status: d.status || 'Unknown',
            last_checked_at: d.last_polled_at || null,
            source: 'User Added',
          })));
        }
      } else if (isAgentScope) {
        const res = await fetch(apiUrl('/api/agents'));
        const data = await res.json();
        if (Array.isArray(data)) {
          setInventory(data.map((agent: any) => ({
            id: String(agent.agentUuid || agent.id || '-'),
            name: agent.hostname || agent.agentName || agent.agent_name || '-',
            hostname: agent.hostname || '-',
            agent_name: agent.agentName || agent.agent_name || '-',
            parent_type: 'Auto-detect',
            sub_type: null,
            target_endpoint: agent.targetEndpoint || agent.hostname || '-',
            environment: 'Auto-detected',
            heartbeat: agent.heartbeat || null,
            status: normalizeAgentStatus(agent.heartbeat || agent.status, agent.lastSeenAt || agent.lastHeartbeatAt),
            last_checked_at: agent.lastSeenAt || agent.lastHeartbeatAt || null,
            source: 'Auto Detected',
          })));
        }
      }
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handlePollDevice = async (deviceId: string) => {
    setPollingDeviceId(deviceId);
    try {
      const res = await fetch(apiUrl(`/api/snmp/devices/${encodeURIComponent(deviceId)}/poll`), { method: 'POST', headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        alert((err.error as string) || 'SNMP poll failed.');
        return;
      }
      // Refresh device list to pick up updated status
      const devRes = await fetch(apiUrl('/api/snmp/devices'));
      const data = await devRes.json();
      if (Array.isArray(data)) {
        setInventory(prev => prev.map(item => {
          const fresh = (data as any[]).find((d: any) => d.id === item.id);
          if (!fresh) return item;
          return { ...item, status: fresh.status || 'Unknown', last_checked_at: fresh.last_polled_at || null };
        }));
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.error('Poll failed:', err);
    } finally {
      setPollingDeviceId(null);
    }
  };

  // Auto-refresh connectivity status: SNMP every 60 s, agents every 30 s
  useEffect(() => {
    if (!isSnmpScope && !isAgentScope) return;
    const interval = setInterval(async () => {
      try {
        if (isSnmpScope) {
          const res = await fetch(apiUrl('/api/snmp/devices'));
          const data = await res.json();
          if (Array.isArray(data)) {
            setInventory(data.map((d: any) => ({
              id: d.id, name: d.name,
              parent_type: 'SNMP Device',
              sub_type: [d.vendor, d.device_type].filter(Boolean).join(' ').trim() || null,
              target_endpoint: `${d.host}:${d.port}`,
              environment: 'User Configured',
              status: d.status || 'Unknown',
              last_checked_at: d.last_polled_at || null,
              source: 'User Added',
            })));
            setLastRefreshed(new Date());
          }
        } else {
          const res = await fetch(apiUrl('/api/agents'));
          const data = await res.json();
          if (Array.isArray(data)) {
            setInventory(data.map((agent: any) => ({
              id: String(agent.agentUuid || agent.id || '-'),
              name: agent.hostname || agent.agentName || agent.agent_name || '-',
              hostname: agent.hostname || '-',
              agent_name: agent.agentName || agent.agent_name || '-',
              parent_type: 'Auto-detect',
              sub_type: null,
              target_endpoint: agent.targetEndpoint || agent.hostname || '-',
              environment: 'Auto-detected',
              heartbeat: agent.heartbeat || null,
              status: normalizeAgentStatus(agent.heartbeat || agent.status, agent.lastSeenAt || agent.lastHeartbeatAt),
              last_checked_at: agent.lastSeenAt || agent.lastHeartbeatAt || null,
              source: 'Auto Detected',
            })));
            setLastRefreshed(new Date());
          }
        }
      } catch { /* silently ignore auto-refresh errors */ }
    }, isAgentScope ? 30_000 : 60_000);
    return () => clearInterval(interval);
  }, [isSnmpScope, isAgentScope]);


  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808014_1px,transparent_1px),linear-gradient(to_bottom,#80808014_1px,transparent_1px)] bg-[size:14px_14px] dark:hidden" />
      <div className="pointer-events-none absolute inset-0 -z-10 hidden dark:block bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:14px_14px]" />
      <div className="space-y-6">
        {/* Header (standalone inventory only) */}
        {(scope === 'all' || canAddAsset || canAddSnmpDevice) && (
          <div className={`flex flex-col sm:flex-row sm:items-center gap-4 ${scope === 'all' ? 'sm:justify-between' : 'sm:justify-end'}`}>
          {scope === 'all' && (
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-1">{isAgentScope ? 'Agent Inventory' : 'Asset Inventory'}</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{isAgentScope ? 'Review auto-detected agents and their current runtime state.' : 'Register and manage all your infrastructure assets and endpoints globally.'}</p>
            </div>
          )}

          {canAddSnmpDevice && (
            <div className="flex items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button className="shadow-sm shrink-0">
                    <Plus className="w-4 h-4 mr-2" /> Add SNMP Device
                  </Button>
                </SheetTrigger>
                <SheetContent className="sm:max-w-lg flex flex-col overflow-hidden p-0">
                  {/* Header */}
                  <div className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                    <SheetTitle className="text-base font-semibold">Register SNMP Device</SheetTitle>
                    <SheetDescription className="text-sm mt-0.5">
                      Add a storage array, SAN switch, or network device for SNMP polling and syslog correlation.
                    </SheetDescription>
                  </div>

                  {/* Scrollable form body */}
                  <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                    {/* Device type — card selector */}
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Device Type</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { value: 'storage', label: 'Storage System', sub: 'NAS / SAN array, NetApp, EMC, HPE' },
                          { value: 'san',     label: 'SAN Switch',     sub: 'Brocade FOS, Cisco MDS' },
                        ] as const).map(({ value, label, sub }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setSnmpDeviceType(value)}
                            className={`text-left rounded-lg border px-3 py-3 transition-all ${
                              snmpDeviceType === value
                                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-50 dark:text-zinc-900'
                                : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
                            }`}
                          >
                            <p className="font-semibold text-sm">{label}</p>
                            <p className={`text-xs mt-0.5 ${snmpDeviceType === value ? 'opacity-70' : 'text-zinc-400'}`}>{sub}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Identity section */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Identity</p>
                      <div className="grid gap-1.5">
                        <Label htmlFor="snmp-name">
                          Device Name <span className="text-rose-500">*</span>
                        </Label>
                        <Input
                          id="snmp-name"
                          placeholder={snmpDeviceType === 'storage' ? 'e.g. NetApp-PROD-01' : 'e.g. Brocade-SAN-SW-01'}
                          value={snmpName}
                          onChange={e => setSnmpName(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="snmp-vendor">
                          Vendor <span className="text-zinc-400 font-normal text-xs">(optional)</span>
                        </Label>
                        <Select value={snmpVendor} onValueChange={setSnmpVendor}>
                          <SelectTrigger id="snmp-vendor">
                            <SelectValue placeholder="Select vendor…" />
                          </SelectTrigger>
                          <SelectContent>
                            {snmpDeviceType === 'storage' ? (
                              <>
                                <SelectItem value="NetApp">NetApp</SelectItem>
                                <SelectItem value="EMC">EMC / Dell</SelectItem>
                                <SelectItem value="HPE">HPE (Primera / Nimble)</SelectItem>
                                <SelectItem value="IBM">IBM</SelectItem>
                                <SelectItem value="Pure Storage">Pure Storage</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="Brocade">Brocade</SelectItem>
                                <SelectItem value="Cisco">Cisco MDS</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Connectivity section */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Connectivity</p>
                      <div className="grid grid-cols-[1fr_100px] gap-3 items-start">
                        <div className="grid gap-1.5">
                          <Label htmlFor="snmp-host">
                            Host / IP Address <span className="text-rose-500">*</span>
                          </Label>
                          <Input
                            id="snmp-host"
                            placeholder="10.0.0.100"
                            value={snmpHost}
                            onChange={e => setSnmpHost(e.target.value)}
                          />
                          <p className="text-xs text-zinc-400">Must match the IP this device sends syslog from.</p>
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="snmp-port">Port</Label>
                          <Input
                            id="snmp-port"
                            type="number"
                            min={1}
                            max={65535}
                            value={snmpPort}
                            onChange={e => setSnmpPort(e.target.value)}
                          />
                          <p className="text-xs text-zinc-400">Default: 161</p>
                        </div>
                      </div>
                    </div>

                    {/* Authentication section */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Authentication</p>
                      <div className="grid gap-1.5">
                        <Label>SNMP Version</Label>
                        <div className="flex gap-2">
                          {(['2c', '3'] as const).map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setSnmpVersion(v)}
                              className={`flex-1 py-2 rounded-md border text-sm font-medium transition-all ${
                                snmpVersion === v
                                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-50 dark:text-zinc-900'
                                  : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300'
                              }`}
                            >
                              {v === '2c' ? 'v2c' : 'v3'}
                              <span className={`block text-xs font-normal mt-0.5 ${snmpVersion === v ? 'opacity-70' : 'text-zinc-400'}`}>
                                {v === '2c' ? 'Community string' : 'Auth + Privacy'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {snmpVersion === '2c' && (
                        <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-4 py-3 space-y-3">
                          <div className="grid gap-1.5">
                            <Label htmlFor="snmp-community">Community String</Label>
                            <Input
                              id="snmp-community"
                              placeholder="public"
                              value={snmpCommunity}
                              onChange={e => setSnmpCommunity(e.target.value)}
                            />
                          </div>
                          <p className="text-xs text-zinc-400">
                            Use the read-only community string configured on the device (e.g. <span className="font-mono">storage-ro</span>). Avoid leaving this as <span className="font-mono">public</span> in production.
                          </p>
                        </div>
                      )}

                      {snmpVersion === '3' && (
                        <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-4 py-3 space-y-3">
                          <div className="grid gap-1.5">
                            <Label htmlFor="snmp-username">Username</Label>
                            <Input
                              id="snmp-username"
                              placeholder="snmpuser"
                              value={snmpUsername}
                              onChange={e => setSnmpUsername(e.target.value)}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                              <Label>Auth Protocol</Label>
                              <Select value={snmpAuthProto} onValueChange={setSnmpAuthProto}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="SHA">SHA (recommended)</SelectItem>
                                  <SelectItem value="MD5">MD5</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid gap-1.5">
                              <Label>Auth Key</Label>
                              <Input type="password" placeholder="min 8 chars" value={snmpAuthKey} onChange={e => setSnmpAuthKey(e.target.value)} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                              <Label>Priv Protocol</Label>
                              <Select value={snmpPrivProto} onValueChange={setSnmpPrivProto}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="AES">AES (recommended)</SelectItem>
                                  <SelectItem value="DES">DES</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid gap-1.5">
                              <Label>Priv Key</Label>
                              <Input type="password" placeholder="min 8 chars" value={snmpPrivKey} onChange={e => setSnmpPrivKey(e.target.value)} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="shrink-0 px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 flex items-center justify-between gap-3">
                    <p className="text-xs text-zinc-400"><span className="text-rose-500">*</span> Required fields</p>
                    <div className="flex gap-2">
                      <SheetClose asChild>
                        <Button variant="outline" onClick={resetSnmpForm}>Cancel</Button>
                      </SheetClose>
                      <Button
                        type="button"
                        disabled={snmpSaving || !snmpName.trim() || !snmpHost.trim()}
                        onClick={async () => {
                          setSnmpSaving(true);
                          try {
                            const body: Record<string, unknown> = {
                              name: snmpName.trim(),
                              vendor: snmpVendor.trim() || null,
                              host: snmpHost.trim(),
                              port: Number(snmpPort || 161),
                              snmpVersion,
                              deviceType: snmpDeviceType === 'storage' ? 'Storage' : 'Switch',
                              enabled: true,
                              pollIntervalSec: 60,
                              retentionHours: 48,
                            };
                            if (snmpVersion === '2c') {
                              body.community = snmpCommunity || 'public';
                            } else {
                              body.username = snmpUsername || null;
                              body.authProtocol = snmpAuthProto;
                              body.authKey = snmpAuthKey || null;
                              body.privProtocol = snmpPrivProto;
                              body.privKey = snmpPrivKey || null;
                            }
                            const res = await fetch(apiUrl('/api/snmp/devices'), {
                              method: 'POST',
                              headers: authHeaders(),
                              body: JSON.stringify(body),
                            });
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({})) as Record<string, unknown>;
                              alert((err.error as string) || 'Failed to register SNMP device.');
                              return;
                            }
                            const d = await res.json();
                            setInventory(prev => [{
                              id: d.id,
                              name: d.name,
                              parent_type: 'SNMP Device',
                              sub_type: [d.vendor, d.device_type].filter(Boolean).join(' ').trim() || null,
                              target_endpoint: `${d.host}:${d.port}`,
                              environment: 'User Configured',
                              status: d.status || 'Unknown',
                              last_checked_at: d.last_polled_at || null,
                              source: 'User Added',
                            }, ...prev]);
                            resetSnmpForm();
                          } catch (err) {
                            console.error('Failed to register SNMP device:', err);
                            alert('Failed to register SNMP device. See console for details.');
                          } finally {
                            setSnmpSaving(false);
                          }
                        }}
                      >
                        {snmpSaving ? 'Saving…' : 'Register Device'}
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          )}

          {canAddAsset && (
            <div className="flex items-center gap-2">
              <Sheet>
              <SheetTrigger asChild>
                <Button className="shadow-sm shrink-0">
                  <Plus className="w-4 h-4 mr-2" /> Add Asset
                </Button>
              </SheetTrigger>
              <SheetContent className="sm:max-w-xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Register New Asset</SheetTitle>
              <SheetDescription>Add a new server, website, or network endpoint to your monitoring inventory.</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-6 py-6 pb-24">
              <div className="grid gap-2">
                <Label htmlFor="monitor-type">Monitor Type</Label>
                <Select value={newMonitorType} onValueChange={(val) => { setNewMonitorType(val); setNewDeviceCategory(''); }}>
                  <SelectTrigger id="monitor-type"><SelectValue placeholder="Select monitor type" /></SelectTrigger>
                  <SelectContent>
                    {monitorTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {deviceCategories[newMonitorType]?.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor="device-category">Device Category</Label>
                  <Select value={newDeviceCategory} onValueChange={setNewDeviceCategory}>
                    <SelectTrigger id="device-category"><SelectValue placeholder="Select category..." /></SelectTrigger>
                    <SelectContent>
                      {deviceCategories[newMonitorType].map(sub => <SelectItem key={sub} value={sub}>{sub}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="asset-name">Asset Name</Label>
                <Input id="asset-name" placeholder="e.g. Primary DB Cluster" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>

              {newMonitorType === 'Ping' && (
                <div className="grid gap-2">
                  <Label htmlFor="asset-ip">IP Address or Hostname</Label>
                  <Input id="asset-ip" placeholder="192.168.1.100" value={newEndpoint} onChange={e => setNewEndpoint(e.target.value)} />
                  <p className="text-xs text-zinc-500 mt-1">Requires an ICMP reachable target.</p>
                </div>
              )}

              {(newMonitorType === 'HTTP(S)' || newMonitorType === 'API Endpoint' || newMonitorType === 'WebSocket') && (
                <div className="grid gap-2">
                  <Label htmlFor="asset-url">Full URL</Label>
                  <Input id="asset-url" type="url" placeholder={newMonitorType === 'WebSocket' ? 'wss://api.example.com/stream' : 'https://api.pulseiq.dev/health'} value={newEndpoint} onChange={e => setNewEndpoint(e.target.value)} />
                </div>
              )}

              {newMonitorType === 'gRPC' && (
                <div className="grid gap-2">
                  <Label htmlFor="asset-grpc">gRPC Endpoint</Label>
                  <Input id="asset-grpc" placeholder="grpc://api.internal:50051" value={newEndpoint} onChange={e => setNewEndpoint(e.target.value)} />
                </div>
              )}

              {(newMonitorType === 'Docker') && (
                <div className="grid gap-2">
                  <Label htmlFor="asset-docker">Docker Socket / Container ID</Label>
                  <Input id="asset-docker" placeholder="e.g. 9b4d... or container name" value={newEndpoint} onChange={e => setNewEndpoint(e.target.value)} />
                </div>
              )}

              {(newMonitorType === 'Port' || newMonitorType === 'Game') && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="asset-tcp-host">Hostname / IP</Label>
                    <Input id="asset-tcp-host" placeholder={newMonitorType === 'Game' ? "mc.example.com" : "redis.internal"} value={newPortHost} onChange={e => setNewPortHost(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="asset-tcp-port">{newMonitorType === 'Game' ? 'Query Port' : 'Port'}</Label>
                    <Input id="asset-tcp-port" type="number" placeholder={newMonitorType === 'Game' ? "25565" : "6379"} value={newPort} onChange={e => setNewPort(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="asset-env">Environment</Label>
                <Select value={newEnvironment} onValueChange={setNewEnvironment}>
                  <SelectTrigger id="asset-env"><SelectValue placeholder="Select environment" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Production">Production</SelectItem>
                    <SelectItem value="Staging">Staging</SelectItem>
                    <SelectItem value="Development">Development</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 px-6 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/90 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <SheetClose asChild>
                <Button variant="outline" className="w-full sm:w-auto" onClick={resetForm}>Cancel</Button>
              </SheetClose>
              <SheetClose asChild>
                <Button type="button" className="w-full sm:w-auto" onClick={async () => {
                  try {
                    let target = newEndpoint.trim();
                    if (newMonitorType === 'Port' || newMonitorType === 'Game') {
                      target = newPortHost.trim() + (newPort ? `:${newPort.trim()}` : '');
                    }
                    if (!target) { alert('Please enter a valid endpoint / URL / IP address.'); return; }
                    const res = await fetch(apiUrl('/api/assets'), {
                      method: 'POST',
                      headers: authHeaders(),
                      body: JSON.stringify({
                        name: newName || 'Unnamed Asset',
                        parent_type: newMonitorType,
                        sub_type: newDeviceCategory || null,
                        target_endpoint: target,
                        environment: newEnvironment,
                        device_category: 'uptime',
                      })
                    });
                    if (res.ok) {
                      const newAsset = await res.json();
                      setInventory(prev => [{ ...newAsset, source: 'User Added' }, ...prev]);
                      resetForm();
                    }
                  } catch (err) { console.error('Failed to save asset:', err); }
                }}>Save Asset</Button>
              </SheetClose>
            </div>
          </SheetContent>
          </Sheet>
          <div className="relative">
             <input type="file" accept=".csv" onChange={handleBulkUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" title="Bulk Upload CSV" />
             <Button variant="outline" className="shadow-sm shrink-0">
                Bulk Upload
             </Button>
          </div>
          <Button variant="ghost" onClick={downloadTemplate} className="text-sm underline text-zinc-500 hover:text-zinc-800">
             Get CSV Template
          </Button>
          </div>
        )}
          </div>
        )}

      {/* Main Card */}
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-0 pt-5 px-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold">
                {isAgentScope ? 'Agent Registry' : isSnmpScope ? 'SNMP Device Registry' : 'Asset Registry'}
              </CardTitle>
              <CardDescription className="text-sm mt-0.5">
                {isAgentScope ? 'Auto-detected agents from the infrastructure database.'
                  : isSnmpScope ? 'Registered SNMP devices for polling and syslog correlation.'
                  : 'Track and manage all entities available for monitoring.'}
                {(isSnmpScope || isAgentScope) && lastRefreshed && (
                  <span className="text-zinc-400"> · Updated {timeAgo(lastRefreshed.toISOString())}</span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={isAgentScope ? 'Search agents...' : 'Search assets...'}
                  className="pl-8 h-9 w-56 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </div>
              <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as 'all' | 'user' | 'auto')}>
                <SelectTrigger className="h-9 w-[150px] text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="user">User Added</SelectItem>
                  <SelectItem value="auto">Auto Detected</SelectItem>
                </SelectContent>
              </Select>
              {/* Download CSV */}
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm"
                onClick={downloadCSV}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export CSV
              </Button>
              {(isSnmpScope || isAgentScope) && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm"
                  onClick={() => void handleRefreshInventory()}
                  disabled={refreshing}
                  title="Refresh status"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-0 pt-4">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-zinc-100 dark:border-zinc-800">
                <TableHead className="pl-6 font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Asset ID</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">{isAgentScope ? 'Hostname' : 'Name'}</TableHead>
                {isAgentScope && <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Agent Name</TableHead>}
                <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Target / Endpoint</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Type</TableHead>
                {!isAgentScope && !isSnmpScope && <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Environment</TableHead>}
                {!isAgentScope && !isSnmpScope && <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Source</TableHead>}
                {(isAgentScope || isSnmpScope) && <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Status</TableHead>}
                {isSnmpScope && <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Last Checked</TableHead>}
                <TableHead className="pr-4 text-right font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAgentScope ? 7 : 7} className="p-0">
                    <div className="border-2 border-dashed border-zinc-100 rounded-lg m-4">
                      <EmptyState
                        title={search ? (isAgentScope ? 'No matching agents' : 'No matching assets') : (isAgentScope ? 'No agents detected yet' : 'No assets registered yet')}
                        message={search ? `${isAgentScope ? 'No agents' : 'No assets'} match "${search}". Try adjusting your search or filters.` : (isAgentScope ? 'Detected agents from the new database will appear here automatically.' : 'Add your first infrastructure asset to start monitoring.')}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {paginated.map((item) => {
                const isInactive =
                  (isAgentScope && String(item.status || '').toLowerCase() !== 'online') ||
                  (isSnmpScope && String(item.status || '').toLowerCase() === 'down');
                return (
                <TableRow key={item.id} className={`border-b border-zinc-100 dark:border-zinc-800/60 group ${isInactive ? 'bg-zinc-50/60 dark:bg-zinc-900/20 opacity-50' : 'hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40'}`}>
                  <TableCell className="pl-6 font-mono text-xs text-zinc-400 py-4 whitespace-nowrap">{item.id}</TableCell>
                  <TableCell className="font-semibold text-zinc-800 dark:text-zinc-200 py-4">{isAgentScope ? (item.hostname || item.name) : item.name}</TableCell>
                  {isAgentScope && <TableCell className="py-4 text-sm text-zinc-700 dark:text-zinc-300">{item.agent_name || '-'}</TableCell>}
                  <TableCell className="py-4 max-w-[200px]">
                    <span className="text-sm text-blue-600 dark:text-blue-400 truncate block" title={item.target_endpoint}>
                      {item.target_endpoint}
                    </span>
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {isAgentScope ? 'Auto-detect' : `${item.parent_type}${item.sub_type ? ` (${item.sub_type})` : ''}`}
                    </span>
                  </TableCell>
                  {!isAgentScope && !isSnmpScope && (
                    <TableCell className="py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium ${envColor(item.environment)}`}>
                        {item.environment}
                      </span>
                    </TableCell>
                  )}
                  {!isAgentScope && !isSnmpScope && (
                    <TableCell className="py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md border text-xs font-medium ${String(item.source || '').toLowerCase() === 'auto detected'
                        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900'
                        : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900'
                      }`}>
                        {item.source || 'User Added'}
                      </span>
                    </TableCell>
                  )}
                  {isAgentScope && (
                    <TableCell className="py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium w-fit ${agentStatusClass(item.status)}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${String(item.status || '').toLowerCase() === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
                          {item.status || 'Offline'}
                        </span>
                        {item.last_checked_at && (
                          <span className="text-xs text-zinc-400 pl-1">{timeAgo(item.last_checked_at)}</span>
                        )}
                      </div>
                    </TableCell>
                  )}
                  {isSnmpScope && (
                    <TableCell className="py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${snmpStatusClass(item.status)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          String(item.status || '').toLowerCase() === 'up' ? 'bg-emerald-500'
                          : String(item.status || '').toLowerCase() === 'degraded' ? 'bg-amber-400'
                          : String(item.status || '').toLowerCase() === 'down' ? 'bg-rose-500'
                          : 'bg-zinc-400'
                        }`} />
                        {item.status || 'Unknown'}
                      </span>
                    </TableCell>
                  )}
                  {isSnmpScope && (
                    <TableCell className="py-4 text-xs text-zinc-500">
                      {timeAgo(item.last_checked_at)}
                    </TableCell>
                  )}
                  <TableCell className="py-4 pr-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Open asset actions"
                          className="inline-flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 shadow-md">
                        {isSnmpScope ? (
                          <DropdownMenuItem
                            className="gap-2 cursor-pointer text-sm"
                            disabled={pollingDeviceId === item.id}
                            onClick={() => void handlePollDevice(item.id)}
                          >
                            <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${pollingDeviceId === item.id ? 'animate-spin' : ''}`} />
                            {pollingDeviceId === item.id ? 'Polling…' : 'Poll Now'}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="gap-2 cursor-pointer text-sm" onClick={() => handleSuspend(item.id, item.status)}>
                            <PauseCircle className={`w-3.5 h-3.5 ${String(item.status).toUpperCase() === 'PAUSED' ? 'text-emerald-500' : 'text-amber-500'}`} /> {String(item.status).toUpperCase() === 'PAUSED' ? 'Resume' : 'Suspend'}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer text-sm text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>

          {/* Pagination Footer */}
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20">
            <p className="text-xs text-zinc-500">
              {filtered.length === 0 ? 'No results' : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} asset${filtered.length !== 1 ? 's' : ''}`}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(1)}>
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {/* Page number pills */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '…' ? (
                    <span key={`el-${i}`} className="px-1 text-xs text-zinc-400">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={page === p ? 'default' : 'ghost'}
                      size="icon"
                      className={`h-8 w-8 text-xs ${page === p ? 'pointer-events-none' : ''}`}
                      onClick={() => setPage(p as number)}
                    >
                      {p}
                    </Button>
                  )
                )}
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(totalPages)}>
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
        </Card>
      </div>
    </div>
  );
}
