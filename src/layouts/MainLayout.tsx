import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Globe, Server, AlertTriangle,
  Settings, Terminal, Menu, Hexagon, X, Box,
  Moon, Sun, HelpCircle, RefreshCw, ChevronDown,
  Search, Network, Activity, Database,
} from 'lucide-react';
import { Button } from '../components/ui/button';

interface Props {
  children: React.ReactNode;
  currentRoute: string;
  setRoute: (route: string) => void;
  onLogout: () => void;
  onRefresh?: () => void;
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
  'monitors-web':   { title: 'Uptime',               description: 'Monitor website and API endpoint availability.' },
  infra:            { title: 'Infrastructure',       description: 'Fleet view of all infrastructure servers and utilization.' },
  'infra-detail':   { title: 'Infrastructure Details', description: 'Detailed host metrics including compute, memory, disk, inode, and network telemetry.' },
  database:         { title: 'Databases',            description: 'Monitored database fleet with health, space, and performance snapshots.' },
  'database-detail':{ title: 'Database Details',     description: 'Detailed database node, inventory, storage, and performance trends.' },
  incidents:        { title: 'Incidents',            description: 'Configure alert rules and ServiceNow integrations.' },
  agents:           { title: 'Capture Agents',       description: 'Manage deployed agents collecting infrastructure telemetry.' },
  settings:         { title: 'Settings',             description: 'Configure your PulseIQ workspace and preferences.' },
  // Upcoming
  investigate:      { title: 'Investigate',          description: 'Prioritized tickets generated from infrastructure utilization thresholds.' },
  'network-design': { title: 'Network Design',       description: 'Visualise and document your network topology.' },
  observability:    { title: 'Observability',        description: 'Unified logs, traces, and metrics across your infrastructure.' },
  broadcast:        { title: 'Broadcast',            description: 'Push status updates and communications to all stakeholders.' },
};

export function MainLayout({ children, currentRoute, setRoute, onLogout, onRefresh }: Props) {

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [regionIdx, setRegionIdx] = useState(4); // Asia/Mumbai default
  const [regionOpen, setRegionOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleDark = () => {
    setDarkMode(d => {
      document.documentElement.classList.toggle('dark', !d);
      return !d;
    });
  };

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    onRefresh?.();
    setTimeout(() => setIsRefreshing(false), 800);
  }, [onRefresh]);

  const time = useTime(REGIONS[regionIdx].tz);

  // Main nav items (middle of sidebar)
  const mainNav = [
    { name: 'Overview',        route: 'overview',      icon: BarChart },
    { name: 'Uptime',          route: 'monitors-web',  icon: Globe },
    { name: 'Infrastructure',  route: 'infra',         icon: Server },
    { name: 'Database',        route: 'database',      icon: Database },
    { name: 'Incidents',       route: 'incidents',     icon: AlertTriangle },

  ];

  // Upcoming / coming-soon nav items
  const comingSoonNav = [
    { name: 'Investigate',     route: 'investigate',     icon: Search },
    { name: 'Network Design',  route: 'network-design',  icon: Network },
    { name: 'Observability',   route: 'observability',   icon: Activity },
  ];

  // Bottom nav items (above admin user section)
  const bottomNav = [
    { name: 'Inventory',       route: 'inventory', icon: Box },
    { name: 'Settings',        route: 'settings',  icon: Settings },
    { name: 'Capture Agents',  route: 'agents',    icon: Terminal },
  ];

  const NavItem = ({ item }: { item: typeof mainNav[0] }) => {
    const isActive = currentRoute === item.route || (item.route === 'infra' && currentRoute === 'infra-detail');
    const databaseActive = item.route === 'database' && currentRoute === 'database-detail';
    const active = isActive || databaseActive;
    const Icon = item.icon;
    return (
      <button
        key={item.name}
        onClick={() => { setRoute(item.route); setMobileMenuOpen(false); }}
        className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${active
          ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50'
          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-zinc-50'
          }`}
      >
        <Icon className={`mr-3 flex-shrink-0 h-5 w-5 ${active ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-400'}`} />
        {item.name}
      </button>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 w-64 flex-shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <Hexagon className="w-6 h-6 text-zinc-900 dark:text-white fill-zinc-100 dark:fill-zinc-800 mr-2" />
        <span className="font-bold text-lg tracking-tight">PulseIQ</span>
      </div>

      {/* Main nav */}
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {mainNav.map(item => <NavItem key={item.route} item={item} />)}
        </nav>

        {/* Coming Soon section */}
        <div className="px-3 mt-5">
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Coming Soon</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 leading-none">
              NEW
            </span>
          </div>
          <nav className="space-y-1">
            {comingSoonNav.map(item => <NavItem key={item.route} item={item} />)}
          </nav>
        </div>
      </div>

      {/* Bottom links: Inventory, Agents, Settings */}
      <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800/60 pt-3">
        <nav className="space-y-1">
          {bottomNav.map(item => <NavItem key={item.route} item={item} />)}
        </nav>
      </div>

      {/* Admin user */}
      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">AD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">Admin User</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">admin@pulseiq.dev</p>
          </div>
        </div>
        <Button variant="outline" className="w-full text-xs h-8" onClick={onLogout}>Log out</Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-[#0c0c0e] text-zinc-900 dark:text-zinc-50 font-sans">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/80 flex md:hidden">
          <SidebarContent />
          <div className="w-14">
            <button className="flex items-center justify-center h-16 w-full" onClick={() => setMobileMenuOpen(false)}>
              <X className="h-6 w-6 text-white" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Mobile-only top bar for hamburger */}
        <div className="flex items-center justify-between h-12 px-4 md:hidden bg-zinc-50 dark:bg-[#0c0c0e] shrink-0">
          <div className="flex items-center gap-2">
            <Hexagon className="w-5 h-5 fill-zinc-100 dark:fill-zinc-800" />
            <span className="font-bold tracking-tight text-sm">PulseIQ</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileMenuOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
          <div className="px-4 sm:px-6 md:px-8 max-w-[1600px] mx-auto">

            {/* Page header — scrolls with content */}
            <div className="flex items-start justify-between pt-6 pb-4">
              {/* Title + description */}
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {PAGE_META[currentRoute]?.title ?? 'PulseIQ'}
                </h1>
                {PAGE_META[currentRoute]?.description && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {PAGE_META[currentRoute].description}
                  </p>
                )}
              </div>

              {/* Right controls */}
              <div className="flex items-center gap-1.5 shrink-0 ml-4">
                {/* Refresh */}
                {onRefresh && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50" onClick={handleRefresh} title="Refresh">
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </Button>
                )}

                {/* Support */}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50" title="Support">
                  <HelpCircle className="h-4 w-4" />
                </Button>

                {/* Dark mode toggle */}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50" onClick={handleDark} title="Toggle theme">
                  {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>

                {/* Region + Clock */}
                <div className="relative">
                  <button
                    onClick={() => setRegionOpen(o => !o)}
                    className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-colors"
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
            <div className="pb-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

