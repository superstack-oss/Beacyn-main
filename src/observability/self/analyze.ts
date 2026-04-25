export type Severity = 'critical' | 'warning' | 'info';

export interface ObservabilityTableStat {
  name: string;
  available: boolean;
  count1h: number;
  lastSeenAt: string | null;
  notes: string[];
}

export interface ObservabilityIssue {
  id: string;
  severity: Severity;
  source: string;
  title: string;
  detail: string;
  metric: string;
  value: number;
  threshold: number;
}

export interface ObservabilityDataset {
  generatedAt: string;
  tables: ObservabilityTableStat[];
  metrics: {
    disconnectedDatabases: number;
    unhealthyHealthChecks: number;
    downMonitorEvents: number;
    openDiagnosticAlerts: number;
    avgDbLatencyMs: number;
    degradedSnmpDevices?: number;
    snmpTrapEvents1h?: number;
    criticalSyslogEvents1h?: number;
  };
}

export interface SelfAnalysisResult {
  observations: string[];
  issues: ObservabilityIssue[];
}

function tsLabel(value: string | null) {
  if (!value) return 'never';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'unknown';
  return dt.toLocaleString('en-GB');
}

export function runSelfObservabilityAnalysis(dataset: ObservabilityDataset): SelfAnalysisResult {
  const issues: ObservabilityIssue[] = [];
  const observations: string[] = [];

  for (const table of dataset.tables) {
    if (!table.available) {
      observations.push(`${table.name}: table unavailable, skipped.`);
      continue;
    }
    observations.push(`${table.name}: ${table.count1h} records in last hour, latest sample ${tsLabel(table.lastSeenAt)}.`);
  }

  const dbDisconnected = Number(dataset.metrics.disconnectedDatabases || 0);
  if (dbDisconnected > 0) {
    issues.push({
      id: 'db-disconnected',
      severity: dbDisconnected >= 3 ? 'critical' : 'warning',
      source: 'database_monitor_logs',
      title: 'Disconnected database monitors',
      detail: `${dbDisconnected} database targets are disconnected or stale.`,
      metric: 'disconnected_targets',
      value: dbDisconnected,
      threshold: 0,
    });
  }

  const unhealthyChecks = Number(dataset.metrics.unhealthyHealthChecks || 0);
  if (unhealthyChecks > 0) {
    issues.push({
      id: 'unhealthy-hosts',
      severity: unhealthyChecks >= 5 ? 'critical' : 'warning',
      source: 'health_checks',
      title: 'Host health checks failing',
      detail: `${unhealthyChecks} unhealthy host checks observed in the last hour.`,
      metric: 'unhealthy_checks_1h',
      value: unhealthyChecks,
      threshold: 0,
    });
  }

  const downEvents = Number(dataset.metrics.downMonitorEvents || 0);
  if (downEvents > 0) {
    issues.push({
      id: 'downtime-events',
      severity: downEvents >= 10 ? 'critical' : 'warning',
      source: 'monitor_logs',
      title: 'Recent downtime events detected',
      detail: `${downEvents} monitor down events found in the last hour.`,
      metric: 'down_events_1h',
      value: downEvents,
      threshold: 0,
    });
  }

  const openAlerts = Number(dataset.metrics.openDiagnosticAlerts || 0);
  if (openAlerts > 0) {
    issues.push({
      id: 'diagnostic-alerts',
      severity: openAlerts >= 5 ? 'critical' : 'warning',
      source: 'diagnostics_alert_events',
      title: 'Open diagnostics alerts',
      detail: `${openAlerts} diagnostics alerts are currently open.`,
      metric: 'open_alerts',
      value: openAlerts,
      threshold: 0,
    });
  }

  const avgLatency = Number(dataset.metrics.avgDbLatencyMs || 0);
  if (avgLatency > 250) {
    issues.push({
      id: 'db-latency',
      severity: avgLatency >= 800 ? 'critical' : 'warning',
      source: 'database_monitor_logs',
      title: 'High database latency',
      detail: `Average database latency is ${avgLatency.toFixed(1)}ms.`,
      metric: 'avg_db_latency_ms',
      value: avgLatency,
      threshold: 250,
    });
  }

  const degradedSnmpDevices = Number(dataset.metrics.degradedSnmpDevices || 0);
  if (degradedSnmpDevices > 0) {
    issues.push({
      id: 'snmp-degraded-devices',
      severity: degradedSnmpDevices >= 3 ? 'critical' : 'warning',
      source: 'snmp_devices',
      title: 'SNMP devices degraded',
      detail: `${degradedSnmpDevices} SNMP devices are degraded, down, or stale.`,
      metric: 'degraded_snmp_devices',
      value: degradedSnmpDevices,
      threshold: 0,
    });
  }

  const snmpTrapEvents1h = Number(dataset.metrics.snmpTrapEvents1h || 0);
  if (snmpTrapEvents1h >= 20) {
    issues.push({
      id: 'snmp-trap-burst',
      severity: snmpTrapEvents1h >= 50 ? 'critical' : 'warning',
      source: 'snmp_traps',
      title: 'SNMP trap burst detected',
      detail: `${snmpTrapEvents1h} SNMP traps were ingested in the last hour.`,
      metric: 'snmp_traps_1h',
      value: snmpTrapEvents1h,
      threshold: 20,
    });
  }

  const criticalSyslogs = Number(dataset.metrics.criticalSyslogEvents1h || 0);
  if (criticalSyslogs > 0) {
    issues.push({
      id: 'syslog-critical',
      severity: criticalSyslogs >= 5 ? 'critical' : 'warning',
      source: 'syslog_events',
      title: 'Critical syslog events from infrastructure devices',
      detail: `${criticalSyslogs} critical-severity syslog messages received from storage/SAN/network devices in the last hour.`,
      metric: 'critical_syslog_events_1h',
      value: criticalSyslogs,
      threshold: 1,
    });
  }

  if (!issues.length) {
    observations.push('No critical anomalies were detected by self-analysis thresholds.');
  }

  return { observations, issues };
}
