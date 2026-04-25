import { spawn } from 'node:child_process';

import 'dotenv/config';

const childProcesses: Array<ReturnType<typeof spawn>> = [];

function startProcess(command: string, args: string[], label: string) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORTAL_MONITOR_RUN_ONCE: 'false',
    },
  });

  child.on('exit', (code, signal) => {
    if (signal || (code != null && code !== 0)) {
      console.error(`[${label}] exited`, { code, signal });
    }
  });

  childProcesses.push(child);
  return child;
}

function shutdown() {
  for (const child of childProcesses) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

startProcess('tsx', ['src/scripts/portal-monitor.ts'], 'portal-monitor');
const vite = startProcess('vite', [], 'vite');

vite.on('exit', (code) => {
  shutdown();
  process.exit(code == null ? 0 : code);
});
