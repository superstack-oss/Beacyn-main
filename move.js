const fs = require('fs');
const path = require('path');

const base = '/Users/atanukumarpal/Documents/Devlopment/uptime/src/pages/main';

const moves = [
  ['PortalAuditPage.tsx', 'admin/PortalAuditPage.tsx'],
  ['AuditDetailsPage.tsx', 'admin/AuditDetailsPage.tsx'],
  ['UserDetailsPage.tsx', 'admin/UserDetailsPage.tsx'],
  ['SettingsPage.tsx', 'admin/SettingsPage.tsx'],
  ['BroadcastPage.tsx', 'broadcast/BroadcastPage.tsx'],
  ['DatabasePage.tsx', 'database/DatabasePage.tsx'],
  ['DatabaseDetails.tsx', 'database/DatabaseDetails.tsx'],
  ['DataCentersPage.tsx', 'datacenter/DataCentersPage.tsx'],
  ['DataCenterDetailsPage.tsx', 'datacenter/DataCenterDetailsPage.tsx'],
  ['DataCenterContinuityMapPage.tsx', 'datacenter/DataCenterContinuityMapPage.tsx'],
  ['RackPointPage.tsx', 'datacenter/RackPointPage.tsx'],
  ['InfrastructurePage.tsx', 'infrastructure/InfrastructurePage.tsx'],
  ['InfraDetail.tsx', 'infrastructure/InfraDetail.tsx'],
  ['AgentsPage.tsx', 'infrastructure/AgentsPage.tsx'],
  ['SnmpDevicesPage.tsx', 'infrastructure/SnmpDevicesPage.tsx'],
  ['InvestigatePage.tsx', 'investigate/InvestigatePage.tsx'],
  ['IncidentsPage.tsx', 'investigate/IncidentsPage.tsx'],
  ['ObservabilityPage.tsx', 'investigate/ObservabilityPage.tsx'],
  ['WebMonitors.tsx', 'uptime/WebMonitors.tsx'],
  ['MonitorDetails.tsx', 'uptime/MonitorDetails.tsx'],
  ['PageSpeedDetails.tsx', 'uptime/PageSpeedDetails.tsx'],
  ['StatusPage.tsx', 'uptime/StatusPage.tsx']
];

const dirsToCreate = ['admin', 'broadcast', 'database', 'datacenter', 'infrastructure', 'investigate', 'uptime'];

dirsToCreate.forEach(d => {
  const p = path.join(base, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

moves.forEach(([src, dest]) => {
  const srcPath = path.join(base, src);
  const destPath = path.join(base, dest);
  if (fs.existsSync(srcPath)) {
    fs.renameSync(srcPath, destPath);
  } else {
    console.log('Not found:', srcPath);
  }
});
