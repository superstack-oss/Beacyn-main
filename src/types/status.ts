export type ServiceStatus = 'online' | 'down' | 'degraded' | 'maintenance';
export type IncidentSeverity = 'info' | 'warning' | 'critical';

export interface Service {
  id: string;
  name: string;
  type: string;
  ip_or_url: string;
  status: ServiceStatus;
  avg_response_ms: number;
  uptime_percentage: number;
  uptime_history: number[];
  category: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceCheck {
  id: string;
  service_id: string;
  response_time_ms: number;
  status: ServiceStatus;
  checked_at: string;
}

export interface Incident {
  id: string;
  title: string;
  message: string;
  severity: IncidentSeverity;
  status: 'active' | 'resolved';
  created_at: string;
  resolved_at?: string;
}
