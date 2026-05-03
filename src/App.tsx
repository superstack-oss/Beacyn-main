import { useState, useCallback, useEffect } from 'react';
import { User as UserIcon, KeyRound, Users, MessageSquareText, ArrowLeft, ChartColumn } from 'lucide-react';
import LoginPage from './pages/auth/LoginPage';
import PrivacyPolicyPage from './pages/policy/PrivacyPolicyPage';
import TermsOfServicePage from './pages/policy/TermsOfServicePage';
import DisclaimerPage from './pages/policy/DisclaimerPage';
import EULAPage from './pages/policy/EULA';
import OverviewPage from './pages/main/OverviewPage';
import InfraDetail from './pages/main/infrastructure/InfraDetail';
import InfrastructurePage from './pages/main/infrastructure/InfrastructurePage';
import DatabasePage from './pages/main/database/DatabasePage';
import DatabaseDetails from './pages/main/database/DatabaseDetails';
import DatabaseQueryInsightsPage from './pages/main/database/DatabaseQueryInsightsPage';
import WebMonitors from './pages/main/uptime/WebMonitors';
import AgentsPage from './pages/main/infrastructure/AgentsPage';
import InventoryPage from './pages/main/InventoryPage';
import SettingsPage from './pages/main/admin/SettingsPage';
import AccessRequestsPage from './pages/main/admin/AccessRequestsPage';
//import ComingSoonPage from './pages/main/ComingSoonPage';
import InvestigatePage from './pages/main/investigate/InvestigatePage';

import ObservabilityPage from './pages/main/investigate/ObservabilityPage';
import SnmpDevicesPage from './pages/main/infrastructure/SnmpDevicesPage';
import DataCentersPage from './pages/main/datacenter/DataCentersPage';
import DataCenterDetailsPage from './pages/main/datacenter/DataCenterDetailsPage';
import DataCenterContinuityMapPage from './pages/main/datacenter/DataCenterContinuityMapPage';
import RackPointPage from './pages/main/datacenter/RackPointPage';
import UserDetailsPage from './pages/main/admin/UserDetailsPage';
import PortalAuditPage from './pages/main/admin/PortalAuditPage';
import AuditDetailsPage from './pages/main/admin/AuditDetailsPage';
import BroadcastPage from './pages/main/broadcast/BroadcastPage';
import StatusPage from './pages/main/uptime/StatusPage';
import { MainLayout } from './layouts/MainLayout';
import { clearStoredUser, getStoredUser, authHeaders } from './lib/auth';
import { apiUrl } from './lib/api';

function App() {
  const readDatabaseTargetFromHash = () => {
    if (typeof window === 'undefined') return null;
    const hashRoute = window.location.hash.replace(/^#/, '').trim();
    const prefixes = ['database-detail/', 'database-query-insights/'];
    const prefix = prefixes.find((p) => hashRoute.startsWith(p));
    if (!prefix) return null;
    const raw = hashRoute.slice(prefix.length).trim();
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };

  const [route, setRoute] = useState(() => {
    const storedUser = getStoredUser();
    const hashRoute = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '').trim() : '';
    if (hashRoute.startsWith('database-detail/')) return storedUser ? 'database-detail' : 'login';
    if (hashRoute.startsWith('database-query-insights/')) return storedUser ? 'database-query-insights' : 'login';
    if (hashRoute.startsWith('broadcast/public/')) return hashRoute;
    if (['privacy', 'terms', 'disclaimer', 'eula'].includes(hashRoute)) return hashRoute;
    return storedUser ? (hashRoute || 'overview') : 'login';
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [userDetailsTab, setUserDetailsTab] = useState('profile');
  const [selectedInfraAgentId, setSelectedInfraAgentId] = useState<string | null>(null);
  const [selectedDatabaseTargetKey, setSelectedDatabaseTargetKey] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const fromHash = readDatabaseTargetFromHash();
    if (fromHash) return fromHash;
    const saved = window.sessionStorage.getItem('selectedDatabaseTargetKey');
    return saved && saved.trim() ? saved.trim() : null;
  });
  const [selectedDcId, setSelectedDcId] = useState<string | null>(null);
  const [selectedAuditId, setSelectedAuditId] = useState<number | null>(null);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // On mount, verify session is still valid — log out if account has been suspended
  useEffect(() => {
    const user = getStoredUser();
    if (!user?.token) return;
    fetch(apiUrl('/api/auth/me'), { headers: authHeaders() })
      .then(async (res) => {
        if (res.status === 403) {
          clearStoredUser();
          setRoute('login');
        }
      })
      .catch(() => { /* ignore network errors — don't force logout on transient failures */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((route === 'database-detail' || route === 'database-query-insights') && selectedDatabaseTargetKey) {
      const routePrefix = route === 'database-query-insights' ? 'database-query-insights' : 'database-detail';
      const nextHash = `#${routePrefix}/${encodeURIComponent(selectedDatabaseTargetKey)}`;
      if (window.location.hash !== nextHash) {
        window.location.hash = nextHash;
      }
      return;
    }
    if (route && route !== 'login') {
      if (window.location.hash !== `#${route}`) {
        window.location.hash = route;
      }
    } else if (route === 'login') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }, [route, selectedDatabaseTargetKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (selectedDatabaseTargetKey && selectedDatabaseTargetKey.trim()) {
      window.sessionStorage.setItem('selectedDatabaseTargetKey', selectedDatabaseTargetKey.trim());
    }
  }, [selectedDatabaseTargetKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      const hashRoute = window.location.hash.replace(/^#/, '').trim() || 'overview';
      if (hashRoute.startsWith('database-detail/')) {
        const raw = hashRoute.slice('database-detail/'.length).trim();
        if (raw) {
          try {
            setSelectedDatabaseTargetKey(decodeURIComponent(raw));
          } catch {
            setSelectedDatabaseTargetKey(raw);
          }
        }
        setRoute('database-detail');
        return;
      }
      if (hashRoute.startsWith('database-query-insights/')) {
        const raw = hashRoute.slice('database-query-insights/'.length).trim();
        if (raw) {
          try {
            setSelectedDatabaseTargetKey(decodeURIComponent(raw));
          } catch {
            setSelectedDatabaseTargetKey(raw);
          }
        }
        setRoute('database-query-insights');
        return;
      }
      if (hashRoute.startsWith('broadcast/public/')) { setRoute(hashRoute); return; }
      if (['privacy', 'terms', 'disclaimer', 'eula'].includes(hashRoute)) { setRoute(hashRoute); return; }
      
      const user = getStoredUser();
      
      if (!user) {
        if (hashRoute !== 'login') {
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        }
        setRoute('login');
        return;
      }
      
      if (hashRoute === 'login') {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#overview`);
        setRoute('overview');
        return;
      }

      setRoute(hashRoute);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (route.startsWith('broadcast/public/')) {
    return <StatusPage publicToken={route.replace(/^broadcast\/public\//, '')} />;
  }

  if (route === 'login') {
    return <LoginPage onLogin={() => setRoute('overview')} />;
  }

  if (route === 'privacy') {
    return <PrivacyPolicyPage />;
  }

  if (route === 'terms') {
    return <TermsOfServicePage />;
  }

  if (route === 'disclaimer') {
    return <DisclaimerPage />;
  }

  if (route === 'eula') {
    return <EULAPage />;
  }

  const renderCurrentRoute = () => {
    switch (route) {
      case 'overview': return <OverviewPage key={refreshKey} />;
      case 'inventory': return <OverviewPage key={refreshKey} />;
      case 'infra':
      case 'infra-servers':
        return (
          <InfrastructurePage
            key={refreshKey}
            view="servers"
            onOpenDetails={(agentId) => {
              setSelectedInfraAgentId(agentId);
              setRoute('infra-detail');
            }}
            onOpenIncidents={() => {
              setRoute('investigate');
            }}
          />
        );
      case 'infra-vms':
        return (
          <InfrastructurePage
            key={refreshKey}
            view="vms"
            onOpenDetails={(agentId) => {
              setSelectedInfraAgentId(agentId);
              setRoute('infra-detail');
            }}
            onOpenIncidents={() => {
              setRoute('investigate');
            }}
          />
        );
      case 'infra-storage':
        return <InfrastructurePage key={refreshKey} view="storage" onOpenDetails={() => { }} />;
      case 'infra-san':
        return <InfrastructurePage key={refreshKey} view="san" onOpenDetails={() => { }} />;
      case 'infra-computer':
        return <InfrastructurePage key={refreshKey} view="computer" onOpenDetails={() => { }} />;
      case 'database':
        return (
          <DatabasePage
            key={refreshKey}
            onOpenDetails={(targetKey) => {
              setSelectedDatabaseTargetKey(targetKey);
              setRoute('database-detail');
            }}
            onOpenIncidents={() => {
              setRoute('investigate');
            }}
          />
        );
      case 'database-detail':
        return (
          <DatabaseDetails
            key={`${refreshKey}-${selectedDatabaseTargetKey ?? 'none'}`}
            targetKey={selectedDatabaseTargetKey}
            onBack={() => setRoute('database')}
          />
        );
      case 'database-query-insights':
        return (
          <DatabaseQueryInsightsPage
            key={`${refreshKey}-${selectedDatabaseTargetKey ?? 'none'}`}
            targetKey={selectedDatabaseTargetKey}
            onBack={() => setRoute('database')}
          />
        );
      case 'infra-detail':
        return (
          <InfraDetail
            key={`${refreshKey}-${selectedInfraAgentId ?? 'none'}`}
            agentId={selectedInfraAgentId}
            onBack={() => setRoute('infra-servers')}
          />
        );
      case 'monitors-web': return <WebMonitors key={refreshKey} />;
      case 'inventory-uptime': return <InventoryPage key={refreshKey} scope="uptime" />;
      case 'monitors-network': return <WebMonitors key={refreshKey} />;
      case 'agents': return <AgentsPage />;
      case 'inventory-agent': return <InventoryPage key={refreshKey} scope="agent" />;
      case 'settings': return <SettingsPage />;
      case 'access-requests': return <AccessRequestsPage />;
      case 'user-details': return <UserDetailsPage activeTab={userDetailsTab} setActiveTab={setUserDetailsTab} />;
      case 'portal-audit':
        return (
          <PortalAuditPage
            onOpenDetails={(id) => {
              setSelectedAuditId(id);
              setRoute('portal-audit-details');
            }}
          />
        );
      case 'portal-audit-details':
        return (
          <AuditDetailsPage
            auditId={selectedAuditId}
            onBack={() => setRoute('portal-audit')}
          />
        );

      case 'investigate':
        return (
          <InvestigatePage
            onOpenServer={(agentId) => {
              setSelectedInfraAgentId(agentId);
              setRoute('infra-detail');
            }}
          />
        );
      // ── Upcoming pages ───────────────────────────────────────────────────

      case 'rackpoint':
        return <RackPointPage />;
      case 'data-centers':
        if (selectedDcId) {
          return (
            <DataCenterDetailsPage
              key={`${refreshKey}-${selectedDcId}`}
              dcId={selectedDcId}
              onBack={() => setSelectedDcId(null)}
              onSaved={(savedDcId) => {
                setSelectedDcId(savedDcId);
                setRefreshKey((k) => k + 1);
              }}
            />
          );
        }
        return (
          <DataCentersPage
            key={refreshKey}
            onViewDetails={(dcId) => setSelectedDcId(dcId)}
            onAddNew={() => setSelectedDcId('new')}
            onOpenContinuityMap={() => setRoute('data-center-continuity-map')}
          />
        );
      case 'data-center-continuity-map':
        return <DataCenterContinuityMapPage key={refreshKey} onBack={() => setRoute('data-centers')} />;
      case 'observability':
        return <ObservabilityPage />;
      case 'snmp':
        return <SnmpDevicesPage key={refreshKey} />;
      case 'inventory-snmp':
        return <InventoryPage key={refreshKey} scope="snmp" />;
      case 'broadcast':
        return <BroadcastPage />;

      default: return <OverviewPage key={refreshKey} />;
    }
  };

  const USER_DETAILS_TABS = [
    { key: 'profile',  label: 'Profile',  Icon: UserIcon },
    { key: 'password', label: 'Password', Icon: KeyRound },
    { key: 'team',     label: 'Team',     Icon: Users },
    { key: 'feedback', label: 'Feedback', Icon: MessageSquareText },
  ] as const;

  const userDetailsHeaderContent = route === 'user-details' ? (
    <>
      <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
      <div className="flex items-center gap-0.5">
        {USER_DETAILS_TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setUserDetailsTab(key)}
            className={`h-8 inline-flex items-center gap-1.5 px-2.5 text-sm rounded-md transition-colors ${
              userDetailsTab === key
                ? 'text-zinc-900 dark:text-zinc-50 font-medium'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
    </>
  ) : null;

  const databaseInsightsHeaderContent = (route === 'database-detail' || route === 'database-query-insights') ? (
    <>
      <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
      <button
        type="button"
        onClick={() => setRoute(route === 'database-query-insights' ? 'database-detail' : 'database-query-insights')}
        className="h-8 inline-flex items-center gap-1.5 px-2.5 text-sm rounded-md transition-colors text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        {route === 'database-query-insights' ? <ArrowLeft className="h-3.5 w-3.5" /> : <ChartColumn className="h-3.5 w-3.5" />}
        <span>{route === 'database-query-insights' ? 'Back to Details' : 'Query Insights'}</span>
      </button>
      <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
    </>
  ) : null;

  const computedHeaderContent = (
    <>
      {userDetailsHeaderContent}
      {databaseInsightsHeaderContent}
    </>
  );

  return (
    <MainLayout
      currentRoute={route}
      setRoute={setRoute}
      onLogout={() => { 
        clearStoredUser(); 
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        setRoute('login'); 
      }}
      onRefresh={handleRefresh}
      headerContent={computedHeaderContent}
    >
      {renderCurrentRoute()}
    </MainLayout>
  );
}

export default App;
