import http from 'http';
import net from 'net';
import tls from 'tls';
import dns from 'dns/promises';
import ping from 'ping';

export type MonitorKind = 'website' | 'api' | 'ping' | 'port' | 'docker' | 'ssl' | 'pagespeed' | 'unknown';

export interface MonitorError {
  code: string;
  explanation: string;
  raw?: string;
}

export interface MonitorResult {
  kind: MonitorKind;
  ok: boolean;
  status: 'Up' | 'Down';
  statusCode: number;
  latencyMs: number;
  message: string;
  error?: MonitorError;
  diagnostics: Record<string, any>;
  checkedAt: string;
}

interface AssetLike {
  parent_type?: string | null;
  sub_type?: string | null;
  target_endpoint?: string | null;
}

function nowIso() {
  return new Date().toISOString();
}

function mapFailure(message: string): MonitorError {
  const m = (message || '').toLowerCase();

  if (m.includes('operation not permitted') || m.includes('permission denied') || m.includes('raw socket') || m.includes('ping:') || m.includes('command not found') || m.includes('exited with code')) {
    return { code: 'MON_ICMP_UNAVAILABLE', explanation: 'ICMP ping is not available in this runtime environment (common in managed/container platforms).', raw: message };
  }

  if (m.includes('getaddrinfo') || m.includes('enotfound') || m.includes('dns')) {
    return { code: 'MON_DNS_LOOKUP_FAILED', explanation: 'DNS lookup failed. Hostname does not resolve from monitor host.', raw: message };
  }
  if (m.includes('econnrefused')) {
    return { code: 'MON_CONNECTION_REFUSED', explanation: 'Target host reachable, but service is not listening on target port.', raw: message };
  }
  if (m.includes('ehostunreach') || m.includes('enetunreach')) {
    return { code: 'MON_NETWORK_UNREACHABLE', explanation: 'Network route to target is unreachable from monitor host.', raw: message };
  }
  if (m.includes('timed out') || m.includes('timeout') || m.includes('aborted')) {
    return { code: 'MON_TIMEOUT', explanation: 'Connection timed out. Firewall drop, routing issue, or overloaded target likely.', raw: message };
  }
  if (m.includes('certificate') || m.includes('tls') || m.includes('ssl')) {
    return { code: 'MON_TLS_HANDSHAKE_FAILED', explanation: 'TLS handshake/certificate validation failed.', raw: message };
  }

  return { code: 'MON_UNKNOWN_ERROR', explanation: 'Unknown monitor failure. Inspect raw error for details.', raw: message };
}

function detectMonitorKind(parentType: string, subType: string, endpoint: string): MonitorKind {
  const p = parentType.toLowerCase();
  const s = subType.toLowerCase();
  const ep = endpoint.toLowerCase();

  if (p.includes('api')) return 'api';
  if (p.includes('website')) return 'website';
  if (p.includes('docker')) return 'docker';
  if (p.includes('network port') && s.includes('ping')) return 'ping';
  if (p.includes('network port') || /^.+:\d+$/.test(endpoint)) return 'port';
  if (p.includes('server') || p.includes('device') || p.includes('switch') || p.includes('appliance') || p.includes('storage')) {
    return 'ping';
  }
  if (ep.startsWith('http://') || ep.startsWith('https://')) return 'website';

  return 'unknown';
}

function normalizeHostAndPort(endpoint: string, fallbackPort = 443) {
  const trimmed = endpoint.trim();
  if (!trimmed) return { host: '', port: fallbackPort };

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const u = new URL(trimmed);
    return { host: u.hostname, port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)) };
  }

  const parts = trimmed.split(':');
  if (parts.length === 2 && /^\d+$/.test(parts[1])) {
    return { host: parts[0], port: Number(parts[1]) };
  }

  return { host: trimmed, port: fallbackPort };
}

export async function monitorPingTarget(host: string) {
  const start = performance.now();
  try {
    const result = await ping.promise.probe(host, {
      timeout: 3,
      extra: ['-c', '4'],
    });

    const latencyMs = Number.isFinite(Number(result.time)) ? Math.round(Number(result.time)) : 0;
    const ok = Boolean(result.alive);

    return {
      kind: 'ping' as const,
      ok,
      status: ok ? ('Up' as const) : ('Down' as const),
      statusCode: ok ? 200 : 0,
      latencyMs,
      message: ok ? `Ping successful (${latencyMs}ms avg)` : 'Ping failed',
      diagnostics: {
        host,
        resolvedIp: result.numeric_host,
        packetLossPct: Number(result.packetLoss || 0),
        minMs: Number(result.min || 0),
        maxMs: Number(result.max || 0),
        stddevMs: Number(result.stddev || 0),
      },
      checkedAt: nowIso(),
    };
  } catch (error: any) {
    const rawMessage = error?.message || 'ping failed';
    const mapped = mapFailure(rawMessage);

    // Some hosted platforms block ICMP. In that case, try DNS + TCP fallback checks.
    if (mapped.code === 'MON_ICMP_UNAVAILABLE') {
      const diagnostics: Record<string, any> = {
        host,
        icmpUnavailable: true,
      };

      try {
        const resolved = await dns.lookup(host);
        diagnostics.resolvedIp = resolved.address;
      } catch (dnsErr: any) {
        const dnsMapped = mapFailure(dnsErr?.message || 'dns lookup failed');
        return {
          kind: 'ping' as const,
          ok: false,
          status: 'Down' as const,
          statusCode: 0,
          latencyMs: Math.round(performance.now() - start),
          message: 'ICMP unavailable and DNS lookup failed',
          error: dnsMapped,
          diagnostics,
          checkedAt: nowIso(),
        };
      }

      const tcp443 = await monitorPortTarget(host, 443);
      if (tcp443.ok) {
        return {
          kind: 'ping' as const,
          ok: true,
          status: 'Up' as const,
          statusCode: 200,
          latencyMs: tcp443.latencyMs,
          message: 'ICMP unavailable; TCP fallback succeeded on port 443',
          diagnostics: {
            ...diagnostics,
            tcpFallbackPort: 443,
            tcpLatencyMs: tcp443.latencyMs,
          },
          checkedAt: nowIso(),
        };
      }

      const tcp80 = await monitorPortTarget(host, 80);
      if (tcp80.ok) {
        return {
          kind: 'ping' as const,
          ok: true,
          status: 'Up' as const,
          statusCode: 200,
          latencyMs: tcp80.latencyMs,
          message: 'ICMP unavailable; TCP fallback succeeded on port 80',
          diagnostics: {
            ...diagnostics,
            tcpFallbackPort: 80,
            tcpLatencyMs: tcp80.latencyMs,
          },
          checkedAt: nowIso(),
        };
      }

      return {
        kind: 'ping' as const,
        ok: false,
        status: 'Down' as const,
        statusCode: 0,
        latencyMs: Math.round(performance.now() - start),
        message: 'ICMP unavailable and TCP fallback failed',
        error: mapped,
        diagnostics: {
          ...diagnostics,
          tcp443: { ok: tcp443.ok, message: tcp443.message, errorCode: tcp443.error?.code || null },
          tcp80: { ok: tcp80.ok, message: tcp80.message, errorCode: tcp80.error?.code || null },
        },
        checkedAt: nowIso(),
      };
    }

    return {
      kind: 'ping' as const,
      ok: false,
      status: 'Down' as const,
      statusCode: 0,
      latencyMs: Math.round(performance.now() - start),
      message: 'Ping failed',
      error: mapped,
      diagnostics: { host },
      checkedAt: nowIso(),
    };
  }
}

export function monitorPortTarget(host: string, port: number): Promise<MonitorResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    let done = false;

    const finish = (partial: Partial<MonitorResult>) => {
      if (done) return;
      done = true;
      const latencyMs = Math.round(performance.now() - start);
      const ok = Boolean(partial.ok);
      resolve({
        kind: 'port',
        ok,
        status: ok ? 'Up' : 'Down',
        statusCode: ok ? 200 : 0,
        latencyMs,
        message: partial.message || (ok ? 'Port reachable' : 'Port unreachable'),
        error: partial.error,
        diagnostics: { host, port, ...(partial.diagnostics || {}) },
        checkedAt: nowIso(),
      });
    };

    const socket = new net.Socket();

    const timeout = setTimeout(() => {
      socket.destroy();
      finish({
        ok: false,
        message: 'Port check timed out',
        error: mapFailure('connection timeout'),
      });
    }, 5000);

    socket.connect(port, host, () => {
      clearTimeout(timeout);
      socket.destroy();
      finish({ ok: true, message: `TCP ${port} open` });
    });

    socket.on('error', (err: any) => {
      clearTimeout(timeout);
      socket.destroy();
      finish({
        ok: false,
        message: `TCP ${port} closed/filtered`,
        error: mapFailure(err?.message || 'port check failed'),
      });
    });
  });
}

export function monitorSSLTarget(hostname: string, port = 443): Promise<MonitorResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    let done = false;

    const finish = (partial: Partial<MonitorResult>) => {
      if (done) return;
      done = true;
      const latencyMs = Math.round(performance.now() - start);
      const ok = Boolean(partial.ok);
      resolve({
        kind: 'ssl',
        ok,
        status: ok ? 'Up' : 'Down',
        statusCode: ok ? 200 : 0,
        latencyMs,
        message: partial.message || (ok ? 'TLS handshake successful' : 'TLS handshake failed'),
        error: partial.error,
        diagnostics: { host: hostname, port, ...(partial.diagnostics || {}) },
        checkedAt: nowIso(),
      });
    };

    const timeout = setTimeout(() => {
      finish({ ok: false, message: 'TLS timeout', error: mapFailure('tls timeout') });
    }, 5000);

    const socket = tls.connect(
      port,
      hostname,
      {
        servername: hostname,
        rejectUnauthorized: false,
      },
      () => {
        clearTimeout(timeout);
        const cert = socket.getPeerCertificate();
        if (!cert || Object.keys(cert).length === 0) {
          socket.end();
          finish({
            ok: false,
            message: 'No certificate presented by target',
            error: { code: 'MON_TLS_NO_CERT', explanation: 'Target did not present a certificate during TLS handshake.' },
          });
          return;
        }

        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const now = new Date();
        const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        socket.end();
        finish({
          ok: true,
          message: 'TLS handshake successful',
          diagnostics: {
            issuer: cert.issuer?.O || cert.issuer?.CN,
            subject: cert.subject?.CN,
            validFrom: validFrom.toISOString(),
            validTo: validTo.toISOString(),
            daysRemaining,
            isExpired: now.getTime() > validTo.getTime(),
            isAuthorized: socket.authorized,
          },
        });
      }
    );

    socket.on('error', (err: any) => {
      clearTimeout(timeout);
      finish({ ok: false, message: 'TLS handshake failed', error: mapFailure(err?.message || 'tls failed') });
    });
  });
}

export async function monitorWebsiteTarget(endpoint: string): Promise<MonitorResult> {
  const start = performance.now();
  const attempts: Array<Record<string, any>> = [];

  const tryFetch = async (url: string) => {
    const t0 = performance.now();
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'PulseIQ-Monitor/2.0' },
        signal: AbortSignal.timeout(10000),
      });
      const elapsed = Math.round(performance.now() - t0);
      const ok = response.status >= 200 && response.status < 400;
      const item = {
        url,
        ok,
        status: response.status,
        latencyMs: elapsed,
        destination: response.url,
      };
      attempts.push(item);
      return item;
    } catch (error: any) {
      const elapsed = Math.round(performance.now() - t0);
      const item = {
        url,
        ok: false,
        status: 0,
        latencyMs: elapsed,
        error: error?.message || 'fetch failed',
      };
      attempts.push(item);
      return item;
    }
  };

  const trimmed = endpoint.trim();
  const explicit = trimmed.startsWith('http://') || trimmed.startsWith('https://');
  let finalAttempt: any;

  if (explicit) {
    finalAttempt = await tryFetch(trimmed);
  } else {
    const httpsTry = await tryFetch(`https://${trimmed}`);
    finalAttempt = httpsTry.ok ? httpsTry : await tryFetch(`http://${trimmed}`);
  }

  if (finalAttempt.ok) {
    return {
      kind: 'website',
      ok: true,
      status: 'Up',
      statusCode: Number(finalAttempt.status || 200),
      latencyMs: Number(finalAttempt.latencyMs || Math.round(performance.now() - start)),
      message: 'HTTP check succeeded',
      diagnostics: { attempts },
      checkedAt: nowIso(),
    };
  }

  const { host, port } = normalizeHostAndPort(explicit ? trimmed : endpoint, explicit ? 443 : 80);
  const pingDiag = host ? await monitorPingTarget(host) : null;
  const portDiag = host ? await monitorPortTarget(host, port) : null;
  const sslDiag = (explicit && trimmed.startsWith('https://') && host) ? await monitorSSLTarget(host, port) : null;

  const baseError = mapFailure(finalAttempt.error || `http status ${finalAttempt.status}`);
  const statusError = finalAttempt.status >= 500
    ? { code: 'MON_HTTP_5XX', explanation: 'Target service responded with server error (5xx).' }
    : finalAttempt.status >= 400
      ? { code: 'MON_HTTP_4XX', explanation: 'Target service responded with client/protection error (4xx).' }
      : null;

  return {
    kind: 'website',
    ok: false,
    status: 'Down',
    statusCode: Number(finalAttempt.status || 0),
    latencyMs: Number(finalAttempt.latencyMs || Math.round(performance.now() - start)),
    message: finalAttempt.error ? 'HTTP fetch failed' : `HTTP check failed with status ${finalAttempt.status}`,
    error: statusError || baseError,
    diagnostics: {
      attempts,
      host,
      tcpPort: port,
      reachability: pingDiag ? {
        ok: pingDiag.ok,
        packetLossPct: pingDiag.diagnostics.packetLossPct,
        latencyMs: pingDiag.latencyMs,
      } : null,
      tcpProbe: portDiag ? {
        ok: portDiag.ok,
        message: portDiag.message,
        errorCode: portDiag.error?.code,
      } : null,
      tlsProbe: sslDiag ? {
        ok: sslDiag.ok,
        message: sslDiag.message,
        errorCode: sslDiag.error?.code,
        cert: sslDiag.diagnostics,
      } : null,
      probableCause: !pingDiag?.ok
        ? 'Target host is not reachable from monitor host (network path, firewall, or host down).'
        : !portDiag?.ok
          ? `Host reachable but TCP ${port} is blocked/refused.`
          : 'Application/service layer failure despite host reachability.',
    },
    checkedAt: nowIso(),
  };
}

export function monitorDockerTarget(socketPath = '/var/run/docker.sock'): Promise<MonitorResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    const req = http.request(
      {
        socketPath,
        path: '/containers/json?all=true',
        method: 'GET',
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const latencyMs = Math.round(performance.now() - start);
          if (res.statusCode !== 200) {
            resolve({
              kind: 'docker',
              ok: false,
              status: 'Down',
              statusCode: Number(res.statusCode || 0),
              latencyMs,
              message: 'Docker daemon not healthy',
              error: { code: 'MON_DOCKER_DAEMON_ERROR', explanation: `Docker socket responded ${res.statusCode}.` },
              diagnostics: { socketPath },
              checkedAt: nowIso(),
            });
            return;
          }

          try {
            const containers = JSON.parse(data);
            const running = containers.filter((c: any) => c.State === 'running').length;
            resolve({
              kind: 'docker',
              ok: true,
              status: 'Up',
              statusCode: 200,
              latencyMs,
              message: 'Docker daemon reachable',
              diagnostics: {
                socketPath,
                totalContainers: containers.length,
                runningContainers: running,
                stoppedContainers: containers.length - running,
                sample: containers.slice(0, 5).map((c: any) => ({
                  id: String(c.Id || '').slice(0, 12),
                  names: c.Names,
                  image: c.Image,
                  state: c.State,
                  status: c.Status,
                })),
              },
              checkedAt: nowIso(),
            });
          } catch (e: any) {
            resolve({
              kind: 'docker',
              ok: false,
              status: 'Down',
              statusCode: 0,
              latencyMs,
              message: 'Docker response parse failed',
              error: { code: 'MON_DOCKER_PARSE_ERROR', explanation: 'Could not parse Docker daemon response.', raw: e?.message },
              diagnostics: { socketPath },
              checkedAt: nowIso(),
            });
          }
        });
      }
    );

    req.on('error', (err: any) => {
      resolve({
        kind: 'docker',
        ok: false,
        status: 'Down',
        statusCode: 0,
        latencyMs: Math.round(performance.now() - start),
        message: 'Docker socket not reachable',
        error: mapFailure(err?.message || 'docker connection failed'),
        diagnostics: { socketPath },
        checkedAt: nowIso(),
      });
    });

    req.end();
  });
}

export async function monitorPageSpeedTarget(url: string, strategy: 'desktop' | 'mobile' = 'desktop'): Promise<MonitorResult> {
  const start = performance.now();
  const apiEndpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}`;

  try {
    const response = await fetch(apiEndpoint, { signal: AbortSignal.timeout(15000) });
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || 'PageSpeed API error');
    }

    const lighthouseMetrics = data?.lighthouseResult?.audits || {};
    return {
      kind: 'pagespeed',
      ok: true,
      status: 'Up',
      statusCode: 200,
      latencyMs: Math.round(performance.now() - start),
      message: 'PageSpeed audit succeeded',
      diagnostics: {
        strategy,
        performanceScore: Number(data?.lighthouseResult?.categories?.performance?.score || 0) * 100,
        firstContentfulPaint: lighthouseMetrics['first-contentful-paint']?.displayValue,
        largestContentfulPaint: lighthouseMetrics['largest-contentful-paint']?.displayValue,
        speedIndex: lighthouseMetrics['speed-index']?.displayValue,
        cumulativeLayoutShift: lighthouseMetrics['cumulative-layout-shift']?.displayValue,
      },
      checkedAt: nowIso(),
    };
  } catch (error: any) {
    return {
      kind: 'pagespeed',
      ok: false,
      status: 'Down',
      statusCode: 0,
      latencyMs: Math.round(performance.now() - start),
      message: 'PageSpeed audit failed',
      error: mapFailure(error?.message || 'pagespeed failed'),
      diagnostics: { strategy, url },
      checkedAt: nowIso(),
    };
  }
}

export async function monitorAsset(asset: AssetLike): Promise<MonitorResult> {
  const parentType = asset.parent_type || '';
  const subType = asset.sub_type || '';
  const endpoint = (asset.target_endpoint || '').trim();

  if (!endpoint) {
    return {
      kind: 'unknown',
      ok: false,
      status: 'Down',
      statusCode: 0,
      latencyMs: 0,
      message: 'Missing endpoint',
      error: { code: 'MON_CONFIG_MISSING_ENDPOINT', explanation: 'No target endpoint configured for this asset.' },
      diagnostics: { parentType, subType },
      checkedAt: nowIso(),
    };
  }

  const kind = detectMonitorKind(parentType, subType, endpoint);

  if (kind === 'website' || kind === 'api') {
    const result = await monitorWebsiteTarget(endpoint);
    return { ...result, kind };
  }

  if (kind === 'ping') {
    const result = await monitorPingTarget(endpoint);
    return { ...result, kind: 'ping' };
  }

  if (kind === 'port') {
    const hp = normalizeHostAndPort(endpoint, 443);
    const result = await monitorPortTarget(hp.host, hp.port);
    return { ...result, kind: 'port' };
  }

  if (kind === 'docker') {
    const result = await monitorDockerTarget(endpoint || '/var/run/docker.sock');
    return { ...result, kind: 'docker' };
  }

  const fallback = await monitorWebsiteTarget(endpoint);
  return {
    ...fallback,
    kind: 'unknown',
    diagnostics: {
      ...(fallback.diagnostics || {}),
      detection: 'Could not infer monitor kind from asset type; ran website probe fallback.',
      parentType,
      subType,
    },
  };
}
