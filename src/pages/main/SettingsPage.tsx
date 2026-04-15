import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { apiUrl } from '../../lib/api';
import { getStoredUser, authHeaders, applyTheme, setStoredTimezone } from '../../lib/auth';
import {
  Globe, Palette, Bell, Link2, Mail, Shield,
  Info, Check, Eye, EyeOff, ExternalLink, AtSign, X, Plus, Bot, KeyRound,
  RotateCcw, Lock,
} from 'lucide-react';

// ── Reusable layout components ────────────────────────────────────────────────

function SettingSection({
  icon: Icon, title, description, children, adminOnly = false,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-0 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-950 shadow-sm">
      {/* Left: label */}
      <div className="px-6 py-6 bg-zinc-50/60 dark:bg-zinc-900/40 border-r border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 shadow-sm">
            <Icon className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
          {adminOnly && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              <Lock className="w-2.5 h-2.5" /> Admin
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{description}</p>
      </div>
      {/* Right: controls */}
      <div className="px-6 py-6 space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</Label>
      {children}
    </div>
  );
}

function SaveToast({ show, message = 'Settings saved' }: { show: boolean; message?: string }) {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-4">
      <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" /> {message}
    </div>
  );
}

// ── Curated timezone options ─────────────────────────────────────────────────
const TIMEZONES = [
  { value: 'UTC', label: 'UTC', sub: 'UTC +0', flag: '🌍' },
  { value: 'America/New_York', label: 'US East', sub: 'UTC −5/−4', flag: '🗽' },
  { value: 'America/Los_Angeles', label: 'US West', sub: 'UTC −8/−7', flag: '🌉' },
  { value: 'Europe/London', label: 'Europe', sub: 'UTC +0/+1', flag: '🏰' },
  { value: 'Asia/Kolkata', label: 'Asia/Mumbai', sub: 'UTC +5:30', flag: '🇮🇳' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo', sub: 'UTC +9', flag: '🗼' },
  { value: 'Australia/Sydney', label: 'Australia', sub: 'UTC +10/+11', flag: '🦘' },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const currentUser = getStoredUser();
  const isAdmin = currentUser?.role === 'admin';

  // Display Timezone
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  // Appearance
  const [theme, setTheme] = useState('light');
  const [language, setLanguage] = useState('en');

  // Notifications (admin-only)
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [downtimeOnly, setDowntimeOnly] = useState(false);
  const [alertEmail, setAlertEmail] = useState('');

  // ServiceNow (admin-only)
  const [snowInstance, setSnowInstance] = useState('');
  const [snowUser, setSnowUser] = useState('');
  const [snowToken, setSnowToken] = useState('');
  const [showSnowToken, setShowSnowToken] = useState(false);
  const [snowAssignGroup, setSnowAssignGroup] = useState('');

  // SMTP (admin-only)
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpTls, setSmtpTls] = useState('starttls');

  // AI Integrations (admin-only)
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState('openai');
  const [aiModel, setAiModel] = useState('gpt-4.1-mini');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [showAiApiKey, setShowAiApiKey] = useState(false);

  // Security (admin-only)
  const [sessionTimeout, setSessionTimeout] = useState('60');
  const [mfa, setMfa] = useState(false);

  // Email Domain Restriction (admin-only)
  const [allowAllDomains, setAllowAllDomains] = useState(true);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState('');
  const [domainError, setDomainError] = useState('');

  const addDomain = () => {
    const raw = domainInput.trim().toLowerCase().replace(/^@/, '');
    if (!raw) return;
    const valid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.[a-z]{2,}$/.test(raw);
    if (!valid) { setDomainError('Enter a valid domain, e.g. company.com'); return; }
    if (allowedDomains.includes(raw)) { setDomainError('Domain already added'); return; }
    setAllowedDomains(prev => [...prev, raw]);
    setDomainInput('');
    setDomainError('');
  };

  const removeDomain = (d: string) =>
    setAllowedDomains(prev => prev.filter(x => x !== d));

  const handleDomainKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addDomain(); }
  };

  // ── Reactive effects ────────────────────────────────────────────────────────

  // Apply theme whenever it changes (including on initial load from API)
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Persist timezone so MainLayout clock and other pages can use it
  useEffect(() => {
    setStoredTimezone(timezone);
  }, [timezone]);

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const applySettings = (s: Record<string, any>) => {
    if (typeof s.timezone === 'string') setTimezone(s.timezone);
    if (typeof s.theme === 'string') setTheme(s.theme);
    if (typeof s.language === 'string') setLanguage(s.language);

    if (typeof s.emailAlerts === 'boolean') setEmailAlerts(s.emailAlerts);
    if (typeof s.downtimeOnly === 'boolean') setDowntimeOnly(s.downtimeOnly);
    if (typeof s.alertEmail === 'string') setAlertEmail(s.alertEmail);

    if (typeof s.snowInstance === 'string') setSnowInstance(s.snowInstance);
    if (typeof s.snowUser === 'string') setSnowUser(s.snowUser);
    if (typeof s.snowToken === 'string') setSnowToken(s.snowToken);
    if (typeof s.snowAssignGroup === 'string') setSnowAssignGroup(s.snowAssignGroup);

    if (typeof s.smtpHost === 'string') setSmtpHost(s.smtpHost);
    if (typeof s.smtpPort === 'string') setSmtpPort(s.smtpPort);
    if (typeof s.smtpUser === 'string') setSmtpUser(s.smtpUser);
    if (typeof s.smtpPass === 'string') setSmtpPass(s.smtpPass);
    if (typeof s.smtpFrom === 'string') setSmtpFrom(s.smtpFrom);
    if (typeof s.smtpTls === 'string') setSmtpTls(s.smtpTls);

    if (typeof s.aiEnabled === 'boolean') setAiEnabled(s.aiEnabled);
    if (typeof s.aiProvider === 'string') setAiProvider(s.aiProvider);
    if (typeof s.aiModel === 'string') setAiModel(s.aiModel);
    if (typeof s.aiBaseUrl === 'string') setAiBaseUrl(s.aiBaseUrl);
    if (typeof s.aiApiKey === 'string') setAiApiKey(s.aiApiKey);

    if (typeof s.sessionTimeout === 'string') setSessionTimeout(s.sessionTimeout);
    if (typeof s.mfa === 'boolean') setMfa(s.mfa);
    if (typeof s.allowAllDomains === 'boolean') setAllowAllDomains(s.allowAllDomains);
    if (Array.isArray(s.allowedDomains)) setAllowedDomains(s.allowedDomains.filter((d: any) => typeof d === 'string'));
  };

  // ── Load on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(apiUrl('/api/settings'), { headers: authHeaders() });
        if (!res.ok) return;
        const s = await res.json();
        if (!s || typeof s !== 'object') return;
        applySettings(s);
      } catch { /* keep UI defaults */ }
    };
    load();
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const payload: Record<string, any> = {
      timezone, theme, language,
      ...(isAdmin ? {
        emailAlerts, downtimeOnly, alertEmail,
        snowInstance, snowUser, snowToken, snowAssignGroup,
        smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpTls,
        aiEnabled, aiProvider, aiModel, aiBaseUrl, aiApiKey,
        sessionTimeout, mfa,
        allowAllDomains, allowedDomains,
      } : {}),
    };

    try {
      const res = await fetch(apiUrl('/api/settings'), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      showToast('Settings saved');
    } catch (err: any) {
      window.alert(err?.message || 'Failed to save settings');
    }
  };

  // ── Reset to defaults ────────────────────────────────────────────────────────
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetAdmin, setResetAdmin] = useState(false);

  const handleReset = async () => {
    try {
      const res = await fetch(apiUrl('/api/settings/reset'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ resetAdmin: isAdmin && resetAdmin }),
      });
      if (!res.ok) throw new Error('Failed to reset');

      // Re-apply UI defaults inline
      setTimezone('Asia/Kolkata');
      setTheme('light');
      setLanguage('en');
      if (isAdmin && resetAdmin) {
        setEmailAlerts(true); setDowntimeOnly(false); setAlertEmail('');
        setSnowInstance(''); setSnowUser(''); setSnowToken(''); setSnowAssignGroup('');
        setSmtpHost(''); setSmtpPort('587'); setSmtpUser(''); setSmtpPass(''); setSmtpFrom(''); setSmtpTls('starttls');
        setAiEnabled(false); setAiProvider('openai'); setAiModel('gpt-4.1-mini'); setAiBaseUrl(''); setAiApiKey('');
        setSessionTimeout('60'); setMfa(false); setAllowAllDomains(true); setAllowedDomains([]);
      }

      setConfirmReset(false);
      setResetAdmin(false);
      showToast('Reset to defaults');
    } catch (err: any) {
      window.alert(err?.message || 'Failed to reset settings');
    }
  };

  return (
    <div className="relative">
      <div className="absolute inset-0 -z-10 rounded-xl bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_14px] opacity-60" />
      <div className="space-y-4 max-w-7xl">
      {/* ── Display Timezone ── */}
      <SettingSection icon={Globe} title="Display Timezone" description="Choose the timezone used to display all dates and times in Beacyn.">
        <Field label="Display timezone">
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="h-10 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors">
              <SelectValue>
                {(() => {
                  const tz = TIMEZONES.find(t => t.value === timezone);
                  return tz ? (
                    <span className="flex items-center gap-2">
                      <span className="text-base leading-none">{tz.flag}</span>
                      <span className="font-medium">{tz.label}</span>
                      <span className="text-zinc-400 dark:text-zinc-500 font-mono text-xs">{tz.sub}</span>
                    </span>
                  ) : null;
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
              {TIMEZONES.map(tz => (
                <SelectItem key={tz.value} value={tz.value} className="cursor-pointer">
                  <span className="flex items-center gap-2.5">
                    <span className="text-base leading-none">{tz.flag}</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{tz.label}</span>
                    <span className="text-zinc-400 dark:text-zinc-500 font-mono text-xs ml-1">{tz.sub}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </SettingSection>

      {/* ── Appearance ── */}
      <SettingSection icon={Palette} title="Appearance" description="Switch between light and dark mode and set your preferred language.">
        <Field label="Theme mode">
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-zinc-950">
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System default</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Language">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-zinc-950">
              <SelectItem value="en">EN — English</SelectItem>
              <SelectItem value="fr">FR — Français</SelectItem>
              <SelectItem value="de">DE — Deutsch</SelectItem>
              <SelectItem value="es">ES — Español</SelectItem>
              <SelectItem value="ja">JA — 日本語</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </SettingSection>

      {/* ── Admin-only sections ── */}
      {isAdmin && (
        <>
          {/* ── Notifications ── */}
          <SettingSection adminOnly icon={Bell} title="Notifications" description="Configure when and how Beacyn sends alert notifications.">
            <Field label="Alert recipient email">
              <Input
                type="email"
                placeholder="admin@company.com"
                value={alertEmail}
                onChange={e => setAlertEmail(e.target.value)}
                className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </Field>
            <div className="flex flex-col gap-3 pt-1">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Email alerts</p>
                  <p className="text-xs text-zinc-500">Send email when a monitor status changes</p>
                </div>
                <button
                  onClick={() => setEmailAlerts(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${emailAlerts ? 'bg-zinc-900 dark:bg-zinc-50' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white dark:bg-zinc-900 shadow transition-transform ${emailAlerts ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Downtime only</p>
                  <p className="text-xs text-zinc-500">Only notify on Down events, not recovery</p>
                </div>
                <button
                  onClick={() => setDowntimeOnly(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${downtimeOnly ? 'bg-zinc-900 dark:bg-zinc-50' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white dark:bg-zinc-900 shadow transition-transform ${downtimeOnly ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </label>
            </div>
          </SettingSection>

          {/* ── ServiceNow Integration ── */}
          <SettingSection adminOnly icon={Link2} title="ServiceNow Integration" description="Connect Beacyn to your ServiceNow instance to automatically open incidents when monitors go down.">
            <Field label="Instance URL">
              <Input
                placeholder="https://yourinstance.service-now.com"
                value={snowInstance}
                onChange={e => setSnowInstance(e.target.value)}
                className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </Field>
            <Field label="API Username">
              <Input
                placeholder="svc-beacyn"
                value={snowUser}
                onChange={e => setSnowUser(e.target.value)}
                className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </Field>
            <Field label="API Token / Password">
              <div className="relative">
                <Input
                  type={showSnowToken ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={snowToken}
                  onChange={e => setSnowToken(e.target.value)}
                  className="h-9 text-sm pr-9 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  onClick={() => setShowSnowToken(v => !v)}
                >
                  {showSnowToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
            <Field label="Default Assignment Group">
              <Input
                placeholder="e.g. Network Ops"
                value={snowAssignGroup}
                onChange={e => setSnowAssignGroup(e.target.value)}
                className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </Field>
            <Button variant="outline" size="sm" className="text-xs h-8 border-zinc-200 dark:border-zinc-700">
              Test Connection
            </Button>
          </SettingSection>

          {/* ── SMTP Configuration ── */}
          <SettingSection adminOnly icon={Mail} title="SMTP Configuration" description="Configure outbound email settings for alert delivery.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="SMTP Host">
                <Input
                  placeholder="smtp.gmail.com"
                  value={smtpHost}
                  onChange={e => setSmtpHost(e.target.value)}
                  className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </Field>
              <Field label="Port">
                <Input
                  placeholder="587"
                  value={smtpPort}
                  onChange={e => setSmtpPort(e.target.value)}
                  className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </Field>
            </div>
            <Field label="Username">
              <Input
                placeholder="alerts@company.com"
                value={smtpUser}
                onChange={e => setSmtpUser(e.target.value)}
                className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <Input
                  type={showSmtpPass ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={smtpPass}
                  onChange={e => setSmtpPass(e.target.value)}
                  className="h-9 text-sm pr-9 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  onClick={() => setShowSmtpPass(v => !v)}
                >
                  {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From address">
                <Input
                  placeholder="noreply@company.com"
                  value={smtpFrom}
                  onChange={e => setSmtpFrom(e.target.value)}
                  className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </Field>
              <Field label="Encryption">
                <Select value={smtpTls} onValueChange={setSmtpTls}>
                  <SelectTrigger className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starttls">STARTTLS</SelectItem>
                    <SelectItem value="tls">TLS / SSL</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Button variant="outline" size="sm" className="text-xs h-8 border-zinc-200 dark:border-zinc-700">
              Send test email
            </Button>
          </SettingSection>

          {/* ── AI Integrations ── */}
          <SettingSection adminOnly icon={Bot} title="AI Integrations" description="Configure AI providers for incident insights, summarization, and assistant workflows.">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Enable AI features</p>
                <p className="text-xs text-zinc-500">Use configured provider for AI-powered analysis and recommendations</p>
              </div>
              <button
                onClick={() => setAiEnabled(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${aiEnabled ? 'bg-zinc-900 dark:bg-zinc-50' : 'bg-zinc-200 dark:bg-zinc-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white dark:bg-zinc-900 shadow transition-transform ${aiEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </label>

            <div className={`space-y-4 transition-opacity duration-200 ${aiEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none select-none'}`}>
              <Field label="AI provider">
                <Select value={aiProvider} onValueChange={setAiProvider}>
                  <SelectTrigger className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="azure-openai">Azure OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="google-gemini">Google Gemini</SelectItem>
                    <SelectItem value="ollama">Ollama (Self-hosted)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Model">
                  <Input
                    placeholder="e.g. gpt-4.1-mini"
                    value={aiModel}
                    onChange={e => setAiModel(e.target.value)}
                    className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                  />
                </Field>
                <Field label="Base URL (optional)">
                  <Input
                    placeholder="https://api.openai.com/v1"
                    value={aiBaseUrl}
                    onChange={e => setAiBaseUrl(e.target.value)}
                    className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                  />
                </Field>
              </div>

              <Field label="API Key">
                <div className="relative">
                  <Input
                    type={showAiApiKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    value={aiApiKey}
                    onChange={e => setAiApiKey(e.target.value)}
                    className="h-9 text-sm pr-9 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    onClick={() => setShowAiApiKey(v => !v)}
                  >
                    {showAiApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs h-8 border-zinc-200 dark:border-zinc-700">
                  <KeyRound className="w-3.5 h-3.5 mr-1.5" /> Validate key
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-8 border-zinc-200 dark:border-zinc-700">
                  Test AI connection
                </Button>
              </div>
            </div>
          </SettingSection>

          {/* ── Security ── */}
          <SettingSection adminOnly icon={Shield} title="Security" description="Manage session behaviour and multi-factor authentication settings.">
            <Field label="Session timeout (minutes)">
              <Select value={sessionTimeout} onValueChange={setSessionTimeout}>
                <SelectTrigger className="h-9 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="240">4 hours</SelectItem>
                  <SelectItem value="0">Never</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <label className="flex items-center justify-between cursor-pointer pt-1">
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Multi-factor authentication</p>
                <p className="text-xs text-zinc-500">Require MFA for all admin logins</p>
              </div>
              <button
                onClick={() => setMfa(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${mfa ? 'bg-zinc-900 dark:bg-zinc-50' : 'bg-zinc-200 dark:bg-zinc-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white dark:bg-zinc-900 shadow transition-transform ${mfa ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </label>
          </SettingSection>

          {/* ── Email Domain Restriction ── */}
          <SettingSection
            adminOnly
            icon={AtSign}
            title="Email Domain Restriction"
            description={'Restrict sign-ins to specific email domains. Add one or more domains below, or enable "Allow all" to lift the restriction.'}
          >
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Allow all domains</p>
                <p className="text-xs text-zinc-500">When enabled, any email domain can sign in</p>
              </div>
              <button
                onClick={() => setAllowAllDomains(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${allowAllDomains ? 'bg-zinc-900 dark:bg-zinc-50' : 'bg-zinc-200 dark:bg-zinc-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white dark:bg-zinc-900 shadow transition-transform ${allowAllDomains ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </label>

            <div className={`space-y-3 transition-opacity duration-200 ${allowAllDomains ? 'opacity-40 pointer-events-none select-none' : 'opacity-100'}`}>
              <Field label="Allowed domains">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400">
                      <AtSign className="w-3.5 h-3.5" />
                    </span>
                    <Input
                      placeholder="company.com"
                      value={domainInput}
                      onChange={e => { setDomainInput(e.target.value); setDomainError(''); }}
                      onKeyDown={handleDomainKeyDown}
                      className="h-9 text-sm pl-7 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addDomain}
                    className="h-9 px-3 border-zinc-200 dark:border-zinc-700 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {domainError && (
                  <p className="text-xs text-red-500 mt-1">{domainError}</p>
                )}
              </Field>

              {allowedDomains.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {allowedDomains.map(d => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
                    >
                      <AtSign className="w-3 h-3 text-zinc-400" />
                      {d}
                      <button
                        type="button"
                        onClick={() => removeDomain(d)}
                        className="ml-0.5 text-zinc-400 hover:text-red-500 transition-colors"
                        aria-label={`Remove ${d}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 italic">No domains added — add at least one to enforce the restriction.</p>
              )}
            </div>
          </SettingSection>
        </>
      )}

      {/* ── About ── */}
      <SettingSection icon={Info} title="About" description="Version information and developer credits for Beacyn.">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Version</span>
            <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-50 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-xs">Beacyn 3.5.1</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Signed in as</span>
            <span className="text-zinc-700 dark:text-zinc-300 font-medium capitalize">{currentUser?.username ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Role</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${isAdmin ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
              {isAdmin ? 'Administrator' : (currentUser?.role === 'superuser' ? 'SuperUser' : 'Staff')}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Developer</span>
            <span className="text-zinc-700 dark:text-zinc-300 font-medium">Mackdev Labs</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Repository</span>
            <a
              href="https://github.com/mackdev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium text-xs"
            >
              github.com/mackdev <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Beacyn is an enterprise-grade infrastructure monitoring platform designed for real-time
              observability, incident management, and ServiceNow integration.
            </p>
          </div>
        </div>
      </SettingSection>

      {/* ── Action bar ── */}
      <div className="flex items-center justify-between pt-2 pb-4">
        {/* Reset to defaults */}
        {!confirmReset ? (
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-rose-600 hover:border-rose-300 dark:hover:border-rose-800 dark:hover:text-rose-400 transition-colors"
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset to defaults
          </Button>
        ) : (
          <div className="flex items-center gap-2 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40">
            <span className="text-xs text-rose-700 dark:text-rose-300 font-medium">
              {isAdmin ? 'Reset your preferences?' : 'Reset your preferences?'}
            </span>
            {isAdmin && (
              <label className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetAdmin}
                  onChange={e => setResetAdmin(e.target.checked)}
                  className="w-3 h-3 accent-rose-600"
                />
                Also reset admin settings
              </label>
            )}
            <Button size="sm" className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white border-0" onClick={handleReset}>
              Yes, reset
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setConfirmReset(false); setResetAdmin(false); }}>
              Cancel
            </Button>
          </div>
        )}

        {/* Save */}
        <Button onClick={handleSave} className="px-6 h-9 text-sm font-medium">
          Save settings
        </Button>
      </div>

        <SaveToast show={Boolean(toastMsg)} message={toastMsg} />
      </div>
    </div>
  );
}
