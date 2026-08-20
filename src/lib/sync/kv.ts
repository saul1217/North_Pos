// Cursor of sale ids already confirmed by the backend. Kept in localStorage
// (persists in both the browser and Electron's renderer). It is ONLY a cursor:
// losing it just means re-pushing sales, which the backend handles
// idempotently. The durable sale data itself lives in the POS state (SQLite).
const SYNCED_KEY = "northbike-pos-synced-v1";

export function getSyncedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SYNCED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function addSyncedIds(ids: string[]): void {
  if (typeof window === "undefined" || ids.length === 0) return;
  const set = getSyncedIds();
  for (const id of ids) set.add(id);
  localStorage.setItem(SYNCED_KEY, JSON.stringify([...set]));
}
