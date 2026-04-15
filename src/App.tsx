import { useState, useCallback } from 'react';
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
import { MainLayout } from './layouts/MainLayout';
import { Radio, Wrench } from 'lucide-react';
import { clearStoredUser, getStoredUser } from './lib/auth';

function App() {
  const [route, setRoute] = useState(() => (getStoredUser() ? 'overview' : 'login'));
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedInfraAgentId, setSelectedInfraAgentId] = useState<string | null>(null);
  const [selectedDatabaseTargetKey, setSelectedDatabaseTargetKey] = useState<string | null>(null);
  const [selectedDcId, setSelectedDcId] = useState<string | null>(null);
  const [selectedAuditId, setSelectedAuditId] = useState<number | null>(null);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  if (route === 'login') {
    return <LoginPage onLogin={() => setRoute('overview')} />;
  }

  const renderCurrentRoute = () => {
    switch (route) {
      case 'overview':          return <OverviewPage key={refreshKey} />;
      case 'inventory':         return <OverviewPage key={refreshKey} />;
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
        return <ComingSoonPage icon={Radio} title="Broadcast" description="Push status updates, maintenance windows, and incident communications to all stakeholders in one click." />;

      default:                  return <OverviewPage key={refreshKey} />;
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
