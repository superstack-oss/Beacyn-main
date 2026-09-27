const rawApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

function normalizeApiBase(base: string | undefined) {
  if (!base) return '';
  const clean = base.trim().replace(/\/$/, '');
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean)) {
    return 'http://localhost:5145';
  }
  return clean;
}

// In production, set VITE_API_BASE_URL (e.g. https://your-backend.example.com).
// In local development, fallback to the static backend port.
const API_BASE = (() => {
  if (rawApiBase && rawApiBase.length > 0) return normalizeApiBase(rawApiBase);

  // For multi-device usage: if you deploy the frontend + backend together behind a reverse proxy,
  // the API can be reached at the same origin (relative URLs).
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5145';
  }

  return '';
})();

export function apiUrl(path: string) {
  if (!path.startsWith('/')) return `${API_BASE}/${path}`;
  return `${API_BASE}${path}`;
}

export { API_BASE };
