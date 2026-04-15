import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Upload, Network, Router, Shield, Server, Database, Cloud } from 'lucide-react';

type TopologyNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: 'dc' | 'connectivity' | 'security' | 'service';
};

type TopologyEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  status: 'up' | 'degraded';
};

const MOCK_NODES: TopologyNode[] = [
  { id: 'internet', label: 'Internet', x: 40, y: 32, w: 140, h: 56, tone: 'connectivity' },
  { id: 'mpls', label: 'MPLS Core', x: 230, y: 32, w: 150, h: 56, tone: 'connectivity' },
  { id: 'vpn', label: 'VPN Gateway', x: 430, y: 32, w: 150, h: 56, tone: 'security' },
  { id: 'dc-a', label: 'DC-A', x: 40, y: 140, w: 180, h: 68, tone: 'dc' },
  { id: 'dc-b', label: 'DC-B', x: 260, y: 140, w: 180, h: 68, tone: 'dc' },
  { id: 'vpc', label: 'Cloud VPC', x: 480, y: 140, w: 170, h: 68, tone: 'service' },
  { id: 'fw', label: 'Edge Firewall', x: 120, y: 262, w: 170, h: 64, tone: 'security' },
  { id: 'lb', label: 'Load Balancer', x: 330, y: 262, w: 170, h: 64, tone: 'service' },
  { id: 'app', label: 'App Cluster', x: 130, y: 370, w: 170, h: 64, tone: 'service' },
  { id: 'db', label: 'DB Cluster', x: 350, y: 370, w: 170, h: 64, tone: 'service' },
];

const MOCK_EDGES: TopologyEdge[] = [
  { id: 'e1', from: 'internet', to: 'mpls', label: 'Primary ISP', status: 'up' },
  { id: 'e2', from: 'mpls', to: 'vpn', label: 'Encrypted Tunnel', status: 'up' },
  { id: 'e3', from: 'vpn', to: 'dc-a', label: 'WAN Link', status: 'up' },
  { id: 'e4', from: 'vpn', to: 'dc-b', label: 'WAN Link', status: 'degraded' },
  { id: 'e5', from: 'vpn', to: 'vpc', label: 'Direct Connect', status: 'up' },
  { id: 'e6', from: 'dc-a', to: 'fw', label: 'Internal', status: 'up' },
  { id: 'e7', from: 'dc-b', to: 'lb', label: 'Internal', status: 'up' },
  { id: 'e8', from: 'fw', to: 'app', label: 'App Traffic', status: 'up' },
  { id: 'e9', from: 'lb', to: 'app', label: 'Service Mesh', status: 'up' },
  { id: 'e10', from: 'app', to: 'db', label: 'DB Replication', status: 'up' },
];

function toneClasses(tone: TopologyNode['tone']) {
  if (tone === 'dc') return 'bg-sky-50 border-sky-200 text-sky-700';
  if (tone === 'security') return 'bg-amber-50 border-amber-200 text-amber-700';
  if (tone === 'connectivity') return 'bg-violet-50 border-violet-200 text-violet-700';
  return 'bg-emerald-50 border-emerald-200 text-emerald-700';
}

export default function NetworkDiagramPage() {
  const [fileName, setFileName] = useState<string>('');

  const nodeMap = useMemo(() => {
    const map = new Map<string, TopologyNode>();
    for (const n of MOCK_NODES) map.set(n.id, n);
    return map;
  }, []);

  const stats = useMemo(() => {
    const up = MOCK_EDGES.filter((e) => e.status === 'up').length;
    const degraded = MOCK_EDGES.filter((e) => e.status === 'degraded').length;
    return {
      totalNodes: MOCK_NODES.length,
      totalLinks: MOCK_EDGES.length,
      up,
      degraded,
      dataCenters: MOCK_NODES.filter((n) => n.tone === 'dc').length,
    };
  }, []);

  return (
    <div className="space-y-6">
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Network className="w-4 h-4" /> Network Architecture Diagram
          </CardTitle>
          <CardDescription>
            Upload a CSV/Excel inventory to auto-generate topology. This preview currently uses mock data for DC and connectivity modeling.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block rounded-xl border-2 border-dashed border-zinc-300 p-6 text-center hover:border-zinc-500 transition-colors cursor-pointer bg-zinc-50/50">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFileName(f?.name || '');
              }}
            />
            <div className="flex flex-col items-center gap-2 text-zinc-600">
              <Upload className="w-5 h-5" />
              <p className="text-sm font-medium">Upload CSV or Excel</p>
              <p className="text-xs text-zinc-500">Expected columns example: site, zone, link_from, link_to, bandwidth, status</p>
              {fileName ? <p className="text-xs text-emerald-700">Selected: {fileName} (mock rendering active)</p> : null}
            </div>
          </label>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card size="sm" className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="pt-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Sites</p>
                <p className="text-xl font-semibold mt-1">{stats.totalNodes}</p>
              </CardContent>
            </Card>
            <Card size="sm" className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="pt-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Connectivity Links</p>
                <p className="text-xl font-semibold mt-1">{stats.totalLinks}</p>
              </CardContent>
            </Card>
            <Card size="sm" className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="pt-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Healthy Links</p>
                <p className="text-xl font-semibold mt-1 text-emerald-700">{stats.up}</p>
              </CardContent>
            </Card>
            <Card size="sm" className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="pt-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Data Centers</p>
                <p className="text-xl font-semibold mt-1">{stats.dataCenters}</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Topology Canvas (Mock)</CardTitle>
          <CardDescription>Degraded links are highlighted in amber.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-xl border border-zinc-200 bg-white">
            <div className="relative min-w-[740px] h-[470px]">
              <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
                {MOCK_EDGES.map((e) => {
                  const from = nodeMap.get(e.from);
                  const to = nodeMap.get(e.to);
                  if (!from || !to) return null;
                  const x1 = from.x + from.w / 2;
                  const y1 = from.y + from.h;
                  const x2 = to.x + to.w / 2;
                  const y2 = to.y;
                  const midX = (x1 + x2) / 2;
                  const midY = (y1 + y2) / 2;
                  const stroke = e.status === 'up' ? '#16a34a' : '#d97706';

                  return (
                    <g key={e.id}>
                      <path d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`} fill="none" stroke={stroke} strokeWidth="2.5" strokeDasharray={e.status === 'degraded' ? '8 6' : '0'} />
                      <text x={midX} y={midY - 4} textAnchor="middle" fill="#52525b" fontSize="11">{e.label}</text>
                    </g>
                  );
                })}
              </svg>

              {MOCK_NODES.map((n) => (
                <div
                  key={n.id}
                  className={`absolute rounded-xl border px-3 py-2 shadow-sm ${toneClasses(n.tone)}`}
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    {n.tone === 'dc' ? <Server className="w-3.5 h-3.5" /> : null}
                    {n.tone === 'connectivity' ? <Router className="w-3.5 h-3.5" /> : null}
                    {n.tone === 'security' ? <Shield className="w-3.5 h-3.5" /> : null}
                    {n.tone === 'service' && (n.id === 'db' ? <Database className="w-3.5 h-3.5" /> : <Cloud className="w-3.5 h-3.5" />)}
                    <span>{n.label}</span>
                  </div>
                  <p className="text-[11px] mt-1 opacity-80">{n.tone === 'dc' ? 'Data Center' : n.tone === 'connectivity' ? 'Connectivity' : n.tone === 'security' ? 'Security' : 'Service'}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-600" /> Link up</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-0.5 border-t-2 border-dashed border-amber-600" /> Link degraded</span>
            <Button size="sm" variant="outline" onClick={() => setFileName('')}>Reset mock upload</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
