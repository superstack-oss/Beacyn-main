export type Severity = 'critical' | 'warning' | 'info';

export interface ObservabilityTableStat {
  name: string;
  database: 'pulseiq' | 'bsa';
  available: boolean;
  count1h: number;
  lastSeenAt: string | null;
  freshnessMinutes: number | null;
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
    tableAvailabilityPct: number;
    missingRequiredTables: number;
    staleTables1h: number;
    disconnectedDatabases: number;
    unhealthyHealthChecks: number;
    downMonitorEvents: number;
    openDiagnosticAlerts: number;
    avgDbLatencyMs: number;
    snmpTrapEvents1h: number;
    criticalSyslogEvents1h: number;
    criticalBsaHealthEvents1h: number;
    highContainerStressEvents1h: number;
  };
}

export interface AnalysisHighlights {
  immediateAttention: string[];
  painPoints: string[];
  keyFindings: string[];
}

export interface SelfAnalysisResult {
  observations: string[];
  issues: ObservabilityIssue[];
  highlights: AnalysisHighlights;
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
  const immediateAttention: string[] = [];
  const painPoints: string[] = [];
  const keyFindings: string[] = [];

  const addIssue = (issue: ObservabilityIssue) => {
    issues.push(issue);
    if (issue.severity === 'critical') {
      immediateAttention.push(`${issue.title}: ${issue.detail}`);
    }
  };

  const requiredTables = new Set([
    'database_monitor_logs',
    'health_checks',
    'monitor_logs',
    'diagnostics_alert_events',
    'snmp_telemetry_samples',
    'snmp_traps',
    'syslog_events',
    'disk_metrics',
    'docker_container_stats',
    'health_events',
    'metric_snapshots',
    'network_interfaces',
  ]);

  for (const table of dataset.tables) {
    if (!table.available) {
      observations.push(`${table.database}.${table.name}: table unavailable.`);
      if (requiredTables.has(table.name)) {
        addIssue({
          id: `missing-${table.database}-${table.name}`,
          severity: 'critical',
          source: `${table.database}.${table.name}`,
          title: `Missing required table: ${table.name}`,
          detail: `The table ${table.database}.${table.name} is not available, reducing observability coverage.`,
          metric: 'table_available',
          value: 0,
          threshold: 1,
        });
      }
      continue;
    }

    const freshnessText = table.freshnessMinutes == null
      ? 'freshness unknown'
      : `${table.freshnessMinutes}m freshness`;
    observations.push(`${table.database}.${table.name}: ${table.count1h} records in last hour, ${freshnessText}, latest ${tsLabel(table.lastSeenAt)}.`);

    if (table.freshnessMinutes != null && table.freshnessMinutes > 60 && requiredTables.has(table.name)) {
      addIssue({
        id: `stale-${table.database}-${table.name}`,
        severity: table.freshnessMinutes >= 180 ? 'critical' : 'warning',
        source: `${table.database}.${table.name}`,
        title: `Stale telemetry stream: ${table.name}`,
        detail: `No fresh data for ${table.freshnessMinutes} minutes from ${table.database}.${table.name}.`,
        metric: 'freshness_minutes',
        value: table.freshnessMinutes,
        threshold: 60,
      });
    }
  }

  const availabilityPct = Number(dataset.metrics.tableAvailabilityPct || 0);
  if (availabilityPct < 90) {
    addIssue({
      id: 'table-coverage',
      severity: availabilityPct < 75 ? 'critical' : 'warning',
      source: 'table_inventory',
      title: 'Observability table coverage degraded',
      detail: `Only ${availabilityPct.toFixed(1)}% of required tables are currently available.`,
      metric: 'table_availability_pct',
      value: availabilityPct,
      threshold: 90,
    });
  }

  const dbDisconnected = Number(dataset.metrics.disconnectedDatabases || 0);
  if (dbDisconnected > 0) {
    addIssue({
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
    addIssue({
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
    addIssue({
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
    addIssue({
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
    addIssue({
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

  const snmpTrapEvents1h = Number(dataset.metrics.snmpTrapEvents1h || 0);
  if (snmpTrapEvents1h >= 20) {
    addIssue({
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
    addIssue({
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

  const criticalBsaHealthEvents1h = Number(dataset.metrics.criticalBsaHealthEvents1h || 0);
  if (criticalBsaHealthEvents1h > 0) {
    addIssue({
      id: 'bsa-health-critical',
      severity: criticalBsaHealthEvents1h >= 10 ? 'critical' : 'warning',
      source: 'bsa.health_events',
      title: 'Critical infrastructure health events in BSA',
      detail: `${criticalBsaHealthEvents1h} critical infrastructure health events were observed in the last hour.`,
      metric: 'critical_bsa_health_events_1h',
      value: criticalBsaHealthEvents1h,
      threshold: 1,
    });
  }

  const highContainerStressEvents1h = Number(dataset.metrics.highContainerStressEvents1h || 0);
  if (highContainerStressEvents1h > 0) {
    addIssue({
      id: 'container-stress',
      severity: highContainerStressEvents1h >= 15 ? 'critical' : 'warning',
      source: 'bsa.docker_container_stats',
      title: 'Container resource stress detected',
      detail: `${highContainerStressEvents1h} container samples crossed high CPU or memory thresholds in the last hour.`,
      metric: 'high_container_stress_events_1h',
      value: highContainerStressEvents1h,
      threshold: 1,
    });
  }

  const staleTables1h = Number(dataset.metrics.staleTables1h || 0);
  if (staleTables1h > 0) {
    painPoints.push(`${staleTables1h} required telemetry tables are stale (>60 minutes).`);
  }

  if (dataset.metrics.missingRequiredTables > 0) {
    painPoints.push(`${dataset.metrics.missingRequiredTables} required tables are missing from schema.`);
  }

  if (issues.length > 0) {
    const criticalCount = issues.filter((item) => item.severity === 'critical').length;
    const warningCount = issues.filter((item) => item.severity === 'warning').length;
    keyFindings.push(`Detected ${issues.length} active issues (${criticalCount} critical, ${warningCount} warning).`);
    keyFindings.push(`Current table availability is ${availabilityPct.toFixed(1)}%.`);
  }

  if (!issues.length) {
    observations.push('No critical anomalies were detected by self-analysis thresholds.');
    keyFindings.push('All high-priority in-house observability checks are within expected thresholds.');
  }

  if (!painPoints.length) {
    painPoints.push('No dominant pain points detected in the last 60-minute analysis window.');
  }

  if (!immediateAttention.length) {
    immediateAttention.push('No immediate critical action required at this time.');
  }

  return {
    observations,
    issues,
    highlights: {
      immediateAttention,
      painPoints,
      keyFindings,
    },
  };
}
