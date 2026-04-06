#!/usr/bin/env node

/**
 * PulseIQ Linux capture agent.
 * Collects metrics and writes snapshots to MySQL every 5 minutes.
 */

import mysql from 'mysql2/promise';
import { cpus, freemem, hostname, loadavg, networkInterfaces, platform, totalmem, uptime } from 'os';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const CONFIG = {
    dbHost: process.env.PULSE_DB_HOST || 'localhost',
    dbUser: process.env.PULSE_DB_USER || 'root',
    dbPassword: process.env.PULSE_DB_PASSWORD || 'madhumitaN8#',
    dbName: process.env.PULSE_DB_NAME || 'pulseiq',
    tableName: process.env.PULSE_DB_TABLE || 'agent_metrics',
    agentTableName: process.env.PULSE_AGENT_TABLE || 'agents',
    intervalMs: Number(process.env.PULSE_INTERVAL_MS || 300000),
    connectTimeoutMs: Number(process.env.PULSE_DB_CONNECT_TIMEOUT_MS || 8000),
    logPayload: (process.env.PULSE_LOG_PAYLOAD || 'false').toLowerCase() === 'true',
    agentId: process.env.PULSE_AGENT_ID || hostname(),
};

if (!/^[a-zA-Z0-9_]+$/.test(CONFIG.tableName)) {
    throw new Error(`Invalid PULSE_DB_TABLE value: ${CONFIG.tableName}`);
}
if (!/^[a-zA-Z0-9_]+$/.test(CONFIG.agentTableName)) {
    throw new Error(`Invalid PULSE_AGENT_TABLE value: ${CONFIG.agentTableName}`);
}

let warnedMissingTable = false;
let warnedMissingAgentTable = false;
let saving = false;

const pool = mysql.createPool({
    host: CONFIG.dbHost,
    user: CONFIG.dbUser,
    password: CONFIG.dbPassword,
    database: CONFIG.dbName,
    waitForConnections: true,
    connectionLimit: 3,
    queueLimit: 0,
    connectTimeout: CONFIG.connectTimeoutMs,
});

function safeExec(command) {
    try {
        return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
        return null;
    }
}

function detectOS() {
    const p = platform();
    let distro = p;
    let version = 'unknown';

    if (p === 'linux') {
        try {
            const data = readFileSync('/etc/os-release', 'utf8');
            const nameMatch = data.match(/^NAME="?(.+?)"?$/m);
            const versionMatch = data.match(/^VERSION="?(.+?)"?$/m);
            distro = nameMatch?.[1] || 'Linux';
            version = versionMatch?.[1] || 'unknown';
        } catch {
            distro = 'Linux';
        }
    } else if (p === 'darwin') {
        distro = 'macOS';
        version = safeExec('sw_vers -productVersion') || 'unknown';
    } else if (p === 'aix') {
        distro = 'AIX';
        version = safeExec('oslevel') || 'unknown';
    }

    return { platform: p, distro, version };
}

function cpuSnapshot() {
    const cores = cpus();
    let idle = 0;
    let total = 0;

    for (const core of cores) {
        const times = core.times;
        idle += times.idle;
        total += times.user + times.nice + times.sys + times.irq + times.idle;
    }

    return { idle, total };
}

async function cpuUsagePercent() {
    const start = cpuSnapshot();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const end = cpuSnapshot();

    const idleDelta = end.idle - start.idle;
    const totalDelta = end.total - start.total;
    if (totalDelta <= 0) return 0;

    return Number((100 * (1 - idleDelta / totalDelta)).toFixed(2));
}

function cpuTemperatureC() {
    const raw = safeExec('cat /sys/class/thermal/thermal_zone0/temp');
    if (!raw) return null;
    const value = Number(raw);
    if (Number.isNaN(value)) return null;
    return Number((value / 1000).toFixed(2));
}

function physicalCpuCores() {
    const p = platform();
    if (p === 'darwin') {
        const out = safeExec('sysctl -n hw.physicalcpu');
        return out ? Number(out) : null;
    }
    if (p === 'linux') {
        const out = safeExec("lscpu -p=Core,Socket | grep -v '^#' | sort -u | wc -l");
        return out ? Number(out) : null;
    }
    return null;
}

function memoryInfo() {
    const total = totalmem();
    const free = freemem();
    const used = total - free;

    return {
        total,
        free,
        used,
        usedPct: total > 0 ? Number(((used / total) * 100).toFixed(2)) : 0,
        swap: swapInfo(),
    };
}

function swapInfo() {
    const p = platform();
    if (p === 'linux') {
        try {
            const meminfo = readFileSync('/proc/meminfo', 'utf8');
            const totalKb = Number((meminfo.match(/^SwapTotal:\s+(\d+)\s+kB/m) || [])[1] || 0);
            const freeKb = Number((meminfo.match(/^SwapFree:\s+(\d+)\s+kB/m) || [])[1] || 0);
            const total = totalKb * 1024;
            const free = freeKb * 1024;
            const used = Math.max(0, total - free);
            return {
                total,
                free,
                used,
                usedPct: total > 0 ? Number(((used / total) * 100).toFixed(2)) : 0,
            };
        } catch {
            return { total: 0, free: 0, used: 0, usedPct: 0 };
        }
    }

    if (p === 'darwin') {
        const out = safeExec('sysctl vm.swapusage');
        if (!out) return { total: 0, free: 0, used: 0, usedPct: 0 };

        const totalM = Number((out.match(/total\s*=\s*([\d.]+)M/i) || [])[1] || 0);
        const usedM = Number((out.match(/used\s*=\s*([\d.]+)M/i) || [])[1] || 0);
        const freeM = Number((out.match(/free\s*=\s*([\d.]+)M/i) || [])[1] || 0);
        const total = Math.round(totalM * 1024 * 1024);
        const used = Math.round(usedM * 1024 * 1024);
        const free = Math.round(freeM * 1024 * 1024);
        return {
            total,
            free,
            used,
            usedPct: total > 0 ? Number(((used / total) * 100).toFixed(2)) : 0,
        };
    }

    return { total: 0, free: 0, used: 0, usedPct: 0 };
}

function diskUsage() {
    const output = safeExec('df -kP');
    if (!output) return [];

    const lines = output.split('\n').slice(1).filter(Boolean);
    return lines.map((line) => {
        const parts = line.trim().split(/\s+/);
        const [filesystem, sizeKb, usedKb, availKb, usedPct, ...mountBits] = parts;
        return {
            filesystem,
            sizeBytes: Number(sizeKb) * 1024,
            usedBytes: Number(usedKb) * 1024,
            availBytes: Number(availKb) * 1024,
            usedPct,
            mountpoint: mountBits.join(' '),
        };
    });
}

function inodeUsage() {
    const output = safeExec('df -iP');
    if (!output) return [];

    const lines = output.split('\n').slice(1).filter(Boolean);
    return lines.map((line) => {
        const parts = line.trim().split(/\s+/);
        const [filesystem, inodes, iused, ifree, iusePct, ...mountBits] = parts;
        return {
            filesystem,
            inodes: Number(inodes),
            used: Number(iused),
            free: Number(ifree),
            usedPct: iusePct,
            mountpoint: mountBits.join(' '),
        };
    });
}

function diskIo() {
    const output = safeExec('iostat -d 1 2');
    return output || null;
}

function smartStatus() {
    const output = safeExec('smartctl -H /dev/sda');
    return output || null;
}

function dockerStats() {
    const output = safeExec('docker stats --no-stream --format "{{json .}}"');
    if (!output) return [];

    return output
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            try {
                return JSON.parse(line);
            } catch {
                return { raw: line };
            }
        });
}

function networkInfo() {
    return networkInterfaces();
}

async function collectMetrics() {
    const osInfo = detectOS();

    return {
        timestamp: new Date().toISOString(),
        hostname: hostname(),
        uptimeSeconds: uptime(),
        os: osInfo,
        cpu: {
            usagePct: await cpuUsagePercent(),
            load: loadavg(),
            cores: cpus().length,
            logicalCores: cpus().length,
            physicalCores: physicalCpuCores(),
            frequencyMHz: cpus()[0]?.speed ?? null,
            temperatureC: cpuTemperatureC(),
        },
        memory: memoryInfo(),
        disk: {
            usage: diskUsage(),
            inode: inodeUsage(),
            ioRaw: diskIo(),
        },
        smartRaw: smartStatus(),
        network: networkInfo(),
        docker: dockerStats(),
    };
}

async function saveMetrics(payload) {
    const sql = `
        INSERT INTO ${CONFIG.tableName}
        (agent_id, hostname, platform, distro, os_version, payload_json, collected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const collectedAt = new Date(payload.timestamp);

    await pool.query(sql, [
        CONFIG.agentId,
        payload.hostname,
        payload.os.platform,
        payload.os.distro,
        payload.os.version,
        JSON.stringify(payload),
        collectedAt,
    ]);
}

async function saveAgentHeartbeat(payload) {
    const sql = `
        INSERT INTO ${CONFIG.agentTableName}
        (id, hostname, os, os_version, agent_version, status, started_at, last_heartbeat_at)
        VALUES (?, ?, ?, ?, ?, 'Actively Syncing', NOW(), NOW())
        ON DUPLICATE KEY UPDATE
            hostname = VALUES(hostname),
            os = VALUES(os),
            os_version = VALUES(os_version),
            agent_version = VALUES(agent_version),
            status = 'Actively Syncing',
            last_heartbeat_at = NOW()
    `;

    await pool.query(sql, [
        CONFIG.agentId,
        payload.hostname,
        payload.os.distro,
        payload.os.version,
        process.env.PULSE_AGENT_VERSION || 'v1.0.0',
    ]);
}

async function runCapture() {
    if (saving) {
        console.warn('[capture-agent] Previous run still in progress. Skipping this cycle.');
        return;
    }

    saving = true;
    try {
        const payload = await collectMetrics();
        try {
            await saveAgentHeartbeat(payload);
        } catch (error) {
            const err = error;
            if (err?.code === 'ER_NO_SUCH_TABLE') {
                if (!warnedMissingAgentTable) {
                    warnedMissingAgentTable = true;
                    console.warn(
                        `[capture-agent] Table ${CONFIG.agentTableName} not found in database ${CONFIG.dbName}. ` +
                        'Heartbeat updates will begin automatically once the table exists.'
                    );
                }
            } else {
                throw err;
            }
        }
        await saveMetrics(payload);

        if (CONFIG.logPayload) {
            console.log(JSON.stringify(payload, null, 2));
        }

        console.log(`[capture-agent] Stored snapshot at ${payload.timestamp}`);
    } catch (error) {
        const err = error;
        if (err?.code === 'ER_NO_SUCH_TABLE') {
            if (!warnedMissingTable) {
                warnedMissingTable = true;
                console.warn(
                    `[capture-agent] Table ${CONFIG.tableName} not found in database ${CONFIG.dbName}. ` +
                    'Create your metrics table, then the agent will auto-start storing rows.'
                );
            }
        } else {
            console.error('[capture-agent] Capture failed:', err?.message || err);
        }
    } finally {
        saving = false;
    }
}

console.log(
    `[capture-agent] Started for agent ${CONFIG.agentId}. ` +
    `Interval ${Math.round(CONFIG.intervalMs / 1000)}s. Target DB ${CONFIG.dbUser}@${CONFIG.dbHost}/${CONFIG.dbName}.`
);

runCapture();
setInterval(runCapture, CONFIG.intervalMs);

async function shutdown(signal) {
    console.log(`[capture-agent] Received ${signal}, shutting down...`);
    try {
        await pool.end();
    } catch {
        // no-op
    }
    process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
