# Syslog Integration — Brocade, Storage & Network Devices

## Overview

PulseIQ already has a **fully operational syslog pipeline**. The backend receives RFC 3164 and RFC 5424 syslog frames over UDP and TCP, parses them, and persists them to MySQL. This document covers what is built, how devices connect to it, how it surfaces in the dashboard, and what remains to be wired up on the frontend.

---

## What Is Already Built

### Backend listeners (`src/scripts/api/server.ts`)

| Component | Detail |
|---|---|
| **UDP listener** | `0.0.0.0:5514` (default, configurable via `SYSLOG_UDP_PORT`) |
| **TCP listener** | `0.0.0.0:5514` (same port, configurable via `SYSLOG_TCP_PORT`) |
| **HTTP ingest endpoint** | `POST /api/syslog/ingest` — accepts JSON body for software-driven ingest |
| **Parser** | `parseSyslogFrame()` — handles both RFC 3164 and RFC 5424 frames |
| **Severity mapper** | `severityFromSyslogCode()` — maps numeric PRI to `critical / warning / info` |
| **Device resolution** | `resolveSnmpDevice()` — auto-links syslog source IP to a known SNMP device |
| **Retention** | Automatic pruning via `SYSLOG_RETENTION_HOURS` (default 48 h) |
| **Enable toggle** | `SYSLOG_ENABLED=true/false` env var |

### Database table

```sql
syslog_events (
  id             BIGINT AUTO_INCREMENT PK,
  device_id      VARCHAR(64)   -- linked to snmp_devices.id (auto-resolved)
  source_ip      VARCHAR(120),
  hostname       VARCHAR(255),
  app_name       VARCHAR(120),
  facility       INT,
  severity       INT,          -- 0=Emergency .. 7=Debug
  severity_label VARCHAR(20),  -- 'critical' | 'warning' | 'info'
  message        VARCHAR(1024),
  raw_message    TEXT,
  payload_json   JSON,
  received_at    TIMESTAMP,
  INDEX (device_id, received_at),
  INDEX (source_ip, received_at),
  INDEX (severity_label, received_at)
)
```

### Unified events API

`GET /api/snmp/events` returns a **merged stream** of `snmp_traps` + `syslog_events` with shared fields:

```
source, event_time, severity, message, source_ip, event_key,
device_id, device_name, category (storage | san | unmapped)
```

This is what `SnmpDevicesPage.tsx` already queries for the events tab.

---

## Pointing Devices at PulseIQ

Replace `<PULSEIQ_HOST>` with your server's IP (e.g. `10.0.0.50`). Use port `5514` (or `514` if you redirect with `iptables`/`nftables`).

### Brocade FOS (SAN switches)

```bash
# SSH into the switch
syslogd add <PULSEIQ_HOST>
syslogd enable
# Verify
syslogd show
```

Brocade uses structured RASlog event IDs (e.g. `FABRIC-1003`, `ZONE-1014`). These appear in `app_name` after parsing.

### EMC / Dell PowerStore & Unity

**PowerStore**: Settings → System → Remote Logging → Add → enter IP + UDP 5514  
**Unity**: System Manager → Settings → Event Notifications → Remote Logging → Add Syslog Server

EMC messages include event codes in the message field (e.g. `0x603001c` = drive failure).

### NetApp ONTAP

```bash
event notification destination create -name pulseiq-syslog \
  -syslog <PULSEIQ_HOST> -syslog-port 5514 -protocol udp-unencrypted

event notification create -filter-name important-events \
  -destinations pulseiq-syslog
```

ONTAP EMS events include node name, severity class, and message ID (e.g. `disk.failmsg`, `wafl.vol.offline`).

### HPE Primera / Nimble Storage

```bash
# Primera / 3PAR CLI
setsyslogserver -addr <PULSEIQ_HOST> -port 5514 -proto udp

# Nimble CLI
syslogd add --host <PULSEIQ_HOST> --port 5514
```

### HPE iLO (ProLiant servers)

iLO Web UI → Administration → Management → Remote Syslog → set server IP + port 5514 → Save

### Generic Linux / Unix hosts

```bash
# /etc/rsyslog.conf — add one line
*.warning    @<PULSEIQ_HOST>:5514      # UDP
*.warning    @@<PULSEIQ_HOST>:5514     # TCP (more reliable)
systemctl restart rsyslog
```

---

## Environment Variables

Add these to your `.env` file or shell environment before starting the server:

```env
SYSLOG_ENABLED=true
SYSLOG_BIND_HOST=0.0.0.0
SYSLOG_UDP_PORT=5514
SYSLOG_TCP_PORT=5514
SYSLOG_RETENTION_HOURS=168    # 7 days recommended for storage systems
```

> **Port 514 note**: ports below 1024 require root on Linux. Either run with `sudo`, use `authbind`, or redirect with `iptables -t nat -A PREROUTING -p udp --dport 514 -j REDIRECT --to-port 5514`.

---

## Frontend Configuration Required

This is the **only setup you need to do inside the app**. Everything else (listener, parser, DB table) is automatic.

### Step 1 — Register the device in SNMP Devices

Navigate to **Infrastructure → SNMP Devices**. Use the tab that matches the device type:

| Tab | Device types to add here |
|---|---|
| **Storage System** | EMC PowerStore, EMC Unity, NetApp ONTAP, HPE Primera, HPE Nimble |
| **SAN Switches** | Brocade FOS switches, Cisco MDS (if applicable) |

Fill in the registration form:

| Field | What to enter |
|---|---|
| **Name** | Friendly name (e.g. `NetApp-PROD-01`, `Brocade-SAN-SW-01`) |
| **Vendor** | `NetApp`, `EMC`, `HPE`, `Brocade` etc. |
| **Host / IP** | The management IP of the device — **must match the IP it sends syslog from** |
| **Port** | `161` (default SNMP port, leave as-is) |
| **SNMP Version** | See community/auth section below |

> Once registered, all incoming syslog frames whose source IP matches this device are automatically tagged with the device name and category. No other step is needed for syslog to work.

---

### Step 2 — SNMP community or credentials (for polling)

SNMP polling (telemetry metrics, OID walks) requires authentication. Syslog does not — it is push-based and needs no credentials. However, to get **both** syslog correlation **and** live metrics in the same device record, set the credentials when registering.

#### SNMPv2c (most common for storage and SAN)

| Field | Storage Systems | SAN Switches (Brocade) |
|---|---|---|
| **SNMP Version** | `2c` | `2c` |
| **Community** | Use the read-only community string configured on the array (e.g. `storage-ro`) | Use the read-only community string on the switch (e.g. `san-public`) |

The community name is set on the device side — ask your storage/network admin for the configured value. The app defaults to `public` but that should be changed to whatever the device is actually configured with.

> **Best practice**: use separate community strings per device class — e.g. `storage-ro` for all arrays and `san-ro` for all SAN switches. Avoids a compromised string affecting all devices.

#### SNMPv3 (more secure, recommended for production)

Select SNMP Version `3` in the form and fill:

| Field | Description |
|---|---|
| **Username** | SNMPv3 security username configured on the device |
| **Auth Protocol** | `SHA` (preferred) or `MD5` |
| **Auth Key** | Authentication passphrase (min 8 chars) |
| **Priv Protocol** | `AES` (preferred) or `DES` |
| **Priv Key** | Privacy/encryption passphrase |

SNMPv3 credentials are stored per-device in the `snmp_devices` table. Auth and priv keys are stored in the DB as-is (plaintext) — ensure your MySQL instance is on a private network.

---

### What gets activated after registration

| Feature | Requires registration | Requires SNMP credentials |
|---|---|---|
| Syslog event tagging (device name in Events tab) | Yes — IP match | No |
| SNMP telemetry polling (metrics, OID charts) | Yes | Yes |
| SNMP trap correlation | Yes | No — traps are also push-based |
| Events tab (unified syslog + traps view) | Yes | No |

Devices do not need to be SNMP-pollable to receive their syslogs — the two features are independent.

---

## Where Syslog Data Already Surfaces

| Page | How |
|---|---|
| **Infrastructure → SNMP Devices** | "Events" tab — unified `snmp_trap + syslog` stream, filterable by severity, source, category, and device |
| **ObservabilityPage** | `snmp_devices` table stat shows event count including syslog events via the unified query |

---

## Frontend Pages That Should Be Enhanced

These are the logical next wiring points. None require backend changes — the data is already queryable.

### 1. InfraDetail (`infrastructure/InfraDetail.tsx`)

Add a **"Syslog Events"** panel at the bottom of the device detail view.

- Query: `GET /api/snmp/events?deviceId=<id>&hours=24&source=syslog`
- Show: last 50 events, severity badge, timestamp, `app_name`, message
- Benefit: see the exact log messages from that device in the same page you view its SNMP metrics

### 2. MonitorDetails (`uptime/MonitorDetails.tsx`)

Add a **"Related Logs"** section that correlates syslog events with monitor down periods.

- Query: `GET /api/snmp/events?source=syslog&hours=6` filtered to the monitor's target hostname/IP
- Show: events timestamped within ±5 min of a down event
- Benefit: instant root-cause hint — e.g. "FABRIC-1003: E_Port isolation" appeared 2 min before the monitor went down

### 3. OverviewPage (`OverviewPage.tsx`)

Add a **"Critical Syslog Alerts"** stat card.

- Query: `GET /api/snmp/events?severity=critical&hours=24&source=syslog&limit=5`
- Show: count badge + last 5 critical messages
- Benefit: one-screen view of whether storage/SAN infrastructure is generating critical alerts right now

### 4. ObservabilityPage (`investigate/ObservabilityPage.tsx`)

Add syslog to the existing issues analysis.

- The `analyze.ts` self-analysis already has an `issues[]` array — syslog critical count can feed a new `ObservabilityIssue` with `source: 'syslog'`
- Show an event-rate spark chart (events per hour for last 24 h) alongside existing DB/monitor stats
- Benefit: the AI summary (Gemini) gains syslog context and can flag SAN/storage anomalies in its recommendations

### 5. IncidentsPage (`investigate/IncidentsPage.tsx`)

Auto-surface syslog severity 0–2 (Emergency/Alert/Critical) as suggested incidents.

- Query: `GET /api/snmp/events?severity=critical&hours=1&source=syslog`
- If count > 0, show a banner with device name and first message
- Benefit: ops team sees a storage critical log as a potential incident without waiting for a monitor probe to fail

---

## Vendor-Specific Message Patterns

Understanding these helps when filtering or building alerts in the app.

### Brocade FOS

| Pattern | Meaning |
|---|---|
| `FABRIC-1003` | E_Port isolation — zone merge conflict |
| `ZONE-1014` | Zone conflict detected |
| `PORT-1004` | Port fault / SFP degraded |
| `RAS-1004` | Internal RAS event — check `message` for detail |

### NetApp ONTAP EMS

| Event ID | Meaning |
|---|---|
| `disk.failmsg` | Disk failed |
| `raid.rg.diskcopy.read.err` | RAID copy read error |
| `wafl.vol.offline` | Volume went offline |
| `callhome.*` | AutoSupport call home triggered |

### EMC / Dell

- Event codes appear as hex in the message: `0x603001c` (drive failure), `0x601000f` (SP fault)
- Component ID and LUN/SP are embedded in the raw message

### HPE Primera / Nimble

- Alert IDs in the format `AXX-YYYY` map to the HPE InfoSight knowledge base
- RAID group degradation shows `raid_group_degraded` in `app_name`

---

## Benefits to the Project

### Operational visibility
- Know what a device was logging **before** a monitor went down — no more blind "the server just went offline"
- Storage arrays report disk pre-failure warnings (SMART-equivalent events) days before an actual failure

### Reduced mean time to resolution (MTTR)
- The unified `/api/snmp/events` endpoint correlates SNMP traps + syslog in one query, so a single table shows the full event chain leading to an incident

### Coverage for devices that don't support HTTP
- Brocade switches, legacy EMC arrays, and HPE Primera do not have REST APIs. Syslog is the only real-time event mechanism available. PulseIQ already receives these — no additional polling needed.

### AI insight quality
- Once syslog events feed into `analyze.ts`, the Gemini summary gains storage/SAN context. Currently it only sees DB metrics and monitor health — adding "3 critical syslog events from storage array in last hour" gives it the full picture.

### Audit trail
- All syslog events are retained in MySQL with `received_at` timestamps. Combined with the existing portal audit log, this provides a complete timeline: user action → config change → device reaction (syslog) → monitor state change.

### No extra infrastructure
- Unlike Splunk or Dynatrace, there is no additional agent, collector, or license required. The listener runs inside the existing Express process on the same port (5145) machine.

---

## Quick-Start Checklist

- [ ] Set `SYSLOG_RETENTION_HOURS=168` (or higher) in your env before storage events age out at 48 h
- [ ] **In app → Infrastructure → SNMP Devices → SAN Switches tab**: register one Brocade switch (correct IP, `2c`, community string)
- [ ] Point that Brocade switch at `<HOST>:5514` UDP (CLI: `syslogd add <HOST>`)
- [ ] Verify events appear in **Infrastructure → SNMP Devices → Events tab** (filter source = syslog)
- [ ] **In app → SAN Switches tab**: confirm the event shows the device name (not "Unmapped") — confirms IP match worked
- [ ] **In app → Infrastructure → SNMP Devices → Storage System tab**: register NetApp / EMC / HPE arrays with their community strings
- [ ] Point those arrays at `<HOST>:5514` (see device-side config section above)
- [ ] Wire `InfraDetail.tsx` to show syslog events per device (see Frontend Pages section)
- [ ] Update `analyze.ts` to count critical syslog events and emit an `ObservabilityIssue`
