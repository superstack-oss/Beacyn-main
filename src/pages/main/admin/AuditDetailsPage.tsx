import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { apiUrl } from '../../../lib/api';
import { authHeaders } from '../../../lib/auth';

interface Props {
  auditId: number | null;
  onBack: () => void;
}

interface AuditDetails {
  id: number;
  event_type: string;
  action: string;
  actor_username: string | null;
  actor_role: string | null;
  target_type: string | null;
  target_id: string | null;
  severity: 'info' | 'warning' | 'critical';
  outcome: 'success' | 'failed';
  resolved_at: string | null;
  resolved_by: string | null;
  message: string | null;
  details_json: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString();
}

function pretty(value: unknown) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value ?? 'null');
  }
}

function getPath(obj: any, path: string[]) {
  return path.reduce((acc: any, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

function formatUptimeYmd(seconds: number | null | undefined) {
  const safe = Math.max(0, Math.floor(Number(seconds || 0)));
  const years = Math.floor(safe / (365 * 24 * 60 * 60));
  const remAfterYears = safe % (365 * 24 * 60 * 60);
  const months = Math.floor(remAfterYears / (30 * 24 * 60 * 60));
  const remAfterMonths = remAfterYears % (30 * 24 * 60 * 60);
  const days = Math.floor(remAfterMonths / (24 * 60 * 60));
  return `${days}days, ${months}months, ${years}years`;
}

function formatBytes(value: number | null | undefined) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  return `${n.toFixed(n >= 10 || u === 0 ? 0 : 2)} ${units[u]}`;
}

export default function AuditDetailsPage({ auditId, onBack }: Props) {
  const [details, setDetails] = useState<AuditDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!auditId) return;
      setLoading(true);
      try {
        const res = await fetch(apiUrl(`/api/portal-audit/${auditId}`), {
          headers: authHeaders(),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || 'Failed to load details');
        if (!cancelled) setDetails(payload);
      } catch {
        if (!cancelled) setDetails(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [auditId]);

  const detailsJson: any = details?.details_json && typeof details.details_json === 'object' ? details.details_json : null;
  const portalUptimeSeconds =
    getPath(detailsJson, ['portalUptimeSeconds'])
    ?? getPath(detailsJson, ['snapshotDetails', 'portalUptimeSeconds'])
    ?? getPath(detailsJson, ['portalStatus', 'uptimeSeconds'])
    ?? null;
  const dbEngineName = getPath(detailsJson, ['dbEngineName']) ?? getPath(detailsJson, ['dbMonitor', 'engineName']) ?? 'MySQL';
  const dbEngineVersion = getPath(detailsJson, ['dbEngineVersion']) ?? getPath(detailsJson, ['dbMonitor', 'engineVersion']) ?? '-';
  const dbSpaceBytes = getPath(detailsJson, ['dbSpaceBytes']) ?? getPath(detailsJson, ['dbMonitor', 'spaceBytes']) ?? 0;
  const dbSignature = getPath(detailsJson, ['dbSignature']) ?? getPath(detailsJson, ['dbMonitor', 'signature']) ?? '-';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Audit
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit Details</CardTitle>
          <CardDescription>Complete record payload including full script report details.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading audit details...</p>
          ) : !details ? (
            <p className="text-sm text-zinc-500">Audit entry not found.</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Portal Audit Center</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <p><span className="text-zinc-500">Portal Uptime:</span> {formatUptimeYmd(portalUptimeSeconds)}</p>
                  <p><span className="text-zinc-500">DB Space:</span> {formatBytes(Number(dbSpaceBytes || 0))}</p>
                  <p><span className="text-zinc-500">DB Engine:</span> {String(dbEngineName || 'MySQL')}</p>
                  <p><span className="text-zinc-500">DB Version:</span> {String(dbEngineVersion || '-')}</p>
                  <p className="md:col-span-2 break-all"><span className="text-zinc-500">DB Signature:</span> {String(dbSignature || '-')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <p><span className="text-zinc-500">Time:</span> {formatDateTime(details.created_at)}</p>
                <p><span className="text-zinc-500">Type:</span> <span className="capitalize">{details.event_type}</span></p>
                <p><span className="text-zinc-500">Action:</span> {details.action}</p>
                <p><span className="text-zinc-500">Actor:</span> {details.actor_username || 'system'}</p>
                <p><span className="text-zinc-500">Role:</span> {details.actor_role || '-'}</p>
                <p><span className="text-zinc-500">Target:</span> {details.target_type ? `${details.target_type}${details.target_id ? `:${details.target_id}` : ''}` : '-'}</p>
                <p><span className="text-zinc-500">Severity:</span> <Badge variant="outline" className="capitalize">{details.severity}</Badge></p>
                <p><span className="text-zinc-500">Outcome:</span> <Badge variant="outline" className="capitalize">{details.outcome}</Badge></p>
                <p><span className="text-zinc-500">Resolved At:</span> {formatDateTime(details.resolved_at)}</p>
                <p><span className="text-zinc-500">Resolved By:</span> {details.resolved_by || '-'}</p>
                <p><span className="text-zinc-500">IP:</span> {details.ip_address || '-'}</p>
                <p><span className="text-zinc-500">User Agent:</span> {details.user_agent || '-'}</p>
              </div>

              <div>
                <p className="text-sm text-zinc-500 mb-1">Message</p>
                <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3 text-sm">
                  {details.message || '-'}
                </div>
              </div>

              <div>
                <p className="text-sm text-zinc-500 mb-1">Complete JSON Details</p>
                <pre className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-xs overflow-x-auto whitespace-pre-wrap break-words">
{pretty(details.details_json)}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
