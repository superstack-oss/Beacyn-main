/*This page is now marked completed. It provides a user profile overview with editable work-contact information, password management, and 
feedback submission features. The code includes API calls to fetch and update user details, handle password 
changes, and submit feedback, along with appropriate UI components and state management for a responsive user 
experience.*/

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { authHeaders } from '../../lib/auth';
import { apiUrl } from '../../lib/api';
import { Briefcase, Building2, Clock3, KeyRound, Mail, MessageSquareText, Pencil, Phone, Save, ShieldAlert, User } from 'lucide-react';

type Profile = {
  id: number;
  username: string;
  email: string | null;
  role: 'admin' | 'staff' | 'superuser' | 'viewer';
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
  password_days_remaining?: number;
  password_near_expiry?: boolean;
  password_expiry_at?: string | null;
  password_policy?: string | null;
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

function roleLabel(role: Profile['role']) {
  if (role === 'superuser') return 'Super-user';
  if (role === 'admin') return 'Admin';
  if (role === 'viewer') return 'Viewer';
  return 'Staff';
}

function initialsOf(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'U';
}

export default function UserDetailsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [portal, setPortal] = useState<PortalStatus>({ uptimeSeconds: 0, appVersion: '0.0.0' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [profileForm, setProfileForm] = useState({
    contactNumber: '',
    team: '',
    managerName: '',
    managerEmail: '',
  });
  const [isEditing, setIsEditing] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState('');
  const [wantsPasswordChange, setWantsPasswordChange] = useState(false);

  const [feedbackCategory, setFeedbackCategory] = useState('general');
  const [feedbackRating, setFeedbackRating] = useState('5');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);

  const [uptimeTick, setUptimeTick] = useState(0);

  const loadProfile = async () => {
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
      const nextProfile = meData as Profile;

      setProfile(nextProfile);
      setProfileForm({
        contactNumber: nextProfile.contact_number || '',
        team: nextProfile.team || '',
        managerName: nextProfile.manager_name || '',
        managerEmail: nextProfile.manager_email || '',
      });
      setPortal({
        uptimeSeconds: Number(portalData?.uptimeSeconds || 0),
        appVersion: String(portalData?.appVersion || '0.0.0'),
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const id = setInterval(() => setUptimeTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void loadProfile();
  }, []);

  const liveUptime = useMemo(() => portal.uptimeSeconds + uptimeTick, [portal.uptimeSeconds, uptimeTick]);
  const passwordDaysRemaining = Math.max(0, Number(profile?.password_days_remaining ?? (90 - Number(profile?.password_age_days || 0))));
  const canChangePassword = Boolean(profile?.password_update_required || profile?.password_near_expiry || wantsPasswordChange);

  const saveProfile = async () => {
    setProfileMsg('');
    setSaving(true);
    try {
      const res = await fetch(apiUrl('/api/auth/profile'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(profileForm),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to update profile');
      setProfileMsg('Profile updated successfully.');
      setIsEditing(false);
      await loadProfile();
    } catch (err: any) {
      setProfileMsg(err?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

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
      if (!res.ok) throw new Error(payload?.error || 'Failed to update password');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg('Password updated successfully.');
      setWantsPasswordChange(false);
      await loadProfile();
    } catch (err: any) {
      setPasswordMsg(err?.message || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  const submitFeedback = async () => {
    setFeedbackMsg('');
    if (!feedbackText.trim()) {
      setFeedbackMsg('Please enter your feedback before submitting.');
      return;
    }

    setSendingFeedback(true);
    try {
      const res = await fetch(apiUrl('/api/auth/feedback'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ category: feedbackCategory, rating: Number(feedbackRating), message: feedbackText.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to submit feedback');
      setFeedbackText('');
      setFeedbackRating('5');
      setFeedbackCategory('general');
      setFeedbackMsg(payload?.message || 'Feedback shared. Thank you.');
    } catch (err: any) {
      setFeedbackMsg(err?.message || 'Failed to submit feedback');
    } finally {
      setSendingFeedback(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading user profile...</p>;
  }

  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }

  if (!profile) {
    return <p className="text-sm text-zinc-500">User profile unavailable.</p>;
  }

  const displayName = profile.full_name || profile.username;
  const avatar = initialsOf(displayName);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {(profile.password_update_required || profile.password_near_expiry) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4" />
            <div>
              <p className="font-medium">Password attention needed</p>
              <p className="mt-0.5 text-xs">
                {profile.password_update_required
                  ? 'Your password has expired and must be updated now.'
                  : `Your password will expire in ${passwordDaysRemaining} day${passwordDaysRemaining === 1 ? '' : 's'}.`}
              </p>
            </div>
          </div>
        </div>
      )}

      <Card className="overflow-hidden border-zinc-200 dark:border-zinc-800">
        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-zinc-900 text-lg font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                {avatar}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{displayName}</h1>
                  <Badge variant="outline" className="capitalize">{roleLabel(profile.role)}</Badge>
                  <Badge variant="outline" className="capitalize">{profile.account_status}</Badge>
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">User ID: {profile.employee_id || 'NA'}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {profile.email || 'N/A'}</span>
                  <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {profile.company || 'N/A'}</span>
                  <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Member since {memberSince(profile.created_at)}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[420px]">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
                <p className="text-xs text-zinc-500">Portal uptime</p>
                <p className="font-mono font-semibold">{fmtUptime(liveUptime)}</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
                <p className="text-xs text-zinc-500">Password expires in</p>
                <p className="font-semibold">{passwordDaysRemaining} day{passwordDaysRemaining === 1 ? '' : 's'}</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
                <p className="text-xs text-zinc-500">Portal version</p>
                <p className="font-semibold">v{portal.appVersion}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">Profile details</CardTitle>
              <CardDescription>User profile overview with editable work-contact information.</CardDescription>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
              onClick={() => {
                setIsEditing((prev) => !prev);
                setProfileMsg('');
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> {isEditing ? 'Cancel' : 'Edit'}
            </button>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-zinc-500">Username</p>
              <p className="mt-1 font-medium">{profile.username}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Full Name</p>
              <p className="mt-1 font-medium">{profile.full_name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Email</p>
              <p className="mt-1 font-medium break-all">{profile.email || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Role</p>
              <p className="mt-1 font-medium">{roleLabel(profile.role)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Company</p>
              <p className="mt-1 font-medium">{profile.company || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Employee ID</p>
              <p className="mt-1 font-medium">{profile.employee_id || 'N/A'}</p>
            </div>

            <div className="sm:col-span-2 grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-number">Contact</Label>
                {isEditing ? (
                  <Input id="contact-number" value={profileForm.contactNumber} onChange={(e) => setProfileForm((prev) => ({ ...prev, contactNumber: e.target.value }))} />
                ) : (
                  <p className="font-medium">{profile.contact_number || 'N/A'}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-name">Team</Label>
                {isEditing ? (
                  <Input id="team-name" value={profileForm.team} onChange={(e) => setProfileForm((prev) => ({ ...prev, team: e.target.value }))} />
                ) : (
                  <p className="font-medium">{profile.team || 'N/A'}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="manager-name">Manager Name</Label>
                {isEditing ? (
                  <Input id="manager-name" value={profileForm.managerName} onChange={(e) => setProfileForm((prev) => ({ ...prev, managerName: e.target.value }))} />
                ) : (
                  <p className="font-medium">{profile.manager_name || 'N/A'}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="manager-email">Manager Email</Label>
                {isEditing ? (
                  <Input id="manager-email" type="email" value={profileForm.managerEmail} onChange={(e) => setProfileForm((prev) => ({ ...prev, managerEmail: e.target.value }))} />
                ) : (
                  <p className="font-medium break-all">{profile.manager_email || 'N/A'}</p>
                )}
              </div>

              {isEditing ? (
                <div className="md:col-span-2 flex items-center gap-3">
                  <Button onClick={saveProfile} disabled={saving}>
                    <Save className="mr-1.5 h-4 w-4" /> {saving ? 'Saving...' : 'Save changes'}
                  </Button>
                  {profileMsg ? <p className={`text-xs ${profileMsg.includes('successfully') ? 'text-emerald-600' : 'text-rose-600'}`}>{profileMsg}</p> : null}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Account overview</CardTitle>
            <CardDescription>Lifecycle, access status, and portal membership details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center gap-2"><User className="h-4 w-4 text-zinc-400" /><span>Account status: <strong>{profile.account_status}</strong></span></div>
            <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-zinc-400" /><span>Reviewed by: <strong>{profile.reviewed_by || 'N/A'}</strong></span></div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-zinc-400" /><span>Contact: <strong>{profile.contact_number || 'N/A'}</strong></span></div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="text-xs text-zinc-500">Important dates</p>
              <div className="mt-2 space-y-2">
                <div className="flex justify-between gap-3"><span>Created</span><span className="font-medium text-right">{fmt(profile.created_at)}</span></div>
                <div className="flex justify-between gap-3"><span>Last profile update</span><span className="font-medium text-right">{fmt(profile.updated_at)}</span></div>
                <div className="flex justify-between gap-3"><span>Password updated</span><span className="font-medium text-right">{fmt(profile.password_updated_at)}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-4 w-4" /> Password & security</CardTitle>
            <CardDescription>
              Remaining days: {passwordDaysRemaining}. Policy: {profile.password_policy || 'Minimum 8 characters with upper/lower case, number, and special character.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Password expiry</p>
                  <p className="text-xs text-zinc-500">Expires on {fmt(profile.password_expiry_at || null)}</p>
                </div>
                <Badge variant="outline" className={passwordDaysRemaining <= 7 ? 'border-amber-300 text-amber-700' : 'border-emerald-300 text-emerald-700'}>
                  {passwordDaysRemaining} day{passwordDaysRemaining === 1 ? '' : 's'} left
                </Badge>
              </div>
            </div>

            {!canChangePassword ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                <p className="font-medium">Password is healthy</p>
                <p className="mt-1 text-xs">Automatic update is prompted during the final week before expiry. You can still open the change form anytime.</p>
                <button type="button" className="mt-3 text-sm font-medium text-sky-700 hover:underline" onClick={() => setWantsPasswordChange(true)}>
                  I want to change my password
                </button>
              </div>
            ) : (
              <div className="space-y-4">
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
                <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-500">
                  <li>Minimum 8 characters</li>
                  <li>Include uppercase, lowercase, number, and special character</li>
                  <li>Should not reuse your current password</li>
                </ul>
                {passwordMsg ? <p className={`text-xs ${passwordMsg.includes('successfully') ? 'text-emerald-600' : 'text-rose-600'}`}>{passwordMsg}</p> : null}
                <div className="flex items-center gap-3">
                  <Button onClick={updatePassword} disabled={saving}>{saving ? 'Updating...' : 'Update Password'}</Button>
                  {!profile.password_update_required ? (
                    <button type="button" className="text-sm font-medium text-zinc-600 hover:underline" onClick={() => setWantsPasswordChange(false)}>
                      Hide form
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><MessageSquareText className="h-4 w-4" /> Share feedback</CardTitle>
            <CardDescription>Tell us what is working well or where the portal can improve.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="feedback-category">Category</Label>
                <select id="feedback-category" value={feedbackCategory} onChange={(e) => setFeedbackCategory(e.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-transparent px-3 text-sm dark:border-zinc-800">
                  <option value="general">General</option>
                  <option value="bug">Bug report</option>
                  <option value="feature">Feature request</option>
                  <option value="ux">UI / UX</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="feedback-rating">Rating</Label>
                <select id="feedback-rating" value={feedbackRating} onChange={(e) => setFeedbackRating(e.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-transparent px-3 text-sm dark:border-zinc-800">
                  <option value="5">5 - Excellent</option>
                  <option value="4">4 - Good</option>
                  <option value="3">3 - Average</option>
                  <option value="2">2 - Needs work</option>
                  <option value="1">1 - Poor</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-message">Your feedback</Label>
              <textarea
                id="feedback-message"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={5}
                placeholder="Share an idea, request, or pain point..."
                className="w-full rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none ring-0 dark:border-zinc-800"
              />
            </div>

            {feedbackMsg ? <p className={`text-xs ${feedbackMsg.toLowerCase().includes('thank') ? 'text-emerald-600' : 'text-rose-600'}`}>{feedbackMsg}</p> : null}
            <Button onClick={submitFeedback} disabled={sendingFeedback}>{sendingFeedback ? 'Sending...' : 'Submit feedback'}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
