import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Globe, Server, ShieldCheck, Container,
  Settings, Terminal, Menu, X, Box,
  Moon, Sun, HelpCircle, RefreshCw, ChevronDown,
  Search, Network, Activity, Database, ChevronRight,
  Router, UserCheck, Radio,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { apiUrl } from '../lib/api';
import { getStoredUser, clearStoredUser } from '../lib/auth';
import hexagonLogo from '../assets/app-logo/hexagon.png';

interface Props {
  children: React.ReactNode;
  currentRoute: string;
  setRoute: (route: string) => void;
  onLogout: () => void;
  onRefresh?: () => void;
  headerContent?: React.ReactNode;
}

// Regions with their IANA timezone identifiers
const REGIONS = [
  { label: 'UTC', tz: 'UTC' },
  { label: 'US East', tz: 'America/New_York' },
  { label: 'US West', tz: 'America/Los_Angeles' },
  { label: 'Europe', tz: 'Europe/London' },
  { label: 'Asia/Mumbai', tz: 'Asia/Kolkata' },
  { label: 'Asia/Tokyo', tz: 'Asia/Tokyo' },
  { label: 'Australia', tz: 'Australia/Sydney' },
];

function useTime(tz: string) {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => {
      setTime(new Date().toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tz]);
  return time;
}

const PAGE_META: Record<string, { title: string; description?: string }> = {
  overview:         { title: 'Overview Dashboard',  description: 'Real-time summary of your entire monitored infrastructure.' },
  inventory:        { title: 'Inventory',            description: 'Manage and track all entities available for monitoring.' },
  'inventory-snmp': { title: 'Inventory • SNMP',     description: 'User-managed SNMP devices and telemetry.' },
  'inventory-agent': { title: 'Inventory • Agent',   description: 'Auto-detected agent-based infrastructure.' },
  'inventory-uptime': { title: 'Inventory • Uptime', description: 'User-configured uptime monitors.' },
  'monitors-web':   { title: 'Uptime',               description: 'Monitor website and API endpoint availability.' },
  'ssl-domain':     { title: 'SSL & Domain',         description: 'Watch live certificates and domain registration expiry.' },
  infra:            { title: 'Infrastructure',       description: 'Fleet view of all infrastructure servers and utilization.' },
  'infra-docker':   { title: 'Infrastructure • Docker', description: 'Docker monitors and containers reported by your hosts.' },
  'infra-servers':  { title: 'Infrastructure • Servers', description: 'Servers inventory with platform and utilization details.' },
  'infra-vms':      { title: 'Infrastructure • VMs', description: 'Virtual machine inventory and health.' },
  'infra-storage':  { title: 'Infrastructure • Storage', description: 'Storage systems and capacity views.' },
  'infra-san':      { title: 'Infrastructure • SAN', description: 'SAN devices and Brocade fabric visibility.' },
  'infra-detail':   { title: 'Infrastructure Details', description: 'Detailed host metrics including compute, memory, disk, inode, and network telemetry.' },
  database:         { title: 'Databases',            description: 'Monitored database fleet with health, space, and performance snapshots.' },
  snmp:             { title: 'SNMP Devices',         description: 'Manage SNMP devices and view telemetry/traps grouped by Storage and SAN.' },
  'database-detail':{ title: 'Database Details',     description: 'Detailed database node, inventory, storage, and performance trends.' },
  'database-query-insights': { title: 'Query Insights', description: 'Top query diagnostics, comparison charts, and digest-level execution trends.' },
  incidents:        { title: 'Incidents',            description: 'Configure alert rules and ServiceNow integrations.' },
  agents:           { title: 'Capture Agents',       description: 'Manage deployed agents collecting infrastructure telemetry.' },
  settings:         { title: 'Settings',             description: 'Configure your Beacyn workspace and preferences.' },
  'access-requests': { title: 'Access Requests',      description: 'Review user registrations with approval status and audit trail.' },
  'user-details':   { title: 'User Details',         description: 'Profile, account lifecycle, portal status, and password policy controls.' },
  'portal-audit':   { title: 'Portal Audit',         description: 'Track user activity, security events, and portal disruptions.' },
  'portal-audit-details': { title: 'Audit Details',  description: 'Full event context, payloads, and remediation actions.' },
  // Upcoming
  investigate:      { title: 'Investigate',          description: 'Prioritized tickets generated from infrastructure utilization thresholds.' },

  rackpoint:        { title: 'RackSpace',            description: 'Rack details and physical infrastructure mapping.' },
  'data-centers':   { title: 'Data Centers',         description: 'Centralized view of your data center footprint and assets.' },

  observability:    { title: 'Observability',        description: 'Unified logs, traces, and metrics across your infrastructure.' },
  broadcast:        { title: 'Broadcast',            description: 'Push status updates and communications to all stakeholders.' },
};

export function MainLayout({ children, currentRoute, setRoute, onLogout, onRefresh, headerContent }: Props) {
  const currentUser = getStoredUser();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superuser';

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [regionIdx, setRegionIdx] = useState(4); // Asia/Mumbai default
  const [regionOpen, setRegionOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'infra-parent': false,
    'inventory-parent': false,
    'portal-tools': false,
  });
  const [counts, setCounts] = useState({
    snmp: 0,
    agent: 0,
    uptime: 0,
    servers: 0,
    vms: 0,
    storage: 0,
    san: 0,

  });

  const handleDark = () => {
    setDarkMode(d => {
      document.documentElement.classList.toggle('dark', !d);
      return !d;
    });
  };

  // Listen for settings changes (theme/timezone) dispatched from SettingsPage
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { timezone?: string; theme?: string } | undefined;
      if (detail?.theme) {
        const isDark = detail.theme === 'dark' || (detail.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        setDarkMode(isDark);
      }
      if (detail?.timezone) {
        const idx = REGIONS.findIndex(r => r.tz === detail.timezone);
        if (idx >= 0) setRegionIdx(idx);
      }
    };
    window.addEventListener('pulseiq:settings', handler);
    return () => window.removeEventListener('pulseiq:settings', handler);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      const user = getStoredUser();
      if (user?.token) {
        await fetch(apiUrl('/api/auth/logout'), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${user.token}` },
        });
      }
    } catch { /* best-effort */ }
    clearStoredUser();
    onLogout();
  }, [onLogout]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    onRefresh?.();
    setTimeout(() => setIsRefreshing(false), 800);
  }, [onRefresh]);

  useEffect(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = 0;
  }, [currentRoute]);

  useEffect(() => {
    const infraActive = ['infra', 'infra-detail', 'infra-servers', 'infra-vms', 'infra-storage', 'infra-san', 'infra-docker', 'database', 'database-detail'].includes(currentRoute);
    const inventoryActive = ['inventory', 'inventory-snmp', 'inventory-agent', 'inventory-uptime'].includes(currentRoute);

    setExpandedSections((prev) => ({
      ...prev,
      ...(infraActive ? { 'infra-parent': true, 'portal-tools': false } : {}),
      ...(inventoryActive ? { 'inventory-parent': true, 'portal-tools': true } : {}),
    }));
  }, [currentRoute]);

  useEffect(() => {
    try {
      window.localStorage.setItem('pulseiq.sidebar.expandedSections', JSON.stringify(expandedSections));
    } catch {
      // Ignore storage failures (private mode, restricted storage, etc.)
    }
  }, [expandedSections]);

  const time = useTime(REGIONS[regionIdx].tz);

  useEffect(() => {
    let ignore = false;

    const inferCategory = (asset: any): 'servers' | 'vms' | 'storage' | 'san'  | 'uptime' => {
      const explicit = String(asset?.device_category || '').trim().toLowerCase();
      if (['servers', 'vms', 'storage', 'san', 'uptime'].includes(explicit)) return explicit as any;

      const parent = String(asset?.parent_type || '').toLowerCase();
      const sub = String(asset?.sub_type || '').toLowerCase();
      const name = String(asset?.name || '').toLowerCase();

      if (parent === 'storage') return 'storage';
      if (parent === 'switch' || sub.includes('brocade') || sub.includes('connextrix')) return 'san';
      if (parent === 'website' || parent === 'api endpoint' || parent === 'network port' || parent === 'docker host' || parent === 'docker container') return 'uptime';
      if (parent === 'server' && (sub.includes('vm') || sub.includes('vmware') || name.includes('vm-') || name.startsWith('vm '))) return 'vms';
      return 'servers';
    };

    const loadCounts = async () => {
      try {
        const [assetsRes, snmpRes, agentsRes, infraServersRes, infraVmsRes] = await Promise.all([
          fetch(apiUrl('/api/assets')),
          fetch(apiUrl('/api/snmp/devices')),
          fetch(apiUrl('/api/agents')),
          fetch(apiUrl('/api/infra/servers?page=1&pageSize=1&machineType=physical')),
          fetch(apiUrl('/api/infra/servers?page=1&pageSize=1&machineType=vm')),
        ]);

        const [assetsData, snmpData, agentsData, infraServersData, infraVmsData] = await Promise.all([
          assetsRes.json().catch(() => []),
          snmpRes.json().catch(() => []),
          agentsRes.json().catch(() => []),
          infraServersRes.json().catch(() => ({ total: 0 })),
          infraVmsRes.json().catch(() => ({ total: 0 })),
        ]);

        if (ignore) return;

        const assets = Array.isArray(assetsData) ? assetsData : [];
        const base = { servers: 0, vms: 0, storage: 0, san: 0, uptime: 0 };
        for (const a of assets) base[inferCategory(a)] += 1;

        setCounts({
          snmp: Array.isArray(snmpData) ? snmpData.length : 0,
          agent: Array.isArray(agentsData) ? agentsData.length : 0,
          uptime: base.uptime,
          servers: Number(infraServersData?.total || 0),
          vms: Number(infraVmsData?.total || 0),
          storage: base.storage,
          san: base.san,
          
        });
      } catch {
        if (!ignore) {
          setCounts((prev) => ({ ...prev }));
        }
      }
    };

    loadCounts();
    const id = setInterval(loadCounts, 30_000);
    return () => {
      ignore = true;
      clearInterval(id);
    };
  }, []);

  type NavNode = {
    name: string;
    route: string;
    icon: any;
    disabled?: boolean;
    nonNavigable?: boolean;
    children?: NavNode[];
  };

  const mainNav: NavNode[] = [
    { name: 'Overview', route: 'overview', icon: BarChart },
    { name: 'Uptime', route: 'monitors-web', icon: Globe },
    { name: 'SSL & Domain', route: 'ssl-domain', icon: ShieldCheck },
    {
      name: 'Infrastructure',
      route: 'infra-parent',
      icon: Server,
      nonNavigable: true,
      children: [
        { name: 'Servers', route: 'infra-servers', icon: Server, disabled: counts.servers === 0 },
        { name: 'VMs', route: 'infra-vms', icon: Server, disabled: counts.vms === 0 },
        { name: 'Storage', route: 'infra-storage', icon: Database, disabled: counts.storage === 0 },
        { name: 'SAN', route: 'infra-san', icon: Router, disabled: counts.san === 0 },
        { name: 'Docker', route: 'infra-docker', icon: Container },
        { name: 'Database', route: 'database', icon: Database },
      ],
    },
  ];

  // Upcoming / coming-soon nav items
  const comingSoonNav = [
    { name: 'Investigate',       route: 'investigate',       icon: Search },
    { name: 'Observability',     route: 'observability',     icon: Activity },
    { name: 'RackSpace',         route: 'rackpoint',         icon: Network },
    { name: 'Data Centers',      route: 'data-centers',      icon: Database },
    { name: 'Broadcast', route: 'broadcast', icon: Radio },
  ];

  // Bottom nav items (above admin user section)
  const bottomNav: NavNode[] = [
    {
      name: 'Inventory',
      route: 'inventory-parent',
      icon: Box,
      nonNavigable: true,
      children: [
        { name: 'SNMP Assets', route: 'inventory-snmp', icon: Router },
        { name: 'Agent Inventory', route: 'inventory-agent', icon: Terminal, disabled: counts.agent === 0 },
        { name: 'Uptime Inventory', route: 'inventory-uptime', icon: Globe },
      ],
    },
    ...(isAdmin ? [{ name: 'Access Requests', route: 'access-requests', icon: UserCheck } as NavNode] : []),
    { name: 'Audit', route: 'portal-audit', icon: Search },
    { name: 'Settings', route: 'settings', icon: Settings },
  ];

  const isRouteActive = (route: string) => {
    if (route === 'infra-parent') return currentRoute === 'infra' || currentRoute === 'infra-detail' || currentRoute === 'infra-servers' || currentRoute === 'infra-vms' || currentRoute === 'infra-storage' || currentRoute === 'infra-san' || currentRoute === 'infra-docker' || currentRoute === 'database' || currentRoute === 'database-detail';
    if (route === 'infra-docker') return currentRoute === 'infra-docker';
    if (route === 'infra-servers') return currentRoute === 'infra' || currentRoute === 'infra-detail' || currentRoute === 'infra-servers';
    if (route === 'database') return currentRoute === 'database' || currentRoute === 'database-detail';
    if (route === 'inventory-parent') return currentRoute === 'inventory' || currentRoute === 'inventory-snmp' || currentRoute === 'inventory-agent' || currentRoute === 'inventory-uptime';
    if (route === 'access-requests') return currentRoute === 'access-requests';
    return currentRoute === route;
  };

  const NavItem = ({ item, nested = false }: { item: NavNode; nested?: boolean }) => {
    const active = isRouteActive(item.route) || Boolean(item.children?.some((child) => isRouteActive(child.route)));
    const Icon = item.icon;
    const sectionExpanded = item.children?.length ? Boolean(expandedSections[item.route]) : false;
    const hasChildren = Boolean(item.children?.length);

    const handleClick = () => {
      if (hasChildren) {
        setExpandedSections((prev) => {
          const nextExpanded = !sectionExpanded;

          if (item.route === 'infra-parent') {
            return {
              ...prev,
              'infra-parent': nextExpanded,
              ...(nextExpanded ? { 'portal-tools': false } : {}),
            };
          }

          if (item.route === 'inventory-parent') {
            return {
              ...prev,
              'inventory-parent': nextExpanded,
              'portal-tools': true,
            };
          }

          return { ...prev, [item.route]: nextExpanded };
        });
        if (!item.nonNavigable && item.route) setRoute(item.route);
      } else {
        setRoute(item.route);
      }
      setMobileMenuOpen(false);
    };

    return (
      <div>
        <button
          key={item.name}
          disabled={item.disabled}
          onClick={handleClick}
          aria-expanded={hasChildren ? sectionExpanded : undefined}
          className={`w-full flex items-center ${nested ? 'pl-9 pr-3 py-1.5 text-xs' : 'px-3 py-2'} ${!nested && (item.route === 'inventory-parent' || item.route === 'access-requests' || item.route === 'portal-audit' || item.route === 'settings') ? 'text-xs' : !nested ? 'text-sm' : ''} font-medium rounded-md transition-colors duration-200 ${item.disabled
            ? 'text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
            : active
              ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-zinc-50'
            }`}
        >
          <Icon className={`mr-3 flex-shrink-0 ${nested ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${active ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-400'}`} />
          <span className="truncate">{item.name}</span>
          {item.children?.length ? (
            <ChevronRight className={`ml-auto h-3.5 w-3.5 text-zinc-400 transition-transform ${sectionExpanded ? 'rotate-90' : ''}`} />
          ) : null}
        </button>
        {item.children?.length && sectionExpanded ? (
          <div className="mt-1 ml-3 pl-2 border-l border-zinc-200/80 dark:border-zinc-800/90 space-y-1">
            {item.children.map((child) => <NavItem key={child.route} item={child} nested />)}
          </div>
        ) : null}
      </div>
    );
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 w-64 flex-shrink-0">
      {/* Logo */}
      <div className="h-auto py-4 px-6 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-start gap-1">
          <img src={hexagonLogo} alt="Beacyn" className="w-14 h-14 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold text-lg tracking-tight block mt-1.5">Beacyn</span>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Monitoring & Observability</p>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="flex-1 min-h-0 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {mainNav.map(item => <NavItem key={item.route} item={item} />)}
        </nav>

        {/* Upcoming items */}
        <div className="px-3 mt-5">
          <nav className="space-y-1">
            {comingSoonNav.map(item => <NavItem key={item.route} item={item} />)}
          </nav>
        </div>
      </div>

      {/* Bottom links: Inventory, Agents, Settings */}
      <div className="px-2.5 pb-2 border-t border-zinc-100 dark:border-zinc-800/60 pt-2">
        <button
          type="button"
          onClick={() => setExpandedSections((prev) => {
            const nextExpanded = !prev['portal-tools'];
            return {
              ...prev,
              'portal-tools': nextExpanded,
              ...(nextExpanded ? { 'infra-parent': false } : {}),
            };
          })}
          className="w-full flex items-center px-2.5 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wide text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
        >
          <span>Portal Tools</span>
          <ChevronRight className={`ml-auto h-3.5 w-3.5 transition-transform ${expandedSections['portal-tools'] ? 'rotate-90' : ''}`} />
        </button>

        {expandedSections['portal-tools'] ? (
          <nav className="space-y-0.5 mt-0.5">
            {bottomNav.map(item => <NavItem key={item.route} item={item} />)}
          </nav>
        ) : null}
      </div>

      {/* Admin user */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
        {(() => {
          const u = currentUser;
          const displayName = u?.username ?? 'User';
          const initials = displayName.slice(0, 2).toUpperCase();
          const roleLabel = u?.role === 'admin'
            ? 'Admin'
            : u?.role === 'superuser'
              ? 'Super-user'
              : u?.role === 'viewer'
                ? 'Viewer'
                : 'Staff';
          return (
            <button
              type="button"
              className="w-full flex items-center gap-2.5 mb-1.5 text-left"
              onClick={() => {
                setRoute('user-details');
                setMobileMenuOpen(false);
              }}
            >
              <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-900 dark:text-zinc-50 truncate capitalize">{displayName}</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{roleLabel}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
            </button>
          );
        })()}
        <Button variant="outline" className="w-full text-[11px] h-7 border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/60" onClick={handleLogout}>Log out</Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-50 dark:bg-[#0c0c0e] text-zinc-900 dark:text-zinc-50 font-sans">
      {/* Desktop sidebar stays fixed; only the main pane scrolls */}
      <div className="hidden h-dvh shrink-0 md:sticky md:top-0 md:flex">
        {renderSidebarContent()}
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/80 flex md:hidden">
          {renderSidebarContent()}
          <div className="w-14">
            <button className="flex items-center justify-center h-16 w-full" onClick={() => setMobileMenuOpen(false)}>
              <X className="h-6 w-6 text-white" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Mobile-only top bar for hamburger */}
        <div className="flex items-center justify-between min-h-12 px-4 pt-[env(safe-area-inset-top)] pb-2 md:hidden bg-zinc-50 dark:bg-[#0c0c0e] shrink-0">
          <div className="flex items-center gap-2">
            <img src={hexagonLogo} alt="Beacyn" className="w-5 h-5" />
            <span className="font-bold tracking-tight text-sm">Beacyn</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileMenuOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <main className="flex-1 relative z-0 min-h-0 overflow-y-auto overscroll-y-contain focus:outline-none">
          <div className="relative px-4 sm:px-6 md:px-8 max-w-[1600px] mx-auto">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808014_1px,transparent_1px),linear-gradient(to_bottom,#80808014_1px,transparent_1px)] bg-[size:14px_14px] dark:hidden" />
            <div className="pointer-events-none absolute inset-0 -z-10 hidden dark:block bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:14px_14px]" />

            {/* Page header — scrolls with content */}
            <div className="flex items-start justify-between pt-6 pb-4">
              {/* Title + description */}
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {PAGE_META[currentRoute]?.title ?? 'Beacyn'}
                </h1>
                {PAGE_META[currentRoute]?.description && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {PAGE_META[currentRoute].description}
                  </p>
                )}
              </div>

              {/* Right controls */}
              <div className="flex items-center gap-1.5 shrink-0 ml-4">
                {/* Page-injected header content (e.g. tab nav) */}
                {headerContent}
                {/* Refresh */}
                {onRefresh && (
                  <button
                    type="button"
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    onClick={handleRefresh}
                    title="Refresh"
                    aria-label="Refresh"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                )}

                {/* Support */}
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title="Support"
                  aria-label="Support"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>

                {/* Dark mode toggle */}
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  onClick={handleDark}
                  title="Toggle theme"
                  aria-label="Toggle theme"
                >
                  {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>

                {/* Region + Clock */}
                <div className="relative">
                  <button
                    onClick={() => setRegionOpen(o => !o)}
                    className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium hover:bg-zinc-100 bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-colors"
                  >
                    <span className="text-zinc-400 text-[10px] font-normal">{REGIONS[regionIdx].label}</span>
                    <span className="font-mono text-zinc-700 dark:text-zinc-300 tracking-tight">{time}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                  </button>

                  {regionOpen && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[160px] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
                      {REGIONS.map((r, i) => (
                        <button
                          key={r.tz}
                          onClick={() => { setRegionIdx(i); setRegionOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors ${i === regionIdx
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 font-medium'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                            }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Page content */}
            <div className="pb-[max(2rem,env(safe-area-inset-bottom))]">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

