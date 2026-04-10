// In dev, Vite proxies /tasks → localhost:3001 so BASE is empty.
// In production (Docker), set VITE_API_URL=http://localhost:3001
const BASE = import.meta.env.VITE_API_URL ?? '';

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  return res;
}
