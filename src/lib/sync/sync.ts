import type { CompletedSale } from "@/lib/pos/types";
import { getSyncedFingerprints, recordSynced } from "./kv";
import { getWipedSaleIds } from "./tombstones";
import { LEGACY_FINGERPRINT, saleSyncFingerprint } from "./fingerprint";
import { postInChunks } from "./chunks";
import { clearAuthSession, getAccessToken } from "@/lib/auth";
import { sanitizeReturnsForSync } from "@/lib/pos/quantities";

// Backend base URL. Baked at build time; defaults to the local backend for dev.
// For the packaged app build with: VITE_API_URL=https://<tu-app>.up.railway.app
const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ||
  "http://localhost:3000";

export type SyncOutcome = {
  ok: boolean;
  pushed: number; // sales newly applied on the server this round
  pending: number; // sales still not confirmed (new + pending status changes)
  /** Ventas que el servidor reporta como borradas: se quitan de esta caja. */
  deleted: string[];
  error?: string;
};

type SyncFailed = { id: string; reason: string };

type SyncResponse = {
  applied?: string[];
  skipped?: string[];
  failed?: SyncFailed[];
  deleted?: string[];
};

// Ventas borradas con «Borrar ventas locales» no se suben ni se vuelven a
// guardar, aunque reaparezcan (respaldo restaurado u otra caja que las reenvió).
export function withoutWipedSales(sales: CompletedSale[]): CompletedSale[] {
  const wiped = getWipedSaleIds();
  return wiped.size === 0 ? sales : sales.filter((s) => !wiped.has(s.id));
}

// Sales the backend has never confirmed (the outbox of new sales).
export function pendingSales(sales: CompletedSale[]): CompletedSale[] {
  const synced = getSyncedFingerprints();
  return withoutWipedSales(sales).filter((s) => !synced.has(s.id));
}

// Already-synced sales whose status/cancel reason/returns changed since the
// server last confirmed them (or synced before fingerprints existed).
export function changedSales(sales: CompletedSale[]): CompletedSale[] {
  const synced = getSyncedFingerprints();
  return withoutWipedSales(sales).filter((s) => {
    const confirmed = synced.get(s.id);
    return confirmed !== undefined && confirmed !== saleSyncFingerprint(s);
  });
}

// Sales that still need a request: new ones plus pending status changes.
export function unsyncedSalesCount(sales: CompletedSale[]): number {
  const synced = getSyncedFingerprints();
  let count = 0;
  for (const s of withoutWipedSales(sales)) {
    const confirmed = synced.get(s.id);
    if (confirmed === undefined || confirmed !== saleSyncFingerprint(s)) count += 1;
  }
  return count;
}

// Sales that arrived from the server (GET /sales) are, by definition, what the
// server has: record their fingerprint so they are not pushed back.
export function markSalesFromServer(sales: CompletedSale[]): void {
  recordSynced(sales.map((s) => ({ id: s.id, fingerprint: saleSyncFingerprint(s) })));
}

// Every sale returned by GET /sales exists on the server. If this till has no
// confirmed fingerprint for it yet (never recorded, or legacy from v1), take
// the server's state as the baseline: a local copy identical to the server's
// is no longer "pending" (e.g. sales merged before this version that the
// server rejects on resend: 1.5-unit lines, «no puede regresar a un estado
// anterior»), while a real local change (cancel/return) still differs and is
// sent. Known fingerprints are left alone.
export function recordServerBaseline(remoteSales: CompletedSale[]): void {
  const synced = getSyncedFingerprints();
  recordSynced(
    remoteSales
      .filter((s) => {
        const known = synced.get(s.id);
        return known === undefined || known === LEGACY_FINGERPRINT;
      })
      .map((s) => ({ id: s.id, fingerprint: saleSyncFingerprint(s) })),
  );
}

// Map a POS sale to the backend's /sales/sync shape (extra fields are ignored
// server-side by the validation whitelist, but we send a clean payload).
function toPayload(sale: CompletedSale) {
  return {
    id: sale.id,
    folio: sale.folio,
    date: sale.date,
    items: sale.items.map((i) => ({
      lineId: i.lineId,
      productId: i.productId,
      variantId: i.variantId,
      serialNumber: i.serialNumber,
      sku: i.sku,
      name: i.name,
      variantLabel: i.variantLabel,
      price: i.price,
      quantity: i.quantity,
      lineDiscount: i.lineDiscount,
    })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    payments: sale.payments.map((p) => ({ method: p.method, amount: p.amount })),
    status: sale.status,
    amountReceived: sale.amountReceived,
    change: sale.change,
    cancelReason: sale.cancelReason,
    // Nunca enviar líneas de devolución con cantidad 0 (el servidor rechaza la venta completa).
    returns: sanitizeReturnsForSync(sale.returns),
  };
}

function parseErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const message = (body as { message?: string | string[] }).message;
    if (typeof message === "string" && message.trim()) return message;
    if (Array.isArray(message) && message.length) return message.join("; ");
  }
  return `HTTP ${status}`;
}

async function postSalesBatch(
  payloadSales: ReturnType<typeof toPayload>[],
): Promise<{ okHttp: boolean; data: SyncResponse | null; error?: string }> {
  const res = await fetch(`${API_BASE}/api/sales/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
    },
    body: JSON.stringify({ sales: payloadSales }),
  });
  if (res.status === 401 && typeof window !== "undefined") {
    clearAuthSession();
    window.dispatchEvent(new CustomEvent("northbike-auth-expired"));
  }

  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    raw = null;
  }

  if (!res.ok) {
    return { okHttp: false, data: null, error: parseErrorMessage(res.status, raw) };
  }
  return { okHttp: true, data: (raw as SyncResponse) ?? null };
}

function recordConfirmed(sent: CompletedSale[], ids: string[]) {
  const confirmed = new Set(ids);
  recordSynced(
    sent.filter((s) => confirmed.has(s.id)).map((s) => ({ id: s.id, fingerprint: saleSyncFingerprint(s) })),
  );
}

export async function syncSales(sales: CompletedSale[]): Promise<SyncOutcome> {
  const pending = pendingSales(sales);
  if (sales.length === 0) return { ok: true, pushed: 0, pending: 0, deleted: [] };

  try {
    let pushed = 0;
    let firstError: string | undefined;
    let pendingSucceeded = 0;
    const deleted: string[] = [];

    // One-by-one for new sales so a single poison sale cannot block the outbox,
    // even against an older backend that still rejects the whole batch.
    for (const sale of pending) {
      // Si se borraron las ventas locales mientras esta ronda estaba en curso,
      // no subir las que quedaban en la lista.
      if (getWipedSaleIds().has(sale.id)) continue;
      const result = await postSalesBatch([toPayload(sale)]);
      if (!result.okHttp) {
        if (!firstError) firstError = result.error;
        continue;
      }
      const applied = result.data?.applied ?? [];
      const skipped = result.data?.skipped ?? [];
      const failed = result.data?.failed ?? [];
      recordConfirmed([sale], [...applied, ...skipped]);
      pushed += applied.length;
      if (result.data?.deleted?.includes(sale.id)) {
        deleted.push(sale.id);
        pendingSucceeded += 1;
      } else if (failed.length) {
        if (!firstError) firstError = failed[0]?.reason || "Venta rechazada";
      } else if (applied.length > 0 || skipped.length > 0) {
        pendingSucceeded += 1;
      }
    }

    // Only already-synced sales with a pending change (cancel/return) are
    // resent, in chunks of ≤100 (backend limit); one failing chunk does not
    // stop the others. Rejected ones keep their old fingerprint and retry.
    const updates = changedSales(sales);
    if (updates.length > 0) {
      const merged = await postInChunks(updates.map(toPayload), postSalesBatch);
      recordConfirmed(updates, [...merged.applied, ...merged.skipped]);
      pushed += merged.applied.length;
      deleted.push(...merged.deleted);
      if (!firstError) firstError = merged.errors[0] ?? (merged.failed.length ? merged.failed[0]?.reason || "Venta rechazada" : undefined);
    }

    const gone = new Set(deleted);
    const stillPending = unsyncedSalesCount(gone.size ? sales.filter((s) => !gone.has(s.id)) : sales);
    // ok when nothing was pending, or at least one pending sale landed.
    const ok = pending.length === 0 || pendingSucceeded > 0;
    return {
      ok,
      pushed,
      pending: stillPending,
      deleted,
      ...(firstError ? { error: firstError } : {}),
    };
  } catch (err) {
    return { ok: false, pushed: 0, pending: unsyncedSalesCount(sales), deleted: [], error: (err as Error).message };
  }
}

// ---- Borrado en el servidor («Borrar ventas locales») ----

export const MAX_PURGE_IDS_PER_REQUEST = 500;

export type PurgeOutcome = {
  ok: boolean;
  /** Ids que el servidor ya no tiene ni aceptará: salen de la cola. */
  confirmed: string[];
  error?: string;
};

type PurgeResponse = { confirmedIds?: string[]; keptIds?: string[] };

/**
 * Envía el borrado pendiente en tandas. Idempotente en el servidor: reintentar
 * ids ya borrados o desconocidos es seguro. Se detiene en la primera tanda que
 * falla (sin internet, sesión sin permisos, error del servidor).
 */
export async function pushSalePurge(ids: string[]): Promise<PurgeOutcome> {
  const confirmed: string[] = [];
  for (let i = 0; i < ids.length; i += MAX_PURGE_IDS_PER_REQUEST) {
    const batch = ids.slice(i, i + MAX_PURGE_IDS_PER_REQUEST);
    try {
      const res = await fetch(`${API_BASE}/api/sales/purge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        },
        body: JSON.stringify({ ids: batch }),
      });
      if (res.status === 401 && typeof window !== "undefined") {
        clearAuthSession();
        window.dispatchEvent(new CustomEvent("northbike-auth-expired"));
      }
      let raw: unknown = null;
      try {
        raw = await res.json();
      } catch {
        raw = null;
      }
      if (!res.ok) return { ok: false, confirmed, error: parseErrorMessage(res.status, raw) };
      const data = (raw ?? {}) as PurgeResponse;
      // Las ventas de e-commerce («kept») no se borran desde el POS; tampoco se reintentan.
      const done = new Set([...(data.confirmedIds ?? []), ...(data.keptIds ?? [])]);
      confirmed.push(...batch.filter((id) => done.has(id)));
      if (batch.some((id) => !done.has(id))) {
        return { ok: false, confirmed, error: "El servidor no confirmó el borrado de todas las ventas" };
      }
    } catch (err) {
      return { ok: false, confirmed, error: (err as Error).message || "Sin conexión" };
    }
  }
  return { ok: true, confirmed };
}

/**
 * Una ronda de sincronización de ventas: primero el borrado pendiente (si esta
 * sesión puede hacerlo) y después las subidas. Así el servidor borra antes de
 * recibir nada nuevo de esta caja.
 */
export async function syncSalesRound(input: {
  sales: CompletedSale[];
  pendingPurge: string[];
  canPurge: boolean;
  onPurgeConfirmed: (ids: string[]) => void;
}): Promise<{ purge: PurgeOutcome | null; outcome: SyncOutcome }> {
  let purge: PurgeOutcome | null = null;
  if (input.canPurge && input.pendingPurge.length > 0) {
    purge = await pushSalePurge(input.pendingPurge);
    if (purge.confirmed.length > 0) input.onPurgeConfirmed(purge.confirmed);
  }
  const outcome = await syncSales(input.sales);
  return { purge, outcome };
}

export async function fetchSales(): Promise<CompletedSale[]> {
  const res = await fetch(`${API_BASE}/api/sales`, {
    headers: {
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
    },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    clearAuthSession();
    window.dispatchEvent(new CustomEvent("northbike-auth-expired"));
  }
  if (!res.ok) {
    let raw: unknown = null;
    try {
      raw = await res.json();
    } catch {
      raw = null;
    }
    throw new Error(parseErrorMessage(res.status, raw));
  }
  return (await res.json()) as CompletedSale[];
}

export { API_BASE };
