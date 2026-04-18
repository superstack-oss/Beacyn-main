import { useEffect, useMemo, useState } from 'react';
import { Search, CheckCircle2, AlertCircle, Settings, ExternalLink, Activity, Info, LifeBuoy, Sun, Moon, Download } from 'lucide-react';
import { RadialBarChart, RadialBar, PolarGrid, PolarRadiusAxis, Label } from 'recharts';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../components/ui/dropdown-menu';
import { apiUrl } from '../../lib/api';
import hexagonLogo from '../../assets/logos/approved.png';
import globeVideo from '../../assets/video/globe.mp4';

type ServiceHealth = {
    id: string | number;
    group: string;
    name: string;
    endpoint: string;
    status: string;
    uptimePct: number;
    avgResponseMs: number | null;
    lastCheckedAt: string | null;
    incident: string | null;
    history: Array<{ ok: boolean; down: boolean }>;
    responseHistory?: number[];
    ip?: string;
};

type PublicPayload = {
    page: {
        id: string;
        name: string;
        groupName: string;
        timezone: string;
        companyName: string;
        pageAddress: string;
        showResponseCharts: boolean;
        createdAt: string;
    };
    services: ServiceHealth[];
    generatedAt: string;
    overall: {
        label: string;
        avgUptime: number;
        total: number;
    };
};

function statusTone(status: string) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'up' || normalized === 'online' || normalized === 'connected' || normalized === 'operational') return 'good';
    if (normalized === 'down' || normalized === 'offline' || normalized === 'disconnected') return 'poor';
    return 'warn';
}

function timeAgo(value?: string | null) {
    if (!value) return 'just now';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'just now';
    const diff = Date.now() - dt.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function InlineResponseBars({ values, timeAgoText }: { values: number[]; timeAgoText: string }) {
    const usable = values.length ? values.slice(-24) : [];
    const max = Math.max(...usable, 1);
    const latestMs = usable.length > 0 ? usable[usable.length - 1] : null;

    return (
        <div className="flex items-center gap-3">
            <div className="flex items-end gap-[1px] h-6 w-24">
                {usable.map((value, index) => (
                    <div key={index} className="flex-1 flex flex-col justify-end group h-full">
                        <span
                            className="w-full rounded-t-[1px] bg-emerald-400 dark:bg-emerald-500 transition-all group-hover:bg-emerald-600"
                            style={{ height: `${Math.max(10, Math.round((value / max) * 100))}%` }}
                            title={`${value}ms`}
                        />
                    </div>
                ))}
                {usable.length === 0 && <span className="text-[10px] text-zinc-400">No data</span>}
            </div>
            <div className="flex flex-col">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{latestMs != null ? `${latestMs}ms` : '—'}</span>
                <span className="text-[9px] text-zinc-400">{timeAgoText}</span>
            </div>
        </div>
    );
}

function DownloadCSV({ data }: { data: ServiceHealth[] }) {
    const handleDownload = () => {
        const headers = ['Name', 'Status', 'Avg Response (ms)', 'Uptime (%)', 'Type', 'IP'];
        const rows = data.map((s) => [
            s.name,
            s.status || 'Up',
            s.avgResponseMs || 0,
            s.uptimePct,
            s.group,
            s.ip || s.endpoint || ''
        ]);
        const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'status_report.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm"
        >
            <Download className="w-3.5 h-3.5" /> CSV Export
        </button>
    );
}

// 7. Graph mock for cards
function CardGraph({ type, isGood }: { type: 'line' | 'bar', isGood: boolean }) {
    const color = isGood ? 'var(--emerald-400, #34d399)' : 'var(--amber-400, #fbbf24)';
    if (type === 'line') {
        return (
            <svg className="w-full h-8 opacity-40 select-none pointer-events-none" viewBox="0 0 100 20" preserveAspectRatio="none">
                <path d="M0,20 L0,15 Q10,5 20,10 T40,12 T60,8 T80,18 T100,5 L100,20 Z" fill={color} className="opacity-20" />
                <path d="M0,15 Q10,5 20,10 T40,12 T60,8 T80,18 T100,5" fill="none" stroke={color} strokeWidth="2" />
            </svg>
        );
    }
    return (
        <div className="flex items-end h-8 gap-0.5 opacity-40 w-full select-none pointer-events-none">
            {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="flex-1 rounded-t-[1px]" style={{ backgroundColor: color, height: `${40 + Math.random() * 60}%` }} />
            ))}
        </div>
    );
}

export default function StatusPage({ publicToken }: { publicToken: string }) {
    const [data, setData] = useState<PublicPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        }
        return 'light';
    });

    const [detailsModal, setDetailsModal] = useState<ServiceHealth | null>(null);

    const toggleTheme = () => {
        setTheme(t => {
            const next = t === 'light' ? 'dark' : 'light';
            if (next === 'dark') document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
            return next;
        });
    };

    const loadData = async () => {
        if (!publicToken) {
            setError('A secure public status page link is required.');
            setLoading(false);
            return;
        }
        setError('');
        try {
            const res = await fetch(apiUrl(`/api/status-pages/public/${publicToken}`));
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload?.error || 'Failed to load public status page');
            setData(payload as PublicPayload);
        } catch (err: any) {
            setError(err?.message || 'Failed to load public status page');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
        const id = window.setInterval(loadData, 60000);
        return () => window.clearInterval(id);
    }, [publicToken]);

    const publicOverall = useMemo(() => {
        const services = data?.services || [];
        const down = services.filter((svc) => statusTone(svc.status) === 'poor').length;
        const degraded = services.filter((svc) => statusTone(svc.status) === 'warn').length;
        return {
            label: data?.overall?.label || (down > 0 ? 'Partial Service Disruption' : degraded > 0 ? 'Minor Service Issues' : 'All Systems Operational'),
            avgUptime: data?.overall?.avgUptime || 100,
            total: data?.overall?.total || services.length,
            isGood: down === 0 && degraded === 0,
        };
    }, [data]);

    const filteredServices = useMemo(() => {
        const svcs = data?.services || [];
        if (!search.trim()) return svcs;
        const q = search.toLowerCase();
        return svcs.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                s.group.toLowerCase().includes(q) ||
                (s.endpoint && s.endpoint.toLowerCase().includes(q)) ||
                (s.ip && s.ip.toLowerCase().includes(q))
        );
    }, [data, search]);

    if (loading && !data) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
                <div className="text-zinc-500 animate-pulse text-sm">Loading status...</div>
            </div>
        );
    }

    const hasNotification = !publicOverall.isGood;

    const currentTimeFormatter = new Intl.DateTimeFormat('en-US', {
        timeStyle: 'short',
        timeZone: data?.page.timezone || 'UTC'
    });

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col font-sans transition-colors duration-300 relative overflow-hidden">

            {/* Box-Grid Background — same as ComingSoonPage */}
            <div
                className="fixed inset-0 z-0 pointer-events-none"
                style={{
                    backgroundImage:
                        'linear-gradient(to right, rgba(100,100,120,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,100,120,0.10) 1px, transparent 1px)',
                    backgroundSize: '12px 12px',
                }}
            />

            {/* Top Notification Banner */}
            {hasNotification && (
                <div className="relative z-10 bg-amber-50 border-b border-amber-200/50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20 px-4 py-2 text-xs md:text-sm font-medium text-center flex items-center justify-center gap-2 shadow-sm">
                    <AlertCircle className="w-4 h-4" />
                    A notification regarding active service issues or ongoing maintenance is currently posted.
                </div>
            )}

            {/* Main Content Area */}
            <main className="relative z-10 flex-grow mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 space-y-6">

                {error ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
                ) : null}

                {/* Header Card (Image 1 replica for AEP Pvt Ltd shape) */}
                <Card className="bg-transparent dark:bg-transparent">
                    <CardContent className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-2">
                            <div className="flex-shrink-0 bg-transparent dark:bg-transparent p-2 rounded-2xl w-34 h-34 flex items-center justify-center">
                                <img src={hexagonLogo} alt="Logo" className="w-34 h-34 object-contain drop-shadow-sm" />
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[20px] font-bold uppercase tracking-[0.15em] text-zinc-400">Public Status Page</p>
                                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                                    {data?.page.companyName || 'Company Name'}
                                </h1>
                                <p className="text-xs text-zinc-500 font-normal">
                                    Public Status Page • {data?.page.pageAddress || 'status.domain.com'}
                                </p>
                            </div>
                        </div>

                        {/* Radial Chart – Shape (replaces the old pill badge) */}
                        <div className="flex flex-col items-center gap-1">
                            <div style={{ width: 110, height: 110 }}>
                                <RadialBarChart
                                    width={110}
                                    height={110}
                                    data={[{ value: publicOverall.avgUptime, fill: publicOverall.isGood ? '#10b981' : publicOverall.avgUptime > 50 ? '#f59e0b' : '#f43f5e' }]}
                                    endAngle={100}
                                    innerRadius={32}
                                    outerRadius={50}
                                >
                                    <PolarGrid
                                        gridType="circle"
                                        radialLines={false}
                                        stroke="none"
                                        polarRadius={[43, 35]}
                                        className="first:fill-zinc-100 last:fill-white dark:first:fill-zinc-800 dark:last:fill-zinc-900"
                                    />
                                    <RadialBar dataKey="value" background={{ fill: '#e4e4e7' }} cornerRadius={6} />
                                    <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                                        <Label
                                            content={({ viewBox }) => {
                                                if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                                                    return (
                                                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                                                            <tspan
                                                                x={viewBox.cx}
                                                                y={(viewBox.cy ?? 0) - 2}
                                                                style={{ fontSize: 14, fontWeight: 700, fill: publicOverall.isGood ? '#10b981' : publicOverall.avgUptime > 50 ? '#f59e0b' : '#f43f5e' }}
                                                            >
                                                                {publicOverall.avgUptime}%
                                                            </tspan>
                                                            <tspan
                                                                x={viewBox.cx}
                                                                y={(viewBox.cy ?? 0) + 13}
                                                                style={{ fontSize: 7.5, fill: '#a1a1aa', fontWeight: 600, letterSpacing: '0.06em' }}
                                                            >
                                                                UPTIME
                                                            </tspan>
                                                        </text>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                    </PolarRadiusAxis>
                                </RadialBarChart>
                            </div>
                            <span className="text-[10px] text-zinc-400 font-medium tracking-wide -mt-1">
                                Updated {timeAgo(data?.generatedAt)}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* 3 Compact Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Status Card — Radial half-donut chart */}
                    <Card className="border border-zinc-200/60 shadow-sm dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 transition-all overflow-hidden relative">
                        <CardContent className="px-5 pt-3 pb-2 flex flex-col h-[100px]">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Status</p>
                            {/* Pure-SVG Half-donut radial chart */}
                            {(() => {
                                const total = Math.max(publicOverall.total, 1);
                                const upServices = data?.services?.filter(s => statusTone(s.status) === 'good').length ?? total;
                                const downServices = total - upServices;
                                const radius = 38;
                                const cx = 80;
                                const cy = 56;
                                const circumference = Math.PI * radius; // half circle arc length
                                const upFrac = upServices / total;
                                const downFrac = downServices / total;
                                // arc from 180° to 0° = left to right across the top
                                const toXY = (angleDeg: number) => {
                                    const rad = (angleDeg * Math.PI) / 180;
                                    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
                                };
                                const startPt = toXY(180); // leftmost
                                const splitPt = toXY(180 - upFrac * 180); // split point
                                const endPt = toXY(0);   // rightmost
                                const upPath = `M ${startPt.x} ${startPt.y} A ${radius} ${radius} 0 ${upFrac > 0.5 ? 1 : 0} 1 ${splitPt.x} ${splitPt.y}`;
                                const downPath = `M ${splitPt.x} ${splitPt.y} A ${radius} ${radius} 0 ${downFrac > 0.5 ? 1 : 0} 1 ${endPt.x} ${endPt.y}`;
                                const bgPath = `M ${startPt.x} ${startPt.y} A ${radius} ${radius} 0 1 1 ${endPt.x} ${endPt.y}`;
                                return (
                                    <div className="relative flex items-end justify-center flex-1">
                                        <svg viewBox="0 0 160 62" className="w-full" style={{ overflow: 'visible' }}>
                                            {/* Track */}
                                            <path d={bgPath} fill="none" stroke="#e4e4e7" strokeWidth="9" strokeLinecap="round" className="dark:stroke-zinc-700" />
                                            {/* Up segment — emerald */}
                                            {upServices > 0 && (
                                                <path d={upPath} fill="none" stroke={publicOverall.isGood ? '#10b981' : '#f59e0b'} strokeWidth="9" strokeLinecap="round" />
                                            )}
                                            {/* Down segment — rose */}
                                            {downServices > 0 && (
                                                <path d={downPath} fill="none" stroke="#f43f5e" strokeWidth="9" strokeLinecap="round" />
                                            )}
                                            {/* Centre label */}
                                            <text x={cx} y={cy - 4} textAnchor="middle" className="font-bold" style={{ fontSize: 16, fontWeight: 700, fill: publicOverall.isGood ? '#10b981' : '#f59e0b' }}>
                                                {upServices}
                                            </text>
                                            <text x={cx} y={cy + 11} textAnchor="middle" style={{ fontSize: 8, fill: '#a1a1aa', fontWeight: 600, letterSpacing: '0.08em' }}>
                                                / {total} UP
                                            </text>
                                        </svg>
                                    </div>
                                );
                            })()}
                        </CardContent>
                    </Card>

                    <Card className="border border-zinc-200/60 shadow-sm dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 transition-all overflow-hidden relative">
                        <CardContent className="px-5 py-4 flex flex-col items-start justify-between h-20">
                            <div className="w-full relative z-10 space-y-0.5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Average Uptime</p>
                                <p className="text-base font-bold text-zinc-800 dark:text-zinc-100">{publicOverall.avgUptime}%</p>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 pointer-events-none">
                                <CardGraph type="bar" isGood={publicOverall.avgUptime > 95} />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Timezone card — globe video background */}
                    <Card className="border border-zinc-200/60 shadow-sm dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 transition-all overflow-hidden relative">
                        {/* Globe video */}
                        <video
                            src={globeVideo}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
                            style={{ opacity: 0.13, mixBlendMode: 'luminosity', transform: 'scale(1.1)' }}
                        />
                        {/* Gradient so text is always readable */}
                        <div className="absolute inset-0 bg-gradient-to-r from-white/80 via-transparent to-white/40 dark:from-zinc-900/80 dark:via-transparent dark:to-zinc-900/40 pointer-events-none" />
                        <CardContent className="px-5 py-4 flex flex-col items-start justify-between h-[100px] relative z-10">
                            <div className="w-full space-y-0.5">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                    Timezone • {data?.page.timezone || 'UTC'}
                                </p>
                                <p className="text-2xl font-bold text-zinc-800 dark:text-zinc-100 mt-1">
                                    {currentTimeFormatter.format(new Date())}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Section Title & Search */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-4 pb-2">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                        <Input
                            placeholder="Search components..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 h-8 text-xs bg-white dark:bg-zinc-900 border-zinc-300 shadow-sm"
                        />
                    </div>
                    <DownloadCSV data={filteredServices} />
                </div>

                {/* Main Component Table */}
                <Card className="border border-zinc-200/60 shadow-sm dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 overflow-hidden backdrop-blur-xl">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40 border-b border-zinc-200 dark:border-zinc-800/60">
                                <TableRow className="hover:bg-transparent tracking-wide">
                                    <TableHead className="w-[180px] text-[10px] font-bold uppercase text-zinc-500 py-3 pl-5">Name</TableHead>
                                    <TableHead className="w-[100px] text-[10px] font-bold uppercase text-zinc-500 py-3">Status</TableHead>
                                    <TableHead className="w-[200px] text-[10px] font-bold uppercase text-zinc-500 py-3">Response Time trend</TableHead>
                                    <TableHead className="w-[100px] text-[10px] font-bold uppercase text-zinc-500 py-3">Avg Response</TableHead>
                                    <TableHead className="w-[80px] text-[10px] font-bold uppercase text-zinc-500 py-3">Uptime</TableHead>
                                    <TableHead className="w-[100px] text-[10px] font-bold uppercase text-zinc-500 py-3">Type</TableHead>
                                    <TableHead className="text-[10px] font-bold uppercase text-zinc-500 py-3">IP</TableHead>
                                    <TableHead className="text-[10px] font-bold uppercase text-zinc-500 py-3 text-right">Updated</TableHead>
                                    <TableHead className="w-[60px] text-[10px] font-bold uppercase text-zinc-500 py-3 text-center pr-5 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredServices.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-32 text-center text-zinc-500 text-sm border-0">
                                            No components found matching your search.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredServices.map((service) => {
                                        const tone = statusTone(service.status);
                                        const isGood = tone === 'good';
                                        const isPoor = tone === 'poor';
                                        const isWebsite = service.group.toLowerCase().includes('web') || service.endpoint.startsWith('http');

                                        return (
                                            <TableRow key={service.id} className="border-b border-zinc-100 dark:border-zinc-800/40 group hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors">
                                                <TableCell className="py-2.5 pl-5 align-middle">
                                                    <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">{service.name}</div>
                                                </TableCell>
                                                <TableCell className="py-2.5 align-middle">
                                                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-transparent shadow-sm text-[10px] font-bold tracking-wide uppercase ${isGood ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                                                        isPoor ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' :
                                                            'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                                                        }`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${isGood ? 'bg-emerald-500' : isPoor ? 'bg-rose-500' : 'bg-amber-500'}`} />
                                                        {service.status || (isGood ? 'Up' : 'Down')}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-2.5 align-middle">
                                                    <InlineResponseBars values={service.responseHistory || []} timeAgoText={timeAgo(service.lastCheckedAt)} />
                                                </TableCell>
                                                <TableCell className="py-2.5 align-middle font-medium text-xs text-zinc-700 dark:text-zinc-300">
                                                    {service.avgResponseMs != null ? `${service.avgResponseMs}ms` : '—'}
                                                </TableCell>
                                                <TableCell className="py-2.5 align-middle font-medium text-xs text-zinc-700 dark:text-zinc-300">
                                                    {service.uptimePct}%
                                                </TableCell>
                                                <TableCell className="py-2.5 align-middle capitalize font-medium text-xs text-zinc-700 dark:text-zinc-300">
                                                    {service.group || 'Server'}
                                                </TableCell>
                                                <TableCell className="py-2.5 align-middle text-[11px] text-zinc-500 max-w-[120px] truncate" title={service.ip || service.endpoint}>
                                                    {service.ip || service.endpoint}
                                                </TableCell>
                                                <TableCell className="py-2.5 align-middle text-right text-[10px] text-zinc-400 font-medium">
                                                    {timeAgo(service.lastCheckedAt)}
                                                </TableCell>
                                                <TableCell className="py-2.5 align-middle text-right pr-5">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <button className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors">
                                                                <Settings className="w-4 h-4" />
                                                            </button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48 text-xs">
                                                            <DropdownMenuItem
                                                                disabled={!isWebsite}
                                                                onClick={() => isWebsite && window.open(service.endpoint, '_blank')}
                                                                className="gap-2 cursor-pointer"
                                                            >
                                                                <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                                                                Open site
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => setDetailsModal(service)}>
                                                                <Activity className="w-3.5 h-3.5 text-zinc-400" />
                                                                Details
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="gap-2 cursor-pointer text-zinc-400 hover:bg-transparent" disabled>
                                                                <LifeBuoy className="w-3.5 h-3.5" />
                                                                Contact support <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-auto scale-90">Soon</Badge>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 p-3 flex items-center justify-end text-[11px] text-zinc-500 bg-zinc-50/30 dark:bg-zinc-900/30 font-medium">
                        <span className="mr-4 text-zinc-400">Rows per page: <strong className="text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded ml-1 bg-white dark:bg-zinc-800">All v</strong></span>
                        <span>1-{filteredServices.length} of {filteredServices.length}</span>
                    </div>
                </Card>
            </main>

            {/* Details Modal */}
            {detailsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setDetailsModal(null)}>
                    <div
                        className="bg-white dark:bg-zinc-950 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-zinc-200 dark:border-zinc-800"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/80 flex items-start gap-4 bg-zinc-50/50 dark:bg-zinc-900/30">
                            <div className="p-2.5 bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 rounded-lg">
                                <Activity className="w-6 h-6" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                    {detailsModal.name}
                                    {detailsModal.status === 'Up' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                    {detailsModal.status === 'Down' && <AlertCircle className="w-4 h-4 text-rose-500" />}
                                </h3>
                                <p className="text-xs text-zinc-500 tracking-wide break-all mt-0.5">{detailsModal.ip || detailsModal.endpoint}</p>
                            </div>
                            <button
                                onClick={() => setDetailsModal(null)}
                                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                                aria-label="Close details"
                            >
                                <div className="rotate-45 text-2xl leading-none">&times;</div>
                            </button>
                        </div>

                        <div className="p-5 space-y-6 text-sm">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 border border-zinc-100 dark:border-zinc-800/80 rounded-lg bg-white dark:bg-zinc-900/40">
                                    <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1 tracking-wider">Last Offline</p>
                                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">—</p>
                                    <p className="text-[10px] text-zinc-500 mt-0.5">No recent downtime in 48h</p>
                                </div>
                                <div className="p-3 border border-zinc-100 dark:border-zinc-800/80 rounded-lg bg-white dark:bg-zinc-900/40">
                                    <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1 tracking-wider">Total disruptions</p>
                                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">0</p>
                                    <p className="text-[10px] text-zinc-500 mt-0.5">Incidents in last 48 hours</p>
                                </div>
                            </div>

                            <div>
                                <h4 className="text-[11px] font-bold uppercase text-zinc-400 mb-2 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Stability Timeline</h4>
                                <div className="h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-md relative flex items-center p-1 px-1.5 w-full">
                                    <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-1 bg-emerald-500 rounded-full" />
                                </div>
                                <div className="flex justify-between mt-1.5 text-[10px] text-zinc-400 font-medium px-1">
                                    <span>48h ago</span>
                                    <span>Now</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Enterprise Footer */}
            <footer className="relative z-10 mt-auto border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 backdrop-blur-xl">
                <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 flex flex-col md:flex-row items-center justify-between text-[11px] text-zinc-500 gap-4 font-medium tracking-wide">
                    <div className="text-center md:text-left">
                        &copy; {new Date().getFullYear()} {data?.page.companyName || 'Company'}. All rights reserved.
                    </div>
                    <div className="text-center hidden md:block">
                        Public read-only service health view. Last refresh {timeAgo(data?.generatedAt)}.
                    </div>
                    <div className="flex items-center text-center gap-4">
                        <span>Powered by <a href="#" className="text-zinc-700 dark:text-zinc-300 hover:text-sky-600 transition-colors">Beacyn M&OT</a></span>

                        {/* Theme Toggle Button matching Reference */}
                        <div className="relative inline-flex h-6 w-12 items-center rounded-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 cursor-pointer shadow-inner shrink-0" onClick={toggleTheme} aria-label="Toggle theme">
                            <span className="sr-only">Toggle theme</span>
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-zinc-900 shadow transition-transform flex items-center justify-center ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'}`}>
                                {theme === 'dark' ? <Moon className="w-3 h-3 text-zinc-400" /> : <Sun className="w-3 h-3 text-zinc-600" />}
                            </span>
                        </div>

                    </div>
                </div>
                <div className="md:hidden text-center text-[10px] text-zinc-400 pb-5 px-4">
                    Last refresh {timeAgo(data?.generatedAt)}.
                </div>
            </footer>
        </div>
    );
}
