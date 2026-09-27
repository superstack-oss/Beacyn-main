import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ExternalLink, FileDown, Plus, RefreshCw, Settings } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Skeleton } from '../../../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '../../../components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { EmptyPlaceholder } from '../../../components/EmptyPlaceholder';
import { apiUrl } from '../../../lib/api';
import { authHeaders } from '../../../lib/auth';
import actalisLogo from '../../../assets/ssl-logo/actalis.svg';
import appleLogo from '../../../assets/ssl-logo/apple-173-svgrepo-com.svg';
import cloudflareLogo from '../../../assets/ssl-logo/cloudflare-svgrepo-com.svg';
import digicertLogo from '../../../assets/ssl-logo/digicert.svg';
import entrustLogo from '../../../assets/ssl-logo/entrust.svg';
import globalsignLogo from '../../../assets/ssl-logo/globalsign-main.svg';
import godaddyLogo from '../../../assets/ssl-logo/godaddy-v2-svgrepo-com.svg';
import googleLogo from '../../../assets/ssl-logo/google-ssl-svgrepo-com.svg';
import haricaLogo from '../../../assets/ssl-logo/harica-Logo.svg';
import letsEncryptLogo from '../../../assets/ssl-logo/letsencrypt-svgrepo-com.svg';
import opensslLogo from '../../../assets/ssl-logo/openssl-svgrepo-com.svg';
import samsungLogo from '../../../assets/ssl-logo/samsung-svgrepo-com.svg';
import sectigoLogo from '../../../assets/ssl-logo/sectigo-logo-new.svg';
import fallbackLogo from '../../../assets/ssl-logo/security-protection-ssl-certificate-svgrepo-com.svg';
import zerosslLogo from '../../../assets/ssl-logo/zerossl_logo.svg';

const PROVIDER_LOGOS: Record<string, string> = {
  actalis: actalisLogo,
  apple: appleLogo,
  cloudflare: cloudflareLogo,
  digicert: digicertLogo,
  entrust: entrustLogo,
  globalsign: globalsignLogo,
  godaddy: godaddyLogo,
  'google trust services': googleLogo,
  google: googleLogo,
  harica: haricaLogo,
  "let's encrypt": letsEncryptLogo,
  letsencrypt: letsEncryptLogo,
  openssl: opensslLogo,
  samsung: samsungLogo,
  sectigo: sectigoLogo,
  zerossl: zerosslLogo,
};

function providerLogo(name: string) {
  const key = name.trim().toLowerCase();
  return PROVIDER_LOGOS[key] || fallbackLogo;
}

type CertState = 'valid' | 'expiring' | 'invalid' | 'pending';

interface CertProfile {
  host?: string | null;
  port?: number | null;
  provider?: string | null;
  issuer?: string | null;
  issuerOrg?: string | null;
  issuerCn?: string | null;
  subject?: string | null;
  names?: string[];
  serial?: string | null;
  fingerprint?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  daysRemaining?: number | null;
  isExpired?: boolean;
  notYetValid?: boolean;
  hostnameMatches?: boolean;
  isAuthorized?: boolean;
  ok?: boolean;
  message?: string | null;
  checkedAt?: string | null;
  domain?: {
    name?: string | null;
    expiresAt?: string | null;
    registeredAt?: string | null;
    registrar?: string | null;
    statuses?: string[];
    nameServers?: string[];
  };
}

function isSslAsset(asset: any) {
  const parent = String(asset?.parent_type || '').toLowerCase();
  const category = String(asset?.device_category || '').toLowerCase();
  return category === 'ssl-domain' || parent.includes('ssl') || parent.includes('certificate');
}

function readProfile(asset: any): CertProfile | null {
  const raw = asset?.ssl_profile_json;
  if (!raw) return null;
  if (typeof raw === 'object') return raw as CertProfile;
  try {
    return JSON.parse(raw) as CertProfile;
  } catch {
    return null;
  }
}

function daysUntil(value: unknown) {
  if (!value) return null;
  const time = new Date(value as string).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((time - Date.now()) / 86_400_000);
}

function formatDay(value: unknown) {
  if (!value) return '—';
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysLabel(days: number | null) {
  if (days == null) return '—';
  const count = Math.abs(days);
  const unit = count === 1 ? 'day' : 'days';
  return days < 0 ? `${count} ${unit} ago` : `${count} ${unit}`;
}

function certState(asset: any, profile: CertProfile | null): CertState {
  const expiry = profile?.validTo || asset?.ssl_expiry_at;
  const days = profile?.daysRemaining ?? daysUntil(expiry);
  if (!expiry && String(asset?.status || '').toLowerCase() !== 'down') return 'pending';
  if (profile?.isExpired || profile?.notYetValid || profile?.hostnameMatches === false || (days != null && days < 0) || (!expiry && String(asset?.status || '').toLowerCase() === 'down')) {
    return 'invalid';
  }
  if (days != null && days <= 30) return 'expiring';
  if (!expiry) return 'pending';
  return 'valid';
}

function domainState(expiresAt: unknown): CertState {
  const days = daysUntil(expiresAt);
  if (days == null) return 'pending';
  if (days < 0) return 'invalid';
  if (days <= 30) return 'expiring';
  return 'valid';
}

const STATE_META: Record<CertState, { label: string; dot: string; text: string }> = {
  valid: { label: 'Valid', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  expiring: { label: 'Expiring', dot: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' },
  invalid: { label: 'Invalid', dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  pending: { label: 'Pending', dot: 'bg-zinc-400', text: 'text-zinc-500' },
};

function StatusMark({ state }: { state: CertState }) {
  const meta = STATE_META[state];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.text}`}>
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function ProviderIcon({ name, compact = false }: { name: string; compact?: boolean }) {
  return (
    <img
      src={providerLogo(name)}
      alt=""
      className={`object-contain ${compact ? 'h-5 w-5' : 'h-7 w-7'}`}
    />
  );
}

function ProviderMark({ name }: { name: string }) {
  const label = name.trim() || 'Unknown';
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs font-medium text-zinc-900 shadow-sm dark:border-zinc-700">
      <ProviderIcon name={label} compact />
      {label}
    </span>
  );
}

function hostOf(asset: any, profile: CertProfile | null) {
  return profile?.host || String(asset?.target_endpoint || '').replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
}

function downloadPdf(name: string, profile: CertProfile | null, asset: any) {
  const lines = [
    `Beacyn SSL & Domain report`,
    name,
    hostOf(asset, profile),
    '',
    `SSL status: ${STATE_META[certState(asset, profile)].label}`,
    `Provider: ${profile?.provider || '—'}`,
    `Issuer: ${[profile?.provider, profile?.issuerOrg || profile?.issuer].filter(Boolean).join(' · ') || '—'}`,
    `Subject: ${profile?.subject || '—'}`,
    `Valid from: ${formatDay(profile?.validFrom)}`,
    `Valid to: ${formatDay(profile?.validTo || asset?.ssl_expiry_at)}`,
    `Days remaining: ${daysLabel(profile?.daysRemaining ?? daysUntil(profile?.validTo || asset?.ssl_expiry_at))}`,
    `Names: ${(profile?.names || []).join(', ') || '—'}`,
    `Serial: ${profile?.serial || '—'}`,
    `Fingerprint: ${profile?.fingerprint || '—'}`,
    '',
    `Domain: ${profile?.domain?.name || hostOf(asset, profile)}`,
    `Domain expires: ${formatDay(profile?.domain?.expiresAt || asset?.domain_expiry_at)}`,
    `Registered: ${formatDay(profile?.domain?.registeredAt)}`,
    `Registrar: ${profile?.domain?.registrar || asset?.domain_registrar || '—'}`,
    `Name servers: ${(profile?.domain?.nameServers || []).join(', ') || '—'}`,
    `Checked: ${formatDay(profile?.checkedAt || asset?.last_checked_at)}`,
  ];
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const body = ['BT', '/F1 11 Tf', '48 800 Td', '16 TL', `(${escape(lines[0])}) Tj`, ...lines.slice(1).map((line) => `T* (${escape(line)}) Tj`), 'ET'].join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${body.length} >> stream\n${body}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/\s+/g, '-').toLowerCase()}-ssl-report.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100 break-all">{value}</div>
    </div>
  );
}

function SslDetail({
  asset,
  refreshing,
  onBack,
  onRefresh,
}: {
  asset: any;
  refreshing: boolean;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const profile = readProfile(asset);
  const host = hostOf(asset, profile);
  const provider = profile?.provider || 'Unknown';
  const state = certState(asset, profile);
  const certDays = profile?.daysRemaining ?? daysUntil(profile?.validTo || asset?.ssl_expiry_at);
  const domainExpiry = profile?.domain?.expiresAt || asset?.domain_expiry_at;
  const domainDays = daysUntil(domainExpiry);
  const issuerLine = [provider, profile?.issuerOrg || profile?.issuer].filter((part, index, list) => part && list.indexOf(part) === index).join(' · ');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm">
            <button type="button" onClick={onBack} className="font-medium text-blue-500 hover:underline">SSL</button>
            <ChevronRight className="h-4 w-4 text-zinc-400" />
            <span className="font-medium text-blue-500">Details</span>
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{asset.name}</h2>
          <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
            <span className={`h-2 w-2 rounded-full ${state === 'valid' ? 'bg-emerald-500' : state === 'expiring' ? 'bg-amber-400' : state === 'invalid' ? 'bg-rose-500' : 'bg-zinc-400'}`} />
            <span>{host}</span>
            <span>·</span>
            <span>{provider}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => window.open(`https://${host}`, '_blank', 'noopener,noreferrer')}>
            <ExternalLink className="h-3.5 w-3.5" /> Open site
          </Button>
          <Button type="button" variant="outline" onClick={() => downloadPdf(asset.name, profile, asset)}>
            <FileDown className="h-3.5 w-3.5" /> Download PDF report
          </Button>
          <Button type="button" variant="outline" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Certificate</p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">SSL status, certificate, and domain expiry.</h3>
          <p className="mt-1 text-sm text-zinc-500">This reads the live certificate on port {profile?.port || 443} and the domain registration record.</p>
        </div>
        <button type="button" className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" onClick={onRefresh} aria-label="Refresh certificate">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm text-zinc-500">SSL status</div>
          <div className="mt-3"><StatusMark state={state} /></div>
          <div className="mt-4 text-sm text-zinc-400">{host} · checked {formatDay(profile?.checkedAt || asset.last_checked_at)}</div>
          <div className="mt-6 space-y-4">
            <DetailField label="Days remaining" value={daysLabel(certDays)} />
            <DetailField label="Certificate expires" value={formatDay(profile?.validTo || asset.ssl_expiry_at)} />
            <DetailField label="Chain" value={profile ? (profile.isAuthorized ? 'Trusted' : 'Untrusted') : '—'} />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm text-zinc-500">Certificate</div>
          <div className="mt-3 flex items-center gap-3">
            <span className="inline-flex rounded-md border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-700">
              <ProviderIcon name={provider} />
            </span>
            <span className="text-base font-medium text-zinc-900 dark:text-zinc-50">{profile?.subject || host}</span>
          </div>
          <div className="mt-6 space-y-4">
            <DetailField label="Issuer" value={issuerLine || '—'} />
            <DetailField label="Valid from" value={formatDay(profile?.validFrom)} />
            <DetailField label="Valid to" value={formatDay(profile?.validTo || asset.ssl_expiry_at)} />
            <DetailField label="Names" value={(profile?.names || []).join(', ') || '—'} />
            <DetailField label="Serial" value={profile?.serial || '—'} />
            <DetailField label="Fingerprint" value={profile?.fingerprint || '—'} />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm text-zinc-500">Domain expiry</div>
          <div className="mt-3"><StatusMark state={domainState(domainExpiry)} /></div>
          <div className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{profile?.domain?.name || host}</div>
          <div className="mt-6 space-y-4">
            <DetailField label="Expires" value={formatDay(domainExpiry)} />
            <DetailField label="Days remaining" value={daysLabel(domainDays)} />
            <DetailField label="Registered" value={formatDay(profile?.domain?.registeredAt)} />
            <DetailField label="Registrar" value={profile?.domain?.registrar || asset.domain_registrar || '—'} />
            <DetailField label="Name servers" value={(profile?.domain?.nameServers || []).join(', ') || '—'} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SslDomainPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ name: '', host: '' });
  const pageSize = 10;

  const load = () => {
    fetch(apiUrl('/api/assets'), { headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        setAssets(data.filter(isSslAsset));
      })
      .catch((err) => console.error('Error fetching SSL monitors:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const totalPages = Math.max(1, Math.ceil(assets.length / pageSize));
  const paged = useMemo(() => assets.slice((page - 1) * pageSize, page * pageSize), [assets, page]);
  const selected = assets.find((asset) => asset.id === selectedId) || null;

  const refreshOne = async (asset: any) => {
    setRefreshing(true);
    try {
      const res = await fetch(apiUrl(`/api/assets/${asset.id}/recheck`), { method: 'POST', headers: authHeaders() });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.id) {
        setAssets((prev) => prev.map((item) => item.id === body.id ? body : item));
      } else {
        load();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  const remove = async (asset: any) => {
    if (!window.confirm(`Delete ${asset.name}?`)) return;
    const res = await fetch(apiUrl(`/api/assets/${asset.id}`), { method: 'DELETE', headers: authHeaders() });
    if (res.ok) {
      setAssets((prev) => prev.filter((item) => item.id !== asset.id));
      if (selectedId === asset.id) setSelectedId(null);
    }
  };

  const submit = async () => {
    const host = form.host.trim();
    const name = form.name.trim() || host;
    if (!host) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl('/api/assets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name,
          parent_type: 'SSL & Domain',
          sub_type: 'Certificate',
          target_endpoint: host,
          environment: 'Production',
          device_category: 'ssl-domain',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(body.error || 'Failed to add SSL monitor');
        return;
      }
      setAddOpen(false);
      setForm({ name: '', host: '' });
      setLoading(true);
      load();
    } catch (err) {
      console.error(err);
      alert('Failed to add SSL monitor');
    } finally {
      setSaving(false);
    }
  };

  if (selected) {
    return (
      <SslDetail
        asset={selected}
        refreshing={refreshing}
        onBack={() => setSelectedId(null)}
        onRefresh={() => refreshOne(selected)}
      />
    );
  }

  const from = assets.length ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, assets.length);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add monitor
        </Button>
      </div>

      {!loading && assets.length === 0 ? (
        <EmptyPlaceholder
          title="No SSL & Domain monitors yet"
          message="Add a hostname to read its live certificate and domain registration record."
          actionLabel="Add your first monitor"
          onAction={() => setAddOpen(true)}
        />
      ) : (
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-zinc-200 bg-zinc-50/80 hover:bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/70">
              {['Name', 'Provider', 'SSL status', 'Days remaining', 'Certificate expires', 'Domain expiry', 'Actions'].map((label) => (
                <TableHead key={label} className="py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && assets.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6"><Skeleton className="h-8 w-full" /></TableCell>
              </TableRow>
            )}
            {paged.map((asset) => {
              const profile = readProfile(asset);
              const state = certState(asset, profile);
              const certDays = profile?.daysRemaining ?? daysUntil(profile?.validTo || asset.ssl_expiry_at);
              const domainExpiry = profile?.domain?.expiresAt || asset.domain_expiry_at;
              return (
                <TableRow
                  key={asset.id}
                  className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50/70 dark:border-zinc-800/80 dark:hover:bg-zinc-900/40"
                  onClick={() => setSelectedId(asset.id)}
                >
                  <TableCell className="py-4">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">{asset.name}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-400">{hostOf(asset, profile)}</div>
                  </TableCell>
                  <TableCell className="py-4">
                    <ProviderMark name={profile?.provider || 'Pending'} />
                  </TableCell>
                  <TableCell className="py-4"><StatusMark state={state} /></TableCell>
                  <TableCell className="py-4 text-sm tabular-nums text-zinc-700 dark:text-zinc-200">{daysLabel(certDays)}</TableCell>
                  <TableCell className="py-4 text-sm tabular-nums text-zinc-700 dark:text-zinc-200">{formatDay(profile?.validTo || asset.ssl_expiry_at)}</TableCell>
                  <TableCell className="py-4">
                    <div className="text-sm tabular-nums text-zinc-700 dark:text-zinc-200">{formatDay(domainExpiry)}</div>
                    <div className="mt-0.5 text-[11px] tabular-nums text-zinc-400">{daysLabel(daysUntil(domainExpiry))}</div>
                  </TableCell>
                  <TableCell className="py-4" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" aria-label="Monitor actions">
                          <Settings className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setSelectedId(asset.id)}>View details</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => refreshOne(asset)}>Refresh</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => remove(asset)}>Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800">
          <span>Showing {from}–{to} of {assets.length}</span>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Prev</Button>
            <span>Page {page} of {totalPages}</span>
            <Button type="button" size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button>
          </div>
        </div>
      </div>
      )}

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add SSL & Domain monitor</SheetTitle>
            <SheetDescription>
              Beacyn connects to the host, reads the certificate it presents, and looks up the domain registration record.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="ssl-name">Name</Label>
              <Input id="ssl-name" value={form.name} placeholder="Infosys" onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ssl-host">Hostname</Label>
              <Input id="ssl-host" value={form.host} placeholder="example.com or example.com:443" onChange={(event) => setForm((prev) => ({ ...prev, host: event.target.value }))} />
            </div>
          </div>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="button" disabled={saving || !form.host.trim()} onClick={submit}>{saving ? 'Adding…' : 'Add monitor'}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
