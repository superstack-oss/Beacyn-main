import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  Copy,
  Terminal,
  CheckCircle2,
  Check,
  AlertTriangle,
  Clock3,
  Search,
  Server,
  Activity,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Input } from '../../components/ui/input';

type AgentStatus = 'Actively Syncing' | 'Delayed Sync' | 'Offline';

interface ConnectedAgent {
  id?: string;
  hostname: string;
  os: string;
  osVersion: string;
  agentVersion: string;
  status: AgentStatus;
  runningFor?: string;
  startedAt?: string;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="relative w-48 h-28 mb-6 select-none pointer-events-none">
        <div className="absolute bottom-0 left-4 right-4 h-16 bg-zinc-100 rounded-xl shadow-sm rotate-[-4deg]" />
        <div className="absolute bottom-2 left-2 right-2 h-16 bg-zinc-50 rounded-xl shadow border border-zinc-100 rotate-[2deg]" />
        <div className="absolute bottom-4 left-0 right-0 h-16 bg-white rounded-xl shadow border border-zinc-100 flex items-center gap-3 px-4">
          <div className="w-10 h-8 rounded bg-zinc-100 shrink-0" />
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="h-2.5 bg-zinc-200 rounded-full w-3/4" />
            <div className="h-2 bg-zinc-100 rounded-full w-1/2" />
            <div className="h-2 bg-zinc-100 rounded-full w-2/3" />
          </div>
        </div>
      </div>
      <h3 className="text-sm font-semibold text-zinc-700 mb-1 dark:text-zinc-200">No agents connected</h3>
      <p className="text-xs text-zinc-400 text-center max-w-xs leading-relaxed">
        Connected agents will appear here once hosts install and start reporting heartbeat data.
      </p>
      <div className="flex items-center gap-2 mt-4 text-xs text-zinc-400">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        No active agent incidents
      </div>
    </div>
  );
}

function formatDuration(startedAt?: string, runningFor?: string) {
  if (runningFor) return runningFor;
  if (!startedAt) return 'Unknown';

  const diffMs = Date.now() - new Date(startedAt).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

export default function AgentsPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<ConnectedAgent[]>([]);

  const installCommands = [
    {
      id: 'linux',
      title: 'Linux Installation',
      description: 'Run this command on Ubuntu, Debian, RHEL, or CentOS servers.',
      command: 'curl -sSL https://get.pulseiq.dev/agent.sh | sudo bash -s -- --token YOUR_API_KEY',
    },
    {
      id: 'docker',
      title: 'Docker Installation',
      description: 'Run the containerized agent in Docker or as a Kubernetes sidecar job.',
      command: 'docker run -d --name pulse-agent --restart unless-stopped -e PULSE_TOKEN=YOUR_API_KEY pulseiq/capture-agent:latest',
    },
    {
      id: 'windows',
      title: 'Windows Installation',
      description: 'Run in an elevated PowerShell terminal on Windows Server or desktop hosts.',
      command: 'powershell -ExecutionPolicy Bypass -Command "iwr -useb https://get.pulseiq.dev/windows.ps1 | iex; Install-PulseAgent -Token YOUR_API_KEY"',
    },
  ];

  useEffect(() => {
    let ignore = false;

    const loadAgents = async () => {
      setLoading(true);
      try {
        const res = await fetch('http://localhost:3001/api/agents');
        if (!res.ok) throw new Error('agents endpoint unavailable');
        const data = await res.json();
        if (!ignore) setAgents(Array.isArray(data) ? data : []);
      } catch {
        if (!ignore) setAgents([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    loadAgents();
    const id = setInterval(loadAgents, 60_000);
    return () => {
      ignore = true;
      clearInterval(id);
    };
  }, []);

  const filteredAgents = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return agents;
    return agents.filter((a) =>
      [a.hostname, a.os, a.osVersion, a.agentVersion, a.status]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q))
    );
  }, [agents, query]);

  const statusCounts = useMemo(() => {
    return {
      total: agents.length,
      active: agents.filter((a) => a.status === 'Actively Syncing').length,
      delayed: agents.filter((a) => a.status === 'Delayed Sync').length,
      offline: agents.filter((a) => a.status === 'Offline').length,
    };
  }, [agents]);

  const handleCopy = async (id: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {
      setCopiedId(null);
    }
  };

  const statusCell = (status: string) => {
    if (status === 'Actively Syncing') {
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
          <CheckCircle2 className="h-4 w-4" />
          {status}
        </span>
      );
    }

    if (status === 'Offline') {
      return (
        <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium">
          <AlertTriangle className="h-4 w-4" />
          {status}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
        <AlertTriangle className="h-4 w-4" />
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            {[
              { label: 'Total', value: statusCounts.total, color: 'bg-zinc-100 text-zinc-700', dot: 'bg-zinc-400' },
              { label: 'Actively Syncing', value: statusCounts.active, color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
              { label: 'Delayed Sync', value: statusCounts.delayed, color: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400' },
              { label: 'Offline', value: statusCounts.offline, color: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
            ].map(({ label, value, color, dot }) => (
              <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${color} border-current/10`}>
                <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
                {label} <span className="font-bold">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {installCommands.map((item) => (
          <Card key={item.id} className="border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                {item.title}
              </CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="bg-zinc-950 text-zinc-50 p-4 rounded-md text-sm overflow-x-auto border border-zinc-800 pr-14">
                  <code>{item.command}</code>
                </pre>
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute top-2 right-2 h-8 w-8"
                  onClick={() => handleCopy(item.id, item.command)}
                  title={copiedId === item.id ? 'Copied' : 'Copy command'}
                >
                  {copiedId === item.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Connected Agents</CardTitle>
              <CardDescription>Only live data is shown. Agents appear once heartbeat telemetry is available.</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search host, OS, version..."
                className="pl-8 h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          {loading ? (
            <div className="px-6 py-10 text-sm text-zinc-500 flex items-center gap-2">
              <Activity className="w-4 h-4 animate-pulse" />
              Loading connected agents...
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-b-lg mx-0">
              <EmptyState />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-zinc-100 dark:border-zinc-800">
                  <TableHead className="pl-6 font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Hostname</TableHead>
                  <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">OS</TableHead>
                  <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">OS Version</TableHead>
                  <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Agent Version</TableHead>
                  <TableHead className="font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Status</TableHead>
                  <TableHead className="pr-6 font-semibold text-xs tracking-wider text-zinc-500/80 uppercase">Running For</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgents.map((agent, idx) => (
                  <TableRow key={agent.id ?? `${agent.hostname}-${idx}`} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800/60">
                    <TableCell className="pl-6 py-4">
                      <span className="font-medium inline-flex items-center gap-2">
                        <Server className="w-3.5 h-3.5 text-zinc-400" />
                        {agent.hostname}
                      </span>
                    </TableCell>
                    <TableCell className="py-4">{agent.os || 'Unknown'}</TableCell>
                    <TableCell className="py-4">{agent.osVersion || 'Unknown'}</TableCell>
                    <TableCell className="py-4">{agent.agentVersion || 'Unknown'}</TableCell>
                    <TableCell className="py-4">{statusCell(agent.status || 'Delayed Sync')}</TableCell>
                    <TableCell className="py-4 pr-6">
                      <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                        <Clock3 className="h-4 w-4" />
                        {formatDuration(agent.startedAt, agent.runningFor)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
