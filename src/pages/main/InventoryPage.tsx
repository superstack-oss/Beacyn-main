import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from '../../components/ui/sheet';
import { Plus, Search, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Settings, Trash2, PenLine, PauseCircle, Flag } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { apiUrl } from '../../lib/api';

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

type InventoryScope = 'all' | 'snmp' | 'agent' | 'uptime';

export default function InventoryPage({ scope = 'all' }: { scope?: InventoryScope }) {
  const [inventory, setInventory] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'user' | 'auto'>('all');
  const [page, setPage] = useState(1);

  // Form state
  const [newItemType, setNewItemType] = useState('Server');
  const [newSubItemType, setNewSubItemType] = useState('');
  const [newName, setNewName] = useState('');
  const [newEndpoint, setNewEndpoint] = useState('');
  const [newPortHost, setNewPortHost] = useState('');
  const [newPort, setNewPort] = useState('');
  const [newEnvironment, setNewEnvironment] = useState('Production');
  const [newDeviceCategory, setNewDeviceCategory] = useState('servers');

  const resetForm = () => {
    setNewItemType('Server');
    setNewSubItemType('');
    setNewName('');
    setNewEndpoint('');
    setNewPortHost('');
    setNewPort('');
    setNewEnvironment('Production');
    setNewDeviceCategory('servers');
  };

  const assetTypes: Record<string, string[]> = {
    'Server': ['RHEL', 'UNIX', 'LINUX', 'AIX', 'CentOS', 'Ubuntu', 'Fedora', 'HPUX'],
    'Storage': ['HPE', 'Infinidat', 'Pure', 'Dell EMC', 'NetApp', 'IBM', 'Hitachi'],
    'Appliance': [],
    'Switch': ['Brocade', 'Connextrix', 'Cisco', 'Aruba'],
    'Website': [],
    'API Endpoint': [],
    'Docker Host': [],
    'Docker Container': [],
    'Network Port': ['TCP', 'Port'],
  };

  useEffect(() => {
    const isUptimeAsset = (item: any) => {
      const explicit = String(item?.device_category || '').toLowerCase();
      const parent = String(item?.parent_type || '').toLowerCase();
      return explicit === 'uptime'
        || parent === 'website'
        || parent === 'api endpoint'
        || parent === 'network port'
        || parent === 'docker host'
        || parent === 'docker container';
    };

    const normalizeAgentStatus = (status: unknown) => {
      const value = String(status || '').toLowerCase();
      if (value === 'running' || value === 'active' || value === 'online') return 'Running';
      if (value === 'stopped' || value === 'inactive' || value === 'offline') return 'Stopped';
      return 'Stopped';
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
          status: normalizeAgentStatus(agent.heartbeat || agent.status),
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

    load().catch(err => console.error('Error fetching assets:', err));
  }, [scope]);

  const canAddAsset = scope !== 'agent';
  const isAgentScope = scope === 'agent';

  const agentStatusClass = (status: string) => {
    const value = String(status || '').toLowerCase();
    return value === 'running'
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
    if (!confirm('Delete this asset? This cannot be undone.')) return;
    try {
      await fetch(apiUrl(`/api/assets/${id}`), { method: 'DELETE' });
      setInventory(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const envColor = (env: string) => {
    const e = (env || '').toLowerCase();
    if (e === 'production') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900';
    if (e === 'staging') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900';
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900';
  };


  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808014_1px,transparent_1px),linear-gradient(to_bottom,#80808014_1px,transparent_1px)] bg-[size:14px_14px] dark:hidden" />
      <div className="pointer-events-none absolute inset-0 -z-10 hidden dark:block bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:14px_14px]" />
      <div className="space-y-6">
        {/* Header (standalone inventory only) */}
        {(scope === 'all' || canAddAsset) && (
          <div className={`flex flex-col sm:flex-row sm:items-center gap-4 ${scope === 'all' ? 'sm:justify-between' : 'sm:justify-end'}`}>
          {scope === 'all' && (
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-1">{isAgentScope ? 'Agent Inventory' : 'Asset Inventory'}</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{isAgentScope ? 'Review auto-detected agents and their current runtime state.' : 'Register and manage all your infrastructure assets and endpoints globally.'}</p>
            </div>
          )}

          {canAddAsset && <Sheet>
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
                <Label htmlFor="asset-type">Asset Type</Label>
                <Select value={newItemType} onValueChange={(val) => { setNewItemType(val); setNewSubItemType(''); }}>
                  <SelectTrigger id="asset-type"><SelectValue placeholder="Select asset type" /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(assetTypes).map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {assetTypes[newItemType]?.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor="asset-subtype">Vendor / OS / Protocol</Label>
                  <Select value={newSubItemType} onValueChange={setNewSubItemType}>
                    <SelectTrigger id="asset-subtype"><SelectValue placeholder="Select specification..." /></SelectTrigger>
                    <SelectContent>
                      {assetTypes[newItemType].map(sub => <SelectItem key={sub} value={sub}>{sub}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="asset-name">Asset Name</Label>
                <Input id="asset-name" placeholder="e.g. Primary DB Cluster" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>

              {(newItemType === 'Server' || newItemType === 'Storage' || newItemType === 'Appliance' || newItemType === 'Switch') && (
                <div className="grid gap-2">
                  <Label htmlFor="asset-ip">IP Address or Hostname</Label>
                  <Input id="asset-ip" placeholder="192.168.1.100" value={newEndpoint} onChange={e => setNewEndpoint(e.target.value)} />
                  {newItemType === 'Server' && <p className="text-xs text-zinc-500 mt-1">Requires Capture Agent to be installed post-registration.</p>}
                  {newItemType === 'Switch' && <p className="text-xs text-zinc-500 mt-1">SNMP polling will be configured automatically.</p>}
                </div>
              )}

              {(newItemType === 'Website' || newItemType === 'API Endpoint') && (
                <div className="grid gap-2">
                  <Label htmlFor="asset-url">Full URL</Label>
                  <Input id="asset-url" type="url" placeholder="https://api.pulseiq.dev/health" value={newEndpoint} onChange={e => setNewEndpoint(e.target.value)} />
                </div>
              )}

              {(newItemType === 'Docker Host' || newItemType === 'Docker Container') && (
                <div className="grid gap-2">
                  <Label htmlFor="asset-docker">Docker Socket / Container ID</Label>
                  <Input id="asset-docker" placeholder={newItemType === 'Docker Host' ? 'tcp://10.0.0.5:2375' : 'e.g. 9b4d... or container name'} value={newEndpoint} onChange={e => setNewEndpoint(e.target.value)} />
                </div>
              )}

              {newItemType === 'Network Port' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="asset-tcp-host">Hostname / IP</Label>
                    <Input id="asset-tcp-host" placeholder="redis.internal" value={newPortHost} onChange={e => setNewPortHost(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="asset-tcp-port">Port</Label>
                    <Input id="asset-tcp-port" type="number" placeholder="6379" value={newPort} onChange={e => setNewPort(e.target.value)} />
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

              <div className="grid gap-2">
                <Label htmlFor="asset-category">Device Category</Label>
                <Select value={newDeviceCategory} onValueChange={setNewDeviceCategory}>
                  <SelectTrigger id="asset-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="servers">Servers</SelectItem>
                    <SelectItem value="vms">VMs</SelectItem>
                    <SelectItem value="storage">Storage</SelectItem>
                    <SelectItem value="san">SAN</SelectItem>
                    <SelectItem value="computer">Computer</SelectItem>
                    <SelectItem value="uptime">Uptime</SelectItem>
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
                    if (newItemType === 'Network Port') {
                      target = newPortHost.trim() + (newPort ? `:${newPort.trim()}` : '');
                    }
                    if (!target) { alert('Please enter a valid endpoint / URL / IP address.'); return; }
                    const res = await fetch(apiUrl('/api/assets'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: newName || 'Unnamed Asset',
                        parent_type: newItemType,
                        sub_type: newSubItemType || null,
                        target_endpoint: target,
                        environment: newEnvironment,
                        device_category: newDeviceCategory,
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
        </Sheet>}
          </div>
        )}

      {/* Main Card */}
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-0 pt-5 px-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold">{isAgentScope ? 'Agent Registry' : 'Asset Registry'}</CardTitle>
              <CardDescription className="text-sm mt-0.5">{isAgentScope ? 'Auto-detected agents from the infrastructure database.' : 'Track and manage all entities available for monitoring.'}</CardDescription>
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
                {!isAgentScope && <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Environment</TableHead>}
                {!isAgentScope && <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Source</TableHead>}
                {isAgentScope && <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Status</TableHead>}
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
                const isStopped = isAgentScope && String(item.status || '').toLowerCase() !== 'running';
                return (
                <TableRow key={item.id} className={`border-b border-zinc-100 dark:border-zinc-800/60 group ${isStopped ? 'bg-zinc-50/60 dark:bg-zinc-900/20 opacity-60' : 'hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40'}`}>
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
                  {!isAgentScope && (
                    <TableCell className="py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium ${envColor(item.environment)}`}>
                        {item.environment}
                      </span>
                    </TableCell>
                  )}
                  {!isAgentScope && (
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
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium ${agentStatusClass(item.status)}`}>
                        {item.status || 'Stopped'}
                      </span>
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
                        <DropdownMenuItem className="gap-2 cursor-pointer text-sm">
                          <PenLine className="w-3.5 h-3.5 text-zinc-500" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer text-sm">
                          <PauseCircle className="w-3.5 h-3.5 text-amber-500" /> Suspend
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer text-sm">
                          <Flag className="w-3.5 h-3.5 text-blue-500" /> Report
                        </DropdownMenuItem>
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
