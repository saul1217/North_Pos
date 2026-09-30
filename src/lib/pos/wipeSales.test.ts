import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import type { CompletedSale, InventoryMovement, PosPersistedState } from "@/lib/pos/types";
import { getDefaultState } from "@/lib/pos/storage";
import { wipeLocalSalesState } from "@/lib/pos/wipeSales";
import { saleSyncFingerprint } from "@/lib/sync/fingerprint";
import { addWipedSaleIds, clearSyncedFingerprints, getSyncedFingerprints, getWipedSaleIds, recordSynced } from "@/lib/sync/kv";
import { changedSales, pendingSales, syncSales, unsyncedSalesCount, withoutWipedSales } from "@/lib/sync/sync";

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

let requests: string[][] = [];
g.fetch = async (_url: string, init: { body: string }) => {
  const ids = (JSON.parse(init.body).sales as { id: string }[]).map((s) => s.id);
  requests.push(ids);
  return { ok: true, status: 201, json: async () => ({ applied: ids, skipped: [], failed: [] }) };
};

function sale(id: string, folio: string, extra: Partial<CompletedSale> = {}): CompletedSale {
  return {
    id, folio, date: "2026-09-29T12:00:00.000Z",
    items: [{ lineId: "l1", productId: "p1", sku: "P1", name: "P1", price: 10, quantity: 1 }],
    subtotal: 10, discount: 0, total: 10, payments: [{ method: "efectivo", amount: 10 }],
    status: "completada", returns: [], ...extra,
  } as CompletedSale;
}

function movement(id: string, type: InventoryMovement["type"], reference: string): InventoryMovement {
  return { id, date: "d", productId: "p1", productName: "P1", type, quantity: -1, stockBefore: 5, stockAfter: 4, reference, user: "admin" };
}

beforeEach(() => {
  storage.clear();
  requests = [];
});

test("wipeLocalSalesState borra ventas y sus movimientos, y conserva todo lo demás", () => {
  const base = getDefaultState();
  const state: PosPersistedState = {
    ...base,
    products: [{ id: "p1", stock: 4 } as PosPersistedState["products"][number]],
    sales: [sale("a", "NB-00001"), sale("b", "NB-00002", { status: "cancelada" }), sale("c", "AP-0001")],
    movements: [
      movement("m1", "venta", "NB-00001"),
      movement("m2", "cancelacion", "NB-00002"),
      movement("m3", "devolucion", "NB-00001"),
      movement("m4", "entrada", "REC-1"),
      movement("m5", "apartado", "AP-0001"),
      movement("m6", "ajuste", "NB-00001"),
    ],
    layaways: [{ id: "l" } as PosPersistedState["layaways"][number]],
    quotations: [{ id: "q" } as PosPersistedState["quotations"][number]],
    workshopOrders: [{ id: "w", saleId: "a" } as PosPersistedState["workshopOrders"][number]],
    folioCounter: 2,
    layawayFolioCounter: 1,
    quoteFolioCounter: 3,
    workshopFolioCounter: 4,
    currentSale: { items: [sale("x", "x").items[0]], discount: 0, discountType: "fixed" },
  };
  const { state: next, removedSaleIds, removedMovements } = wipeLocalSalesState(state);
  assert.deepEqual(next.sales, []);
  assert.deepEqual(removedSaleIds, ["a", "b", "c"]);
  assert.equal(removedMovements, 3);
  assert.deepEqual(next.movements.map((m) => m.id), ["m4", "m5", "m6"]);
  assert.equal(next.folioCounter, 0);
  assert.equal(next.products, state.products);
  assert.equal(next.layaways, state.layaways);
  assert.equal(next.quotations, state.quotations);
  assert.equal(next.workshopOrders, state.workshopOrders);
  assert.equal(next.currentSale, state.currentSale);
  assert.equal(next.layawayFolioCounter, 1);
  assert.equal(next.quoteFolioCounter, 3);
  assert.equal(next.workshopFolioCounter, 4);
  // El original no se modifica.
  assert.equal(state.sales.length, 3);
});

test("ventas borradas no se vuelven a subir aunque reaparezcan (respaldo restaurado)", async () => {
  const old = [sale("a", "NB-00001"), sale("b", "NB-00002")];
  recordSynced([{ id: "a", fingerprint: saleSyncFingerprint(old[0]) }]);
  addWipedSaleIds(old.map((s) => s.id));
  clearSyncedFingerprints();
  assert.equal(getSyncedFingerprints().size, 0);
  assert.deepEqual([...getWipedSaleIds()], ["a", "b"]);
  const restored = [{ ...old[0], status: "cancelada" } as CompletedSale, old[1]];
  assert.deepEqual(pendingSales(restored), []);
  assert.deepEqual(changedSales(restored), []);
  assert.equal(unsyncedSalesCount(restored), 0);
  const res = await syncSales(restored);
  assert.equal(requests.length, 0);
  assert.equal(res.pending, 0);
  // Una venta nueva después del borrado sí se sube.
  await syncSales([sale("n", "NB-00001"), ...restored]);
  assert.deepEqual(requests, [["n"]]);
});

test("ventas borradas que devuelve el servidor u otra caja no se vuelven a guardar", () => {
  addWipedSaleIds(["a"]);
  assert.deepEqual(withoutWipedSales([sale("a", "NB-00001"), sale("z", "NB-00009")]).map((s) => s.id), ["z"]);
});

test("una ronda en curso deja de subir las ventas borradas a mitad de camino", async () => {
  const sales = [sale("a", "1"), sale("b", "2"), sale("c", "3")];
  g.fetch = async (_url: string, init: { body: string }) => {
    const ids = (JSON.parse(init.body).sales as { id: string }[]).map((s) => s.id);
    requests.push(ids);
    addWipedSaleIds(sales.map((s) => s.id)); // se borra durante la primera petición
    return { ok: true, status: 201, json: async () => ({ applied: ids, skipped: [], failed: [] }) };
  };
  await syncSales(sales);
  assert.deepEqual(requests, [["a"]]);
});

test("sin el borrado (v0.1.20): tras borrar en el servidor, una venta vieja cancelada en caja se reenvía", async () => {
  const s = sale("a", "NB-00001");
  recordSynced([{ id: "a", fingerprint: saleSyncFingerprint(s) }]);
  requests = [];
  await syncSales([s]);
  assert.equal(requests.length, 0, "sin cambios no se reenvía");
  await syncSales([{ ...s, status: "cancelada", cancelReason: "x" } as CompletedSale]);
  assert.deepEqual(requests, [["a"]], "un cambio de estado la reenvía completa (el servidor la recrea)");
});
