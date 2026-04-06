export async function monitorWebsite(url: string) {
  const start = performance.now();
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PulseIQ-Monitor/1.0',
      },
      // Ensure we don't hold the connection forever
      signal: AbortSignal.timeout(10000), 
    });

    const end = performance.now();
    return {
      status: response.status,
      // Treat redirects as reachable for uptime semantics.
      ok: response.status >= 200 && response.status < 400,
      latencyMs: Math.round(end - start),
      destination: response.url, // helpful if there was a redirect
    };
  } catch (error: any) {
    const end = performance.now();
    return {
      status: 0,
      ok: false,
      latencyMs: Math.round(end - start),
      error: error.message,
    };
  }
}
