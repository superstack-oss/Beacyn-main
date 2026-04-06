import tls from 'tls';
import net from 'net';

export function monitorSSL(hostname: string, port = 443) {
  return new Promise((resolve) => {
    const start = performance.now();
    let isResolved = false;

    // Use a strict timeout
    const timeoutTimer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        resolve({ success: false, error: 'Connection timeout' });
      }
    }, 5000);

    try {
      const socket = tls.connect(port, hostname, {
        servername: hostname, // Required for SNI
        rejectUnauthorized: false, // We want to inspect the cert even if invalid
      }, () => {
        const cert = socket.getPeerCertificate();
        const end = performance.now();
        
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutTimer);
          
          if (!cert || Object.keys(cert).length === 0) {
            resolve({ success: false, error: 'Target did not provide a certificate' });
            return socket.end();
          }

          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);
          const now = new Date();
          
          const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const isExpired = now.getTime() > validTo.getTime();

          resolve({
            success: true,
            issuer: cert.issuer.O || cert.issuer.CN,
            subject: cert.subject.CN,
            validFrom: validFrom.toISOString(),
            validTo: validTo.toISOString(),
            daysRemaining,
            isExpired,
            isAuthorized: socket.authorized, // whether Node trusts the root CA
            handshakeLatencyMs: Math.round(end - start)
          });
          
          socket.end();
        }
      });

      socket.on('error', (error: any) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutTimer);
          resolve({ success: false, error: error.message });
        }
      });
    } catch (e: any) {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutTimer);
        resolve({ success: false, error: e.message });
      }
    }
  });
}
