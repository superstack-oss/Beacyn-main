import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { apiUrl } from '../../lib/api';
import { Activity, Database, RefreshCw, ShieldAlert, Trash2, Waves } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type SnmpVersion = '2c' | '3';

type SnmpDevice = {
  id: string;
  asset_id?: string | null;
  name: string;
  vendor?: string | null;
  device_type: string;
  host: string;
  port: number;
  snmp_version: SnmpVersion;
  enabled: number;
  poll_interval_sec: number;
  retention_hours: number;
  status: string;
  last_polled_at?: string | null;
  last_error?: string | null;
};

type SnmpSample = {
  id: number;
  device_id: string;
  metric_key: string;
  metric_value_num: number | null;
  metric_value_text: string | null;
  unit: string | null;
  oid: string;
  severity: string;
  sample_time: string;
};

type SnmpTrap = {
  id: number;
  device_id: string | null;
  source_ip: string;
  trap_oid: string;
  severity: string;
  message: string | null;
  received_at: string;
};

type SnmpEvent = {
  source: 'snmp_trap' | 'syslog';
  source_id: number;
  event_time: string;
  severity: string;
  message: string | null;
  source_ip: string;
  event_key: string;
  device_id: string | null;
  device_name: string;
  category: 'storage' | 'san' | 'unmapped';
};

function fmtTime(ts?: string | null) {
  if (!ts) return 'N/A';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('en-GB');
}

function statusTone(status: string) {
  const s = String(status || '').toLowerCase();
  if (s === 'up') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'degraded') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'down') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-zinc-100 text-zinc-700 border-zinc-300';
}

function categoryForDevice(deviceType: string) {
  return String(deviceType || '').toLowerCase() === 'storage' ? 'storage' : 'san';
}

export default function SnmpDevicesPage() {
  const [devices, setDevices] = useState<SnmpDevice[]>([]);
  const [allTraps, setAllTraps] = useState<SnmpTrap[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<'storage' | 'san'>('storage');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [samples, setSamples] = useState<SnmpSample[]>([]);
  const [events, setEvents] = useState<SnmpEvent[]>([]);
  const [metricKey, setMetricKey] = useState<string>('');
  const [eventQuery, setEventQuery] = useState('');
  const [eventSource, setEventSource] = useState<'all' | 'snmp_trap' | 'syslog'>('all');
  const [eventSeverity, setEventSeverity] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [vendor, setVendor] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('161');
  const [snmpVersion, setSnmpVersion] = useState<SnmpVersion>('2c');
  const [community, setCommunity] = useState('public');
  const [username, setUsername] = useState('');
  const [authProtocol, setAuthProtocol] = useState('SHA');
  const [authKey, setAuthKey] = useState('');
  const [privProtocol, setPrivProtocol] = useState('AES');
  const [privKey, setPrivKey] = useState('');

  const currentCategoryDevices = useMemo(
    () => devices.filter((d) => categoryForDevice(d.device_type) === selectedCategory),
    [devices, selectedCategory]
  );

  const currentDevice = useMemo(
    () => currentCategoryDevices.find((d) => d.id === selectedDeviceId) || null,
    [currentCategoryDevices, selectedDeviceId]
  );

  const categoryTraps = useMemo(() => {
    const ids = new Set(currentCategoryDevices.map((d) => d.id));
    return allTraps.filter((t) => (t.device_id ? ids.has(t.device_id) : false));
  }, [allTraps, currentCategoryDevices]);

  const chartData = useMemo(() => {
    if (!metricKey) return [];
    return [...samples]
      .filter((s) => s.metric_key === metricKey && s.metric_value_num != null)
      .sort((a, b) => new Date(a.sample_time).getTime() - new Date(b.sample_time).getTime())
      .map((s) => ({
        time: new Date(s.sample_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: Number(s.metric_value_num),
      }));
  }, [metricKey, samples]);

  const loadDevices = async () => {
    const res = await fetch(apiUrl('/api/snmp/devices'));
    const json = await res.json();
    const list = Array.isArray(json) ? json : [];
    setDevices(list);

    if (!selectedDeviceId) {
      const match = list.find((d: SnmpDevice) => categoryForDevice(d.device_type) === selectedCategory);
      if (match) setSelectedDeviceId(match.id);
    }
  };

  const loadTraps = async () => {
    const res = await fetch(apiUrl('/api/snmp/traps?hours=24&limit=1000'));
    const json = await res.json();
    setAllTraps(Array.isArray(json) ? json : []);
  };

  const loadEvents = async () => {
    const params = new URLSearchParams();
    params.set('category', selectedCategory);
    params.set('hours', '24');
    params.set('limit', '300');
    if (eventQuery.trim()) params.set('q', eventQuery.trim());
    if (eventSource !== 'all') params.set('source', eventSource);
    if (eventSeverity !== 'all') params.set('severity', eventSeverity);

    const res = await fetch(apiUrl(`/api/snmp/events?${params.toString()}`));
    const json = await res.json();
    setEvents(Array.isArray(json?.events) ? json.events : []);
  };

  const loadSamplesForDevice = async (deviceId: string) => {
    if (!deviceId) {
      setSamples([]);
      setMetricKey('');
      return;
    }
    const res = await fetch(apiUrl(`/api/snmp/telemetry?deviceId=${encodeURIComponent(deviceId)}&hours=6&limit=1000`));
    const json = await res.json();
    const list = Array.isArray(json) ? json : [];
    setSamples(list);

    const keys = Array.from(new Set(list.filter((s: SnmpSample) => s.metric_value_num != null).map((s: SnmpSample) => s.metric_key))).sort();
    setMetricKey((prev) => (prev && keys.includes(prev) ? prev : (keys[0] || '')));
  };

  const refreshAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadDevices(), loadTraps(), loadEvents()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    const fallback = currentCategoryDevices[0]?.id || '';
    if (!currentCategoryDevices.find((d) => d.id === selectedDeviceId)) {
      setSelectedDeviceId(fallback);
    }
  }, [currentCategoryDevices, selectedDeviceId]);

  useEffect(() => {
    void loadSamplesForDevice(selectedDeviceId);
  }, [selectedDeviceId]);

  useEffect(() => {
    void loadEvents();
  }, [selectedCategory, eventSource, eventSeverity]);

  const handleCreate = async () => {
    if (!name.trim() || !host.trim()) {
      alert('Name and host are required.');
      return;
    }

    const body: Record<string, any> = {
      name: name.trim(),
      vendor: vendor.trim() || null,
      host: host.trim(),
      port: Number(port || 161),
      snmpVersion,
      deviceType: selectedCategory === 'storage' ? 'Storage' : 'Switch',
      enabled: true,
      pollIntervalSec: 60,
      retentionHours: 48,
    };

    if (snmpVersion === '2c') {
      body.community = community || 'public';
    } else {
      body.username = username || null;
      body.authProtocol = authProtocol;
      body.authKey = authKey || null;
      body.privProtocol = privProtocol;
      body.privKey = privKey || null;
    }

    const res = await fetch(apiUrl('/api/snmp/devices'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Failed to create SNMP device.');
      return;
    }

    setName('');
    setVendor('');
    setHost('');
    setPort('161');
    setCommunity('public');
    setUsername('');
    setAuthKey('');
    setPrivKey('');
    await refreshAll();
  };

  const handlePoll = async (deviceId: string) => {
    const res = await fetch(apiUrl(`/api/snmp/devices/${encodeURIComponent(deviceId)}/poll`), { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'SNMP poll failed.');
      return;
    }
    await Promise.all([refreshAll(), loadSamplesForDevice(deviceId)]);
  };

  const handleDelete = async (deviceId: string) => {
    if (!confirm('Delete this SNMP device and related telemetry/traps?')) return;
    const res = await fetch(apiUrl(`/api/snmp/devices/${encodeURIComponent(deviceId)}`), { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Failed to delete device.');
      return;
    }
    if (selectedDeviceId === deviceId) setSelectedDeviceId('');
    await refreshAll();
  };

  const storageCount = devices.filter((d) => categoryForDevice(d.device_type) === 'storage').length;
  const sanCount = devices.filter((d) => categoryForDevice(d.device_type) === 'san').length;

  return (
    <div className="space-y-6">
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">SNMP Device Management</CardTitle>
              <CardDescription>
                Manage SNMP devices and visualize telemetry/traps in two categories: Storage and SAN.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refreshAll()}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="pt-4">
                <p className="text-xs text-zinc-500 uppercase">Storage Devices</p>
                <p className="text-2xl font-semibold mt-1">{storageCount}</p>
              </CardContent>
            </Card>
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="pt-4">
                <p className="text-xs text-zinc-500 uppercase">SAN Devices</p>
                <p className="text-2xl font-semibold mt-1">{sanCount}</p>
              </CardContent>
            </Card>
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="pt-4">
                <p className="text-xs text-zinc-500 uppercase">Traps (24h)</p>
                <p className="text-2xl font-semibold mt-1">{allTraps.length}</p>
              </CardContent>
            </Card>
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="pt-4">
                <p className="text-xs text-zinc-500 uppercase">Samples (Selected)</p>
                <p className="text-2xl font-semibold mt-1">{samples.length}</p>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-lg border border-zinc-200 p-4">
            <p className="text-sm font-semibold mb-3">Add SNMP Device</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="grid gap-1.5">
                <Label>Device Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="brocade-lab-1" />
              </div>
              <div className="grid gap-1.5">
                <Label>Vendor</Label>
                <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Brocade / NetApp / HPE" />
              </div>
              <div className="grid gap-1.5">
                <Label>Host</Label>
                <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="127.0.0.1" />
              </div>
              <div className="grid gap-1.5">
                <Label>Port</Label>
                <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="161" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mt-3">
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as 'storage' | 'san')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="storage">Storage</SelectItem>
                    <SelectItem value="san">SAN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>SNMP Version</Label>
                <Select value={snmpVersion} onValueChange={(v) => setSnmpVersion(v as SnmpVersion)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2c">SNMP v2c</SelectItem>
                    <SelectItem value="3">SNMP v3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {snmpVersion === '2c' ? (
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label>Community</Label>
                  <Input value={community} onChange={(e) => setCommunity(e.target.value)} placeholder="public" />
                </div>
              ) : (
                <>
                  <div className="grid gap-1.5">
                    <Label>Username</Label>
                    <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="snmpuser" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Auth Protocol</Label>
                    <Select value={authProtocol} onValueChange={setAuthProtocol}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SHA">SHA</SelectItem>
                        <SelectItem value="SHA256">SHA256</SelectItem>
                        <SelectItem value="MD5">MD5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Auth Key</Label>
                    <Input value={authKey} onChange={(e) => setAuthKey(e.target.value)} placeholder="auth key" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Priv Protocol</Label>
                    <Select value={privProtocol} onValueChange={setPrivProtocol}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AES">AES</SelectItem>
                        <SelectItem value="AES256">AES256</SelectItem>
                        <SelectItem value="DES">DES</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label>Priv Key</Label>
                    <Input value={privKey} onChange={(e) => setPrivKey(e.target.value)} placeholder="privacy key" />
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={() => void handleCreate()}>Create Device</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as 'storage' | 'san')}>
        <TabsList variant="line">
          <TabsTrigger value="storage"><Database className="w-3.5 h-3.5 mr-1" /> Storage</TabsTrigger>
          <TabsTrigger value="san"><Waves className="w-3.5 h-3.5 mr-1" /> SAN</TabsTrigger>
        </TabsList>

        <TabsContent value="storage" className="space-y-6">
          <CategorySection
            devices={currentCategoryDevices}
            selectedDeviceId={selectedDeviceId}
            setSelectedDeviceId={setSelectedDeviceId}
            currentDevice={currentDevice}
            samples={samples}
            metricKey={metricKey}
            setMetricKey={setMetricKey}
            chartData={chartData}
            traps={categoryTraps}
            events={events}
            eventQuery={eventQuery}
            setEventQuery={setEventQuery}
            eventSource={eventSource}
            setEventSource={setEventSource}
            eventSeverity={eventSeverity}
            setEventSeverity={setEventSeverity}
            onSearch={() => void loadEvents()}
            onPoll={handlePoll}
            onDelete={handleDelete}
          />
        </TabsContent>

        <TabsContent value="san" className="space-y-6">
          <CategorySection
            devices={currentCategoryDevices}
            selectedDeviceId={selectedDeviceId}
            setSelectedDeviceId={setSelectedDeviceId}
            currentDevice={currentDevice}
            samples={samples}
            metricKey={metricKey}
            setMetricKey={setMetricKey}
            chartData={chartData}
            traps={categoryTraps}
            events={events}
            eventQuery={eventQuery}
            setEventQuery={setEventQuery}
            eventSource={eventSource}
            setEventSource={setEventSource}
            eventSeverity={eventSeverity}
            setEventSeverity={setEventSeverity}
            onSearch={() => void loadEvents()}
            onPoll={handlePoll}
            onDelete={handleDelete}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CategorySection({
  devices,
  selectedDeviceId,
  setSelectedDeviceId,
  currentDevice,
  samples,
  metricKey,
  setMetricKey,
  chartData,
  traps,
  events,
  eventQuery,
  setEventQuery,
  eventSource,
  setEventSource,
  eventSeverity,
  setEventSeverity,
  onSearch,
  onPoll,
  onDelete,
}: {
  devices: SnmpDevice[];
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
  currentDevice: SnmpDevice | null;
  samples: SnmpSample[];
  metricKey: string;
  setMetricKey: (v: string) => void;
  chartData: Array<{ time: string; value: number }>;
  traps: SnmpTrap[];
  events: SnmpEvent[];
  eventQuery: string;
  setEventQuery: (value: string) => void;
  eventSource: 'all' | 'snmp_trap' | 'syslog';
  setEventSource: (value: 'all' | 'snmp_trap' | 'syslog') => void;
  eventSeverity: 'all' | 'critical' | 'warning' | 'info';
  setEventSeverity: (value: 'all' | 'critical' | 'warning' | 'info') => void;
  onSearch: () => void;
  onPoll: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const numericMetricKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const s of samples) {
      if (s.metric_value_num != null) keys.add(s.metric_key);
    }
    return Array.from(keys).sort();
  }, [samples]);

  return (
    <>
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Devices</CardTitle>
          <CardDescription>Human-readable status and controls.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Polled</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-zinc-500">No devices in this category.</TableCell>
                </TableRow>
              ) : devices.map((d) => (
                <TableRow
                  key={d.id}
                  className={selectedDeviceId === d.id ? 'bg-zinc-50' : ''}
                  onClick={() => setSelectedDeviceId(d.id)}
                >
                  <TableCell className="pl-6 font-medium">{d.name}</TableCell>
                  <TableCell>{d.vendor || 'N/A'}</TableCell>
                  <TableCell>{d.host}:{d.port}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusTone(d.status)}>{d.status || 'Unknown'}</Badge>
                  </TableCell>
                  <TableCell>{fmtTime(d.last_polled_at)}</TableCell>
                  <TableCell className="pr-6 text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); void onPoll(d.id); }}>
                      <Activity className="w-3.5 h-3.5 mr-1.5" /> Poll
                    </Button>
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); void onDelete(d.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="border-zinc-200 dark:border-zinc-800 xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Telemetry Visualization</CardTitle>
            <CardDescription>
              {currentDevice ? `Live metric trend for ${currentDevice.name}` : 'Select a device to view telemetry.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!currentDevice ? (
              <p className="text-sm text-zinc-500">No device selected.</p>
            ) : (
              <div className="space-y-4">
                <div className="max-w-xs">
                  <Label>Metric</Label>
                  <Select value={metricKey} onValueChange={setMetricKey}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select metric" />
                    </SelectTrigger>
                    <SelectContent>
                      {numericMetricKeys.map((k) => (
                        <SelectItem key={k} value={k}>{k}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="h-[280px]">
                  {chartData.length === 0 ? (
                    <div className="h-full rounded-lg border border-dashed border-zinc-200 flex items-center justify-center text-sm text-zinc-500">
                      No numeric telemetry points available yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                        <XAxis dataKey="time" axisLine={false} tickLine={false} fontSize={11} />
                        <YAxis axisLine={false} tickLine={false} fontSize={11} />
                        <Tooltip />
                        <Line dataKey="value" type="monotone" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="rounded-lg border border-zinc-200 p-3">
                  <p className="text-xs font-semibold text-zinc-600 mb-2">Latest Telemetry Samples</p>
                  <div className="max-h-52 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Metric</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>OID</TableHead>
                          <TableHead>Sample Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {samples.slice(0, 20).map((s) => (
                          <TableRow key={s.id}>
                            <TableCell>{s.metric_key}</TableCell>
                            <TableCell>{s.metric_value_num ?? s.metric_value_text ?? 'N/A'} {s.unit || ''}</TableCell>
                            <TableCell className="font-mono text-xs">{s.oid}</TableCell>
                            <TableCell>{fmtTime(s.sample_time)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Traps (Category)
            </CardTitle>
            <CardDescription>Human-readable trap events scoped to this category.</CardDescription>
          </CardHeader>
          <CardContent>
            {traps.length === 0 ? (
              <p className="text-sm text-zinc-500">No traps captured in last 24h.</p>
            ) : (
              <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
                {traps.slice(0, 60).map((t) => (
                  <div key={t.id} className="rounded-lg border border-zinc-200 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">{t.source_ip}</p>
                      <Badge variant="outline" className={statusTone(t.severity)}>{t.severity}</Badge>
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-1">OID: {t.trap_oid}</p>
                    {t.message ? <p className="text-[11px] text-zinc-500 mt-0.5">{t.message}</p> : null}
                    <p className="text-[10px] text-zinc-400 mt-1">{fmtTime(t.received_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Event Timeline (Traps + Syslogs)</CardTitle>
          <CardDescription>Searchable normalized events for this category.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label>Search</Label>
              <Input
                value={eventQuery}
                onChange={(e) => setEventQuery(e.target.value)}
                placeholder="device, source IP, message, event key"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSearch();
                }}
              />
            </div>
            <div>
              <Label>Source</Label>
              <Select value={eventSource} onValueChange={(v) => setEventSource(v as 'all' | 'snmp_trap' | 'syslog')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="snmp_trap">SNMP Trap</SelectItem>
                  <SelectItem value="syslog">Syslog</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={eventSeverity} onValueChange={(v) => setEventSeverity(v as 'all' | 'critical' | 'warning' | 'info')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Button variant="outline" size="sm" onClick={onSearch}>Search Events</Button>
          </div>

          <div className="rounded-lg border border-zinc-200 max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Event Key</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Source IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-zinc-500">No events found for this category/filter.</TableCell>
                  </TableRow>
                ) : events.map((e) => (
                  <TableRow key={`${e.source}-${e.source_id}`}>
                    <TableCell>{fmtTime(e.event_time)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-zinc-100 text-zinc-700 border-zinc-300">{e.source}</Badge>
                    </TableCell>
                    <TableCell>{e.device_name || 'Unmapped'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusTone(e.severity)}>{e.severity}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.event_key}</TableCell>
                    <TableCell>{e.message || 'N/A'}</TableCell>
                    <TableCell>{e.source_ip}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}