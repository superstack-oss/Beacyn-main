#!/usr/bin/env node

/**
 * System health check script.
 *
 * Checks:
 * - OS detection (MacOS, RHEL, AIX, OpenSuse, CentOS, Fedora, Ubuntu, HPUX, Linux, Unix)
 * - CPU / memory / temperature health
 * - Hardware failure signals
 * - Failed services and hung jobs/processes
 * - Network performance (latency + download speed)
 * - Overall server health status
 */

import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

const THRESHOLDS = {
  cpuHighPct: Number(process.env.HEALTH_CPU_HIGH_PCT || 85),
  memoryHighPct: Number(process.env.HEALTH_MEMORY_HIGH_PCT || 90),
  temperatureHighC: Number(process.env.HEALTH_TEMP_HIGH_C || 85),
};

const DB = {
  host: process.env.HEALTH_DB_HOST || process.env.PULSE_DB_HOST || 'localhost',
  user: process.env.HEALTH_DB_USER || process.env.PULSE_DB_USER || 'root',
  password: process.env.HEALTH_DB_PASSWORD || process.env.PULSE_DB_PASSWORD || 'madhumitaN8#',
  database: process.env.HEALTH_DB_NAME || process.env.PULSE_DB_NAME || 'pulseiq',
  table: process.env.HEALTH_DB_TABLE || 'health_checks',
  enabled: (process.env.HEALTH_SAVE_TO_DB || 'true').toLowerCase() !== 'false',
};

const RUNTIME = {
  intervalMs: Number(process.env.HEALTH_INTERVAL_MS || 60000),
  runOnce: (process.env.HEALTH_RUN_ONCE || 'false').toLowerCase() === 'true',
};

const SCORE_WEIGHTS = {
  cpu: 10,
  memory: 20,
  diskUsage: 25,
  diskIo: 10,
  inodes: 5,
  network: 10,
  services: 10,
  docker: 10,
  smartDisk: 5,
  temperature: 5,
  processes: 5,
  uptime: 5,
};

const COMPONENT_MULTIPLIER = {
  Healthy: 1,
  Warning: 0.6,
  Critical: 0,
};

function run(command, timeoutMs = 8000) {
  try {
    return {
      ok: true,
      output: execSync(command, {
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: timeoutMs,
      }).toString().trim(),
    };
  } catch (error) {
    return {
      ok: false,
      output: '',
      error: error?.message || String(error),
    };
  }
}

function detectOS() {
  const platform = os.platform();
  let family = 'Unknown';
  let name = 'Unknown';
  let version = 'Unknown';

  if (platform === 'darwin') {
    family = 'Unix';
    name = 'MacOS';
    const v = run('sw_vers -productVersion');
    if (v.ok && v.output) version = v.output;
    return { platform, family, name, version };
  }

  if (platform === 'aix') {
    family = 'Unix';
    name = 'AIX';
    const v = run('oslevel');
    if (v.ok && v.output) version = v.output;
    return { platform, family, name, version };
  }

  if (platform === 'hpux') {
    family = 'Unix';
    name = 'HPUX';
    const v = run('uname -r');
    if (v.ok && v.output) version = v.output;
    return { platform, family, name, version };
  }

  if (platform === 'linux') {
    family = 'Linux';
    name = 'Linux';

    try {
      const release = fs.readFileSync('/etc/os-release', 'utf8');
      const id = (release.match(/^ID="?(.+?)"?$/m) || [])[1]?.toLowerCase() || '';
      const pretty = (release.match(/^PRETTY_NAME="?(.+?)"?$/m) || [])[1] || '';
      const versionId = (release.match(/^VERSION_ID="?(.+?)"?$/m) || [])[1] || '';

      if (id.includes('rhel') || id.includes('redhat')) name = 'RHEL';
      else if (id.includes('centos')) name = 'CentOS';
      else if (id.includes('fedora')) name = 'Fedora';
      else if (id.includes('ubuntu')) name = 'Ubuntu';
      else if (id.includes('opensuse') || id.includes('sles') || id.includes('suse')) name = 'OpenSuse';
      else name = 'Linux';

      version = versionId || pretty || 'Unknown';
    } catch {
      const uname = run('uname -r');
      version = uname.ok ? uname.output : 'Unknown';
    }

    return { platform, family, name, version };
  }

  if (['freebsd', 'openbsd', 'sunos'].includes(platform)) {
    family = 'Unix';
    name = 'Unix';
    const v = run('uname -r');
    if (v.ok && v.output) version = v.output;
    return { platform, family, name, version };
  }

  return { platform, family, name, version };
}

function cpuSnapshot() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.irq + t.idle;
  }

  return { idle, total };
}

async function cpuUsagePct() {
  const a = cpuSnapshot();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const b = cpuSnapshot();
  const idleDelta = b.idle - a.idle;
  const totalDelta = b.total - a.total;

  if (totalDelta <= 0) return 0;
  return Number((100 * (1 - idleDelta / totalDelta)).toFixed(2));
}

function memoryUsagePct() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return Number(((used / total) * 100).toFixed(2));
}

function temperatureC(osInfo) {
  if (osInfo.platform === 'linux') {
    try {
      const value = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8').trim();
      const n = Number(value);
      if (!Number.isNaN(n)) return Number((n / 1000).toFixed(2));
    } catch {
      return null;
    }
  }

  if (osInfo.platform === 'darwin') {
    const out = run('osx-cpu-temp');
    if (out.ok && out.output) {
      const n = Number(out.output.replace(/[^0-9.]/g, ''));
      if (!Number.isNaN(n)) return n;
    }
  }

  return null;
}

function hardwareFailureSignals(osInfo) {
  const checks = [];

  if (osInfo.platform === 'linux') {
    checks.push(run("dmesg | tail -n 500 | grep -Ei 'hardware error|i/o error|mce|machine check|disk failure|read-only file system'"));
  } else if (osInfo.platform === 'darwin') {
    checks.push(run("log show --last 1d --style compact --predicate 'eventMessage CONTAINS[c] " + "\"I/O error\"' | head -n 20"));
  } else if (osInfo.platform === 'aix') {
    checks.push(run('errpt | head -n 20'));
  } else if (osInfo.platform === 'hpux') {
    checks.push(run('dmesg | tail -n 200'));
  } else {
    checks.push(run("dmesg | tail -n 300 | grep -Ei 'error|fail|panic'"));
  }

  const findings = checks
    .filter((c) => c.ok && c.output)
    .flatMap((c) => c.output.split('\n').slice(0, 20));

  return {
    ok: findings.length === 0,
    findings,
  };
}

function serviceAndJobHealth(osInfo) {
  let failedServices = [];
  let hungProcesses = [];

  if (osInfo.platform === 'linux') {
    const failed = run('systemctl --failed --no-legend --no-pager');
    if (failed.ok && failed.output) failedServices = failed.output.split('\n').filter(Boolean);
  } else if (osInfo.platform === 'darwin') {
    const failed = run("launchctl list | awk 'NR > 1 && $2 != " + '"0"' + " {print $0}'");
    if (failed.ok && failed.output) failedServices = failed.output.split('\n').filter(Boolean);
  } else if (osInfo.platform === 'aix') {
    const failed = run("lssrc -a | grep -i inoperative");
    if (failed.ok && failed.output) failedServices = failed.output.split('\n').filter(Boolean);
  }

  const hung = run("ps -eo stat,pid,comm | awk '$1 ~ /D|Z/ {print $0}'");
  if (hung.ok && hung.output) hungProcesses = hung.output.split('\n').filter(Boolean);

  return {
    allServicesRunning: failedServices.length === 0,
    failedServices,
    hungProcesses,
    ok: failedServices.length === 0 && hungProcesses.length === 0,
  };
}

function readNetworkCounters(platform) {
  if (platform === 'linux') {
    const out = run("cat /proc/net/dev | tail -n +3 | awk -F'[: ]+' '{if($1 != \"lo\") {rx += $3; tx += $11}} END {print rx \" \" tx}'");
    if (!out.ok || !out.output) return null;
    const [rxStr, txStr] = out.output.split(/\s+/);
    const rxBytes = Number(rxStr || 0);
    const txBytes = Number(txStr || 0);
    if (Number.isNaN(rxBytes) || Number.isNaN(txBytes)) return null;
    return { rxBytes, txBytes };
  }

  if (platform === 'darwin') {
    const out = run("netstat -ibn | awk 'NR > 1 && $1 !~ /^lo/ {if($7 ~ /^[0-9]+$/) rx[$1]=$7; if($10 ~ /^[0-9]+$/) tx[$1]=$10} END {for(i in rx){rin+=rx[i]} for(i in tx){tout+=tx[i]} print rin \" \" tout}'");
    if (!out.ok || !out.output) return null;
    const [rxStr, txStr] = out.output.split(/\s+/);
    const rxBytes = Number(rxStr || 0);
    const txBytes = Number(txStr || 0);
    if (Number.isNaN(rxBytes) || Number.isNaN(txBytes)) return null;
    return { rxBytes, txBytes };
  }

  return null;
}

async function networkHealth(osInfo) {
  const ping = run('ping -c 4 -W 2 8.8.8.8');
  let avgLatencyMs = null;
  let packetLossPct = null;

  if (ping.ok) {
    const m = ping.output.match(/=\s*([0-9.]+)\/([0-9.]+)\/([0-9.]+)\/([0-9.]+)\s*ms/);
    if (m?.[2]) avgLatencyMs = Number(m[2]);
    const loss = ping.output.match(/([0-9.]+)%\s*packet loss/);
    if (loss?.[1]) packetLossPct = Number(loss[1]);
  }

  const c1 = readNetworkCounters(osInfo.platform);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const c2 = readNetworkCounters(osInfo.platform);

  let rxMbps = null;
  let txMbps = null;
  let totalMbps = null;
  if (c1 && c2) {
    const rxDelta = Math.max(0, c2.rxBytes - c1.rxBytes);
    const txDelta = Math.max(0, c2.txBytes - c1.txBytes);
    rxMbps = Number(((rxDelta * 8) / 2_000_000).toFixed(2));
    txMbps = Number(((txDelta * 8) / 2_000_000).toFixed(2));
    totalMbps = Number((rxMbps + txMbps).toFixed(2));
  }

  let downloadMbps = null;
  const speed = run("curl -L -o /dev/null -s -w '%{speed_download}' https://speed.cloudflare.com/__down?bytes=1000000", 15000);
  if (speed.ok && speed.output) {
    const bytesPerSec = Number(speed.output);
    if (!Number.isNaN(bytesPerSec)) downloadMbps = Number(((bytesPerSec * 8) / 1_000_000).toFixed(2));
  }

  let txErrors = 0;
  let rxErrors = 0;
  if (osInfo.platform === 'linux') {
    const err = run("cat /proc/net/dev | tail -n +3 | awk -F'[: ]+' '{if($1 != \"lo\") {rx += $4; tx += $12}} END {print rx \" \" tx}'");
    if (err.ok && err.output) {
      const [rxErr, txErr] = err.output.split(/\s+/);
      rxErrors = Number(rxErr || 0);
      txErrors = Number(txErr || 0);
    }
  }

  return {
    ok: ping.ok,
    avgLatencyMs,
    packetLossPct,
    rxMbps,
    txMbps,
    totalMbps,
    downloadMbps,
    errorCount: Number((rxErrors || 0) + (txErrors || 0)),
    pingSample: ping.ok ? 'ok' : ping.error,
  };
}

function swapUsagePct(osInfo) {
  if (osInfo.platform === 'linux') {
    const out = run("awk '/SwapTotal/ {t=$2} /SwapFree/ {f=$2} END {if(t>0) printf \"%.2f\", ((t-f)/t)*100; else print 0}' /proc/meminfo");
    if (out.ok && out.output) {
      const n = Number(out.output);
      if (!Number.isNaN(n)) return n;
    }
  }

  if (osInfo.platform === 'darwin') {
    const out = run("sysctl vm.swapusage | awk '{for(i=1;i<=NF;i++){if($i ~ /used/) u=$(i+1); if($i ~ /total/) t=$(i+1)}} END {gsub(/M|G/ ,\"\",u); gsub(/M|G/ ,\"\",t); if(t+0>0) printf \"%.2f\", (u/t)*100; else print 0}'");
    if (out.ok && out.output) {
      const n = Number(out.output);
      if (!Number.isNaN(n)) return n;
    }
  }

  return 0;
}

function diskUsageByMount() {
  const out = run('df -Pk');
  if (!out.ok || !out.output) return [];

  return out.output
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^.*\s(\d+)%\s+(.+)$/);
      const pct = Number(match?.[1] || 0);
      const mountpoint = (match?.[2] || 'unknown').trim();
      return {
        mountpoint,
        usagePct: Number.isFinite(pct) ? pct : 0,
      };
    })
    .filter((d) => d.mountpoint.startsWith('/'));
}

function inodeUsageByMount() {
  const out = run('df -Pi');
  if (!out.ok || !out.output) return [];

  return out.output
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^.*\s(\d+)%\s+(.+)$/);
      const pct = Number(match?.[1] || 0);
      const mountpoint = (match?.[2] || 'unknown').trim();
      return {
        mountpoint,
        usagePct: Number.isFinite(pct) ? pct : 0,
      };
    })
    .filter((d) => d.mountpoint.startsWith('/'));
}

function diskIoSnapshot(osInfo) {
  if (osInfo.platform === 'linux') {
    const out = run("iostat -dx 1 2 | awk 'BEGIN{s=0} /^Device/ {s=1; next} s && NF>=12 {await=$10; util=$NF; if(await+0>m1) m1=await+0; if(util+0>m2) m2=util+0} END {print m1+0 \" \" m2+0}'", 12000);
    if (out.ok && out.output) {
      const [awaitMs, utilPct] = out.output.split(/\s+/).map((v) => Number(v || 0));
      if (!Number.isNaN(awaitMs) && !Number.isNaN(utilPct)) {
        return { ok: true, awaitMs, utilPct };
      }
    }
  }

  if (osInfo.platform === 'darwin') {
    const out = run("iostat -w 1 -c 2 | tail -n 1 | awk '{print $1+0 \" \" $2+0}'", 12000);
    if (out.ok && out.output) {
      const [tps, mbps] = out.output.split(/\s+/).map((v) => Number(v || 0));
      if (!Number.isNaN(tps) && !Number.isNaN(mbps)) {
        return { ok: true, tps, mbps };
      }
    }
  }

  return { ok: false };
}

function criticalServicesHealth(osInfo) {
  const configured = (process.env.HEALTH_CRITICAL_SERVICES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!configured.length) {
    return {
      configured: [],
      down: [],
      ok: true,
      note: 'No HEALTH_CRITICAL_SERVICES configured',
    };
  }

  const down = [];
  for (const service of configured) {
    if (osInfo.platform === 'linux') {
      const s = run(`systemctl is-active ${service}`);
      if (!s.ok || s.output.trim() !== 'active') down.push(service);
    } else if (osInfo.platform === 'darwin') {
      const s = run(`launchctl list | grep -E "${service}"`);
      if (!s.ok || !s.output) down.push(service);
    } else {
      const s = run(`ps -ef | grep -v grep | grep -E "${service}"`);
      if (!s.ok || !s.output) down.push(service);
    }
  }

  return {
    configured,
    down,
    ok: down.length === 0,
  };
}

function dockerHealth() {
  const docker = run('docker ps --format "{{.Names}}|{{.Status}}|{{.State}}"');
  if (!docker.ok) {
    return {
      available: false,
      containers: [],
      unhealthyCount: 0,
      restartingCount: 0,
      stoppedCount: 0,
      ok: true,
    };
  }

  const containers = docker.output
    ? docker.output.split('\n').filter(Boolean).map((line) => {
        const [name, status, state] = line.split('|');
        return { name, status, state };
      })
    : [];

  const unhealthyCount = containers.filter((c) => /unhealthy/i.test(c.status)).length;
  const restartingCount = containers.filter((c) => /restarting/i.test(c.status) || /restarting/i.test(c.state)).length;

  const stoppedOut = run('docker ps -a --filter status=exited --filter status=dead -q | wc -l');
  const stoppedCount = stoppedOut.ok ? Number(stoppedOut.output || 0) : 0;

  return {
    available: true,
    containers,
    unhealthyCount,
    restartingCount,
    stoppedCount,
    ok: unhealthyCount === 0 && restartingCount === 0 && stoppedCount === 0,
  };
}

function smartDiskHealth(osInfo) {
  if (osInfo.platform !== 'linux') {
    return { available: false, failingDisks: [], warningDisks: [], ok: true };
  }

  const list = run("lsblk -dn -o NAME,TYPE | awk '$2==\"disk\" {print $1}'");
  if (!list.ok || !list.output) {
    return { available: false, failingDisks: [], warningDisks: [], ok: true };
  }

  const devices = list.output.split('\n').filter(Boolean).map((d) => `/dev/${d}`);
  const failingDisks = [];
  const warningDisks = [];

  for (const dev of devices) {
    const out = run(`smartctl -H ${dev}`);
    if (!out.ok) continue;
    const txt = out.output.toLowerCase();
    if (txt.includes('failed') || txt.includes('prefail')) failingDisks.push(dev);
    else if (txt.includes('warning') || txt.includes('caution')) warningDisks.push(dev);
  }

  return {
    available: true,
    failingDisks,
    warningDisks,
    ok: failingDisks.length === 0 && warningDisks.length === 0,
  };
}

function processPressure() {
  const out = run("ps -eo pcpu,pmem,comm --sort=-pcpu | head -n 6");
  if (!out.ok || !out.output) {
    return { ok: true, top: [], maxCpu: 0, maxMem: 0 };
  }

  const lines = out.output.split('\n').slice(1).filter(Boolean);
  const top = lines.map((line) => {
    const parts = line.trim().split(/\s+/);
    const cpu = Number(parts[0] || 0);
    const mem = Number(parts[1] || 0);
    const cmd = parts.slice(2).join(' ');
    return { cpu, mem, cmd };
  });

  const maxCpu = top.reduce((m, p) => Math.max(m, p.cpu), 0);
  const maxMem = top.reduce((m, p) => Math.max(m, p.mem), 0);

  return {
    ok: true,
    top,
    maxCpu,
    maxMem,
  };
}

function uptimeHealth() {
  const seconds = os.uptime();
  let restartCount24h = null;
  const out = run("last reboot | head -n 10 | wc -l");
  if (out.ok && out.output) {
    const n = Number(out.output);
    if (!Number.isNaN(n)) restartCount24h = n;
  }

  return {
    uptimeSeconds: seconds,
    restartCount24h,
  };
}

function statusFromRules(name, metrics) {
  if (name === 'cpu') {
    if (metrics.usagePct > 85 || metrics.load1m > metrics.cores) return 'Critical';
    if (metrics.usagePct >= 70 || metrics.load1m > metrics.cores * 0.8) return 'Warning';
    return 'Healthy';
  }

  if (name === 'memory') {
    if (metrics.usagePct > 90 && metrics.swapUsagePct >= 50) return 'Critical';
    if (metrics.usagePct >= 80 || metrics.swapUsagePct >= 25) return 'Warning';
    return 'Healthy';
  }

  if (name === 'diskUsage') {
    if (metrics.maxUsagePct > 90) return 'Critical';
    if (metrics.maxUsagePct >= 80) return 'Warning';
    return 'Healthy';
  }

  if (name === 'diskIo') {
    if (metrics.available === false) return 'Warning';
    if ((metrics.awaitMs != null && metrics.awaitMs > 50) || (metrics.utilPct != null && metrics.utilPct > 90)) return 'Critical';
    if ((metrics.awaitMs != null && metrics.awaitMs >= 20) || (metrics.utilPct != null && metrics.utilPct >= 75)) return 'Warning';
    if ((metrics.tps != null && metrics.tps > 500) || (metrics.mbps != null && metrics.mbps > 500)) return 'Warning';
    return 'Healthy';
  }

  if (name === 'inodes') {
    if (metrics.maxUsagePct > 90) return 'Critical';
    if (metrics.maxUsagePct >= 70) return 'Warning';
    return 'Healthy';
  }

  if (name === 'network') {
    if ((metrics.packetLossPct != null && metrics.packetLossPct > 5) || (metrics.errorCount || 0) > 0 || (metrics.avgLatencyMs != null && metrics.avgLatencyMs > 200)) return 'Critical';
    if ((metrics.packetLossPct != null && metrics.packetLossPct > 0) || (metrics.avgLatencyMs != null && metrics.avgLatencyMs >= 100)) return 'Warning';
    return 'Healthy';
  }

  if (name === 'services') {
    if (metrics.criticalDownCount > 0) return 'Critical';
    if (metrics.failedServicesCount > 0 || metrics.hungProcessCount > 0) return 'Warning';
    return 'Healthy';
  }

  if (name === 'docker') {
    if (metrics.stoppedCount > 0 || metrics.unhealthyCount > 0) return 'Critical';
    if (metrics.restartingCount > 0) return 'Warning';
    return 'Healthy';
  }

  if (name === 'smartDisk') {
    if (metrics.failingDisks > 0) return 'Critical';
    if (metrics.warningDisks > 0) return 'Warning';
    return 'Healthy';
  }

  if (name === 'temperature') {
    if (metrics.celsius != null && metrics.celsius > 85) return 'Critical';
    if (metrics.celsius != null && metrics.celsius >= 70) return 'Warning';
    return 'Healthy';
  }

  if (name === 'processes') {
    if (metrics.maxCpu > 95 || metrics.maxMem > 60) return 'Critical';
    if (metrics.maxCpu >= 80 || metrics.maxMem >= 40) return 'Warning';
    return 'Healthy';
  }

  if (name === 'uptime') {
    if (metrics.uptimeSeconds < 900 || (metrics.restartCount24h != null && metrics.restartCount24h >= 5)) return 'Critical';
    if (metrics.uptimeSeconds < 3600 || (metrics.restartCount24h != null && metrics.restartCount24h >= 2)) return 'Warning';
    return 'Healthy';
  }

  return 'Warning';
}

function aggregateScore(components) {
  const entries = Object.entries(components);
  const totalWeight = entries.reduce((sum, [, c]) => sum + c.weight, 0);
  const earned = entries.reduce((sum, [, c]) => sum + (c.weight * COMPONENT_MULTIPLIER[c.status]), 0);
  const score = totalWeight > 0 ? Number(((earned / totalWeight) * 100).toFixed(2)) : 0;

  let scoreStatus = 'Critical';
  if (score >= 90) scoreStatus = 'Info';
  else if (score >= 70) scoreStatus = 'Warning';

  return { score, scoreStatus, totalWeight, earnedWeight: Number(earned.toFixed(2)) };
}

async function saveHealthToDb(report, osInfo) {
  if (!DB.enabled) return;

  let connection;
  try {
    connection = await mysql.createConnection({
      host: DB.host,
      user: DB.user,
      password: DB.password,
      database: DB.database,
    });

    const sql = `
      INSERT INTO ${DB.table}
      (agent_id, hostname, os_name, os_version, server_healthy, cpu_usage_pct, memory_usage_pct, cpu_temperature_c,
       network_latency_ms, network_download_mbps, network_rx_mbps, network_tx_mbps, failed_services_count,
       hung_process_count, payload_json, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await connection.query(sql, [
      os.hostname(),
      os.hostname(),
      osInfo.name,
      osInfo.version,
      report.summary.serverHealthy ? 1 : 0,
      report.checks.cpu.usagePct,
      report.checks.memory.usagePct,
      report.checks.temperature.celsius,
      report.checks.network.avgLatencyMs,
      report.checks.network.downloadMbps,
      report.checks.network.rxMbps,
      report.checks.network.txMbps,
      report.checks.jobsAndServices.failedServices.length,
      report.checks.jobsAndServices.hungProcesses.length,
      JSON.stringify(report),
      new Date(report.startedAt),
    ]);
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      console.warn(`[health-check] Table ${DB.table} not found. Run initdb to create it.`);
    } else {
      console.warn('[health-check] Failed to store report:', err?.message || err);
    }
  } finally {
    if (connection) await connection.end();
  }
}

async function runHealthCheckCycle() {
  const startedAt = new Date().toISOString();
  const osInfo = detectOS();

  const cpuPct = await cpuUsagePct();
  const loadAvg = os.loadavg();
  const cores = Math.max(1, os.cpus().length);
  const memPct = memoryUsagePct();
  const swapPct = swapUsagePct(osInfo);
  const tempC = temperatureC(osInfo);

  const hardware = hardwareFailureSignals(osInfo);
  const serviceHealth = serviceAndJobHealth(osInfo);
  const criticalServices = criticalServicesHealth(osInfo);
  const network = await networkHealth(osInfo);
  const diskUsage = diskUsageByMount();
  const inodeUsage = inodeUsageByMount();
  const diskIo = diskIoSnapshot(osInfo);
  const docker = dockerHealth();
  const smartDisk = smartDiskHealth(osInfo);
  const processStats = processPressure();
  const uptime = uptimeHealth();

  const components = {
    cpu: {
      weight: SCORE_WEIGHTS.cpu,
      status: statusFromRules('cpu', {
        usagePct: cpuPct,
        load1m: loadAvg[0] || 0,
        cores,
      }),
      metrics: {
        usagePct: cpuPct,
        load1m: Number((loadAvg[0] || 0).toFixed(2)),
        load5m: Number((loadAvg[1] || 0).toFixed(2)),
        load15m: Number((loadAvg[2] || 0).toFixed(2)),
        cores,
      },
    },
    memory: {
      weight: SCORE_WEIGHTS.memory,
      status: statusFromRules('memory', {
        usagePct: memPct,
        swapUsagePct: swapPct,
      }),
      metrics: {
        usagePct: memPct,
        swapUsagePct: Number(swapPct.toFixed(2)),
      },
    },
    diskUsage: {
      weight: SCORE_WEIGHTS.diskUsage,
      status: statusFromRules('diskUsage', {
        maxUsagePct: diskUsage.reduce((m, d) => Math.max(m, d.usagePct), 0),
      }),
      metrics: {
        maxUsagePct: diskUsage.reduce((m, d) => Math.max(m, d.usagePct), 0),
        mounts: diskUsage,
      },
    },
    diskIo: {
      weight: SCORE_WEIGHTS.diskIo,
      status: statusFromRules('diskIo', diskIo),
      metrics: diskIo,
    },
    inodes: {
      weight: SCORE_WEIGHTS.inodes,
      status: statusFromRules('inodes', {
        maxUsagePct: inodeUsage.reduce((m, d) => Math.max(m, d.usagePct), 0),
      }),
      metrics: {
        maxUsagePct: inodeUsage.reduce((m, d) => Math.max(m, d.usagePct), 0),
        mounts: inodeUsage,
      },
    },
    network: {
      weight: SCORE_WEIGHTS.network,
      status: statusFromRules('network', network),
      metrics: network,
    },
    services: {
      weight: SCORE_WEIGHTS.services,
      status: statusFromRules('services', {
        failedServicesCount: serviceHealth.failedServices.length,
        hungProcessCount: serviceHealth.hungProcesses.length,
        criticalDownCount: criticalServices.down.length,
      }),
      metrics: {
        failedServicesCount: serviceHealth.failedServices.length,
        hungProcessCount: serviceHealth.hungProcesses.length,
        criticalConfigured: criticalServices.configured,
        criticalDown: criticalServices.down,
      },
    },
    docker: {
      weight: SCORE_WEIGHTS.docker,
      status: statusFromRules('docker', docker),
      metrics: docker,
    },
    smartDisk: {
      weight: SCORE_WEIGHTS.smartDisk,
      status: statusFromRules('smartDisk', {
        failingDisks: smartDisk.failingDisks.length,
        warningDisks: smartDisk.warningDisks.length,
      }),
      metrics: smartDisk,
    },
    temperature: {
      weight: SCORE_WEIGHTS.temperature,
      status: statusFromRules('temperature', { celsius: tempC }),
      metrics: {
        celsius: tempC,
        thresholdWarningC: 70,
        thresholdCriticalC: 85,
      },
    },
    processes: {
      weight: SCORE_WEIGHTS.processes,
      status: statusFromRules('processes', processStats),
      metrics: processStats,
    },
    uptime: {
      weight: SCORE_WEIGHTS.uptime,
      status: statusFromRules('uptime', uptime),
      metrics: uptime,
    },
  };

  const score = aggregateScore(components);

  // Operational health should only flip to unhealthy for major incidents.
  const majorIssueReasons = [];
  if (!hardware.ok) majorIssueReasons.push('Hardware fault signals detected');
  if (criticalServices.down.length > 0) {
    majorIssueReasons.push(`Critical services down: ${criticalServices.down.join(', ')}`);
  }
  if (smartDisk.failingDisks.length > 0) {
    majorIssueReasons.push(`Failing SMART disk(s): ${smartDisk.failingDisks.join(', ')}`);
  }

  const healthy = majorIssueReasons.length === 0;

  const report = {
    startedAt,
    os: osInfo,
    checks: {
      cpu: {
        usagePct: cpuPct,
        load1m: Number((loadAvg[0] || 0).toFixed(2)),
        load5m: Number((loadAvg[1] || 0).toFixed(2)),
        load15m: Number((loadAvg[2] || 0).toFixed(2)),
        cores,
      },
      memory: {
        usagePct: memPct,
        swapUsagePct: Number(swapPct.toFixed(2)),
      },
      diskUsage,
      diskIo,
      inodes: inodeUsage,
      temperature: {
        celsius: tempC,
      },
      hardware,
      jobsAndServices: serviceHealth,
      criticalServices,
      docker,
      smartDisk,
      processes: processStats,
      uptime,
      network,
    },
    scoring: {
      components,
      ...score,
    },
    summary: {
      allServicesRunning: serviceHealth.allServicesRunning,
      serverHealthy: healthy,
      status: score.scoreStatus,
      score: score.score,
      majorIssueReasons,
      message:
        majorIssueReasons.length > 0
          ? 'Server is operationally unhealthy due to major incidents.'
          : score.scoreStatus === 'Info'
            ? 'Server is healthy. Minor findings are under observation.'
            : score.scoreStatus === 'Warning'
              ? 'Server is healthy. Some findings need observation.'
              : 'Server is healthy. Risk score is critical; review observations.',
    },
  };

  await saveHealthToDb(report, osInfo);

  console.log(JSON.stringify(report, null, 2));
  return healthy;
}

let running = false;

async function tick() {
  if (running) {
    console.warn('[health-check] Previous cycle still running. Skipping this tick.');
    return;
  }

  running = true;
  try {
    await runHealthCheckCycle();
  } catch (err) {
    console.error('Health check failed:', err);
  } finally {
    running = false;
  }
}

async function start() {
  console.log(`[health-check] Started. Interval: ${Math.round(RUNTIME.intervalMs / 1000)}s. Run once: ${RUNTIME.runOnce}.`);

  await tick();
  if (RUNTIME.runOnce) {
    process.exit(0);
  }

  setInterval(() => {
    void tick();
  }, RUNTIME.intervalMs);
}

start().catch((err) => {
  console.error('[health-check] Startup failed:', err);
  process.exit(1);
});
