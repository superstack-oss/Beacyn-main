import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Cable,
  Edit2,
  Mail,
  Phone,
  Radar,
  Server,
  Shield,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import DataCenterForm, { type DataCenterFormPayload } from '../../../components/datacenter/DataCenterForm';
import { apiUrl } from '../../../lib/api';
import { authHeaders, getStoredUser } from '../../../lib/auth';
import type { DataCenterDetail, DataCenterSummary } from '../../../lib/datacenters';
import { fallbackNodePosition } from '../../../lib/datacenters';

interface DataCenterDetailsPageProps {
  dcId: string | null;
  onBack: () => void;
  onSaved: (dcId: string) => void;
}

type NodePosition = { left: string; top: string };

type ContinuityMapNode = {
  id: string;
  name: string;
  city: string;
  dcRole: DataCenterSummary['dcRole'];
  dcCode: string;
  mapPosX?: number | null;
  mapPosY?: number | null;
};

const typeLabels = {
  colocation: 'Colocation',
  shared: 'Shared',
  private: 'Private',
};

const typeColors = {
  colocation: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300' },
  shared: { bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-700 dark:text-violet-300' },
  private: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300' },
};

const roleTone = {
  Primary: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  'Disaster Recovery': 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  'Backup Site': 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  'Edge DC': 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300',
} as const;

function StatTile({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'accent' }) {
  return (
    <div className={`rounded-2xl border px-4 py-4 ${tone === 'accent' ? 'border-blue-200/80 bg-blue-50/80 dark:border-blue-900/60 dark:bg-blue-950/30' : 'border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/50'}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-zinc-950 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function InventoryAreaChart({
  items,
  max,
}: {
  items: Array<{ label: string; value: number; tone: string }>;
  max: number;
}) {
  const width = 520;
  const height = 220;
  const paddingX = 26;
  const topPad = 24;
  const bottomY = 170;
  const step = items.length > 1 ? (width - paddingX * 2) / (items.length - 1) : 0;

  const points = items.map((item, index) => {
    const x = paddingX + step * index;
    const normalized = max > 0 ? item.value / max : 0;
    const y = bottomY - normalized * 100;
    return { ...item, x, y };
  });

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? paddingX} ${bottomY} L ${points[0]?.x ?? paddingX} ${bottomY} Z`;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full">
        <defs>
          <linearGradient id="inventoryAreaFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((stepLine) => {
          const y = topPad + stepLine * 36;
          return <line key={stepLine} x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="currentColor" strokeOpacity="0.1" />;
        })}

        <path d={areaPath} fill="url(#inventoryAreaFill)" />
        <path d={linePath} fill="none" stroke="rgb(59 130 246)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="5.5" fill="white" stroke="rgb(59 130 246)" strokeWidth="2.5" />
            <text x={point.x} y={point.y - 12} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.75">{point.value}</text>
          </g>
        ))}
      </svg>

      <div className="mt-1 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white/80 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950/70">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full bg-gradient-to-r ${item.tone}`} />
              <span className="text-zinc-600 dark:text-zinc-300">{item.label}</span>
            </div>
            <span className="font-semibold text-zinc-950 dark:text-zinc-50">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContinuityEmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/70 px-8 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Continuity map not configured yet</p>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Add the data center first, then use the admin-only DC Continuity Map designer to connect and position sites.</p>
    </div>
  );
}

async function parseJsonResponseSafe(res: Response) {
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function DataCenterDetailsPage({ dcId, onBack, onSaved }: DataCenterDetailsPageProps) {
  const currentUser = getStoredUser();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superuser';
  const [dataCenter, setDataCenter] = useState<DataCenterDetail | null>(null);
  const [allDataCenters, setAllDataCenters] = useState<DataCenterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(Boolean(dcId?.includes(':edit')));
  const [error, setError] = useState('');

  const isCreateMode = dcId === 'new';
  const isEditMode = dcId?.includes(':edit');
  const cleanId = dcId?.replace(':edit', '') || '';

  const loadPageData = async () => {
    if (isCreateMode) {
      setLoading(false);
      setDataCenter(null);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [detailRes, listRes] = await Promise.all([
        fetch(apiUrl(`/api/datacenters/${cleanId}`), { headers: authHeaders() }),
        fetch(apiUrl('/api/datacenters'), { headers: authHeaders() }),
      ]);
      const detailJson = await parseJsonResponseSafe(detailRes);
      const listJson = await parseJsonResponseSafe(listRes);

      if (!detailRes.ok) throw new Error(detailJson?.error || 'Failed to load data center details');
      if (!listRes.ok) throw new Error(listJson?.error || 'Failed to load data centers');

      setDataCenter(detailJson as DataCenterDetail);
      setAllDataCenters(Array.isArray(listJson) ? listJson : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load data center details');
      setDataCenter(null);
      setAllDataCenters([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setIsEditing(Boolean(isEditMode));
  }, [isEditMode]);

  useEffect(() => {
    void loadPageData();
  }, [cleanId, isCreateMode]);

  const handleSave = async (formData: DataCenterFormPayload) => {
    try {
      const method = isCreateMode ? 'POST' : 'PUT';
      const target = isCreateMode ? apiUrl('/api/datacenters') : apiUrl(`/api/datacenters/${cleanId}`);
      const response = await fetch(target, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(formData),
      });
      const payload = await parseJsonResponseSafe(response);
      if (!response.ok) throw new Error(payload?.error || 'Failed to save data center');

      const savedId = String(payload?.id || cleanId);

      if (isCreateMode) {
        onSaved(savedId);
        return;
      }

      await loadPageData();
      setIsEditing(false);
      onSaved(savedId);
    } catch (err: any) {
      alert(err?.message || 'Failed to save data center');
    }
  };

  const visualLinks = useMemo(() => {
    if (!dataCenter) return [];
    return dataCenter.connectivity.filter((link) => link.targetName.trim());
  }, [dataCenter]);

  const continuityNodes = useMemo<ContinuityMapNode[]>(() => {
    if (!dataCenter) return [];

    const nodes = new Map<string, ContinuityMapNode>();

    allDataCenters.forEach((center) => {
      nodes.set(center.id, center);
    });

    nodes.set(dataCenter.id, {
      id: dataCenter.id,
      name: dataCenter.name,
      city: dataCenter.city,
      dcRole: dataCenter.dcRole,
      dcCode: dataCenter.dcCode,
      mapPosX: dataCenter.mapPosX,
      mapPosY: dataCenter.mapPosY,
    });

    return Array.from(nodes.values());
  }, [allDataCenters, dataCenter]);

  const continuityPositions = useMemo<Record<string, NodePosition>>(() => {
    return continuityNodes.reduce<Record<string, NodePosition>>((acc, center, index) => {
      const fallback = fallbackNodePosition(index);
      acc[center.id] = {
        left: `${center.mapPosX ?? fallback.x}%`,
        top: `${center.mapPosY ?? fallback.y}%`,
      };
      return acc;
    }, {});
  }, [continuityNodes]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (isEditing || isCreateMode) {
    return (
      <div>
        <button
          onClick={() => {
            if (isCreateMode) onBack();
            else if (isEditMode) onSaved(cleanId);
            else setIsEditing(false);
          }}
          className="mb-6 flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <DataCenterForm
          dataCenter={dataCenter}
          onSave={handleSave}
          onCancel={() => {
            if (isCreateMode) onBack();
            else if (isEditMode) onSaved(cleanId);
            else setIsEditing(false);
          }}
        />
      </div>
    );
  }

  if (error || !dataCenter) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="py-12 text-center">
          <p className="text-red-600 dark:text-red-400">{error || 'Data center not found'}</p>
        </div>
      </div>
    );
  }

  const rackUtilization = dataCenter.facility.rackCapacity.total > 0
    ? Math.round((dataCenter.facility.rackCapacity.used / dataCenter.facility.rackCapacity.total) * 100)
    : 0;
  const colors = typeColors[dataCenter.type];
  const primaryLink = dataCenter.connectivity[0] || null;
  const guardrails = dataCenter.guardrails ?? {
    operationalCoverage: '24x7' as const,
    operationalWorkHours: '24x7' as const,
    visitorAccessNeeded: 'No' as const,
    visitorDetails: {
      name: '',
      phone: '',
      officialEmail: '',
      vendor: '',
      visitDuration: '',
      specialInstructions: '',
    },
  };
  const inventoryMetrics = [
    { label: 'Physical Servers', value: Number(dataCenter.inventory.physicalServers || 0), tone: 'from-blue-500 to-cyan-400' },
    { label: 'Virtualization Hosts', value: Number(dataCenter.inventory.virtualizationHosts || 0), tone: 'from-violet-500 to-fuchsia-400' },
    { label: 'Storage Arrays', value: Number(dataCenter.inventory.storageArrays || 0), tone: 'from-emerald-500 to-teal-400' },
    { label: 'Network Devices', value: Number(dataCenter.inventory.networkDevices || 0), tone: 'from-amber-500 to-orange-400' },
    { label: 'Racks Occupied', value: Number(dataCenter.inventory.racksOccupied || 0), tone: 'from-slate-500 to-zinc-400' },
  ];
  const maxInventoryValue = Math.max(...inventoryMetrics.map((item) => item.value), 1);
  const totalHostedAssets = inventoryMetrics.reduce((sum, item) => sum + item.value, 0);
  const topInventoryMetric = [...inventoryMetrics].sort((a, b) => b.value - a.value)[0];

  const quickSections = [
    { id: 'section-overview', label: 'Overview' },
    { id: 'section-escalation', label: 'Escalation' },
    { id: 'section-capacity', label: 'Capacity' },
    { id: 'section-continuity', label: 'Continuity' },
    { id: 'section-inventory', label: 'Inventory' },
  ];

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            <Edit2 className="h-4 w-4" />
            Edit
          </button>
        ) : null}
      </div>

      <Card className="overflow-hidden border-zinc-200 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="bg-white/95 dark:bg-zinc-950/85">
          <CardHeader className="pb-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={`${colors.bg} ${colors.text} border-0`}>{typeLabels[dataCenter.type]}</Badge>
                  <Badge variant="outline" className={roleTone[dataCenter.dcRole]}>{dataCenter.dcRole}</Badge>
                  <Badge variant="outline" className="border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">{dataCenter.regionGroup}</Badge>
                </div>
                <div>
                  <CardTitle className="text-3xl tracking-tight text-zinc-950 dark:text-zinc-50">{dataCenter.name}</CardTitle>
                  <CardDescription className="mt-2 max-w-3xl text-base text-zinc-600 dark:text-zinc-300">
                    {dataCenter.dcCode} · {dataCenter.city}, {dataCenter.country} · {dataCenter.vendorProvider}
                  </CardDescription>
                </div>
              </div>
              <div className="grid min-w-[240px] grid-cols-2 gap-3">
                <StatTile label="Rack Utilization" value={`${dataCenter.facility.rackCapacity.used}/${dataCenter.facility.rackCapacity.total}`} tone="accent" />
                <StatTile label="Power Capacity" value={dataCenter.facility.powerCapacity} />
                <StatTile label="Paired DC" value={dataCenter.pairedDcName || 'Not linked'} />
                <StatTile label="24x7 NOC" value={dataCenter.nocContact.phone} />
              </div>
            </div>
          </CardHeader>
        </div>
      </Card>

      <div className="rounded-2xl border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex flex-wrap gap-2">
          {quickSections.map((section) => (
            <Button key={section.id} type="button" size="sm" variant="outline" onClick={() => scrollToSection(section.id)} className="h-8">
              {section.label}
            </Button>
          ))}
        </div>
      </div>

      <Card id="section-overview" className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Radar className="h-5 w-5 text-zinc-500" />Operational Overview</CardTitle>
          <CardDescription>The core reference data needed during audits, maintenance windows, and incident calls.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <DetailRow label="Data Center" value={`${dataCenter.name} (${dataCenter.dcCode})`} />
            <DetailRow label="Region" value={dataCenter.region} />
            <DetailRow label="Country / City" value={`${dataCenter.country} / ${dataCenter.city}`} />
            <DetailRow label="Address" value={dataCenter.exactAddress || dataCenter.address} />
            <DetailRow label="Owner Company" value={dataCenter.ownerCompany} />
            <DetailRow label="Business Unit" value={dataCenter.businessUnit || 'Not specified'} />
            <DetailRow label="Provider" value={dataCenter.vendorProvider} />
            <DetailRow label="Primary Owner" value={dataCenter.contactPerson} />
            <DetailRow label="Created On" value={new Date(dataCenter.createdAt).toLocaleString()} />
          </div>

          <div className="space-y-4 rounded-3xl border border-zinc-200 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Role & Pairing</p>
              <p className="mt-2 text-xl font-semibold text-zinc-950 dark:text-zinc-50">{dataCenter.dcRole}</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Primary continuity pairing: {dataCenter.pairedDcName || 'Not configured'}.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatTile label="Primary ISP" value={dataCenter.network.ispProviders.primary || 'Not set'} />
              <StatTile label="Secondary ISP" value={dataCenter.network.ispProviders.secondary || 'Not set'} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="section-continuity" className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Cable className="h-5 w-5 text-zinc-500" />DC Continuity Map</CardTitle>
          <CardDescription>Kept on the details page for review. Configure it separately in the admin continuity map designer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {continuityNodes.length === 0 ? (
            <ContinuityEmptyState />
          ) : (
            <>
              <div className="overflow-auto rounded-3xl border border-zinc-200 dark:border-zinc-800">
                <div className="relative h-[420px] min-h-[420px] min-w-[860px] overflow-hidden bg-[linear-gradient(to_right,rgba(113,113,122,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(113,113,122,0.07)_1px,transparent_1px)] bg-[size:36px_36px] p-6 dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] dark:bg-[size:36px_36px]">
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {visualLinks.map((link) => {
                    const from = continuityPositions[dataCenter.id];
                    const to = continuityPositions[link.targetId || ''];
                    if (!from || !to) return null;
                    return (
                      <line
                        key={`${dataCenter.id}-${link.targetId || link.targetName}`}
                        x1={parseFloat(from.left)}
                        y1={parseFloat(from.top)}
                        x2={parseFloat(to.left)}
                        y2={parseFloat(to.top)}
                        stroke={link.redundant ? '#14b8a6' : '#94a3b8'}
                        strokeWidth="0.7"
                        strokeDasharray={link.mode === 'Active-Active' ? '0' : '2 1.5'}
                        opacity="0.9"
                      />
                    );
                  })}
                  </svg>

                  {continuityNodes.map((center, index) => {
                  const fallback = fallbackNodePosition(index);
                  const pos = continuityPositions[center.id] || { left: `${fallback.x}%`, top: `${fallback.y}%` };
                  const isCurrent = center.id === dataCenter.id;
                  const isLinked = visualLinks.some((link) => link.targetId === center.id);
                  return (
                    <div key={center.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: pos.left, top: pos.top }}>
                      <div className={`rounded-2xl border px-4 py-3 shadow-sm backdrop-blur ${isCurrent ? 'border-blue-300 bg-blue-50/95 dark:border-blue-800 dark:bg-blue-950/80' : isLinked ? 'border-teal-200 bg-white/90 dark:border-teal-900 dark:bg-zinc-950/90' : 'border-zinc-200 bg-white/75 dark:border-zinc-800 dark:bg-zinc-950/75'}`}>
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${isCurrent ? 'bg-blue-500' : isLinked ? 'bg-teal-500' : 'bg-zinc-400'}`} />
                          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{center.name}</p>
                        </div>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{center.city} · {center.dcRole}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{center.dcCode}</p>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>

              {visualLinks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/70 px-5 py-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300">
                  Primary DC is shown above. No continuity links are configured yet.
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {visualLinks.map((link) => (
                    <div key={`${link.sourceDcId}-${link.targetId || link.targetName}`} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-zinc-950 dark:text-zinc-50">{link.targetName}</p>
                          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{link.connectionType} · {link.bandwidth} · {link.latencyMs} ms</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="border-zinc-200 dark:border-zinc-700">{link.mode}</Badge>
                          <Badge variant="outline" className="border-zinc-200 dark:border-zinc-700">{link.replicationType}</Badge>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <DetailRow label="Replication Tool" value={link.replicationTool || 'Not configured'} />
                        <DetailRow label="Failover" value={link.failover} />
                        <DetailRow label="RTO" value={link.rto || 'Not set'} />
                        <DetailRow label="RPO" value={link.rpo || 'Not set'} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div id="section-escalation" className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Shield className="h-5 w-5 text-zinc-500" />Escalation Path</CardTitle>
            <CardDescription>The three contacts that matter most during outages and planned activity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Primary Owner</p>
              <p className="mt-2 text-base font-semibold text-zinc-950 dark:text-zinc-50">{dataCenter.contactPerson}</p>
              <div className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-zinc-400" />{dataCenter.contactEmail}</div>
                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-zinc-400" />{dataCenter.contactPhone || 'Not set'}</div>
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">24x7 NOC</p>
              <p className="mt-2 text-base font-semibold text-zinc-950 dark:text-zinc-50">{dataCenter.nocContact.phone}</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{dataCenter.nocContact.email}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Emergency Bridge</p>
              <p className="mt-2 text-base font-semibold text-zinc-950 dark:text-zinc-50">{dataCenter.emergencyContact.name}</p>
              <div className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-zinc-400" />{dataCenter.emergencyContact.phone}</div>
                <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-zinc-400" />{dataCenter.emergencyContact.email || 'Not set'}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card id="section-capacity" className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Building2 className="h-5 w-5 text-zinc-500" />Capacity & Resilience</CardTitle>
            <CardDescription>Capacity headroom and resilience posture for operational planning.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <StatTile label="Building Type" value={dataCenter.facility.buildingType || 'Not set'} />
              <StatTile label="Redundancy" value={dataCenter.facility.redundancyLevel || 'Not set'} />
              <StatTile label="Power Capacity" value={dataCenter.facility.powerCapacity || 'Not set'} />
              <StatTile label="UPS Backup" value={dataCenter.facility.upsBackupDuration || 'Not set'} />
            </div>
            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Rack Capacity</p>
                  <p className="mt-2 text-xl font-semibold text-zinc-950 dark:text-zinc-50">{dataCenter.facility.rackCapacity.used} used / {dataCenter.facility.rackCapacity.total} total</p>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">{dataCenter.facility.rackCapacity.available} available</p>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${rackUtilization}%` }} />
              </div>
            </div>
            <DetailRow label="Generator Capacity" value={dataCenter.facility.generatorCapacity || 'Not set'} />
            <div className="grid gap-4 md:grid-cols-2">
              <DetailRow label="Primary ISP" value={dataCenter.network.ispProviders.primary || 'Not set'} />
              <DetailRow label="Secondary ISP" value={dataCenter.network.ispProviders.secondary || 'Not set'} />
              <DetailRow label="Primary Bandwidth" value={dataCenter.network.bandwidthPerLink.primary || 'Not set'} />
              <DetailRow label="Secondary Bandwidth" value={dataCenter.network.bandwidthPerLink.secondary || 'Not set'} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div id="section-inventory" className="space-y-6">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Server className="h-5 w-5 text-zinc-500" />Hosted Inventory</CardTitle>
            <CardDescription>The hosted footprint is visualized as a full-width area chart for quicker planning and review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
              <InventoryAreaChart items={inventoryMetrics} max={maxInventoryValue} />
              <div className="grid gap-4">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Total Hosted Assets</p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{totalHostedAssets}</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Across compute, storage, network, and rack footprint.</p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Largest Footprint</p>
                  <p className="mt-2 text-xl font-semibold text-zinc-950 dark:text-zinc-50">{topInventoryMetric?.label || 'N/A'}</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{topInventoryMetric?.value ?? 0} units recorded.</p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Rack Occupancy</p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{rackUtilization}%</p>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-500" style={{ width: `${rackUtilization}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Zap className="h-5 w-5 text-zinc-500" />Operational Guardrails</CardTitle>
            <CardDescription>Working hours, access expectations, and visitor readiness for the site.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatTile label="DC Operational" value={guardrails.operationalCoverage} tone="accent" />
              <StatTile label="Work Hours" value={guardrails.operationalWorkHours || '24x7'} />
              <StatTile label="Visitor Access Needed" value={guardrails.visitorAccessNeeded || 'No'} />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Ownership</p>
                <p className="mt-2 text-base font-semibold text-zinc-950 dark:text-zinc-50">{dataCenter.ownerCompany}</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Primary owner: {dataCenter.contactPerson}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Continuity Pairing</p>
                <p className="mt-2 text-base font-semibold text-zinc-950 dark:text-zinc-50">{dataCenter.pairedDcName || 'Not linked'}</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">RTO: {primaryLink?.rto || 'Not set'} · RPO: {primaryLink?.rpo || 'Not set'}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Emergency Escalation</p>
                <p className="mt-2 text-base font-semibold text-zinc-950 dark:text-zinc-50">{dataCenter.emergencyContact.name}</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{dataCenter.emergencyContact.phone}</p>
              </div>
            </div>

            {guardrails.visitorAccessNeeded === 'Yes' ? (
              <div className="space-y-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Visitor Details</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Pre-approved site-access information retained for operations.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <DetailRow label="Visitor Name" value={guardrails.visitorDetails.name || 'Not set'} />
                  <DetailRow label="Visitor Phone" value={guardrails.visitorDetails.phone || 'Not set'} />
                  <DetailRow label="Official Email" value={guardrails.visitorDetails.officialEmail || 'Not set'} />
                  <DetailRow label="Vendor" value={guardrails.visitorDetails.vendor || 'Not set'} />
                  <DetailRow label="Visit Duration" value={guardrails.visitorDetails.visitDuration || 'Not set'} />
                  <DetailRow label="Special Instructions" value={guardrails.visitorDetails.specialInstructions || 'None'} />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/70 px-5 py-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300">
                Visitor site access is currently marked as not required.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
