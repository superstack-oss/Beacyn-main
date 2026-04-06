const rawApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

// In production, set VITE_API_BASE_URL (e.g. https://your-backend.example.com).
// In local development, fallback to localhost backend.
const API_BASE = rawApiBase && rawApiBase.length > 0
  ? rawApiBase.replace(/\/$/, '')
  : 'http://localhost:3001';

export function apiUrl(path: string) {
  if (!path.startsWith('/')) return `${API_BASE}/${path}`;
  return `${API_BASE}${path}`;
}

export { API_BASE };
