import { useEffect, useMemo, useState } from 'react';
import { Eye, Edit, Plus, Search, Settings, Trash2, Workflow } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Button } from '../../../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { apiUrl } from '../../../lib/api';
import { authHeaders, getStoredUser } from '../../../lib/auth';
import type { DataCenterSummary } from '../../../lib/datacenters';

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12">
      <div className="relative mb-6 h-28 w-48 select-none pointer-events-none">
        <div className="absolute bottom-0 left-4 right-4 h-16 rotate-[-4deg] rounded-xl bg-zinc-100 shadow-sm" />
        <div className="absolute bottom-2 left-2 right-2 h-16 rotate-[2deg] rounded-xl border border-zinc-100 bg-zinc-50 shadow" />
        <div className="absolute bottom-4 left-0 right-0 flex h-16 items-center gap-3 rounded-xl border border-zinc-100 bg-white px-4 shadow">
          <div className="h-8 w-10 shrink-0 rounded bg-zinc-100" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-2.5 w-3/4 rounded-full bg-zinc-200" />
            <div className="h-2 w-1/2 rounded-full bg-zinc-100" />
            <div className="h-2 w-2/3 rounded-full bg-zinc-100" />
          </div>
        </div>
      </div>
      <h3 className="mb-1 text-sm font-semibold text-zinc-700">{title}</h3>
      <p className="max-w-xs text-center text-xs text-zinc-400">{message}</p>
    </div>
  );
}

interface DataCentersPageProps {
  onViewDetails: (dcId: string) => void;
  onAddNew: () => void;
  onOpenContinuityMap: () => void;
}

const typeColors: Record<string, { bg: string; text: string; dot: string }> = {
  colocation: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  shared: { bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  private: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
};

const typeLabels: Record<string, string> = {
  colocation: 'Colocation',
  shared: 'Shared',
  private: 'Private',
};

export default function DataCentersPage({ onViewDetails, onAddNew, onOpenContinuityMap }: DataCentersPageProps) {
  const currentUser = getStoredUser();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superuser';
  const [dataCenters, setDataCenters] = useState<DataCenterSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDataCenters = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/api/datacenters'), { headers: authHeaders() });
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const payload = contentType.includes('application/json') ? await response.json() : null;
      if (!response.ok) throw new Error(payload?.error || 'Failed to load data centers');
      setDataCenters(Array.isArray(payload) ? payload : []);
    } catch (err: any) {
      setDataCenters([]);
      setError(err?.message || 'Failed to load data centers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDataCenters();
  }, []);

  const filteredDCs = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return dataCenters;
    return dataCenters.filter((dc) =>
      [dc.name, dc.dcCode, dc.address, dc.city, dc.country, dc.contactPerson, dc.vendorProvider]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q))
    );
  }, [dataCenters, searchTerm]);

  const handleDelete = async (dcId: string) => {
    if (!confirm('Are you sure you want to delete this data center?')) return;
    try {
      const response = await fetch(apiUrl(`/api/datacenters/${dcId}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const payload = String(response.headers.get('content-type') || '').toLowerCase().includes('application/json') ? await response.json() : null;
      if (!response.ok) throw new Error(payload?.error || 'Failed to delete data center');
      setDataCenters((prev) => prev.filter((dc) => dc.id !== dcId));
    } catch (err: any) {
      alert(err?.message || 'Failed to delete data center');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/70 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {dataCenters.length} site{dataCenters.length === 1 ? '' : 's'}
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              Continuity workflow ready
            </span>
          </div>
          <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Add and manage your sites here, then open the continuity map to design failover and recovery relationships.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <Button onClick={onOpenContinuityMap} variant="outline" className="gap-2 border-zinc-300 bg-white/80 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:bg-zinc-900">
              <Workflow className="h-4 w-4" />
              DC Continuity Map
            </Button>
          ) : null}
          {isAdmin ? (
            <Button onClick={onAddNew} className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              Add Data Center
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="border-zinc-200/80 bg-white/80 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/70">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Search by name, code, city, provider, or contact..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-zinc-200 bg-white pl-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              />
            </div>
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Showing {filteredDCs.length} of {dataCenters.length} site{dataCenters.length === 1 ? '' : 's'}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200/80 bg-white/80 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/70">
        <CardContent className="pt-6">
          {loading ? (
            <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">Loading data centers...</div>
          ) : error ? (
            <div className="py-12 text-center text-red-600 dark:text-red-400">{error}</div>
          ) : filteredDCs.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-zinc-200/80 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-900/20">
              <EmptyState
                title={searchTerm ? 'No matching data centers' : 'No data centers yet'}
                message={searchTerm ? `No data centers match "${searchTerm}".` : 'Register your first data center to begin the continuity workflow.'}
              />
              {!searchTerm && isAdmin ? (
                <div className="-mt-4 flex justify-center pb-8">
                  <Button onClick={onAddNew} variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create your first data center
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-200 dark:border-zinc-800 hover:bg-transparent">
                    <TableHead className="font-semibold text-zinc-600 dark:text-zinc-400">Name</TableHead>
                    <TableHead className="font-semibold text-zinc-600 dark:text-zinc-400">Type</TableHead>
                    <TableHead className="font-semibold text-zinc-600 dark:text-zinc-400">Role</TableHead>
                    <TableHead className="font-semibold text-zinc-600 dark:text-zinc-400">Location</TableHead>
                    <TableHead className="font-semibold text-zinc-600 dark:text-zinc-400">Contact</TableHead>
                    <TableHead className="font-semibold text-zinc-600 dark:text-zinc-400">Provider</TableHead>
                    <TableHead className="w-12 text-right font-semibold text-zinc-600 dark:text-zinc-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDCs.map((dc) => {
                    const colors = typeColors[dc.type] ?? { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-700 dark:text-zinc-300', dot: 'bg-zinc-500' };
                    return (
                      <TableRow key={dc.id} className="border-zinc-100 transition-colors hover:bg-zinc-50/80 dark:border-zinc-800 dark:hover:bg-zinc-900/40">
                        <TableCell>
                          <div>
                            <p className="font-medium text-zinc-900 dark:text-zinc-50">{dc.name}</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{dc.dcCode}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${colors.bg} ${colors.text} border-0 shadow-sm`}>
                            <div className={`mr-1.5 h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                            {typeLabels[dc.type] ?? dc.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">{dc.dcRole}</TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-zinc-600 dark:text-zinc-400" title={dc.address}>{dc.city}, {dc.country}</TableCell>
                        <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">{dc.contactPerson}</TableCell>
                        <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">{dc.vendorProvider}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" aria-label="Open data center actions" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
                                <Settings className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onViewDetails(dc.id)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              {isAdmin ? (
                                <DropdownMenuItem onClick={() => onViewDetails(`${dc.id}:edit`)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                              ) : null}
                              {isAdmin ? (
                                <DropdownMenuItem onClick={() => handleDelete(dc.id)} className="text-red-600 dark:text-red-400">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
