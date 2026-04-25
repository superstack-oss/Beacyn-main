import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Move, RefreshCw, Save, Trash2, Workflow } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { apiUrl } from '../../../lib/api';
import { authHeaders, getStoredUser } from '../../../lib/auth';
import type {
  ConnectionType,
  ContinuityLineStyle,
  ContinuityLineVariant,
  ConnectivityMode,
  DataCenterConnection,
  DataCenterContinuityMapPayload,
  DataCenterContinuityMapResponse,
  DataCenterSummary,
  FailoverType,
  ReplicationType,
} from '../../../lib/datacenters';
import { fallbackNodePosition } from '../../../lib/datacenters';

interface DataCenterContinuityMapPageProps {
  onBack: () => void;
}

type DragState = {
  id: string;
  pointerId: number;
  moved: boolean;
};

type DraftLink = {
  lineVariant: ContinuityLineVariant;
};

type ConnectState = {
  sourceId: string;
  pointerId: number;
  currentX: number;
  currentY: number;
};

type Point = { x: number; y: number };

type VariantDefinition = {
  label: string;
  description: string;
  lineColor: string;
  lineStyle: ContinuityLineStyle;
  laneOrder: number;
  routeBias: number;
};

type StrokeLayer = {
  color: string;
  dashArray: string;
  dashOffset?: number;
  opacity?: number;
};

const roleTone: Record<DataCenterSummary['dcRole'], { badge: string; node: string }> = {
  Primary: {
    badge: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
    node: 'border-blue-300 dark:border-blue-800',
  },
  'Disaster Recovery': {
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
    node: 'border-amber-300 dark:border-amber-800',
  },
  'Backup Site': {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
    node: 'border-emerald-300 dark:border-emerald-800',
  },
  'Edge DC': {
    badge: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900 dark:bg-fuchsia-950/40 dark:text-fuchsia-300',
    node: 'border-fuchsia-300 dark:border-fuchsia-800',
  },
};

const lineVariantDefinitions: Record<ContinuityLineVariant, VariantDefinition> = {
  'general-network': {
    label: 'General Interconnect',
    description: 'Dotted green line',
    lineColor: '#16a34a',
    lineStyle: 'dotted',
    laneOrder: 0,
    routeBias: -0.55,
  },
  replication: {
    label: 'Replication',
    description: 'Green/red dotted line',
    lineColor: '#dc2626',
    lineStyle: 'dotted',
    laneOrder: 1,
    routeBias: -0.15,
  },
  'bidirectional-replication': {
    label: 'Bidirectional Replication',
    description: 'Green/red/yellow dotted line',
    lineColor: '#2563eb',
    lineStyle: 'dotted',
    laneOrder: 2,
    routeBias: 0.22,
  },
  'secondary-network': {
    label: 'Redundant Connection',
    description: 'Gray dotted line with green/orange accents',
    lineColor: '#6b7280',
    lineStyle: 'dotted',
    laneOrder: 3,
    routeBias: 0.9,
  },
};

const lineVariantOrder = Object.keys(lineVariantDefinitions) as ContinuityLineVariant[];

function getVariantPreviewBackground(lineVariant: ContinuityLineVariant) {
  switch (lineVariant) {
    case 'general-network':
      return 'repeating-linear-gradient(to right, #22c55e 0 8px, transparent 8px 14px)';
    case 'replication':
      return 'repeating-linear-gradient(to right, #22c55e 0 7px, transparent 7px 11px, #ef4444 11px 18px, transparent 18px 22px)';
    case 'bidirectional-replication':
      return 'repeating-linear-gradient(to right, #22c55e 0 6px, transparent 6px 9px, #ef4444 9px 15px, transparent 15px 18px, #facc15 18px 24px, transparent 24px 28px)';
    case 'secondary-network':
      return 'repeating-linear-gradient(to right, #94a3b8 0 8px, transparent 8px 14px)';
    default:
      return '#22c55e';
  }
}

function getVariantStrokeLayers(lineVariant: ContinuityLineVariant): StrokeLayer[] {
  switch (lineVariant) {
    case 'general-network':
      return [
        { color: '#22c55e', dashArray: '1.05 2.15', opacity: 0.98 },
      ];
    case 'replication':
      return [
        { color: '#22c55e', dashArray: '1.05 4.2', dashOffset: 0, opacity: 0.98 },
        { color: '#ef4444', dashArray: '1.05 4.2', dashOffset: -2.1, opacity: 0.98 },
      ];
    case 'bidirectional-replication':
      return [
        { color: '#22c55e', dashArray: '0.95 4.8', dashOffset: 0, opacity: 0.98 },
        { color: '#ef4444', dashArray: '0.95 4.8', dashOffset: -1.6, opacity: 0.98 },
        { color: '#facc15', dashArray: '0.95 4.8', dashOffset: -3.2, opacity: 0.98 },
      ];
    case 'secondary-network':
      return [
        { color: '#94a3b8', dashArray: '1.05 2.25', opacity: 0.94 },
      ];
    default:
      return [
        { color: '#22c55e', dashArray: '1.05 2.15', opacity: 0.98 },
      ];
  }
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/70 px-8 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">No data centers available yet</p>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Add at least one data center first. After that, come back here to position nodes and create continuity links.</p>
    </div>
  );
}

function connectionKey(connection: Pick<DataCenterConnection, 'sourceDcId' | 'targetId' | 'targetName'>) {
  return `${connection.sourceDcId}::${connection.targetId || connection.targetName}::${(connection as DataCenterConnection).lineVariant || 'general-network'}`;
}

function connectionPairKey(connection: Pick<DataCenterConnection, 'sourceDcId' | 'targetId' | 'targetName'>) {
  const first = connection.sourceDcId;
  const second = connection.targetId || connection.targetName;
  return [first, second].sort().join('::');
}

function withVariantPreset(connection: DataCenterConnection, lineVariant: ContinuityLineVariant): DataCenterConnection {
  const definition = lineVariantDefinitions[lineVariant];
  return {
    ...connection,
    lineVariant,
    lineColor: definition.lineColor,
    lineStyle: definition.lineStyle,
  };
}

function buildDefaultConnection(source: DataCenterSummary, target: DataCenterSummary, draft: DraftLink): DataCenterConnection {
  return withVariantPreset({
    sourceDcId: source.id,
    targetId: target.id,
    targetName: target.name,
    regionGroup: source.regionGroup || target.regionGroup || '',
    lineVariant: draft.lineVariant,
    lineColor: '#16a34a',
    lineStyle: 'dotted',
    connectionType: 'MPLS',
    bandwidth: '',
    latencyMs: 0,
    redundant: true,
    mode: 'Active-Passive',
    replicationType: 'Asynchronous',
    replicationTool: '',
    failover: 'Manual',
    rto: '',
    rpo: '',
  }, draft.lineVariant);
}

function buildLanePath(from: Point, to: Point, lineVariant: ContinuityLineVariant, laneIndex: number, laneCount: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(Math.hypot(dx, dy), 0.001);
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const definition = lineVariantDefinitions[lineVariant];
  const laneOffsets = laneCount <= 1
    ? [0]
    : Array.from({ length: laneCount }, (_, index) => (index - ((laneCount - 1) / 2)) * 3.2);
  const laneOffset = laneOffsets[laneIndex] ?? 0;
  const bendAmplitude = Math.max(3, Math.min(8.2, distance * 0.11));
  const bias = laneOffset + (bendAmplitude * definition.routeBias);
  const controlA = {
    x: from.x + dx * 0.28 + normalX * bias,
    y: from.y + dy * 0.28 + normalY * bias,
  };
  const controlB = {
    x: from.x + dx * 0.72 - normalX * bias * 0.85,
    y: from.y + dy * 0.72 - normalY * bias * 0.85,
  };
  return {
    path: `M ${from.x} ${from.y} L ${controlA.x} ${controlA.y} L ${controlB.x} ${controlB.y} L ${to.x} ${to.y}`,
    labelX: (controlA.x + controlB.x) / 2,
    labelY: (controlA.y + controlB.y) / 2 + (normalY * 0.65),
  };
}

function getNodeIdFromPoint(clientX: number, clientY: number) {
  const element = document.elementFromPoint(clientX, clientY);
  if (!(element instanceof HTMLElement)) return null;
  const nodeElement = element.closest('[data-dc-node-id]');
  if (!(nodeElement instanceof HTMLElement)) return null;
  return nodeElement.dataset.dcNodeId || null;
}

export default function DataCenterContinuityMapPage({ onBack }: DataCenterContinuityMapPageProps) {
  const currentUser = getStoredUser();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superuser';
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const connectStateRef = useRef<ConnectState | null>(null);
  const suppressClickRef = useRef(false);
  const [nodes, setNodes] = useState<DataCenterSummary[]>([]);
  const [connections, setConnections] = useState<DataCenterConnection[]>([]);
  const [draftLink, setDraftLink] = useState<DraftLink>({
    lineVariant: 'general-network',
  });
  const [selectedConnectionKey, setSelectedConnectionKey] = useState<string | null>(null);
  const [connectPreview, setConnectPreview] = useState<ConnectState | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const loadMap = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/api/datacenters/continuity-map'), { headers: authHeaders() });
      const payload = String(response.headers.get('content-type') || '').toLowerCase().includes('application/json') ? await response.json() : null;
      if (!response.ok) throw new Error(payload?.error || 'Failed to load continuity map');
      const data = payload as DataCenterContinuityMapResponse;
      const nextNodes = Array.isArray(data?.nodes) ? data.nodes : [];
      setNodes(nextNodes.map((node, index) => {
        const fallback = fallbackNodePosition(index);
        return {
          ...node,
          mapPosX: node.mapPosX ?? fallback.x,
          mapPosY: node.mapPosY ?? fallback.y,
        };
      }));
      const normalizedConnections = Array.isArray(data?.connections)
        ? data.connections.map((connection) => withVariantPreset({
            ...connection,
            lineVariant: connection.lineVariant || 'general-network',
          }, connection.lineVariant || 'general-network'))
        : [];
      setConnections(Array.from(new Map(normalizedConnections.map((connection) => [connectionKey(connection), connection])).values()));
      connectStateRef.current = null;
      setConnectPreview(null);
      setHoveredTargetId(null);
      setSelectedConnectionKey((prev) => prev ?? null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load continuity map');
      setNodes([]);
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMap();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      const drag = dragStateRef.current;
      const connect = connectStateRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const xPct = Math.max(8, Math.min(92, ((event.clientX - rect.left) / rect.width) * 100));
      const yPct = Math.max(12, Math.min(88, ((event.clientY - rect.top) / rect.height) * 100));

      if (drag) {
        drag.moved = true;
        setNodes((prev) => prev.map((node) => (node.id === drag.id ? { ...node, mapPosX: xPct, mapPosY: yPct } : node)));
      }

      if (connect) {
        const nextPreview = { ...connect, currentX: xPct, currentY: yPct };
        connectStateRef.current = nextPreview;
        setConnectPreview(nextPreview);
        const targetNodeId = getNodeIdFromPoint(event.clientX, event.clientY);
        setHoveredTargetId(targetNodeId && targetNodeId !== connect.sourceId ? targetNodeId : null);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (dragStateRef.current?.moved) {
        suppressClickRef.current = true;
      }

      const connect = connectStateRef.current;
      if (connect) {
        const source = nodeMap.get(connect.sourceId);
        const targetNodeId = getNodeIdFromPoint(event.clientX, event.clientY);
        const resolvedTargetId = targetNodeId && targetNodeId !== connect.sourceId ? targetNodeId : hoveredTargetId;
        const target = resolvedTargetId ? nodeMap.get(resolvedTargetId) : null;
        if (source && target && source.id !== target.id) {
          const nextConnection = buildDefaultConnection(source, target, draftLink);
          const nextKey = connectionKey(nextConnection);
          setConnections((prev) => {
            const existing = prev.find((item) => connectionKey(item) === nextKey);
            if (!existing) return [...prev, nextConnection];
            return prev.map((item) => (
              connectionKey(item) === nextKey
                ? withVariantPreset(item, draftLink.lineVariant)
                : item
            ));
          });
          setSelectedConnectionKey(nextKey);
          suppressClickRef.current = true;
        }
        connectStateRef.current = null;
        setConnectPreview(null);
        setHoveredTargetId(null);
      }

      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draftLink, hoveredTargetId, nodeMap]);

  const selectedConnection = useMemo(
    () => connections.find((item) => connectionKey(item) === selectedConnectionKey) || null,
    [connections, selectedConnectionKey]
  );

  const laneMetaByConnectionKey = useMemo(() => {
    const laneMap = new Map<string, { laneIndex: number; laneCount: number }>();
    const byPair = new Map<string, DataCenterConnection[]>();

    connections.forEach((connection) => {
      const pairKey = connectionPairKey(connection);
      const existing = byPair.get(pairKey) || [];
      existing.push(connection);
      byPair.set(pairKey, existing);
    });

    byPair.forEach((pairConnections) => {
      const sortedPair = [...pairConnections].sort((left, right) => (
        lineVariantDefinitions[left.lineVariant].laneOrder - lineVariantDefinitions[right.lineVariant].laneOrder
      ));
      sortedPair.forEach((connection, index) => {
        laneMap.set(connectionKey(connection), { laneIndex: index, laneCount: sortedPair.length });
      });
    });

    return laneMap;
  }, [connections]);

  const updateConnection = (key: string, patch: Partial<DataCenterConnection>) => {
    setConnections((prev) => prev.map((item) => (
      connectionKey(item) === key
        ? { ...item, ...patch }
        : item
    )));
  };

  const removeConnection = (key: string) => {
    setConnections((prev) => prev.filter((item) => connectionKey(item) !== key));
    setSelectedConnectionKey((prev) => (prev === key ? null : prev));
  };

  const handleNodeClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
    }
  };

  const beginConnectionDrag = (sourceId: string, pointerId: number) => {
    const source = nodeMap.get(sourceId);
    if (!source) return;
    const nextState = {
      sourceId,
      pointerId,
      currentX: Number(source.mapPosX || 50),
      currentY: Number(source.mapPosY || 50),
    };
    connectStateRef.current = nextState;
    setConnectPreview(nextState);
    setHoveredTargetId(null);
    setSelectedConnectionKey(null);
  };

  const sortedConnections = useMemo(() => {
    return [...connections].sort((left, right) => connectionKey(left).localeCompare(connectionKey(right)));
  }, [connections]);

  const currentVariant = lineVariantDefinitions[draftLink.lineVariant];

  const handleSave = async () => {
    const payload: DataCenterContinuityMapPayload = {
      nodes: nodes.map((node) => ({ id: node.id, mapPosX: Number(node.mapPosX || 0), mapPosY: Number(node.mapPosY || 0) })),
      connections,
    };

    setSaving(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/api/datacenters/continuity-map'), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = String(response.headers.get('content-type') || '').toLowerCase().includes('application/json') ? await response.json() : null;
      if (!response.ok) throw new Error(data?.error || 'Failed to save continuity map');
      setToast('Continuity map saved');
    } catch (err: any) {
      setError(err?.message || 'Failed to save continuity map');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => void loadMap()}
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            <RefreshCw className="h-4 w-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || !nodes.length}
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-45 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Map'}
          </button>
        </div>
      </div>

      <Card className="overflow-hidden border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Workflow className="h-5 w-5 text-zinc-500" />DC Continuity Map Designer</CardTitle>
          <CardDescription>Step 2: drag data center nodes into place, then create directional A to B links with direct or dotted line components.</CardDescription>
        </CardHeader>
      </Card>

      {!isAdmin ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Admin access is required to design the DC Continuity Map.
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div> : null}
      {toast ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{toast}</div> : null}

      {!isAdmin ? null : loading ? (
        <div className="flex min-h-[420px] items-center justify-center text-zinc-500 dark:text-zinc-400">Loading continuity map...</div>
      ) : !nodes.length ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Move className="h-5 w-5 text-zinc-500" />Drag Layout</CardTitle>
              <CardDescription>Drag nodes into position. Then drag from a node connector to another DC to place the selected network line component.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                {(['Primary', 'Disaster Recovery', 'Backup Site', 'Edge DC'] as DataCenterSummary['dcRole'][]).map((role) => (
                  <span key={role} className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${roleTone[role].badge}`}>
                    {role}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-zinc-200 bg-zinc-50/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                {lineVariantOrder.map((variant) => {
                  const definition = lineVariantDefinitions[variant];
                  return (
                    <div key={variant} className="inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950/70">
                      <span
                        className="block h-0.5 w-10"
                        style={{ background: getVariantPreviewBackground(variant) }}
                      />
                      <span className="text-zinc-700 dark:text-zinc-200">{definition.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="overflow-auto rounded-3xl border border-zinc-200 dark:border-zinc-800">
                <div ref={canvasRef} className="relative h-[620px] min-h-[620px] min-w-[960px] overflow-hidden bg-[linear-gradient(to_right,rgba(113,113,122,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(113,113,122,0.07)_1px,transparent_1px)] bg-[size:36px_36px] p-6 dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] dark:bg-[size:36px_36px]">
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {sortedConnections.map((link) => {
                      const from = nodeMap.get(link.sourceDcId);
                      const to = link.targetId ? nodeMap.get(link.targetId) : null;
                      if (!from || !to) return null;
                      const definition = lineVariantDefinitions[link.lineVariant];
                      const laneMeta = laneMetaByConnectionKey.get(connectionKey(link)) || { laneIndex: 0, laneCount: 1 };
                      const geometry = buildLanePath(
                        { x: Number(from.mapPosX || 50), y: Number(from.mapPosY || 50) },
                        { x: Number(to.mapPosX || 50), y: Number(to.mapPosY || 50) },
                        link.lineVariant,
                        laneMeta.laneIndex,
                        laneMeta.laneCount
                      );
                      const layers = getVariantStrokeLayers(link.lineVariant);
                      const accentColor = layers[0]?.color || definition.lineColor;
                      return (
                        <g key={connectionKey(link)}>
                          {layers.map((layer, index) => (
                            <path
                              key={`${connectionKey(link)}-${index}`}
                              d={geometry.path}
                              fill="none"
                              stroke={layer.color}
                              strokeWidth={connectionKey(link) === selectedConnectionKey ? '0.58' : '0.46'}
                              strokeDasharray={layer.dashArray}
                              strokeDashoffset={layer.dashOffset ?? 0}
                              strokeLinecap="round"
                              opacity={layer.opacity ?? 0.95}
                              className="cursor-pointer"
                              onClick={() => setSelectedConnectionKey(connectionKey(link))}
                            />
                          ))}
                          <circle cx={Number(from.mapPosX || 50)} cy={Number(from.mapPosY || 50)} r="0.76" fill="white" stroke={accentColor} strokeWidth="0.24" />
                          <circle cx={Number(to.mapPosX || 50)} cy={Number(to.mapPosY || 50)} r="0.76" fill="white" stroke={accentColor} strokeWidth="0.24" />
                        </g>
                      );
                    })}
                    {connectPreview ? (() => {
                      const source = nodeMap.get(connectPreview.sourceId);
                      if (!source) return null;
                      const geometry = buildLanePath(
                        { x: Number(source.mapPosX || 50), y: Number(source.mapPosY || 50) },
                        { x: connectPreview.currentX, y: connectPreview.currentY },
                        draftLink.lineVariant,
                        0,
                        1
                      );
                      const layers = getVariantStrokeLayers(draftLink.lineVariant);
                      return (
                        <g>
                          {layers.map((layer, index) => (
                            <path
                              key={`preview-${index}`}
                              d={geometry.path}
                              fill="none"
                              stroke={layer.color}
                              strokeWidth="0.42"
                              strokeDasharray={layer.dashArray}
                              strokeDashoffset={layer.dashOffset ?? 0}
                              strokeLinecap="round"
                              opacity="0.72"
                            />
                          ))}
                          <circle cx={Number(source.mapPosX || 50)} cy={Number(source.mapPosY || 50)} r="0.58" fill="white" stroke={currentVariant.lineColor} strokeWidth="0.22" />
                        </g>
                      );
                    })() : null}
                  </svg>

                  {nodes.map((node) => {
                    const isPendingSource = node.id === connectPreview?.sourceId;
                    const isHoveredTarget = node.id === hoveredTargetId && node.id !== connectPreview?.sourceId;
                    const isConnected = connections.some((link) => link.sourceDcId === node.id || link.targetId === node.id);
                    const tone = roleTone[node.dcRole];
                    return (
                      <button
                        key={node.id}
                        type="button"
                        data-dc-node-id={node.id}
                        onClick={handleNodeClick}
                        onPointerDown={(event) => {
                          dragStateRef.current = { id: node.id, pointerId: event.pointerId, moved: false };
                          (event.currentTarget as HTMLButtonElement).setPointerCapture?.(event.pointerId);
                        }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 text-left"
                        style={{ left: `${node.mapPosX}%`, top: `${node.mapPosY}%` }}
                      >
                        <div className={`min-w-[224px] rounded-2xl border px-4 py-3 shadow-sm backdrop-blur transition ${isPendingSource ? 'border-blue-400 bg-blue-50/95 ring-2 ring-blue-200 dark:border-blue-700 dark:bg-blue-950/80 dark:ring-blue-900/70' : isHoveredTarget ? 'border-teal-400 bg-teal-50/95 ring-2 ring-teal-200 dark:border-teal-700 dark:bg-teal-950/60 dark:ring-teal-900/70' : isConnected ? `${tone.node} bg-white/92 dark:bg-zinc-950/90` : 'border-zinc-200 bg-white/78 dark:border-zinc-800 dark:bg-zinc-950/78'}`}>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: isPendingSource ? '#2563eb' : isConnected ? '#0f766e' : '#9ca3af' }} />
                            <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{node.name}</p>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{node.city}</p>
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone.badge}`}>
                              {node.dcRole}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{node.dcCode}</span>
                              <span
                                role="button"
                                tabIndex={0}
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  beginConnectionDrag(node.id, event.pointerId);
                                  (event.currentTarget as HTMLSpanElement).setPointerCapture?.(event.pointerId);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                  }
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-xs font-semibold text-zinc-500 shadow-sm transition hover:border-blue-300 hover:text-blue-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-blue-700 dark:hover:text-blue-300"
                                title="Drag to connect"
                                aria-label={`Drag from ${node.name} to connect to another data center`}
                              >
                                {'>'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Connection Builder</CardTitle>
              <CardDescription>A to B defines the direction. Choose a fixed network line component, then drag between DCs. Operational metadata is still edited here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Current line component</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {lineVariantOrder.map((variant) => {
                    const definition = lineVariantDefinitions[variant];
                    const isActive = draftLink.lineVariant === variant;
                    return (
                      <button
                        key={variant}
                        type="button"
                        onClick={() => setDraftLink({ lineVariant: variant })}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${isActive ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/60'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="block h-0.5 w-12"
                            style={{ background: getVariantPreviewBackground(variant) }}
                          />
                          <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">{definition.label}</span>
                        </div>
                        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{definition.description}</p>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  {connectPreview
                    ? `Dragging ${currentVariant.label} from ${nodeMap.get(connectPreview.sourceId)?.name || 'selected DC'}. Drop on a target DC to place it.`
                    : 'Use the small connector on a DC card and drag it to another DC to create the connection.'}
                </p>
                {connectPreview ? (
                  <div className="mt-3 flex gap-2">
                    <Button type="button" variant="outline" onClick={() => {
                      connectStateRef.current = null;
                      setConnectPreview(null);
                      setHoveredTargetId(null);
                    }}>
                      Cancel Drag
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Placed connections</p>
                  <span className="text-xs uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{sortedConnections.length} total</span>
                </div>

                {!sortedConnections.length ? (
                  <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    No network lines yet. Drag from a DC connector and drop on another DC.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedConnections.map((connection) => {
                      const key = connectionKey(connection);
                      const sourceName = nodeMap.get(connection.sourceDcId)?.name || connection.sourceDcId;
                      const definition = lineVariantDefinitions[connection.lineVariant];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelectedConnectionKey(key)}
                          className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${selectedConnectionKey === key ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/60'}`}
                        >
                          <div>
                            <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">{sourceName} → {connection.targetName}</p>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{definition.label} · {connection.connectionType}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-10 rounded-full border border-zinc-200 dark:border-zinc-700" style={{ background: getVariantPreviewBackground(connection.lineVariant) }} />
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeConnection(key);
                              }}
                              className="text-zinc-400 transition hover:text-red-600 dark:hover:text-red-400"
                              aria-label={`Remove connection ${sourceName} to ${connection.targetName}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedConnection ? (
                <div className="space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                        {nodeMap.get(selectedConnection.sourceDcId)?.name || selectedConnection.sourceDcId} → {selectedConnection.targetName}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{lineVariantDefinitions[selectedConnection.lineVariant].label}. Direction is defined by the line placement order.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => removeConnection(connectionKey(selectedConnection))} className="gap-2">
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Visual line</Label>
                      <select
                        value={selectedConnection.lineVariant}
                        onChange={(e) => {
                          const nextVariant = e.target.value as ContinuityLineVariant;
                          updateConnection(connectionKey(selectedConnection), withVariantPreset(selectedConnection, nextVariant));
                        }}
                        className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                      >
                        {lineVariantOrder.map((variant) => (
                          <option key={variant} value={variant}>{lineVariantDefinitions[variant].label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Connection Type</Label>
                      <select value={selectedConnection.connectionType} onChange={(e) => updateConnection(connectionKey(selectedConnection), { connectionType: e.target.value as ConnectionType })} className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
                        <option>MPLS</option><option>Leased Line</option><option>VPN (IPSec)</option><option>SD-WAN</option>
                      </select>
                    </div>
                    <div className="space-y-1.5"><Label>Bandwidth</Label><Input value={selectedConnection.bandwidth} onChange={(e) => updateConnection(connectionKey(selectedConnection), { bandwidth: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Latency (ms)</Label><Input type="number" value={selectedConnection.latencyMs} onChange={(e) => updateConnection(connectionKey(selectedConnection), { latencyMs: Number(e.target.value || 0) })} /></div>
                    <div className="space-y-1.5">
                      <Label>Mode</Label>
                      <select value={selectedConnection.mode} onChange={(e) => updateConnection(connectionKey(selectedConnection), { mode: e.target.value as ConnectivityMode })} className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
                        <option>Active-Active</option><option>Active-Passive</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Replication</Label>
                      <select value={selectedConnection.replicationType} onChange={(e) => updateConnection(connectionKey(selectedConnection), { replicationType: e.target.value as ReplicationType })} className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
                        <option>Synchronous</option><option>Asynchronous</option>
                      </select>
                    </div>
                    <div className="space-y-1.5"><Label>Replication Tool</Label><Input value={selectedConnection.replicationTool} onChange={(e) => updateConnection(connectionKey(selectedConnection), { replicationTool: e.target.value })} /></div>
                    <div className="space-y-1.5">
                      <Label>Failover</Label>
                      <select value={selectedConnection.failover} onChange={(e) => updateConnection(connectionKey(selectedConnection), { failover: e.target.value as FailoverType })} className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
                        <option>Manual</option><option>Automatic</option>
                      </select>
                    </div>
                    <div className="space-y-1.5"><Label>RTO</Label><Input value={selectedConnection.rto} onChange={(e) => updateConnection(connectionKey(selectedConnection), { rto: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>RPO</Label><Input value={selectedConnection.rpo} onChange={(e) => updateConnection(connectionKey(selectedConnection), { rpo: e.target.value })} /></div>
                    <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:col-span-2">
                      <input type="checkbox" checked={selectedConnection.redundant} onChange={(e) => updateConnection(connectionKey(selectedConnection), { redundant: e.target.checked })} className="h-4 w-4 rounded border-zinc-300 text-blue-600" />
                      Redundant transport path
                    </label>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  Select a placed connection to edit its operational metadata.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
