import http from 'http';
import net from 'net';
import tls from 'tls';
import dns from 'dns/promises';
import ping from 'ping';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { GameDig } from 'gamedig';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import WebSocket from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

export type MonitorKind = 'website' | 'api' | 'ping' | 'port' | 'docker' | 'ssl' | 'pagespeed' | 'game' | 'grpc' | 'websocket' | 'unknown';

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

  if (p.includes('game') || s.includes('game')) return 'game';
  if (p.includes('grpc') || s.includes('grpc') || ep.startsWith('grpc://')) return 'grpc';
  if (p.includes('websocket') || s.includes('websocket') || ep.startsWith('ws://') || ep.startsWith('wss://')) return 'websocket';

  if (p.includes('api')) return 'api';
  if (p.includes('website') || p.includes('http')) return 'website';
  if (p.includes('docker')) return 'docker';
  if (p.includes('network port') || p.includes('port') && !p.includes('ping')) return 'port';
  if (p.includes('ping') || p.includes('server') || p.includes('device') || p.includes('switch') || p.includes('appliance') || p.includes('storage')) {
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

export function monitorDockerTarget(target = '/var/run/docker.sock'): Promise<MonitorResult> {
  let targetContainerId: string | null = null;
  let requestOptions: http.RequestOptions = { method: 'GET', path: '/containers/json?all=true' };
  let connectionRef = target;

  const isRemote = target.startsWith('tcp://') || target.startsWith('http://');

  if (isRemote) {
    const parsedUrl = new URL(target.replace('tcp://', 'http://'));
    requestOptions.hostname = parsedUrl.hostname;
    requestOptions.port = parsedUrl.port || 2375;
    if (parsedUrl.pathname && parsedUrl.pathname !== '/') {
        targetContainerId = parsedUrl.pathname.replace(/^\//, '');
    }
    connectionRef = `tcp://${requestOptions.hostname}:${requestOptions.port}`;
  } else {
    const isSocketPath = target.includes('/');
    requestOptions.socketPath = isSocketPath ? target : '/var/run/docker.sock';
    targetContainerId = isSocketPath ? null : target;
    connectionRef = requestOptions.socketPath;
  }

  return new Promise((resolve) => {
    const start = performance.now();
    const req = http.request(requestOptions, (res) => {
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
              diagnostics: { connectionRef },
              checkedAt: nowIso(),
            });
            return;
          }

          try {
            const containers = JSON.parse(data);
            const running = containers.filter((c: any) => c.State === 'running').length;

            if (targetContainerId) {
              // Look specifically for the container ID or name
              const targetContainer = containers.find((c: any) => 
                String(c.Id).startsWith(targetContainerId) || 
                (c.Names || []).some((n: string) => n.includes(targetContainerId))
              );

              if (!targetContainer) {
                resolve({
                  kind: 'docker',
                  ok: false,
                  status: 'Down',
                  statusCode: 200,
                  latencyMs,
                  message: `Container ${targetContainerId} not found`,
                  error: { code: 'MON_DOCKER_CONTAINER_MISSING', explanation: 'Container does not exist on daemon.', raw: targetContainerId },
                  diagnostics: { connectionRef, targetContainerId },
                  checkedAt: nowIso(),
                });
                return;
              }

              const isRunning = targetContainer.State === 'running';
              resolve({
                kind: 'docker',
                ok: isRunning,
                status: isRunning ? 'Up' : 'Down',
                statusCode: 200,
                latencyMs,
                message: isRunning ? `Container ${targetContainerId} is running` : `Container ${targetContainerId} is ${targetContainer.State}`,
                diagnostics: {
                  connectionRef,
                  targetContainerId,
                  containerStats: {
                    id: String(targetContainer.Id || '').slice(0, 12),
                    names: targetContainer.Names,
                    image: targetContainer.Image,
                    state: targetContainer.State,
                    status: targetContainer.Status,
                  }
                },
                checkedAt: nowIso(),
              });
              return;
            }

            // Daemon-level check (no specific container requested)
            resolve({
              kind: 'docker',
              ok: true,
              status: 'Up',
              statusCode: 200,
              latencyMs,
              message: 'Docker daemon reachable',
              diagnostics: {
                connectionRef,
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
              diagnostics: { connectionRef },
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
        diagnostics: { connectionRef },
        checkedAt: nowIso(),
      });
    });

    req.end();
  });
}

function buildLighthouseDiagnostics(lighthouseResult: any, strategy: 'desktop' | 'mobile', targetUrl: string, extra?: Record<string, any>) {
  const lighthouseMetrics = lighthouseResult?.audits || {};
  const auditEntries = Object.entries(lighthouseMetrics).map(([id, audit]: [string, any]) => ({
    id,
    title: audit?.title || id,
    description: audit?.description || '',
    score: typeof audit?.score === 'number' ? Math.round(audit.score * 100) : null,
    scoreDisplayMode: audit?.scoreDisplayMode || 'informative',
    displayValue: audit?.displayValue || null,
    numericValue: audit?.numericValue ?? null,
    detailsType: audit?.details?.type || null,
  }));

  const insights = auditEntries.filter((audit) => audit.detailsType === 'opportunity');
  const diagnosticsList = auditEntries.filter((audit) => audit.detailsType === 'debugdata' || audit.scoreDisplayMode === 'informative');
  const passedAudits = auditEntries.filter((audit) => audit.scoreDisplayMode === 'binary' && (audit.score ?? 0) >= 100);
  const otherAudits = auditEntries.filter((audit) => !insights.includes(audit) && !diagnosticsList.includes(audit) && !passedAudits.includes(audit));

  return {
    strategy,
    requestedUrl: extra?.requestedUrl || targetUrl,
    finalUrl: lighthouseResult?.finalUrl || targetUrl,
    fetchTime: lighthouseResult?.fetchTime || nowIso(),
    categories: {
      performance: Number(lighthouseResult?.categories?.performance?.score || 0) * 100,
      accessibility: Number(lighthouseResult?.categories?.accessibility?.score || 0) * 100,
      bestPractices: Number(lighthouseResult?.categories?.['best-practices']?.score || 0) * 100,
      seo: Number(lighthouseResult?.categories?.seo?.score || 0) * 100,
      pwa: Number(lighthouseResult?.categories?.pwa?.score || 0) * 100,
    },
    performanceScore: Number(lighthouseResult?.categories?.performance?.score || 0) * 100,
    firstContentfulPaint: lighthouseMetrics['first-contentful-paint']?.displayValue,
    largestContentfulPaint: lighthouseMetrics['largest-contentful-paint']?.displayValue,
    speedIndex: lighthouseMetrics['speed-index']?.displayValue,
    cumulativeLayoutShift: lighthouseMetrics['cumulative-layout-shift']?.displayValue,
    metrics: {
      firstContentfulPaint: lighthouseMetrics['first-contentful-paint']?.displayValue,
      largestContentfulPaint: lighthouseMetrics['largest-contentful-paint']?.displayValue,
      speedIndex: lighthouseMetrics['speed-index']?.displayValue,
      totalBlockingTime: lighthouseMetrics['total-blocking-time']?.displayValue,
      cumulativeLayoutShift: lighthouseMetrics['cumulative-layout-shift']?.displayValue,
      timeToInteractive: lighthouseMetrics['interactive']?.displayValue,
      serverResponseTime: lighthouseMetrics['server-response-time']?.displayValue,
      bootupTime: lighthouseMetrics['bootup-time']?.displayValue,
      networkRequests: lighthouseMetrics['network-requests']?.displayValue,
      mainThreadWork: lighthouseMetrics['mainthread-work-breakdown']?.displayValue,
    },
    insights,
    diagnosticsList,
    passedAudits,
    otherAudits,
    audits: auditEntries,
    loadingExperience: extra?.loadingExperience || null,
    originLoadingExperience: extra?.originLoadingExperience || null,
    environment: lighthouseResult?.environment || null,
    configSettings: lighthouseResult?.configSettings || null,
    screenshot: lighthouseMetrics['final-screenshot']?.details?.data || null,
    fullPageScreenshot: lighthouseResult?.fullPageScreenshot?.screenshot?.data || null,
    runtimeError: lighthouseResult?.runtimeError || null,
  };
}

export async function monitorPageSpeedTarget(url: string, strategy: 'desktop' | 'mobile' = 'desktop'): Promise<MonitorResult> {
  const start = performance.now();
  const targetUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  let chrome: Awaited<ReturnType<typeof launch>> | null = null;

  try {
    chrome = await launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      logLevel: 'error',
    });

    const runnerResult: any = await (lighthouse as any)(targetUrl, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      formFactor: strategy,
      screenEmulation: strategy === 'desktop'
        ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
        : undefined,
    });

    const lighthouseResult = runnerResult?.lhr;
    if (!lighthouseResult) {
      throw new Error('No Lighthouse report was returned.');
    }

    return {
      kind: 'pagespeed',
      ok: true,
      status: 'Up',
      statusCode: 200,
      latencyMs: Math.round(performance.now() - start),
      message: 'Lighthouse audit succeeded',
      diagnostics: buildLighthouseDiagnostics(lighthouseResult, strategy, targetUrl),
      checkedAt: nowIso(),
    };
  } catch (localError: any) {
    try {
      const apiEndpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&strategy=${strategy}`;
      const response = await fetch(apiEndpoint, { signal: AbortSignal.timeout(30000) });
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'PageSpeed API error');
      }

      const lighthouseResult = data?.lighthouseResult || {};
      return {
        kind: 'pagespeed',
        ok: true,
        status: 'Up',
        statusCode: 200,
        latencyMs: Math.round(performance.now() - start),
        message: 'PageSpeed audit succeeded',
        diagnostics: buildLighthouseDiagnostics(lighthouseResult, strategy, targetUrl, {
          requestedUrl: data?.id || targetUrl,
          loadingExperience: data?.loadingExperience || null,
          originLoadingExperience: data?.originLoadingExperience || null,
        }),
        checkedAt: nowIso(),
      };
    } catch (fallbackError: any) {
      return {
        kind: 'pagespeed',
        ok: false,
        status: 'Down',
        statusCode: 0,
        latencyMs: Math.round(performance.now() - start),
        message: 'PageSpeed audit failed',
        error: mapFailure(fallbackError?.message || localError?.message || 'pagespeed failed'),
        diagnostics: { strategy, url: targetUrl },
        checkedAt: nowIso(),
      };
    }
  } finally {
    if (chrome) {
      try {
        await chrome.kill();
      } catch {
        // ignore cleanup failure
      }
    }
  }
}

export function monitorWebSocketTarget(url: string): Promise<MonitorResult> {
  const targetUrl = /^wss?:\/\//i.test(url) ? url : `wss://${url}`;
  return new Promise((resolve) => {
    const start = performance.now();
    let done = false;

    const finish = (partial: Partial<MonitorResult>) => {
      if (done) return;
      done = true;
      const latencyMs = Math.round(performance.now() - start);
      resolve({
        kind: 'websocket',
        ok: Boolean(partial.ok),
        status: partial.ok ? 'Up' : 'Down',
        statusCode: partial.ok ? 101 : 0,
        latencyMs,
        message: partial.message || (partial.ok ? 'WebSocket connected' : 'WebSocket connection failed'),
        error: partial.error,
        diagnostics: { url: targetUrl, ...partial.diagnostics },
        checkedAt: nowIso(),
      });
    };

    try {
      const ws = new WebSocket(targetUrl, { handshakeTimeout: 5000 });
      
      ws.on('open', () => {
        ws.close();
        finish({ ok: true });
      });

      ws.on('error', (err: any) => {
        finish({ ok: false, message: 'WebSocket Error', error: mapFailure(err.message || 'ws error') });
      });

    } catch (e: any) {
       finish({ ok: false, message: 'Invalid WebSocket Configuration', error: { code: 'MON_WS_ERROR', explanation: e.message } });
    }
  });
}

const resolveProtoPath = () => {
  try {
    return path.resolve(fileURLToPath(import.meta.url), '../../scripts/health.proto');
  } catch {
    return path.resolve(process.cwd(), 'src/scripts/health.proto');
  }
};

const PROTO_PATH = resolveProtoPath();

export function monitorGrpcTarget(endpoint: string): Promise<MonitorResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    let done = false;

    const finish = (partial: Partial<MonitorResult>) => {
      if (done) return;
      done = true;
      const latencyMs = Math.round(performance.now() - start);
      resolve({
        kind: 'grpc',
        ok: Boolean(partial.ok),
        status: partial.ok ? 'Up' : 'Down',
        statusCode: partial.ok ? 200 : 0,
        latencyMs,
        message: partial.message || (partial.ok ? 'gRPC Service is SERVING' : 'gRPC Health Check Failed'),
        error: partial.error,
        diagnostics: { endpoint, ...partial.diagnostics },
        checkedAt: nowIso(),
      });
    };

    try {
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
      });
      const grpcPkg = grpc.loadPackageDefinition(packageDefinition) as any;
      const healthProto = grpcPkg?.grpc?.health?.v1;
      
      if (!healthProto?.Health) {
        throw new Error("Unable to load standard grpc.health.v1.Health protocol");
      }

      const targetUrl = endpoint.replace(/^grpc:\/\//i, '');
      const client = new healthProto.Health(targetUrl, grpc.credentials.createInsecure());
      
      client.Check({ service: '' }, (err: any, response: any) => {
        if (err) {
           finish({ ok: false, message: 'gRPC Unavailable', error: { code: 'MON_GRPC_ERROR', explanation: err.details || err.message } });
           return;
        }
        
        const isServing = response.status === 'SERVING';
        finish({
           ok: isServing,
           message: isServing ? 'gRPC SERVING' : `gRPC Status: ${response.status}`,
           diagnostics: { grpcStatus: response.status }
        });
      });
      
      setTimeout(() => { finish({ ok: false, message: 'gRPC Timeout', error: mapFailure('timeout') }); }, 5000);

    } catch (e: any) {
      finish({ ok: false, message: 'gRPC probe error', error: { code: 'MON_GRPC_INTERNAL', explanation: e.message } });
    }
  });
}

export async function monitorGameTarget(endpoint: string, fallbackType = 'minecraft'): Promise<MonitorResult> {
  const start = performance.now();
  const hp = normalizeHostAndPort(endpoint, 25565);
  
  try {
    const state: any = await GameDig.query({
      type: fallbackType as any,
      host: hp.host,
      port: hp.port,
      maxRetries: 1
    });
    
    return {
      kind: 'game',
      ok: true,
      status: 'Up',
      statusCode: 200,
      latencyMs: state.ping || Math.round(performance.now() - start),
      message: `Game active (${state.players?.length || 0} online)`,
      diagnostics: {
        host: hp.host,
        port: hp.port,
        gameType: fallbackType,
        name: state.name || '',
        map: state.map || '',
        password: state.password,
        numPlayers: state.players?.length || 0,
        maxPlayers: state.maxplayers || 0,
      },
      checkedAt: nowIso(),
    };
  } catch (err: any) {
    return {
      kind: 'game',
      ok: false,
      status: 'Down',
      statusCode: 0,
      latencyMs: Math.round(performance.now() - start),
      message: 'Game server offline',
      error: mapFailure(err.message || 'Game query failed'),
      diagnostics: { host: hp.host, port: hp.port, gameType: fallbackType },
      checkedAt: nowIso()
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

  if (kind === 'websocket') {
    const result = await monitorWebSocketTarget(endpoint);
    return { ...result, kind: 'websocket' };
  }

  if (kind === 'grpc') {
    const result = await monitorGrpcTarget(endpoint);
    return { ...result, kind: 'grpc' };
  }

  if (kind === 'game') {
    const fallbackMap: Record<string, string> = {
      'minecraft': 'minecraft',
      'source engine': 'csgo',
      'unreal': 'unreal2',
      'rust': 'rust',
      'valheim': 'valheim'
    };
    const gameType = fallbackMap[subType.toLowerCase()] || 'minecraft';
    const result = await monitorGameTarget(endpoint, gameType);
    return { ...result, kind: 'game' };
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
