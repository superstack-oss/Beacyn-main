import ping from 'ping';

export async function monitorPing(host: string) {
  try {
    const result = await ping.promise.probe(host, {
      timeout: 3,
      extra: ['-c', '4'], // Send 4 packets
    });

    return {
      success: result.alive,
      host: result.host,
      ip: result.numeric_host,
      latencyMs: result.time, // Avg time in ms
      packetLoss: result.packetLoss, // %
      min: result.min,
      max: result.max,
      stddev: result.stddev,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}
