# Infrastructure Monitoring

This guide explains how Infrastructure monitoring works in Beacyn and exactly what is collected and displayed in [src/pages/main/infrastructure/InfraDetail.tsx](src/pages/main/infrastructure/InfraDetail.tsx).

## Scope and Data Sources

Beacyn infrastructure monitoring is split into two collection paths:

1. Server/VM monitoring
- Uses BeacynMonitorAgent.
- Agent is required to collect deep host telemetry.
- Covers CPU, memory, disks, inodes, network interfaces, health scoring, Docker, and host metadata.

2. Storage and SAN switch monitoring
- Uses SNMP polling and SNMP traps.
- Uses Syslog ingestion for event logs.
- Syslog events are surfaced in Infrastructure details via `/api/snmp/events?source=syslog...`.

## Platform Support

Supported operating systems:
- RHEL
- Debian
- Linux/UNIX
- Windows

Supported server types:
- Bare metal servers
- Virtual machines

## What Infra Detail Displays

The Infrastructure detail page for a selected server shows the following sections and metrics.

### 1. Health Snapshot

Top-level health posture:
- Operational health: `Healthy` or `Unhealthy`
- Overall score: numeric health score
- Score status: `Info`, `Warning`, or `Critical`
- Major incident reasons: list of high-impact reasons

Health signal metrics:
- Network latency (ms)
- Network download speed (Mbps)
- Network RX speed (Mbps)
- Network TX speed (Mbps)
- CPU usage (%)
- Memory usage (%)
- CPU temperature (C)
- Failed services count
- Hung process count
- Last health check timestamp

Health scoring component drilldown (sheet view):
- Component/parameter name
- Component status
- Weight
- Latest summarized metrics

### 2. System Configuration

Host and platform metadata:
- Hostname
- Agent name
- OS
- OS build/version
- Platform
- Uptime
- Last seen timestamp
- Last updated/collected timestamp
- Physical CPU cores
- Logical CPU cores
- CPU frequency
- Total RAM
- Total swap
- Serial number
- Architecture
- Kernel version
- Virtualization type
- Machine type

### 3. Resource Utilization Cards (with micro-trends)

Utilization KPIs:
- CPU utilization (%)
- Memory utilization (%)
- Network utilization (%)
- Disk utilization (%)

Each card includes a mini trend chart.

### 4. Performance Signals (with micro-trends)

Performance KPIs:
- Latency (ms)
- Throughput (Mbps)
- Bandwidth (Mbps)
- IOPS

Each card includes a mini trend chart.

### 5. CPU Metrics

CPU details shown:
- Physical core count
- Logical/virtual core count
- Frequency (GHz)
- CPU trend chart over time

### 6. Memory Metrics

Memory details shown:
- Total memory
- Used memory
- Swap used and swap total
- Memory trend chart over time

### 7. Network Performance

Two trend charts:
- Throughput trend: RX and TX Mbps over time
- Latency trend: latency in ms over time

### 8. Thermal Status

Thermal details:
- CPU temperature (C)
- Fallback note when temperature sensor data is unavailable

### 9. Disk Monitoring

Per-mountpoint metrics (selectable mount):
- Used (%)
- Remaining capacity
- Filesystem type
- Disk health status
- Read bytes
- Write bytes
- SMART summary

### 10. Inode Monitoring

Per-mountpoint inode metrics:
- Inode used (%)
- Inodes used
- Inodes free
- Total inodes

### 11. Network Monitoring

Interface-level monitoring:
- Interface throughput trend chart
- Table columns:
  - Interface
  - IP family (IPv4/IPv6)
  - Address
  - Scope (internal/external)
  - RX bytes
  - TX bytes
  - Total packets (RX + TX)

### 12. Docker Monitoring

Docker runtime summary:
- Docker status text
- Total containers
- Running containers

Per-container metrics:
- Container name
- Image
- Status/state
- CPU usage (%)
- Memory usage (%)
- Network RX/TX bytes

### 13. Status and Active Issues

Active issue/ticket stream for this server:
- Severity (`P1`, `P2`, `P3`)
- Ticket ID
- Metric type
- Resource key
- Current value
- Threshold value
- Description

### 14. Syslog Events

Syslog events filtered by host and lookback window:
- Time
- Severity
- App/process key
- Message

Supported lookback shortcuts in page UI:
- 6h
- 24h
- 48h

## Collection Model Summary

Server/VM:
- Source: MonitorAgent
- Data: deep telemetry + host inventory + trends + health scoring + Docker stats

Storage/SAN:
- Source: SNMP + Syslog
- Data: polled SNMP telemetry, traps, and syslog event stream

## Operational Notes

- Detail data refreshes every 60 seconds for the selected server.
- The page requests server detail with trend history via `/api/infra/servers/:agentId?limit=72`.
- Syslog events are host-filtered and queried from `/api/snmp/events` with `source=syslog`.
- If agent data is unavailable, the page shows an unavailable state rather than partial stale metrics.
