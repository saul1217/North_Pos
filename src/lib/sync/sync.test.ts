import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import type { CompletedSale } from "@/lib/pos/types";
import { LEGACY_FINGERPRINT, saleSyncFingerprint } from "@/lib/sync/fingerprint";
import { getSyncedFingerprints, recordSynced } from "@/lib/sync/kv";
import { changedSales, markSalesFromServer, pendingSales, syncSales, unsyncedSalesCount } from "@/lib/sync/sync";

// Minimal browser globals for the sync module.
const storage = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.window = globalThis;
g.localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, String(v)),
  removeItem: (k: string) => void storage.delete(k),
};
g.dispatchEvent = () => true;
g.CustomEvent = class {};

const V1 = "northbike-pos-synced-v1";
const V2 = "northbike-pos-synced-v2";

function sale(id: string, extra: Partial<CompletedSale> = {}): CompletedSale {
  return {
    id, folio: id, date: "2026-09-26T12:00:00.000Z",
    items: [{ lineId: "l1", productId: "p1", sku: "P1", name: "P1", price: 10, quantity: 2 }],
    subtotal: 20, discount: 0, total: 20, payments: [{ method: "efectivo", amount: 20 }],
    status: "completada", returns: [], ...extra,
  } as unknown as CompletedSale;
}

type Req = { ids: string[] };
let requests: Req[] = [];
let respond: (ids: string[]) => { status?: number; body: unknown } = (ids) => ({ body: { applied: [], skipped: ids, failed: [] } });
g.fetch = async (_url: string, init: { body: string }) => {
  const ids = (JSON.parse(init.body).sales as { id: string }[]).map((s) => s.id);
  requests.push({ ids });
  const { status = 201, body } = respond(ids);
  return { ok: status < 400, status, json: async () => body };
};

beforeEach(() => {
  storage.clear();
  requests = [];
  respond = (ids) => ({ body: { applied: [], skipped: ids, failed: [] } });
});

test("fingerprint only depends on status, cancel reason and sanitized returns", () => {
  const a = sale("a");
  assert.equal(saleSyncFingerprint(a), saleSyncFingerprint({ ...a, total: 999 } as CompletedSale));
  assert.notEqual(saleSyncFingerprint(a), saleSyncFingerprint({ ...a, status: "cancelada" } as CompletedSale));
  const r1 = { id: "r1", date: "d", type: "parcial", items: [{ lineId: "l1", quantity: 1, unitPrice: 10 }] };
  const r1Reordered = { items: [{ unitPrice: 10, quantity: 1, lineId: "l1" }], type: "parcial", date: "d", id: "r1" };
  assert.equal(
    saleSyncFingerprint({ ...a, returns: [r1] } as unknown as CompletedSale),
    saleSyncFingerprint({ ...a, returns: [r1Reordered] } as unknown as CompletedSale),
  );
  // A zero-quantity line is never sent, so it does not count as a change.
  const withZero = { ...r1, items: [...r1.items, { lineId: "l2", quantity: 0, unitPrice: 5 }] };
  assert.equal(
    saleSyncFingerprint({ ...a, returns: [r1] } as unknown as CompletedSale),
    saleSyncFingerprint({ ...a, returns: [withZero] } as unknown as CompletedSale),
  );
});

test("migration: v1 ids become legacy entries (resent once) and v1 keeps being written", () => {
  storage.set(V1, JSON.stringify(["a", "b"]));
  const map = getSyncedFingerprints();
  assert.deepEqual([...map], [["a", LEGACY_FINGERPRINT], ["b", LEGACY_FINGERPRINT]]);
  assert.ok(storage.has(V2));
  const sales = [sale("a"), sale("b"), sale("c")];
  assert.deepEqual(pendingSales(sales).map((s) => s.id), ["c"]);
  assert.deepEqual(changedSales(sales).map((s) => s.id), ["a", "b"]);
  recordSynced([{ id: "c", fingerprint: saleSyncFingerprint(sales[2]) }]);
  assert.deepEqual(JSON.parse(storage.get(V1)!), ["a", "b", "c"]);
  // Ids synced by an older version after a rollback are picked up again.
  storage.set(V1, JSON.stringify(["a", "b", "c", "d"]));
  assert.equal(getSyncedFingerprints().get("d"), LEGACY_FINGERPRINT);
});

test("syncSales: after the one-time resend only new or changed sales are sent", async () => {
  const sales = Array.from({ length: 5 }, (_, i) => sale(`s${i}`));
  await syncSales(sales); // 5 new, one by one
  assert.deepEqual(requests.map((r) => r.ids.length), [1, 1, 1, 1, 1]);
  requests = [];
  const r = await syncSales(sales);
  assert.equal(requests.length, 0, "nothing resent when nothing changed");
  assert.equal(r.pending, 0);
  sales[3] = { ...sales[3], status: "cancelada", cancelReason: "x" } as CompletedSale;
  assert.equal(unsyncedSalesCount(sales), 1);
  await syncSales(sales);
  assert.deepEqual(requests.map((q) => q.ids), [["s3"]]);
  requests = [];
  await syncSales(sales);
  assert.equal(requests.length, 0);
});

test("syncSales: upgrade resend of >100 legacy sales goes in chunks of ≤100, then stops", async () => {
  const sales = Array.from({ length: 230 }, (_, i) => sale(`s${i}`));
  storage.set(V1, JSON.stringify(sales.map((s) => s.id)));
  await syncSales(sales);
  assert.deepEqual(requests.map((q) => q.ids.length), [100, 100, 30]);
  requests = [];
  await syncSales(sales);
  assert.equal(requests.length, 0);
});

test("syncSales: a failing chunk or rejected sale stays pending and is retried", async () => {
  const sales = Array.from({ length: 150 }, (_, i) => sale(`s${i}`));
  storage.set(V1, JSON.stringify(sales.map((s) => s.id)));
  let call = 0;
  respond = (ids) => {
    call += 1;
    if (call === 1) return { status: 400, body: { message: "boom" } };
    return { body: { applied: [], skipped: ids.filter((id) => id !== "s120"), failed: [{ id: "s120", reason: "No puedes modificar esta venta" }] } };
  };
  const r = await syncSales(sales);
  assert.equal(r.error, "boom");
  assert.equal(r.pending, 101); // chunk 1 (100) + rejected s120
  requests = [];
  respond = (ids) => ({ body: { applied: [], skipped: ids, failed: [] } });
  await syncSales(sales);
  assert.deepEqual(requests.map((q) => q.ids.length), [100, 1]);
  assert.equal(unsyncedSalesCount(sales), 0);
});

test("markSalesFromServer: merged server sales are not pushed back", async () => {
  const mine = sale("mine");
  const other = sale("other-cashier", { status: "parcialmente_devuelta", returns: [[]] as unknown as CompletedSale["returns"] });
  await syncSales([mine]);
  requests = [];
  markSalesFromServer([other]);
  const local = [mine, other];
  assert.equal(unsyncedSalesCount(local), 0);
  await syncSales(local);
  assert.equal(requests.length, 0);
});
