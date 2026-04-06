import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from '../../components/ui/sheet';
import { Plus, Search, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Settings2, Trash2, PenLine, PauseCircle, Flag } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';

const PAGE_SIZE = 10;

export default function InventoryPage() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Form state
  const [newItemType, setNewItemType] = useState('Server');
  const [newSubItemType, setNewSubItemType] = useState('');
  const [newName, setNewName] = useState('');
  const [newEndpoint, setNewEndpoint] = useState('');
  const [newPortHost, setNewPortHost] = useState('');
  const [newPort, setNewPort] = useState('');
  const [newEnvironment, setNewEnvironment] = useState('Production');

  const resetForm = () => {
    setNewItemType('Server');
    setNewSubItemType('');
    setNewName('');
    setNewEndpoint('');
    setNewPortHost('');
    setNewPort('');
    setNewEnvironment('Production');
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
    fetch('http://localhost:3001/api/assets')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setInventory(data); })
      .catch(err => console.error('Error fetching assets:', err));
  }, []);

  // Filtered + paginated data
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return inventory;
    return inventory.filter(item =>
      item.name?.toLowerCase().includes(q) ||
      item.id?.toLowerCase().includes(q) ||
      item.parent_type?.toLowerCase().includes(q) ||
      item.target_endpoint?.toLowerCase().includes(q) ||
      item.environment?.toLowerCase().includes(q)
    );
  }, [inventory, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1); }, [search]);

  // CSV download
  const downloadCSV = () => {
    const headers = ['Asset ID', 'Name', 'Type', 'Sub-Type', 'Target / Endpoint', 'Environment', 'Status', 'Last Checked'];
    const rows = filtered.map(item => [
      item.id,
      item.name,
      item.parent_type || '',
      item.sub_type || '',
      item.target_endpoint || '',
      item.environment || '',
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
      await fetch(`http://localhost:3001/api/assets/${id}`, { method: 'DELETE' });
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-1">Asset Inventory</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Register and manage all your infrastructure assets and endpoints globally.</p>
        </div>

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
                    const res = await fetch('http://localhost:3001/api/assets', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: newName || 'Unnamed Asset', parent_type: newItemType, sub_type: newSubItemType || null, target_endpoint: target, environment: newEnvironment })
                    });
                    if (res.ok) {
                      const newAsset = await res.json();
                      setInventory(prev => [newAsset, ...prev]);
                      resetForm();
                    }
                  } catch (err) { console.error('Failed to save asset:', err); }
                }}>Save Asset</Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Card */}
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-0 pt-5 px-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold">Asset Registry</CardTitle>
              <CardDescription className="text-sm mt-0.5">Track and manage all entities available for monitoring.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search assets..."
                  className="pl-8 h-9 w-56 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </div>
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
                <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Name</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Type</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Target / Endpoint</TableHead>
                <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Environment</TableHead>
                <TableHead className="pr-4 text-right font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-zinc-400 text-sm">
                    {search ? `No assets matching "${search}"` : 'No assets registered yet'}
                  </TableCell>
                </TableRow>
              )}
              {paginated.map((item) => (
                <TableRow key={item.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800/60 group">
                  <TableCell className="pl-6 font-mono text-xs text-zinc-400 py-4 whitespace-nowrap">{item.id}</TableCell>
                  <TableCell className="font-semibold text-zinc-800 dark:text-zinc-200 py-4">{item.name}</TableCell>
                  <TableCell className="py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {item.parent_type}{item.sub_type ? ` (${item.sub_type})` : ''}
                    </span>
                  </TableCell>
                  <TableCell className="py-4 max-w-[200px]">
                    <span className="text-sm text-blue-600 dark:text-blue-400 truncate block" title={item.target_endpoint}>
                      {item.target_endpoint}
                    </span>
                  </TableCell>
                  <TableCell className="py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium ${envColor(item.environment)}`}>
                      {item.environment}
                    </span>
                  </TableCell>
                  <TableCell className="py-4 pr-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          <Settings2 className="w-4 h-4" />
                        </Button>
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
              ))}
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
  );
}
