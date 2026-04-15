import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { authHeaders } from '../../lib/auth';
import { apiUrl } from '../../lib/api';
import { Clock3, KeyRound, ShieldAlert } from 'lucide-react';

type Profile = {
  id: number;
  username: string;
  email: string | null;
  role: 'admin' | 'staff' | 'superuser';
  created_at: string;
  updated_at: string;
  full_name: string | null;
  employee_id: string | null;
  contact_number: string | null;
  team: string | null;
  company: string | null;
  manager_name: string | null;
  manager_email: string | null;
  account_status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  password_updated_at: string | null;
  password_age_days: number;
  password_update_required: boolean;
};

type PortalStatus = {
  uptimeSeconds: number;
  appVersion: string;
};

function fmt(value: string | null | undefined) {
  if (!value) return 'N/A';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'N/A';
  return dt.toLocaleString();
}

function memberSince(value: string | null | undefined) {
  if (!value) return 'N/A';
  const from = new Date(value).getTime();
  if (!Number.isFinite(from)) return 'N/A';
  const now = Date.now();
  let days = Math.floor((now - from) / 86400000);
  if (days < 0) days = 0;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const remDays = days - years * 365 - months * 30;
  return `${years}y ${months}m ${remDays}d`;
}

function fmtUptime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (days > 0) return `${days}d ${hh}:${mm}:${ss}`;
  return `${hh}:${mm}:${ss}`;
}

export default function UserDetailsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [portal, setPortal] = useState<PortalStatus>({ uptimeSeconds: 0, appVersion: '0.0.0' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState('');

  const [uptimeTick, setUptimeTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setUptimeTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [meRes, portalRes] = await Promise.all([
          fetch(apiUrl('/api/auth/me'), { headers: authHeaders() }),
          fetch(apiUrl('/api/system/portal-status'), { headers: authHeaders() }),
        ]);

        if (!meRes.ok) {
          const payload = await meRes.json().catch(() => ({}));
          throw new Error(payload?.error || 'Failed to load profile details');
        }

        const meData = await meRes.json();
        const portalData = portalRes.ok ? await portalRes.json().catch(() => ({})) : {};

        if (!ignore) {
          setProfile(meData as Profile);
          setPortal({
            uptimeSeconds: Number(portalData?.uptimeSeconds || 0),
            appVersion: String(portalData?.appVersion || '0.0.0'),
          });
        }
      } catch (err: any) {
        if (!ignore) setError(err?.message || 'Failed to load user details');
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
  }, []);

  const liveUptime = useMemo(() => portal.uptimeSeconds + uptimeTick, [portal.uptimeSeconds, uptimeTick]);

  const updatePassword = async () => {
    setPasswordMsg('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMsg('Please fill all password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg('New password and confirm password do not match.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(apiUrl('/api/auth/change-password'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to update password');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg('Password updated successfully.');

      const meRes = await fetch(apiUrl('/api/auth/me'), { headers: authHeaders() });
      if (meRes.ok) {
        const meData = await meRes.json();
        setProfile(meData as Profile);
      }
    } catch (err: any) {
      setPasswordMsg(err?.message || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading user details...</p>;
  }

  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }

  if (!profile) {
    return <p className="text-sm text-zinc-500">User details unavailable.</p>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {profile.password_update_required && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5" />
          <div>
            <p className="font-medium">Password update required</p>
            <p className="text-xs mt-0.5">Your password is older than 90 days. Please update it now to stay compliant.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-zinc-200 dark:border-zinc-800 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Account Details</CardTitle>
            <CardDescription>Profile information from the users table.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
            <div><p className="text-zinc-500 text-xs">ID</p><p className="font-medium">{profile.id}</p></div>
            <div><p className="text-zinc-500 text-xs">Username</p><p className="font-medium">{profile.username}</p></div>
            <div><p className="text-zinc-500 text-xs">Email</p><p className="font-medium">{profile.email || 'N/A'}</p></div>
            <div><p className="text-zinc-500 text-xs">Password Hash</p><p className="font-medium">Hidden for security</p></div>
            <div><p className="text-zinc-500 text-xs">Role</p><p className="font-medium capitalize">{profile.role}</p></div>
            <div><p className="text-zinc-500 text-xs">Full Name</p><p className="font-medium">{profile.full_name || 'N/A'}</p></div>
            <div><p className="text-zinc-500 text-xs">Employee ID</p><p className="font-medium">{profile.employee_id || 'N/A'}</p></div>
            <div><p className="text-zinc-500 text-xs">Contact Number</p><p className="font-medium">{profile.contact_number || 'N/A'}</p></div>
            <div><p className="text-zinc-500 text-xs">Team</p><p className="font-medium">{profile.team || 'N/A'}</p></div>
            <div><p className="text-zinc-500 text-xs">Company</p><p className="font-medium">{profile.company || 'N/A'}</p></div>
            <div><p className="text-zinc-500 text-xs">Manager Name</p><p className="font-medium">{profile.manager_name || 'N/A'}</p></div>
            <div className="sm:col-span-2"><p className="text-zinc-500 text-xs">Manager Email</p><p className="font-medium break-all">{profile.manager_email || 'N/A'}</p></div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Portal Status</CardTitle>
            <CardDescription>Common portal runtime and version for all users.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <Clock3 className="w-4 h-4 text-zinc-400" />
              <span className="font-mono">{fmtUptime(liveUptime)}</span>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Version</p>
              <p className="font-medium">v{portal.appVersion}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Member Since</p>
              <p className="font-medium">{memberSince(profile.created_at)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg">Lifecycle & Approval</CardTitle>
          <CardDescription>Account status and timeline details.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-zinc-500 text-xs">Account Status</p>
            <div className="mt-1">
              <Badge variant="outline" className="capitalize">{profile.account_status}</Badge>
            </div>
          </div>
          <div>
            <p className="text-zinc-500 text-xs">Created At</p>
            <p className="font-medium">{fmt(profile.created_at)}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs">Updated At</p>
            <p className="font-medium">{fmt(profile.updated_at)}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs">Approved/Reviewed By</p>
            <p className="font-medium">{profile.reviewed_by || 'N/A'}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs">Approved/Reviewed At</p>
            <p className="font-medium">{fmt(profile.reviewed_at)}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs">Rejection Reason</p>
            <p className="font-medium">{profile.rejection_reason || 'N/A'}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs">Password Updated At</p>
            <p className="font-medium">{fmt(profile.password_updated_at)}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs">Password Age (Days)</p>
            <p className="font-medium">{profile.password_age_days}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><KeyRound className="w-4 h-4" /> Update Password</CardTitle>
          <CardDescription>Password must be updated every 90 days per policy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-xl">
          <div className="grid gap-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <p className="text-xs text-zinc-500">Policy: minimum 8 characters with upper/lower case, number, and special character.</p>
          {passwordMsg ? <p className={`text-xs ${passwordMsg.includes('successfully') ? 'text-emerald-600' : 'text-rose-600'}`}>{passwordMsg}</p> : null}
          <Button onClick={updatePassword} disabled={saving}>{saving ? 'Updating...' : 'Update Password'}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
