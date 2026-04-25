export interface MaintenanceModeEntry {
  id: string;
  entityId: string;
  entityName: string;
  entityType: string;
  startTime: string; // ISO
  endTime: string; // ISO
  status: 'scheduled' | 'active' | 'expired' | 'cancelled';
  suppressAlerts: boolean;
  suppressIncidents: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}
