import { useState, useCallback, useEffect } from 'react';
import LoginPage from './pages/auth/LoginPage';
import OverviewPage from './pages/main/OverviewPage';
import InfraDetail from './pages/main/InfraDetail';
import InfrastructurePage from './pages/main/InfrastructurePage';
import DatabasePage from './pages/main/DatabasePage';
import DatabaseDetails from './pages/main/DatabaseDetails';
import WebMonitors from './pages/main/WebMonitors';
import AgentsPage from './pages/main/AgentsPage';
import InventoryPage from './pages/main/InventoryPage';
import SettingsPage from './pages/main/SettingsPage';
import AccessRequestsPage from './pages/main/AccessRequestsPage';
import ComingSoonPage from './pages/main/ComingSoonPage';
import InvestigatePage from './pages/main/InvestigatePage';
import NetworkDiagramPage from './pages/main/NetworkDiagramPage';
import ObservabilityPage from './pages/main/ObservabilityPage';
import SnmpDevicesPage from './pages/main/SnmpDevicesPage';
import DataCentersPage from './pages/main/DataCentersPage';
import DataCenterDetailsPage from './pages/main/DataCenterDetailsPage';
import DataCenterContinuityMapPage from './pages/main/DataCenterContinuityMapPage';
import RackPointPage from './pages/main/RackPointPage';
import UserDetailsPage from './pages/main/UserDetailsPage';
import PortalAuditPage from './pages/main/PortalAuditPage';
import AuditDetailsPage from './pages/main/AuditDetailsPage';
import BroadcastPage from './pages/main/BroadcastPage';
import StatusPage from './pages/main/StatusPage';
import { MainLayout } from './layouts/MainLayout';
import { Wrench } from 'lucide-react';
import { clearStoredUser, getStoredUser } from './lib/auth';

function App() {
  const [route, setRoute] = useState(() => {
    const storedUser = getStoredUser();
    const hashRoute = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '').trim() : '';
    if (hashRoute.startsWith('broadcast/public/')) return hashRoute;
    return storedUser ? (hashRoute || 'overview') : 'login';
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedInfraAgentId, setSelectedInfraAgentId] = useState<string | null>(null);
  const [selectedDatabaseTargetKey, setSelectedDatabaseTargetKey] = useState<string | null>(null);
  const [selectedDcId, setSelectedDcId] = useState<string | null>(null);
  const [selectedAuditId, setSelectedAuditId] = useState<number | null>(null);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (route && route !== 'login') {
      window.location.hash = route;
    } else {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }, [route]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      const hashRoute = window.location.hash.replace(/^#/, '').trim();
      if (!hashRoute) return;
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

  const renderCurrentRoute = () => {
    switch (route) {
      case 'overview':          return <OverviewPage key={refreshKey} onOpenObservability={() => setRoute('observability')} />;
      case 'inventory':         return <OverviewPage key={refreshKey} onOpenObservability={() => setRoute('observability')} />;
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
        return <InfrastructurePage key={refreshKey} view="storage" onOpenDetails={() => {}} />;
      case 'infra-san':
        return <InfrastructurePage key={refreshKey} view="san" onOpenDetails={() => {}} />;
      case 'infra-computer':
        return <InfrastructurePage key={refreshKey} view="computer" onOpenDetails={() => {}} />;
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
      case 'infra-detail':
        return (
          <InfraDetail
            key={`${refreshKey}-${selectedInfraAgentId ?? 'none'}`}
            agentId={selectedInfraAgentId}
            onBack={() => setRoute('infra-servers')}
          />
        );
      case 'monitors-web':      return <WebMonitors key={refreshKey} />;
      case 'inventory-uptime':  return <InventoryPage key={refreshKey} scope="uptime" />;
      case 'monitors-network':  return <WebMonitors key={refreshKey} />;
      case 'agents':            return <AgentsPage />;
      case 'inventory-agent':   return <InventoryPage key={refreshKey} scope="agent" />;
      case 'settings':          return <SettingsPage />;
      case 'access-requests':   return <AccessRequestsPage />;
      case 'user-details':      return <UserDetailsPage />;
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
      case 'network-design':
        return <NetworkDiagramPage />;
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
      case 'maintainance-mode':
        return <ComingSoonPage icon={Wrench} title="Maintainance Mode" description="Planned maintenance orchestration is coming soon." />;
      case 'observability':
        return <ObservabilityPage />;
      case 'snmp':
        return <SnmpDevicesPage key={refreshKey} />;
      case 'inventory-snmp':
        return <InventoryPage key={refreshKey} scope="snmp" />;
      case 'broadcast':
        return <BroadcastPage />;

      default:                  return <OverviewPage key={refreshKey} onOpenObservability={() => setRoute('observability')} />;
    }
  };

  return (
    <MainLayout
      currentRoute={route}
      setRoute={setRoute}
      onLogout={() => { clearStoredUser(); setRoute('login'); }}
      onRefresh={handleRefresh}
    >
      {renderCurrentRoute()}
    </MainLayout>
  );
}

export default App;
