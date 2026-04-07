import { useState, useCallback } from 'react';
import LoginPage from './pages/auth/LoginPage';
import OverviewPage from './pages/main/OverviewPage';
import InfraDetail from './pages/main/InfraDetail';
import InfrastructurePage from './pages/main/InfrastructurePage';
import DatabasePage from './pages/main/DatabasePage';
import DatabaseDetails from './pages/main/DatabaseDetails';
import WebMonitors from './pages/main/WebMonitors';
import IncidentsPage from './pages/main/IncidentsPage';
import AgentsPage from './pages/main/AgentsPage';
import InventoryPage from './pages/main/InventoryPage';
import SettingsPage from './pages/main/SettingsPage';
import ComingSoonPage from './pages/main/ComingSoonPage';
import InvestigatePage from './pages/main/InvestigatePage';
import { MainLayout } from './layouts/MainLayout';
import { Network, Activity, Radio } from 'lucide-react';

function App() {
  const [route, setRoute] = useState('login');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedInfraAgentId, setSelectedInfraAgentId] = useState<string | null>(null);
  const [selectedDatabaseTargetKey, setSelectedDatabaseTargetKey] = useState<string | null>(null);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  if (route === 'login') {
    return <LoginPage onLogin={() => setRoute('overview')} />;
  }

  const renderCurrentRoute = () => {
    switch (route) {
      case 'overview':          return <OverviewPage key={refreshKey} />;
      case 'inventory':         return <InventoryPage key={refreshKey} />;
      case 'infra':
        return (
          <InfrastructurePage
            key={refreshKey}
            onOpenDetails={(agentId) => {
              setSelectedInfraAgentId(agentId);
              setRoute('infra-detail');
            }}
            onOpenIncidents={() => {
              setRoute('investigate');
            }}
          />
        );
      case 'database':
        return (
          <DatabasePage
            key={refreshKey}
            onOpenDetails={(targetKey) => {
              setSelectedDatabaseTargetKey(targetKey);
              setRoute('database-detail');
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
            onBack={() => setRoute('infra')}
          />
        );
      case 'monitors-web':      return <WebMonitors key={refreshKey} />;
      case 'monitors-network':  return <WebMonitors key={refreshKey} />;
      case 'incidents':         return <IncidentsPage key={refreshKey} />;
      case 'agents':            return <AgentsPage />;
      case 'settings':          return <SettingsPage />;

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
        return <ComingSoonPage icon={Network} title="Network Design" description="Visually map and document your network topology, VLAN layouts, and inter-service connections." />;
      case 'observability':
        return <ComingSoonPage icon={Activity} title="Observability" description="Unified view of logs, distributed traces, and custom metrics to gain full-stack visibility." />;
      case 'broadcast':
        return <ComingSoonPage icon={Radio} title="Broadcast" description="Push status updates, maintenance windows, and incident communications to all stakeholders in one click." />;

      default:                  return <OverviewPage key={refreshKey} />;
    }
  };

  return (
    <MainLayout
      currentRoute={route}
      setRoute={setRoute}
      onLogout={() => setRoute('login')}
      onRefresh={handleRefresh}
    >
      {renderCurrentRoute()}
    </MainLayout>
  );
}

export default App;
