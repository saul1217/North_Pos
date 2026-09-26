import { LEGACY_FINGERPRINT } from "./fingerprint";

// Cursor de sincronización, en localStorage (persiste en el navegador y en el
// renderer de Electron). Es SOLO un cursor: perderlo implica reenviar ventas,
// que el backend procesa de forma idempotente. Los datos de las ventas viven
// en el estado del POS (SQLite).
//
// v2: id de venta → huella de lo último que el servidor confirmó. Una venta
// cuya huella actual difiere tiene un cambio pendiente (cancelación/devolución).
// v1 (lista de ids) se sigue escribiendo durante una versión para que volver a
// una versión anterior no reenvíe todas las ventas como nuevas.
const SYNCED_V1_KEY = "northbike-pos-synced-v1";
const SYNCED_V2_KEY = "northbike-pos-synced-v2";

function readV1(): string[] {
  try {
    const raw = localStorage.getItem(SYNCED_V1_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function readV2(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(SYNCED_V2_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/**
 * Mapa id → huella confirmada. Migración: los ids de v1 que no estén en v2
 * (primera ejecución tras actualizar, o ventas sincronizadas por una versión
 * anterior tras un retroceso) entran con huella desconocida, así se reenvían
 * una vez (en tandas) y a partir de ahí solo cuando cambian.
 */
export function getSyncedFingerprints(): Map<string, string> {
  if (typeof window === "undefined") return new Map();
  const v2 = readV2();
  const map = new Map<string, string>(Object.entries(v2 ?? {}).filter(([, fp]) => typeof fp === "string"));
  let migrated = v2 === null;
  for (const id of readV1()) {
    if (!map.has(id)) {
      map.set(id, LEGACY_FINGERPRINT);
      migrated = true;
    }
  }
  if (migrated) writeV2(map);
  return map;
}

function writeV2(map: Map<string, string>) {
  localStorage.setItem(SYNCED_V2_KEY, JSON.stringify(Object.fromEntries(map)));
}

export function getSyncedIds(): Set<string> {
  return new Set(getSyncedFingerprints().keys());
}

/** Registra lo que el servidor confirmó (o lo que vino del servidor). */
export function recordSynced(entries: { id: string; fingerprint: string }[]): void {
  if (typeof window === "undefined" || entries.length === 0) return;
  const map = getSyncedFingerprints();
  let changed = false;
  for (const { id, fingerprint } of entries) {
    if (map.get(id) !== fingerprint) {
      map.set(id, fingerprint);
      changed = true;
    }
  }
  if (changed) writeV2(map);
  // Compatibilidad hacia atrás (una versión): mantener también la lista v1.
  const v1 = new Set(readV1());
  const before = v1.size;
  for (const { id } of entries) v1.add(id);
  if (v1.size !== before) localStorage.setItem(SYNCED_V1_KEY, JSON.stringify([...v1]));
}
