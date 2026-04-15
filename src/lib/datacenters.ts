export type DataCenterType = 'colocation' | 'shared' | 'private';
export type DcRole = 'Primary' | 'Disaster Recovery' | 'Backup Site' | 'Edge DC';
export type OperationalWorkHours = '9-5' | '8-6' | '24x7' | '24x5';
export type YesNoOption = 'Yes' | 'No';
export type ConnectionType = 'MPLS' | 'Leased Line' | 'VPN (IPSec)' | 'SD-WAN';
export type ConnectivityMode = 'Active-Active' | 'Active-Passive';
export type ReplicationType = 'Synchronous' | 'Asynchronous';
export type FailoverType = 'Manual' | 'Automatic';
export type ContinuityLineStyle = 'direct' | 'dotted';
export type ContinuityLineVariant = 'general-network' | 'replication' | 'bidirectional-replication' | 'secondary-network';

export interface DataCenterSummary {
  id: string;
  dcCode: string;
  name: string;
  type: DataCenterType;
  dcRole: DcRole;
  region: string;
  regionGroup: string;
  country: string;
  city: string;
  address: string;
  exactAddress?: string | null;
  ownerCompany: string;
  businessUnit?: string | null;
  vendorProvider: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone?: string | null;
  escalationContact: string;
  nocPhone: string;
  nocEmail: string;
  pairedDcId?: string | null;
  pairedDcName?: string | null;
  operationalWorkHours?: OperationalWorkHours;
  visitorAccessNeeded?: YesNoOption;
  mapPosX?: number | null;
  mapPosY?: number | null;
  createdAt: string;
  updatedAt?: string;
}

export interface DataCenterEmergencyContact {
  name: string;
  phone: string;
  email: string;
}

export interface DataCenterCapacityProfile {
  buildingType: string;
  redundancyLevel: string;
  rackCapacity: {
    total: number;
    used: number;
    available: number;
  };
  powerCapacity: string;
  upsBackupDuration: string;
  generatorCapacity: string;
}

export interface DataCenterNetworkProfile {
  ispProviders: {
    primary: string;
    secondary: string;
  };
  bandwidthPerLink: {
    primary: string;
    secondary: string;
  };
}

export interface DataCenterConnection {
  sourceDcId: string;
  targetId?: string | null;
  targetName: string;
  regionGroup: string;
  lineVariant: ContinuityLineVariant;
  lineColor: string;
  lineStyle: ContinuityLineStyle;
  connectionType: ConnectionType;
  bandwidth: string;
  latencyMs: number;
  redundant: boolean;
  mode: ConnectivityMode;
  replicationType: ReplicationType;
  replicationTool: string;
  failover: FailoverType;
  rto: string;
  rpo: string;
}

export interface DataCenterInventorySummary {
  physicalServers: number;
  virtualizationHosts: number;
  storageArrays: number;
  networkDevices: number;
  racksOccupied: number;
}

export interface DataCenterVisitorDetails {
  name: string;
  phone: string;
  officialEmail: string;
  vendor: string;
  visitDuration: string;
  specialInstructions: string;
}

export interface DataCenterGuardrailsProfile {
  operationalCoverage: '24x7';
  operationalWorkHours: OperationalWorkHours;
  visitorAccessNeeded: YesNoOption;
  visitorDetails: DataCenterVisitorDetails;
}

export interface DataCenterDetail extends DataCenterSummary {
  nocContact: {
    phone: string;
    email: string;
  };
  emergencyContact: DataCenterEmergencyContact;
  facility: DataCenterCapacityProfile;
  network: DataCenterNetworkProfile;
  connectivity: DataCenterConnection[];
  inventory: DataCenterInventorySummary;
  guardrails: DataCenterGuardrailsProfile;
}

export interface DataCenterContinuityMapPayload {
  nodes: Array<{
    id: string;
    mapPosX: number;
    mapPosY: number;
  }>;
  connections: Array<{
    sourceDcId: string;
    targetId?: string | null;
    targetName: string;
    regionGroup: string;
    lineVariant: ContinuityLineVariant;
    lineColor: string;
    lineStyle: ContinuityLineStyle;
    connectionType: ConnectionType;
    bandwidth: string;
    latencyMs: number;
    redundant: boolean;
    mode: ConnectivityMode;
    replicationType: ReplicationType;
    replicationTool: string;
    failover: FailoverType;
    rto: string;
    rpo: string;
  }>;
}

export interface DataCenterContinuityMapResponse {
  nodes: DataCenterSummary[];
  connections: DataCenterConnection[];
}

export function fallbackNodePosition(index: number) {
  const presets = [
    { x: 18, y: 50 },
    { x: 48, y: 22 },
    { x: 76, y: 60 },
    { x: 28, y: 76 },
    { x: 62, y: 42 },
    { x: 84, y: 28 },
  ];
  return presets[index] || { x: 16 + ((index * 17) % 68), y: 18 + ((index * 13) % 60) };
}
