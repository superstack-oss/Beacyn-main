import http from 'http';

export function monitorDocker(socketPath = '/var/run/docker.sock') {
  return new Promise((resolve) => {
    const options = {
      socketPath,
      path: '/containers/json?all=true',
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve({ success: false, error: `Docker daemon responded with status: ${res.statusCode}` });
          return;
        }

        try {
          const containers = JSON.parse(data);
          const running = containers.filter((c: any) => c.State === 'running').length;
          
          resolve({
            success: true,
            totalContainers: containers.length,
            runningContainers: running,
            stoppedContainers: containers.length - running,
            summary: containers.map((c: any) => ({
              id: c.Id.substring(0, 12),
              names: c.Names,
              image: c.Image,
              state: c.State,
              status: c.Status
            })).slice(0, 5) // Return top 5 for overview
          });
        } catch (e: any) {
          resolve({ success: false, error: `Parse error: ${e.message}` });
        }
      });
    });

    req.on('error', (err: any) => {
      resolve({ 
        success: false, 
        error: `Could not connect to Docker socket ${socketPath}. Is Docker running? Err: ${err.message}` 
      });
    });

    req.end();
  });
}
