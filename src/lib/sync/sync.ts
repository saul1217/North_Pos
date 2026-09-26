import type { CompletedSale } from "@/lib/pos/types";
import { getSyncedFingerprints, recordSynced } from "./kv";
import { saleSyncFingerprint } from "./fingerprint";
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
  error?: string;
};

type SyncFailed = { id: string; reason: string };

type SyncResponse = {
  applied?: string[];
  skipped?: string[];
  failed?: SyncFailed[];
};

// Sales the backend has never confirmed (the outbox of new sales).
export function pendingSales(sales: CompletedSale[]): CompletedSale[] {
  const synced = getSyncedFingerprints();
  return sales.filter((s) => !synced.has(s.id));
}

// Already-synced sales whose status/cancel reason/returns changed since the
// server last confirmed them (or synced before fingerprints existed).
export function changedSales(sales: CompletedSale[]): CompletedSale[] {
  const synced = getSyncedFingerprints();
  return sales.filter((s) => {
    const confirmed = synced.get(s.id);
    return confirmed !== undefined && confirmed !== saleSyncFingerprint(s);
  });
}

// Sales that still need a request: new ones plus pending status changes.
export function unsyncedSalesCount(sales: CompletedSale[]): number {
  const synced = getSyncedFingerprints();
  let count = 0;
  for (const s of sales) {
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
  if (sales.length === 0) return { ok: true, pushed: 0, pending: 0 };

  try {
    let pushed = 0;
    let firstError: string | undefined;
    let pendingSucceeded = 0;

    // One-by-one for new sales so a single poison sale cannot block the outbox,
    // even against an older backend that still rejects the whole batch.
    for (const sale of pending) {
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
      if (failed.length) {
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
      if (!firstError) firstError = merged.errors[0] ?? (merged.failed.length ? merged.failed[0]?.reason || "Venta rechazada" : undefined);
    }

    const stillPending = unsyncedSalesCount(sales);
    // ok when nothing was pending, or at least one pending sale landed.
    const ok = pending.length === 0 || pendingSucceeded > 0;
    return {
      ok,
      pushed,
      pending: stillPending,
      ...(firstError ? { error: firstError } : {}),
    };
  } catch (err) {
    return { ok: false, pushed: 0, pending: unsyncedSalesCount(sales), error: (err as Error).message };
  }
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
