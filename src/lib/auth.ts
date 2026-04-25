export interface StoredUser {
  username: string;
  role: 'admin' | 'staff' | 'superuser' | 'viewer';
  token: string;
  expiresAt?: number;
}

const STORAGE_KEY = 'pulseiq.auth';
const TIMEZONE_KEY = 'pulseiq.settings.timezone';
const THEME_KEY = 'theme';

export function getStoredUser(): StoredUser | null {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.username || !parsed?.role || !parsed?.token) return null;
    
    // Check local 24-hour expiration threshold
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    
    return parsed as StoredUser;
  } catch {
    return null;
  }
}

export function setStoredUser(u: StoredUser): void {
  const secureUser = {
    ...u,
    expiresAt: u.expiresAt || Date.now() + 24 * 60 * 60 * 1000 // default 24 hour lifespan
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(secureUser));
}

export function clearStoredUser(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function authHeaders(): Record<string, string> {
  const user = getStoredUser();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user?.token) {
    headers['Authorization'] = `Bearer ${user.token}`;
  }
  return headers;
}

/** Persist timezone so all pages can apply it for date formatting. */
export function setStoredTimezone(tz: string): void {
  localStorage.setItem(TIMEZONE_KEY, tz);
  // Notify other components (e.g. MainLayout clock)
  window.dispatchEvent(new CustomEvent('pulseiq:settings', { detail: { timezone: tz } }));
}

export function getStoredTimezone(): string {
  return localStorage.getItem(TIMEZONE_KEY) || 'UTC';
}

/** Apply a theme value to the document and persist it. */
export function applyTheme(theme: string): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    localStorage.setItem(THEME_KEY, 'dark');
  } else if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
    localStorage.removeItem(THEME_KEY);
  } else {
    root.classList.remove('dark');
    localStorage.setItem(THEME_KEY, 'light');
  }
  window.dispatchEvent(new CustomEvent('pulseiq:settings', { detail: { theme } }));
}
