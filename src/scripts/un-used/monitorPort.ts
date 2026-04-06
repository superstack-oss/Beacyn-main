import net from 'net';

export function monitorPort(host: string, port: number) {
  return new Promise((resolve) => {
    const start = performance.now();
    let isResolved = false;

    const timeoutTimer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        resolve({ success: false, error: 'Connection timeout', port, host });
      }
    }, 5000);

    const socket = new net.Socket();

    socket.connect(port, host, () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutTimer);
        const end = performance.now();
        
        resolve({
          success: true,
          host,
          port,
          latencyMs: Math.round(end - start),
          status: 'open'
        });
        
        socket.destroy();
      }
    });

    socket.on('error', (err: any) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutTimer);
        resolve({
          success: false,
          host,
          port,
          error: err.message,
          status: 'closed/filtered'
        });
      }
    });
  });
}
