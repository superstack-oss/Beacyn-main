import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { CheckCircle2, ChevronLeft, MoreVertical, Pencil, Search, Trash2, X } from 'lucide-react';
import { apiUrl } from '../../lib/api';
import { authHeaders, getStoredUser } from '../../lib/auth';

type RackPointDataCenter = {
  id: string;
  dcCode: string;
  name: string;
  type: 'colocation' | 'shared' | 'private';
  dcRole: 'Primary' | 'Disaster Recovery' | 'Backup Site' | 'Edge DC';
  region: string;
  regionGroup: string;
  country: string;
  city: string;
  vendorProvider: string;
  isAvailable: boolean;
};

type DeviceType =
  | 'server'
  | 'storage'
  | 'network'
  | 'firewall'
  | 'loadbalancer'
  | 'patch'
  | 'kvm'
  | 'ups'
  | 'pdu'
  | 'blank';

type DeviceStatus = 'active' | 'standby' | 'maintenance' | 'offline';
type AvailabilityStatus = 'reachable' | 'unreachable' | 'unknown';
type RackType = '42U' | '45U' | '48U';

interface RackDevice {
  id: string;
  rackId?: string;
  name: string;
  serialNumber?: string | null;
  hostname?: string | null;
  type: DeviceType;
  uStart: number;
  uSize: number;
  vendor: string;
  model: string;
  ip?: string | null;
  status: DeviceStatus;
  availabilityStatus?: AvailabilityStatus;
  availabilityMessage?: string | null;
  lastAvailabilityLatencyMs?: number | null;
  lastAvailabilityCheckedAt?: string | Date | null;
  role?: string | null;
  specs?: string | null;
}

interface Rack {
  id: string;
  name: string;
  dcId: string;
  dcName: string;
  rackType: RackType;
  totalU: number;
  location: string;
  powerDraw?: string | null;
  devices: RackDevice[];
}

interface DcSummary extends RackPointDataCenter {
  rackCount: number;
  serverCount: number;
  storageCount: number;
  networkCount: number;
  otherCount: number;
  reachableCount: number;
  totalDevices: number;
}

const U_PX = 22;
const RACK_TYPE_TO_U: Record<RackType, number> = { '42U': 42, '45U': 45, '48U': 48 };
const DEVICE_TYPE_OPTIONS: Array<Exclude<DeviceType, 'blank'>> = ['server', 'storage', 'network', 'firewall', 'loadbalancer', 'patch', 'kvm', 'ups', 'pdu'];
const DEVICE_STATUS_OPTIONS: DeviceStatus[] = ['active', 'standby', 'maintenance', 'offline'];

const EMPTY_RACK_FORM = {
  name: '',
  dcId: '',
  dcName: '',
  rackType: '42U' as RackType,
  location: '',
  powerDraw: '',
};

const EMPTY_DEVICE_FORM = {
  rackId: '',
  name: '',
  serialNumber: '',
  hostname: '',
  type: 'server' as Exclude<DeviceType, 'blank'>,
  uStart: 1,
  uSize: 1,
  vendor: '',
  model: '',
  ip: '',
  status: 'active' as DeviceStatus,
  role: '',
  specs: '',
};

const TYPE_CONFIG: Record<DeviceType, { label: string; blockBg: string; blockBorder: string; blockHover: string; textClass: string; legendBg: string }> = {
  server: { label: 'Server', blockBg: 'bg-blue-700', blockBorder: 'border-blue-600', blockHover: 'hover:bg-blue-600', textClass: 'text-blue-50', legendBg: 'bg-blue-600' },
  storage: { label: 'Storage', blockBg: 'bg-violet-700', blockBorder: 'border-violet-600', blockHover: 'hover:bg-violet-600', textClass: 'text-violet-50', legendBg: 'bg-violet-600' },
  network: { label: 'Network', blockBg: 'bg-teal-700', blockBorder: 'border-teal-600', blockHover: 'hover:bg-teal-600', textClass: 'text-teal-50', legendBg: 'bg-teal-600' },
  firewall: { label: 'Firewall', blockBg: 'bg-amber-600', blockBorder: 'border-amber-500', blockHover: 'hover:bg-amber-500', textClass: 'text-amber-50', legendBg: 'bg-amber-500' },
  loadbalancer: { label: 'Load Balancer', blockBg: 'bg-emerald-700', blockBorder: 'border-emerald-600', blockHover: 'hover:bg-emerald-600', textClass: 'text-emerald-50', legendBg: 'bg-emerald-600' },
  patch: { label: 'Patch Panel', blockBg: 'bg-zinc-600', blockBorder: 'border-zinc-500', blockHover: 'hover:bg-zinc-500', textClass: 'text-zinc-200', legendBg: 'bg-zinc-500' },
  kvm: { label: 'KVM', blockBg: 'bg-pink-700', blockBorder: 'border-pink-600', blockHover: 'hover:bg-pink-600', textClass: 'text-pink-50', legendBg: 'bg-pink-600' },
  ups: { label: 'UPS', blockBg: 'bg-rose-700', blockBorder: 'border-rose-600', blockHover: 'hover:bg-rose-600', textClass: 'text-rose-50', legendBg: 'bg-rose-600' },
  pdu: { label: 'PDU', blockBg: 'bg-yellow-500', blockBorder: 'border-yellow-400', blockHover: 'hover:bg-yellow-400', textClass: 'text-yellow-950', legendBg: 'bg-yellow-500' },
  blank: { label: 'Blank', blockBg: 'bg-zinc-800', blockBorder: 'border-zinc-700', blockHover: '', textClass: 'text-zinc-600', legendBg: 'bg-zinc-700' },
};

const STATUS_CONFIG: Record<DeviceStatus, { dotClass: string; label: string }> = {
  active: { dotClass: 'bg-green-400', label: 'Active' },
  standby: { dotClass: 'bg-yellow-400', label: 'Standby' },
  maintenance: { dotClass: 'bg-amber-400', label: 'Maintenance' },
  offline: { dotClass: 'bg-red-500', label: 'Offline' },
};

const AVAILABILITY_CONFIG: Record<AvailabilityStatus, { dotClass: string; label: string; textClass: string }> = {
  reachable: { dotClass: 'bg-emerald-500', label: 'Reachable', textClass: 'text-emerald-600 dark:text-emerald-400' },
  unreachable: { dotClass: 'bg-rose-500', label: 'Unreachable', textClass: 'text-rose-600 dark:text-rose-400' },
  unknown: { dotClass: 'bg-zinc-400', label: 'Unknown', textClass: 'text-zinc-500 dark:text-zinc-400' },
};

function buildSlotMap(rack: Rack): Record<number, RackDevice | 'occupied'> {
  const map: Record<number, RackDevice | 'occupied'> = {};
  for (const device of rack.devices) {
    map[device.uStart] = device;
    for (let u = device.uStart + 1; u < device.uStart + device.uSize; u++) map[u] = 'occupied';
  }
  return map;
}

function getRackStats(rack: Rack) {
  const usedU = rack.devices.filter((d) => d.type !== 'blank').reduce((sum, d) => sum + d.uSize, 0);
  const utilization = rack.totalU > 0 ? Math.round((usedU / rack.totalU) * 100) : 0;
  const reachableCount = rack.devices.filter((d) => d.availabilityStatus === 'reachable').length;
  return { usedU, utilization, deviceCount: rack.devices.length, reachableCount };
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

function TextAction({ disabled, onClick, children }: { disabled?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-sm font-medium transition-colors ${disabled ? 'cursor-not-allowed text-zinc-400 dark:text-zinc-600' : 'text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50'}`}
    >
      {children}
    </button>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</Label>
      {children}
    </div>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{value}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{sub}</p>
    </div>
  );
}

function DrawerShell({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[430px] max-w-[92vw] flex flex-col border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-4 py-4 shrink-0">
          <div>
            <p className="text-base font-bold text-zinc-900 dark:text-zinc-50">{title}</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </>
  );
}

function RackFormPanel({
  mode,
  form,
  saving,
  error,
  selectedDc,
  onChange,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  form: typeof EMPTY_RACK_FORM;
  saving: boolean;
  error: string;
  selectedDc: RackPointDataCenter;
  onChange: (patch: Partial<typeof EMPTY_RACK_FORM>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <DrawerShell title={mode === 'edit' ? 'Edit Rack' : 'Add Rack'} description={mode === 'edit' ? 'Update rack details and enclosure capacity.' : 'Create a rack under the selected data center.'} onClose={onClose}>
      <div className="space-y-4">
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p> : null}
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">{selectedDc.name}</p>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">{selectedDc.dcCode} · {selectedDc.city}, {selectedDc.country}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Rack Name"><Input value={form.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="MUM-R02A" /></FormField>
          <FormField label="Rack Type">
            <select value={form.rackType} onChange={(e) => onChange({ rackType: e.target.value as RackType })} className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950">
              {(['42U', '45U', '48U'] as RackType[]).map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Location"><Input value={form.location} onChange={(e) => onChange({ location: e.target.value })} placeholder="Row D · Position 2" /></FormField>
        <FormField label="Power Draw"><Input value={form.powerDraw} onChange={(e) => onChange({ powerDraw: e.target.value })} placeholder="3.8 kW" /></FormField>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
          This rack will be created as a {form.rackType} enclosure with {RACK_TYPE_TO_U[form.rackType]} rack units.
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={onSubmit} disabled={saving}>{saving ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Create Rack'}</Button>
        </div>
      </div>
    </DrawerShell>
  );
}

function DeviceFormPanel({
  mode,
  racks,
  form,
  saving,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  racks: Rack[];
  form: typeof EMPTY_DEVICE_FORM;
  saving: boolean;
  error: string;
  onChange: (patch: Partial<typeof EMPTY_DEVICE_FORM>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const selectedRack = racks.find((rack) => rack.id === form.rackId) || null;
  return (
    <DrawerShell title={mode === 'edit' ? 'Edit Device' : 'Add Device To Slot'} description={mode === 'edit' ? 'Update the device details or move it to another slot.' : 'Place a device in a rack slot and capture serial number plus reachability target.'} onClose={onClose}>
      <div className="space-y-4">
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p> : null}
        <FormField label="Rack">
          <select value={form.rackId} onChange={(e) => onChange({ rackId: e.target.value })} className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950">
            <option value="">Select rack</option>
            {racks.map((rack) => <option key={rack.id} value={rack.id}>{rack.name} · {rack.location}</option>)}
          </select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="U Start"><Input type="number" min={1} max={selectedRack?.totalU || 48} value={String(form.uStart)} onChange={(e) => onChange({ uStart: Number(e.target.value || 1) })} /></FormField>
          <FormField label="U Size"><Input type="number" min={1} max={selectedRack?.totalU || 48} value={String(form.uSize)} onChange={(e) => onChange({ uSize: Number(e.target.value || 1) })} /></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Device Name"><Input value={form.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="APP-SRV-09" /></FormField>
          <FormField label="Serial Number"><Input value={form.serialNumber} onChange={(e) => onChange({ serialNumber: e.target.value })} placeholder="SN-000123456" /></FormField>
          <FormField label="Hostname"><Input value={form.hostname} onChange={(e) => onChange({ hostname: e.target.value })} placeholder="app-srv-09.mum" /></FormField>
          <FormField label="IP Address"><Input value={form.ip} onChange={(e) => onChange({ ip: e.target.value })} placeholder="10.24.1.19" /></FormField>
          <FormField label="Type">
            <select value={form.type} onChange={(e) => onChange({ type: e.target.value as Exclude<DeviceType, 'blank'> })} className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950">
              {DEVICE_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{TYPE_CONFIG[type].label}</option>)}
            </select>
          </FormField>
          <FormField label="Lifecycle Status">
            <select value={form.status} onChange={(e) => onChange({ status: e.target.value as DeviceStatus })} className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950">
              {DEVICE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{STATUS_CONFIG[status].label}</option>)}
            </select>
          </FormField>
          <FormField label="Vendor"><Input value={form.vendor} onChange={(e) => onChange({ vendor: e.target.value })} placeholder="Dell" /></FormField>
          <FormField label="Model"><Input value={form.model} onChange={(e) => onChange({ model: e.target.value })} placeholder="PowerEdge R760" /></FormField>
          <FormField label="Role"><Input value={form.role} onChange={(e) => onChange({ role: e.target.value })} placeholder="Application Server" /></FormField>
        </div>
        <FormField label="Specs / Notes">
          <textarea value={form.specs} onChange={(e) => onChange({ specs: e.target.value })} className="min-h-28 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950" placeholder="2× Xeon Gold · 256 GB RAM · 4× NVMe" />
        </FormField>
        {selectedRack ? <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">Target rack: {selectedRack.name} · {selectedRack.rackType} · capacity {selectedRack.totalU}U.</div> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={onSubmit} disabled={saving || !form.rackId}>{saving ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Add Device'}</Button>
        </div>
      </div>
    </DrawerShell>
  );
}

function RackSlots({ rack, selectedId, searchQuery, canManage, draggedDeviceId, onSelectDevice, onSelectEmptySlot, onStartDrag, onEndDrag, onDropDevice }: { rack: Rack; selectedId: string | null; searchQuery: string; canManage: boolean; draggedDeviceId: string | null; onSelectDevice: (device: RackDevice) => void; onSelectEmptySlot: (uStart: number) => void; onStartDrag: (device: RackDevice, rack: Rack) => void; onEndDrag: () => void; onDropDevice: (rack: Rack, uStart: number) => void }) {
  const slotMap = useMemo(() => buildSlotMap(rack), [rack]);
  return (
    <div>
      {Array.from({ length: rack.totalU }, (_, i) => i + 1).map((u) => {
        const slot = slotMap[u];
        if (slot === 'occupied') return null;

        if (!slot) {
          return (
            <div
              key={u}
              style={{ height: U_PX }}
              onClick={() => canManage && onSelectEmptySlot(u)}
              onDragOver={(e) => {
                if (canManage && draggedDeviceId) e.preventDefault();
              }}
              onDrop={(e) => {
                if (!canManage || !draggedDeviceId) return;
                e.preventDefault();
                onDropDevice(rack, u);
              }}
              className={`border-b border-zinc-800/30 ${canManage ? 'cursor-pointer hover:bg-blue-500/10' : ''} ${draggedDeviceId ? 'bg-sky-500/5 hover:bg-sky-500/15' : ''}`}
            >
              <div className={`h-full w-full border-t border-dashed ${draggedDeviceId ? 'border-sky-400/50' : 'border-zinc-800/20'}`} />
            </div>
          );
        }

        const cfg = TYPE_CONFIG[slot.type];
        const lifecycle = STATUS_CONFIG[slot.status];
        const availability = AVAILABILITY_CONFIG[slot.availabilityStatus || 'unknown'];
        const isSelected = selectedId === slot.id;
        const blockH = slot.uSize * U_PX;
        const q = searchQuery.toLowerCase().trim();
        const isHighlighted = q.length > 0 && [slot.name, slot.hostname || '', slot.ip || '', slot.vendor, slot.model, slot.serialNumber || ''].some((value) => value.toLowerCase().includes(q));

        return (
          <div
            key={u}
            style={{ height: blockH }}
            draggable={canManage && slot.type !== 'blank'}
            onDragStart={() => {
              if (canManage && slot.type !== 'blank') onStartDrag(slot, rack);
            }}
            onDragEnd={onEndDrag}
            onClick={() => slot.type !== 'blank' && onSelectDevice(slot)}
            onContextMenu={(e) => {
              if (slot.type === 'blank') return;
              e.preventDefault();
              onSelectDevice(slot);
            }}
            className={[
              'relative overflow-hidden transition-all border-b',
              cfg.blockBg,
              cfg.blockBorder,
              slot.type !== 'blank' ? `${cfg.blockHover} cursor-pointer` : 'cursor-default',
              isSelected ? 'ring-2 ring-inset ring-white/60' : '',
              isHighlighted && !isSelected ? 'ring-2 ring-inset ring-white/90 brightness-125' : '',
              draggedDeviceId === slot.id ? 'opacity-70 scale-[0.99]' : '',
            ].filter(Boolean).join(' ')}
          >
            {slot.uSize >= 4 ? <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[repeating-linear-gradient(0deg,transparent,transparent_3px,rgba(255,255,255,0.4)_3px,rgba(255,255,255,0.4)_4px)]" /> : null}
            <div className="absolute top-1.5 right-2 flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${availability.dotClass}`} />
              <span className={`h-1.5 w-1.5 rounded-full ${lifecycle.dotClass}`} />
            </div>
            {canManage && slot.type !== 'blank' ? <span className={`absolute bottom-1 right-2 text-[8px] font-semibold opacity-70 ${cfg.textClass}`}>drag</span> : null}
            {slot.uSize === 1 ? (
              <div className="h-full flex items-center pl-2 pr-8 gap-1.5">
                <p className={`text-[10px] font-semibold leading-none truncate ${cfg.textClass}`}>{slot.name}</p>
              </div>
            ) : slot.uSize === 2 ? (
              <div className="h-full flex flex-col justify-center pl-2 py-1 pr-8">
                <p className={`text-[10px] font-bold leading-tight truncate ${cfg.textClass}`}>{slot.name}</p>
                <p className={`text-[9px] mt-0.5 opacity-70 truncate ${cfg.textClass}`}>{slot.vendor} · {slot.model}</p>
              </div>
            ) : (
              <div className="h-full flex flex-col justify-center pl-2.5 py-2 pr-8 gap-0.5">
                <p className={`text-[11px] font-bold truncate ${cfg.textClass}`}>{slot.name}</p>
                <p className={`text-[9px] opacity-70 truncate ${cfg.textClass}`}>{slot.vendor} {slot.model}</p>
                {slot.serialNumber ? <p className={`text-[8px] font-mono opacity-60 truncate ${cfg.textClass}`}>SN {slot.serialNumber}</p> : null}
                {slot.ip ? <p className={`text-[9px] font-mono mt-0.5 opacity-55 ${cfg.textClass}`}>{slot.ip}</p> : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RackDiagram({ rack, selectedId, searchQuery, canManage, draggedDeviceId, onSelectDevice, onSelectEmptySlot, onAddDevice, onEditRack, onDeleteRack, onStartDrag, onEndDrag, onDropDevice }: { rack: Rack; selectedId: string | null; searchQuery: string; canManage: boolean; draggedDeviceId: string | null; onSelectDevice: (device: RackDevice, rack: Rack) => void; onSelectEmptySlot: (rack: Rack, uStart: number) => void; onAddDevice: (rack: Rack) => void; onEditRack: (rack: Rack) => void; onDeleteRack: (rack: Rack) => void; onStartDrag: (device: RackDevice, rack: Rack) => void; onEndDrag: () => void; onDropDevice: (rack: Rack, uStart: number) => void }) {
  const stats = useMemo(() => getRackStats(rack), [rack]);
  const utilizationGradient = stats.utilization > 85 ? 'from-rose-500 to-orange-500' : stats.utilization > 60 ? 'from-teal-500 to-blue-500' : 'from-zinc-500 to-zinc-400';

  return (
    <div className="flex-none select-none" style={{ width: 264 }}>
      <div className="rounded-t-xl bg-zinc-900 border border-b-0 border-zinc-700 px-3 pt-2.5 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-zinc-100 tracking-tight truncate">{rack.name}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{rack.location}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {canManage ? <button type="button" onClick={() => onAddDevice(rack)} className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-200 hover:bg-zinc-700">Add</button> : null}
            {canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="rounded border border-zinc-700 bg-zinc-800 p-1 text-zinc-300 hover:bg-zinc-700">
                    <MoreVertical className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEditRack(rack)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit rack
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAddDevice(rack)}>
                    <Pencil className="h-3.5 w-3.5" /> Add device
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => onDeleteRack(rack)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete rack
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <span className="text-[10px] font-mono border border-zinc-600 text-zinc-400 rounded px-1.5 py-0.5">{rack.rackType}</span>
          </div>
        </div>
        <div className="mt-2.5">
          <div className="h-1 bg-zinc-700/50 rounded-full overflow-hidden"><div className={`h-full rounded-full bg-gradient-to-r ${utilizationGradient}`} style={{ width: `${stats.utilization}%` }} /></div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[9px] text-zinc-600">{stats.usedU}U used · {stats.deviceCount} devices</p>
            <p className="text-[9px] text-zinc-500 font-medium">{stats.reachableCount} reachable</p>
          </div>
        </div>
      </div>
      <div className="border border-t-0 border-zinc-700 bg-[#070709] overflow-hidden">
        <div className="flex">
          <div className="flex-none w-8 bg-zinc-900/80 border-r border-zinc-700/60">
            {Array.from({ length: rack.totalU }, (_, i) => <div key={i} style={{ height: U_PX }} className="flex items-center justify-between px-1"><div className="h-[5px] w-[5px] rounded-full bg-zinc-700/70 ring-1 ring-zinc-600/30" /><span className="text-[7px] text-zinc-600 font-mono leading-none">{i + 1}</span></div>)}
          </div>
          <div className="flex-1 min-w-0">
            <RackSlots rack={rack} selectedId={selectedId} searchQuery={searchQuery} canManage={canManage} draggedDeviceId={draggedDeviceId} onSelectDevice={(device) => onSelectDevice(device, rack)} onSelectEmptySlot={(uStart) => onSelectEmptySlot(rack, uStart)} onStartDrag={onStartDrag} onEndDrag={onEndDrag} onDropDevice={onDropDevice} />
          </div>
          <div className="flex-none w-8 bg-zinc-900/80 border-l border-zinc-700/60">
            {Array.from({ length: rack.totalU }, (_, i) => <div key={i} style={{ height: U_PX }} className="flex items-center justify-between px-1"><span className="text-[7px] text-zinc-600 font-mono leading-none">{i + 1}</span><div className="h-[5px] w-[5px] rounded-full bg-zinc-700/70 ring-1 ring-zinc-600/30" /></div>)}
          </div>
        </div>
      </div>
      <div className="rounded-b-xl bg-zinc-900 border border-t-0 border-zinc-700 px-2.5 py-2">
        <p className="text-[9px] text-zinc-600">{rack.dcName}</p>
        {canManage ? <p className="mt-1 text-[9px] text-zinc-500">Right-click or drag devices to move them.</p> : null}
      </div>
    </div>
  );
}

function DevicePanel({ device, rack, canManage, onClose, onEdit, onDelete }: { device: RackDevice; rack: Rack; canManage: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const availability = AVAILABILITY_CONFIG[device.availabilityStatus || 'unknown'];
  const lifecycle = STATUS_CONFIG[device.status];
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[360px] max-w-[92vw] flex flex-col border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 shrink-0">
          <div>
            <p className="font-bold text-sm text-zinc-900 dark:text-zinc-50">{device.name}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{rack.name} · {rack.dcName}</p>
          </div>
          <div className="flex items-center gap-1">
            {canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="h-3.5 w-3.5" /> Edit device
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete device
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium ${availability.textClass} border-zinc-200 dark:border-zinc-700`}><span className={`h-1.5 w-1.5 rounded-full ${availability.dotClass}`} />{availability.label}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"><span className={`h-1.5 w-1.5 rounded-full ${lifecycle.dotClass}`} />{lifecycle.label}</span>
          </div>
          {canManage ? <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Use the menu to edit or delete this device, or drag it onto an empty U slot in the rack canvas.</p> : null}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {[
              ['Serial Number', device.serialNumber || '—'],
              ['Hostname', device.hostname || '—'],
              ['IP Address', device.ip || '—'],
              ['Vendor', device.vendor || '—'],
              ['Model', device.model || '—'],
              ['Reachability', device.availabilityMessage || availability.label],
              ['Latency', device.lastAvailabilityLatencyMs != null ? `${device.lastAvailabilityLatencyMs} ms` : '—'],
              ['Rack Position', device.uSize === 1 ? `U${device.uStart}` : `U${device.uStart} – U${device.uStart + device.uSize - 1} (${device.uSize}U)`],
              ['Role', device.role || '—'],
              ['Specifications', device.specs || '—'],
            ].map(([label, value]) => (
              <div key={label} className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">{label}</p>
                <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-50">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Legend() {
  const types: DeviceType[] = ['server', 'storage', 'network', 'firewall', 'loadbalancer', 'patch', 'kvm', 'ups', 'pdu'];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {types.map((type) => <div key={type} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm ${TYPE_CONFIG[type].legendBg}`} /><span className="text-xs text-zinc-600 dark:text-zinc-400">{TYPE_CONFIG[type].label}</span></div>)}
      <div className="flex items-center gap-3 pl-3 border-l border-zinc-200 dark:border-zinc-700">
        {(Object.entries(AVAILABILITY_CONFIG) as [AvailabilityStatus, (typeof AVAILABILITY_CONFIG)[AvailabilityStatus]][]).map(([status, cfg]) => <div key={status} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${cfg.dotClass}`} /><span className="text-[11px] text-zinc-500 dark:text-zinc-400">{cfg.label}</span></div>)}
      </div>
    </div>
  );
}

function DcCard({ dc, selected, onSelect }: { dc: DcSummary; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className={`rounded-3xl border p-5 text-left transition-all ${selected ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950' : 'border-zinc-200 bg-white/80 hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] opacity-60">{dc.dcCode}</p>
          <p className="mt-1 text-xl font-semibold tracking-tight">{dc.name}</p>
          <p className="mt-1 text-sm opacity-70">{dc.city}, {dc.country} · {dc.dcRole}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${dc.isAvailable ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'}`}>{dc.isAvailable ? 'Available' : 'Unavailable'}</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><p className="text-[10px] uppercase tracking-[0.14em] opacity-55">Racks</p><p className="mt-1 text-lg font-semibold">{dc.rackCount}</p></div>
        <div><p className="text-[10px] uppercase tracking-[0.14em] opacity-55">Servers</p><p className="mt-1 text-lg font-semibold">{dc.serverCount}</p></div>
        <div><p className="text-[10px] uppercase tracking-[0.14em] opacity-55">Storage</p><p className="mt-1 text-lg font-semibold">{dc.storageCount}</p></div>
        <div><p className="text-[10px] uppercase tracking-[0.14em] opacity-55">Network</p><p className="mt-1 text-lg font-semibold">{dc.networkCount}</p></div>
      </div>
      <p className="mt-4 text-xs opacity-60">Reachable devices: {dc.reachableCount}/{dc.totalDevices}</p>
    </button>
  );
}

export default function RackPointManager() {
  const currentUser = getStoredUser();
  const canManage = Boolean(currentUser);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [dataCenters, setDataCenters] = useState<RackPointDataCenter[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedDcId, setSelectedDcId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<{ device: RackDevice; rack: Rack } | null>(null);
  const [isRackFormOpen, setIsRackFormOpen] = useState(false);
  const [isDeviceFormOpen, setIsDeviceFormOpen] = useState(false);
  const [rackForm, setRackForm] = useState(EMPTY_RACK_FORM);
  const [deviceForm, setDeviceForm] = useState(EMPTY_DEVICE_FORM);
  const [rackFormError, setRackFormError] = useState('');
  const [deviceFormError, setDeviceFormError] = useState('');
  const [savingRack, setSavingRack] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingRack, setEditingRack] = useState<Rack | null>(null);
  const [editingDevice, setEditingDevice] = useState<{ device: RackDevice; rack: Rack } | null>(null);
  const [draggingDevice, setDraggingDevice] = useState<{ device: RackDevice; rack: Rack } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [dcRes, rackRes] = await Promise.all([
        fetch(apiUrl('/api/rackpoint/data-centers'), { headers: authHeaders() }),
        fetch(apiUrl('/api/rackpoint/racks'), { headers: authHeaders() }),
      ]);

      const dcJson = await parseJsonResponseSafe(dcRes);
      const rackJson = rackRes.status === 404 ? [] : await parseJsonResponseSafe(rackRes);

      if (!dcRes.ok) throw new Error((dcJson as any)?.error || 'Failed to load RackPoint data centers');
      if (!rackRes.ok && rackRes.status !== 404) throw new Error((rackJson as any)?.error || 'Failed to load RackPoint racks');

      setDataCenters(Array.isArray(dcJson) ? dcJson : []);
      setRacks(Array.isArray(rackJson) ? rackJson : []);
    } catch (err: any) {
      setDataCenters([]);
      setRacks([]);
      setLoadError(err?.message || 'Failed to load RackPoint data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const dcSummaries = useMemo<DcSummary[]>(() => {
    return dataCenters.map((dc) => {
      const dcRacks = racks.filter((rack) => rack.dcId === dc.id);
      const devices = dcRacks.flatMap((rack) => rack.devices);
      return {
        ...dc,
        rackCount: dcRacks.length,
        serverCount: devices.filter((device) => device.type === 'server').length,
        storageCount: devices.filter((device) => device.type === 'storage').length,
        networkCount: devices.filter((device) => ['network', 'firewall', 'loadbalancer'].includes(device.type)).length,
        otherCount: devices.filter((device) => !['server', 'storage', 'network', 'firewall', 'loadbalancer'].includes(device.type)).length,
        reachableCount: devices.filter((device) => device.availabilityStatus === 'reachable').length,
        totalDevices: devices.length,
      };
    });
  }, [dataCenters, racks]);

  const selectedDc = useMemo(() => dcSummaries.find((dc) => dc.id === selectedDcId) || null, [dcSummaries, selectedDcId]);

  const filteredDcSummaries = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return dcSummaries;
    return dcSummaries.filter((dc) => [dc.name, dc.dcCode, dc.city, dc.country, dc.vendorProvider].some((value) => value.toLowerCase().includes(q)));
  }, [dcSummaries, search]);

  const selectedDcRacks = useMemo(() => {
    if (!selectedDcId) return [] as Rack[];
    const q = search.toLowerCase().trim();
    let visible = racks.filter((rack) => rack.dcId === selectedDcId);
    if (q) {
      visible = visible.filter((rack) =>
        [rack.name, rack.location, rack.dcName].some((value) => value.toLowerCase().includes(q)) ||
        rack.devices.some((device) => [device.name, device.hostname || '', device.ip || '', device.serialNumber || '', device.vendor, device.model].some((value) => value.toLowerCase().includes(q)))
      );
    }
    return visible;
  }, [racks, selectedDcId, search]);

  const globalStats = useMemo(() => {
    const allDevices = racks.flatMap((rack) => rack.devices);
    const totalU = racks.reduce((sum, rack) => sum + rack.totalU, 0);
    const usedU = racks.reduce((sum, rack) => sum + getRackStats(rack).usedU, 0);
    return {
      rackCount: racks.length,
      deviceCount: allDevices.length,
      reachableCount: allDevices.filter((device) => device.availabilityStatus === 'reachable').length,
      totalU,
      usedU,
      utilization: totalU > 0 ? Math.round((usedU / totalU) * 100) : 0,
    };
  }, [racks]);

  const canManageSelectedDc = Boolean(canManage && selectedDc?.isAvailable);

  const openRackForm = () => {
    if (!selectedDc) return;
    setEditingRack(null);
    setRackForm({ ...EMPTY_RACK_FORM, dcId: selectedDc.id, dcName: selectedDc.name });
    setRackFormError('');
    setIsRackFormOpen(true);
  };

  const openEditRackForm = (rack: Rack) => {
    setEditingRack(rack);
    setRackForm({
      name: rack.name,
      dcId: rack.dcId,
      dcName: rack.dcName,
      rackType: rack.rackType,
      location: rack.location,
      powerDraw: String(rack.powerDraw || ''),
    });
    setRackFormError('');
    setIsRackFormOpen(true);
  };

  const openDeviceForm = (rack?: Rack, uStart = 1) => {
    setEditingDevice(null);
    setDeviceForm({ ...EMPTY_DEVICE_FORM, rackId: rack?.id || selectedDcRacks[0]?.id || '', uStart });
    setDeviceFormError('');
    setIsDeviceFormOpen(true);
  };

  const openEditDeviceForm = (device: RackDevice, rack: Rack) => {
    setEditingDevice({ device, rack });
    setSelectedEntry(null);
    setDeviceForm({
      rackId: rack.id,
      name: device.name,
      serialNumber: String(device.serialNumber || ''),
      hostname: String(device.hostname || ''),
      type: (device.type === 'blank' ? 'server' : device.type) as Exclude<DeviceType, 'blank'>,
      uStart: Number(device.uStart || 1),
      uSize: Number(device.uSize || 1),
      vendor: device.vendor,
      model: device.model,
      ip: String(device.ip || ''),
      status: device.status,
      role: String(device.role || ''),
      specs: String(device.specs || ''),
    });
    setDeviceFormError('');
    setIsDeviceFormOpen(true);
  };

  const handleSaveRack = async () => {
    setSavingRack(true);
    setRackFormError('');
    try {
      const res = await fetch(
        editingRack ? apiUrl(`/api/rackpoint/racks/${editingRack.id}/update`) : apiUrl('/api/rackpoint/racks'),
        { method: 'POST', headers: authHeaders(), body: JSON.stringify(rackForm) }
      );
      const data = await parseJsonResponseSafe(res);
      if (!res.ok) throw new Error((data as any)?.error || `Failed to ${editingRack ? 'update' : 'create'} rack`);
      setIsRackFormOpen(false);
      setEditingRack(null);
      setToast(`Rack ${(data as any)?.name || rackForm.name} ${editingRack ? 'updated' : 'created'}`);
      await loadData();
    } catch (err: any) {
      setRackFormError(err?.message || `Failed to ${editingRack ? 'update' : 'create'} rack`);
    } finally {
      setSavingRack(false);
    }
  };

  const handleSaveDevice = async () => {
    setSavingDevice(true);
    setDeviceFormError('');
    try {
      const { rackId, ...payload } = deviceForm;
      const res = await fetch(
        editingDevice ? apiUrl(`/api/rackpoint/devices/${editingDevice.device.id}/update`) : apiUrl(`/api/rackpoint/racks/${rackId}/devices`),
        { method: 'POST', headers: authHeaders(), body: JSON.stringify({ rackId, ...payload }) }
      );
      const data = await parseJsonResponseSafe(res);
      if (!res.ok) throw new Error((data as any)?.error || `Failed to ${editingDevice ? 'update' : 'add'} device`);
      setIsDeviceFormOpen(false);
      setEditingDevice(null);
      setToast(`Device ${(data as any)?.name || payload.name} ${editingDevice ? 'updated' : 'added'}`);
      await loadData();
    } catch (err: any) {
      setDeviceFormError(err?.message || `Failed to ${editingDevice ? 'update' : 'add'} device`);
    } finally {
      setSavingDevice(false);
    }
  };

  const handleDeleteRack = async (rack: Rack) => {
    if (!window.confirm(`Delete rack ${rack.name} and all of its devices?`)) return;
    try {
      const res = await fetch(apiUrl(`/api/rackpoint/racks/${rack.id}/delete`), { method: 'POST', headers: authHeaders() });
      const data = await parseJsonResponseSafe(res);
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to delete rack');
      if (selectedEntry?.rack.id === rack.id) setSelectedEntry(null);
      setToast(`Rack ${rack.name} deleted`);
      await loadData();
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to delete rack');
    }
  };

  const handleDeleteDevice = async (entry: { device: RackDevice; rack: Rack }) => {
    if (!window.confirm(`Delete device ${entry.device.name}?`)) return;
    try {
      const res = await fetch(apiUrl(`/api/rackpoint/devices/${entry.device.id}/delete`), { method: 'POST', headers: authHeaders() });
      const data = await parseJsonResponseSafe(res);
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to delete device');
      setSelectedEntry(null);
      setToast(`Device ${entry.device.name} deleted`);
      await loadData();
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to delete device');
    }
  };

  const handleMoveDevice = async (entry: { device: RackDevice; rack: Rack }, targetRack: Rack, uStart: number) => {
    if (entry.device.rackId === targetRack.id && Number(entry.device.uStart) === Number(uStart)) {
      setDraggingDevice(null);
      return;
    }

    setSavingDevice(true);
    setLoadError('');
    try {
      const res = await fetch(apiUrl(`/api/rackpoint/devices/${entry.device.id}/update`), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          rackId: targetRack.id,
          name: entry.device.name,
          serialNumber: entry.device.serialNumber || '',
          hostname: entry.device.hostname || '',
          type: entry.device.type === 'blank' ? 'server' : entry.device.type,
          uStart,
          uSize: entry.device.uSize,
          vendor: entry.device.vendor,
          model: entry.device.model,
          ip: entry.device.ip || '',
          status: entry.device.status,
          role: entry.device.role || '',
          specs: entry.device.specs || '',
        }),
      });
      const data = await parseJsonResponseSafe(res);
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to move device');
      setSelectedEntry(null);
      setToast(`Moved ${entry.device.name} to ${targetRack.name} U${uStart}`);
      await loadData();
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to move device');
    } finally {
      setSavingDevice(false);
      setDraggingDevice(null);
    }
  };

  const downloadTemplate = () => {
    const dcId = selectedDc?.id || 'dc-001';
    const dcName = selectedDc?.name || 'Mumbai Colocation';
    const sampleRows = [
      {
        dcId,
        dcName,
        rackName: selectedDc ? `${selectedDc.dcCode}-R01` : 'MUM-R01A',
        rackType: '42U',
        location: 'Row A · Position 1',
        powerDraw: '3.8 kW',
        deviceName: 'APP-SRV-01',
        serialNumber: 'SN-000123456',
        hostname: 'app-srv-01.mum',
        ip: '10.24.1.11',
        deviceType: 'server',
        vendor: 'Dell',
        model: 'PowerEdge R760',
        uStart: 6,
        uSize: 2,
        lifecycleStatus: 'active',
        role: 'Application Server',
        specs: '2× Xeon Gold · 256 GB RAM · 4× NVMe',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RackPointImport');
    XLSX.writeFile(wb, 'rackpoint-bulk-template.xlsx');
  };

  const handleBulkUploadFile = async (file: File) => {
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: '' });
      const rows = parsed.map((row) => ({
        ...row,
        dcId: String(row.dcId || selectedDc?.id || '').trim(),
        dcName: String(row.dcName || selectedDc?.name || '').trim(),
      }));

      const res = await fetch(apiUrl('/api/rackpoint/import'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ rows }),
      });
      const data = await parseJsonResponseSafe(res);
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to import RackPoint workbook');
      const warnings = Array.isArray((data as any)?.warnings) ? (data as any).warnings.length : 0;
      setToast(`Imported ${(data as any)?.createdDevices || 0} devices${warnings ? ` · ${warnings} warnings` : ''}`);
      await loadData();
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to import workbook');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {toast ? <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-zinc-900"><CheckCircle2 className="h-4 w-4 text-emerald-400 dark:text-emerald-600" />{toast}</div> : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setSelectedDcId(null)} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${!selectedDcId ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-50 dark:hover:bg-zinc-800'}`}>All DCs</button>
          {selectedDc ? <button type="button" onClick={() => setSelectedDcId(null)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"><ChevronLeft className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />Back to all DCs</button> : null}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {selectedDc ? (
            <>
              <TextAction disabled={!canManageSelectedDc} onClick={openRackForm}>Add Rack</TextAction>
              <TextAction disabled={!canManageSelectedDc || selectedDcRacks.length === 0} onClick={() => openDeviceForm()}>Add Device</TextAction>
              <TextAction disabled={!selectedDc} onClick={downloadTemplate}>Download Template</TextAction>
              <TextAction disabled={!canManageSelectedDc || importing} onClick={() => fileInputRef.current?.click()}>{importing ? 'Uploading...' : 'Bulk Upload'}</TextAction>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleBulkUploadFile(file); }} />
            </>
          ) : null}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-rose-400 pointer-events-none" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={selectedDc ? 'Search racks, hostname, IP, serial …' : 'Search data center …'} className="pl-9 pr-9 py-2 text-sm w-72 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
            {search ? <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"><X className="h-3.5 w-3.5" /></button> : null}
          </div>
        </div>
      </div>

      {loadError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{loadError}</div> : null}
      {selectedDc && !selectedDc.isAvailable ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">This data center is currently unavailable for RackPoint onboarding. Rack creation is disabled.</div> : null}
      {selectedDc ? <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">Use the rack and device menus to edit or delete items. Devices can also be dragged to open U slots to change position.</div> : null}
      {!selectedDc ? <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">Select a data center to manage racks and devices. RackPoint is now reading the live Data Center inventory.</div> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Total Racks" value={String(selectedDc ? selectedDc.rackCount : globalStats.rackCount)} sub={selectedDc ? `inside ${selectedDc.name}` : `across ${dcSummaries.length} data centers`} />
        <SummaryTile label="Total Devices" value={String(selectedDc ? selectedDc.totalDevices : globalStats.deviceCount)} sub={selectedDc ? `${selectedDc.reachableCount} reachable in this DC` : `${globalStats.reachableCount} reachable overall`} />
        <SummaryTile label="Rack Units Used" value={`${selectedDc ? selectedDcRacks.reduce((sum, rack) => sum + getRackStats(rack).usedU, 0) : globalStats.usedU}U`} sub={`of ${selectedDc ? selectedDcRacks.reduce((sum, rack) => sum + rack.totalU, 0) : globalStats.totalU}U total capacity`} />
        <SummaryTile label="Avg Utilization" value={`${selectedDc ? (() => { const totalU = selectedDcRacks.reduce((sum, rack) => sum + rack.totalU, 0); const usedU = selectedDcRacks.reduce((sum, rack) => sum + getRackStats(rack).usedU, 0); return totalU > 0 ? Math.round((usedU / totalU) * 100) : 0; })() : globalStats.utilization}%`} sub={selectedDc ? `${selectedDc.serverCount} servers · ${selectedDc.storageCount} storage` : `${globalStats.totalU - globalStats.usedU}U free across all racks`} />
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 px-4 py-3">
        <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Legend</p>
        <Legend />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500 dark:text-zinc-400"><p>Loading RackPoint data...</p></div>
      ) : !selectedDc ? (
        filteredDcSummaries.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/70 px-8 py-20 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">No data centers match the current search</p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Try adjusting the search text.</p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredDcSummaries.map((dc) => <DcCard key={dc.id} dc={dc} selected={dc.id === selectedDcId} onSelect={() => setSelectedDcId(dc.id)} />)}
          </div>
        )
      ) : selectedDcRacks.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/70 px-8 py-20 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">No racks created yet for {selectedDc.name}</p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Create the first rack, then start placing devices into the correct U slots.</p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-6">
          <div className="flex gap-5" style={{ minWidth: 'max-content' }}>
            {selectedDcRacks.map((rack) => <RackDiagram key={rack.id} rack={rack} selectedId={selectedEntry?.device.id ?? null} searchQuery={search} canManage={canManageSelectedDc} draggedDeviceId={draggingDevice?.device.id ?? null} onSelectDevice={(device, selectedRack) => setSelectedEntry({ device, rack: selectedRack })} onSelectEmptySlot={(selectedRack, uStart) => openDeviceForm(selectedRack, uStart)} onAddDevice={(selectedRack) => openDeviceForm(selectedRack, 1)} onEditRack={openEditRackForm} onDeleteRack={(selectedRack) => void handleDeleteRack(selectedRack)} onStartDrag={(device, selectedRack) => setDraggingDevice({ device, rack: selectedRack })} onEndDrag={() => setDraggingDevice(null)} onDropDevice={(selectedRack, uStart) => { if (draggingDevice) void handleMoveDevice(draggingDevice, selectedRack, uStart); }} />)}
          </div>
        </div>
      )}

      {selectedEntry ? <DevicePanel device={selectedEntry.device} rack={selectedEntry.rack} canManage={canManageSelectedDc} onClose={() => setSelectedEntry(null)} onEdit={() => openEditDeviceForm(selectedEntry.device, selectedEntry.rack)} onDelete={() => void handleDeleteDevice(selectedEntry)} /> : null}
      {isRackFormOpen && selectedDc ? <RackFormPanel mode={editingRack ? 'edit' : 'create'} form={rackForm} saving={savingRack} error={rackFormError} selectedDc={selectedDc} onChange={(patch) => setRackForm((prev) => ({ ...prev, ...patch }))} onClose={() => { setIsRackFormOpen(false); setEditingRack(null); }} onSubmit={handleSaveRack} /> : null}
      {isDeviceFormOpen ? <DeviceFormPanel mode={editingDevice ? 'edit' : 'create'} racks={selectedDcRacks} form={deviceForm} saving={savingDevice} error={deviceFormError} onChange={(patch) => setDeviceForm((prev) => ({ ...prev, ...patch }))} onClose={() => { setIsDeviceFormOpen(false); setEditingDevice(null); }} onSubmit={handleSaveDevice} /> : null}
    </div>
  );
}
