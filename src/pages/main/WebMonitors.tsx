import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Settings, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, Info, AlertCircle, SlidersHorizontal, PauseCircle, Trash2 } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { BarChart, Bar, ResponsiveContainer } from 'recharts';
import { useState, useEffect } from 'react';
import MonitorDetails from './MonitorDetails';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';

const TinyBarChart = ({ data }: { data: number[] }) => {
  const chartData = data.map((val, i) => ({ name: `T${i}`, value: val }));
  return (
    <div className="h-10 w-32 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} barCategoryGap={1}>
          <Bar dataKey="value" fill="#22c55e" radius={[1, 1, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default function WebMonitors() {
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState<any>(null);

  useEffect(() => {
    const load = () => {
      fetch('http://localhost:3001/api/assets')
        .then(res => res.json())
        .then(data => { if (Array.isArray(data)) setEndpoints(data); })
        .catch(err => console.error('Error fetching monitors:', err));
    };
    load();
    const interval = setInterval(load, 30_000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const upCount = endpoints.filter(e => e.status?.toUpperCase() === 'UP').length;
  const downCount = endpoints.filter(e => e.status?.toUpperCase() === 'DOWN').length;
  const pausedCount = endpoints.filter(e => e.status?.toUpperCase() === 'PAUSED').length;
  const initCount = endpoints.filter(e => !e.status || e.status?.toUpperCase() === 'INITIALIZING').length;

  if (selectedMonitor) {
    return <MonitorDetails monitor={selectedMonitor} onBack={() => setSelectedMonitor(null)} />;
  }

  return (
    <div className="space-y-6">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: 'UP', count: upCount, color: 'text-emerald-500' },
          { title: 'DOWN', count: downCount, color: 'text-rose-500' },
          { title: 'PAUSED', count: pausedCount, color: 'text-amber-500' },
          { title: 'INITIALIZING', count: initCount, color: 'text-amber-500' }
        ].map((stat, i) => (
          <Card key={i} className="relative overflow-hidden bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 shadow-sm rounded-md h-28">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_14px] opacity-60"></div>
            <CardContent className="relative p-5 flex flex-col justify-center h-full">
              <div className="text-xs font-semibold text-zinc-500/80 dark:text-zinc-400 tracking-wide mb-1.5">{stat.title}</div>
              <div className={`text-4xl sm:text-5xl font-light tracking-tight ${stat.color}`}>
                {stat.count}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select defaultValue="type">
            <SelectTrigger className="w-[110px] bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 h-9 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent><SelectItem value="type">Type</SelectItem></SelectContent>
          </Select>
          
          <Select defaultValue="status">
            <SelectTrigger className="w-[110px] bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 h-9 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent><SelectItem value="status">Status</SelectItem></SelectContent>
          </Select>

          <Select defaultValue="state">
            <SelectTrigger className="w-[110px] bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 h-9 border-zinc-200 dark:border-zinc-800 shadow-sm rounded-md">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent><SelectItem value="state">State</SelectItem></SelectContent>
          </Select>
        </div>

        <Input 
          type="search" 
          placeholder="Search monitors..." 
          className="w-full sm:w-64 bg-white dark:bg-zinc-950 h-9 text-zinc-500"
        />
      </div>

      {/* Data Table */}
      <div className="border border-zinc-100 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-950 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-zinc-100 dark:border-zinc-800">
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80">NAME</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80">STATUS</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80">RESPONSE TIME</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80">TYPE</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 text-right pr-6">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {endpoints.map((ep, i) => (
              <TableRow 
                key={i} 
                className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800 group cursor-pointer"
                onClick={() => setSelectedMonitor(ep)}
              >
                <TableCell className="font-medium text-zinc-800 dark:text-zinc-300 py-4">
                  {ep.name}
                </TableCell>
                <TableCell className="py-4">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-semibold shadow-sm
                    ${ ep.status === 'Up' ? 'border-zinc-100 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
                      : ep.status === 'Down' ? 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400'
                      : 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400' }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      ep.status === 'Up' ? 'bg-emerald-500' : ep.status === 'Down' ? 'bg-rose-500' : 'bg-amber-400'
                    }`}></span>
                    {ep.status || 'Initializing'}
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex items-center gap-3">
                    <TinyBarChart data={Array.from({length: 20}, () => Math.floor(Math.random() * 50) + 10)} />
                    <div className="flex flex-col text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                      <span>{ep.last_response_ms != null ? `${ep.last_response_ms}ms` : '—'}</span>
                      <span className="text-zinc-300">{ep.last_checked_at ? new Date(ep.last_checked_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'pending'}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-4 text-zinc-600 dark:text-zinc-400 text-sm">
                  {ep.parent_type || ep.type || '—'}
                </TableCell>
                <TableCell className="py-4 text-right pr-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border-zinc-100 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 shadow-md">
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer text-sm"
                        onClick={() => ep.target_endpoint && window.open(
                          ep.target_endpoint.startsWith('http') ? ep.target_endpoint : `https://${ep.target_endpoint}`, '_blank'
                        )}
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-zinc-500" /> Open site
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer text-sm"
                        onClick={() => setSelectedMonitor(ep)}
                      >
                        <Info className="w-3.5 h-3.5 text-zinc-500" /> Details
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 cursor-pointer text-sm">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Incidents
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 cursor-pointer text-sm">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" /> Configure
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 cursor-pointer text-sm">
                        <PauseCircle className="w-3.5 h-3.5 text-blue-500" /> Pause
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="gap-2 cursor-pointer text-sm text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Table Footer / Pagination */}
        <div className="flex items-center justify-end px-5 py-4 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-6 text-sm text-zinc-600 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="text-xs">Rows per page:</span>
              <Select defaultValue="10">
                <SelectTrigger className="h-8 w-[65px] text-xs border-zinc-100 shadow-sm bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="text-xs">1-4 of 4</div>
            
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-xs" className="h-8 w-8 opacity-50 cursor-not-allowed">
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon-xs" className="h-8 w-8 opacity-50 cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon-xs" className="h-8 w-8 opacity-50 cursor-not-allowed">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon-xs" className="h-8 w-8 opacity-50 cursor-not-allowed">
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
