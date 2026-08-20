import type { CompletedSale } from "@/lib/pos/types";
import { addSyncedIds, getSyncedIds } from "./kv";

// Backend base URL. Baked at build time; defaults to the local backend for dev.
// For the packaged app build with: VITE_API_URL=https://<tu-app>.up.railway.app
const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ||
  "http://localhost:3000";

export type SyncOutcome = {
  ok: boolean;
  pushed: number; // sales newly applied on the server this round
  pending: number; // sales still not confirmed
  error?: string;
};

// Sales the backend has not confirmed yet (the outbox).
export function pendingSales(sales: CompletedSale[]): CompletedSale[] {
  const synced = getSyncedIds();
  return sales.filter((s) => !synced.has(s.id));
}

// Map a POS sale to the backend's /sales/sync shape (extra fields are ignored
// server-side by the validation whitelist, but we send a clean payload).
function toPayload(sale: CompletedSale) {
  return {
    id: sale.id,
    folio: sale.folio,
    date: sale.date,
    items: sale.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      serialNumber: i.serialNumber,
      sku: i.sku,
      name: i.name,
      variantLabel: i.variantLabel,
      price: i.price,
      quantity: i.quantity,
    })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    payments: sale.payments.map((p) => ({ method: p.method, amount: p.amount })),
    status: sale.status,
  };
}

export async function syncSales(sales: CompletedSale[]): Promise<SyncOutcome> {
  const pending = pendingSales(sales);
  if (pending.length === 0) return { ok: true, pushed: 0, pending: 0 };

  try {
    const res = await fetch(`${API_BASE}/api/sales/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sales: pending.map(toPayload) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { applied: string[]; skipped: string[] };
    // Both `applied` and `skipped` mean the server now has the sale.
    addSyncedIds([...data.applied, ...data.skipped]);
    return { ok: true, pushed: data.applied.length, pending: pendingSales(sales).length };
  } catch (err) {
    return { ok: false, pushed: 0, pending: pending.length, error: (err as Error).message };
  }
}

export { API_BASE };
