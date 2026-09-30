import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import type { CompletedSale, InventoryMovement, PosPersistedState } from "@/lib/pos/types";
import { getDefaultState, loadPosState, POS_STATE_KEY, saveWipedSalesState } from "@/lib/pos/storage";
import { confirmSalePurge, removeSalesState, wipeLocalSalesState } from "@/lib/pos/wipeSales";
import { saleSyncFingerprint } from "@/lib/sync/fingerprint";
import { clearSyncedFingerprints, getSyncedFingerprints, LEGACY_WIPED_KEY, recordSynced } from "@/lib/sync/kv";
import { getWipedSaleIds, setWipedSaleIds } from "@/lib/sync/tombstones";
import { changedSales, pendingSales, pushSalePurge, syncSales, syncSalesRound, unsyncedSalesCount, withoutWipedSales } from "@/lib/sync/sync";

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

// ---- Servidor simulado con la semántica del backend (/sales/sync, /sales/purge) ----
type Req = { path: string; ids: string[] };
class FakeServer {
  sales = new Map<string, CompletedSale>();
  tombstones = new Set<string>();
  stock = 100;
  online = true;
  requests: Req[] = [];
  handle = async (url: string, init: { body: string }) => {
    const path = url.replace(/^.*\/api/, "");
    if (!this.online) throw new TypeError("Failed to fetch");
    const body = JSON.parse(init.body);
    if (path === "/sales/purge") {
      const ids = body.ids as string[];
      this.requests.push({ path, ids });
      for (const id of ids) {
        this.sales.delete(id); // el stock NO cambia
        this.tombstones.add(id);
      }
      return { ok: true, status: 200, json: async () => ({ confirmedIds: ids, keptIds: [] }) };
    }
    const sales = body.sales as CompletedSale[];
    this.requests.push({ path, ids: sales.map((s) => s.id) });
    const out = { applied: [] as string[], skipped: [] as string[], failed: [], deleted: [] as string[] };
    for (const s of sales) {
      if (this.tombstones.has(s.id)) out.deleted.push(s.id);
      else if (this.sales.has(s.id)) {
        this.sales.set(s.id, s);
        out.skipped.push(s.id);
      } else {
        this.sales.set(s.id, s);
        this.stock -= 1;
        out.applied.push(s.id);
      }
    }
    return { ok: true, status: 201, json: async () => out };
  };
}

let server: FakeServer;
beforeEach(() => {
  storage.clear();
  setWipedSaleIds([]);
  server = new FakeServer();
  g.fetch = server.handle;
});

function stateWith(sales: CompletedSale[], extra: Partial<PosPersistedState> = {}): PosPersistedState {
  return { ...getDefaultState(), sales, folioCounter: sales.length, ...extra };
}

test("wipeLocalSalesState borra ventas y sus movimientos, conserva lo demás y encola el borrado", () => {
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
    wipedSaleIds: ["old"],
    pendingSalePurge: ["old"],
  };
  const { state: next, removedSaleIds, removedMovements } = wipeLocalSalesState(state);
  assert.deepEqual(next.sales, []);
  assert.deepEqual(removedSaleIds, ["a", "b", "c"]);
  assert.equal(removedMovements, 3);
  assert.deepEqual(next.movements.map((m) => m.id), ["m4", "m5", "m6"]);
  assert.equal(next.folioCounter, 0);
  assert.deepEqual(next.wipedSaleIds, ["old", "a", "b", "c"]);
  assert.deepEqual(next.pendingSalePurge, ["old", "a", "b", "c"]);
  assert.equal(next.products, state.products);
  assert.equal(next.layaways, state.layaways);
  assert.equal(next.quotations, state.quotations);
  assert.equal(next.workshopOrders, state.workshopOrders);
  assert.equal(next.currentSale, state.currentSale);
  assert.deepEqual([next.layawayFolioCounter, next.quoteFolioCounter, next.workshopFolioCounter], [1, 3, 4]);
  assert.equal(state.sales.length, 3, "el original no se modifica");
  assert.deepEqual(confirmSalePurge(next, ["a", "old"]), ["b", "c"]);
});

test("removeSalesState (ventas borradas en el servidor) no toca movimientos de otra venta con el mismo folio", () => {
  const state = stateWith([sale("other-till", "NB-00003"), sale("mine", "NB-00003"), sale("x", "NB-00004")], {
    movements: [movement("m1", "venta", "NB-00003"), movement("m2", "venta", "NB-00004")],
  });
  const { state: next, removedSaleIds } = removeSalesState(state, ["other-till", "x"]);
  assert.deepEqual(removedSaleIds, ["other-till", "x"]);
  assert.deepEqual(next.sales.map((s) => s.id), ["mine"]);
  assert.deepEqual(next.movements.map((m) => m.id), ["m1"]);
  assert.deepEqual(next.wipedSaleIds, ["other-till", "x"]);
  assert.deepEqual(next.pendingSalePurge, [], "no se encola: el servidor ya las borró");
});

test("borrado + lápidas + cola se guardan juntos y sobreviven a cerrar la app", async () => {
  const { state } = wipeLocalSalesState(stateWith([sale("a", "NB-00001")]));
  await saveWipedSalesState(state);
  const loaded = loadPosState();
  assert.deepEqual(loaded.sales, []);
  assert.deepEqual(loaded.wipedSaleIds, ["a"]);
  assert.deepEqual(loaded.pendingSalePurge, ["a"]);
});

test("migración: la lista de v0.1.21 en localStorage pasa al estado y se quita cuando ya está guardada", () => {
  storage.set(LEGACY_WIPED_KEY, JSON.stringify(["x", "y"]));
  storage.set(POS_STATE_KEY, JSON.stringify(stateWith([])));
  assert.deepEqual(loadPosState().wipedSaleIds, ["x", "y"]);
  assert.ok(storage.has(LEGACY_WIPED_KEY), "se conserva hasta que SQLite la tenga");
  storage.set(POS_STATE_KEY, JSON.stringify(stateWith([], { wipedSaleIds: ["x", "y"] })));
  assert.deepEqual(loadPosState().wipedSaleIds, ["x", "y"]);
  assert.equal(storage.has(LEGACY_WIPED_KEY), false);
});

test("ventas borradas no se vuelven a subir aunque reaparezcan (respaldo restaurado)", async () => {
  const old = [sale("a", "NB-00001"), sale("b", "NB-00002")];
  recordSynced([{ id: "a", fingerprint: saleSyncFingerprint(old[0]) }]);
  setWipedSaleIds(["a", "b"]);
  clearSyncedFingerprints();
  assert.equal(getSyncedFingerprints().size, 0);
  const restored = [{ ...old[0], status: "cancelada" } as CompletedSale, old[1]];
  assert.deepEqual(pendingSales(restored), []);
  assert.deepEqual(changedSales(restored), []);
  assert.equal(unsyncedSalesCount(restored), 0);
  await syncSales(restored);
  assert.equal(server.requests.length, 0);
  await syncSales([sale("n", "NB-00001"), ...restored]);
  assert.deepEqual(server.requests.map((r) => r.ids), [["n"]]);
  assert.deepEqual(withoutWipedSales([sale("a", "1"), sale("z", "2")]).map((s) => s.id), ["z"]);
});

test("una ronda en curso deja de subir las ventas borradas a mitad de camino", async () => {
  const sales = [sale("a", "1"), sale("b", "2"), sale("c", "3")];
  const handle = server.handle;
  g.fetch = async (url: string, init: { body: string }) => {
    setWipedSaleIds(sales.map((s) => s.id)); // se borra durante la primera petición
    return handle(url, init);
  };
  await syncSales(sales);
  assert.deepEqual(server.requests.map((r) => r.ids), [["a"]]);
});

test("sin conexión, cerrar la app y reconectar: el borrado se envía primero y el servidor borra", async () => {
  // La caja subió a y b; luego c quedó sin subir.
  const sales = [sale("a", "NB-00001"), sale("b", "NB-00002"), sale("c", "NB-00003")];
  await syncSales(sales.slice(0, 2));
  assert.equal(server.stock, 98);
  server.requests = [];

  // Sin internet: «Borrar ventas locales».
  server.online = false;
  let persisted = stateWith(sales);
  const { state } = wipeLocalSalesState(persisted);
  setWipedSaleIds(state.wipedSaleIds);
  await saveWipedSalesState(state);
  const offline = await syncSalesRound({ sales: state.sales, pendingPurge: state.pendingSalePurge, canPurge: true, onPurgeConfirmed: () => assert.fail("sin internet no se confirma nada") });
  assert.equal(offline.purge?.ok, false);
  assert.equal(server.sales.size, 2, "sin internet el servidor no cambia");

  // Cierre forzado: la memoria se pierde; al abrir se lee SQLite.
  setWipedSaleIds([]);
  persisted = loadPosState();
  setWipedSaleIds(persisted.wipedSaleIds);
  assert.deepEqual(persisted.pendingSalePurge, ["a", "b", "c"]);

  // Vuelve el internet; hay una venta nueva antes de sincronizar.
  server.online = true;
  const fresh = sale("n", "NB-00001");
  const round = await syncSalesRound({
    sales: [fresh],
    pendingPurge: persisted.pendingSalePurge,
    canPurge: true,
    onPurgeConfirmed: (ids) => { persisted = { ...persisted, pendingSalePurge: confirmSalePurge(persisted, ids) }; },
  });
  assert.equal(round.purge?.ok, true);
  assert.deepEqual(server.requests.map((r) => r.path), ["/sales/purge", "/sales/sync"], "el borrado va antes que las subidas");
  assert.deepEqual(server.requests[0].ids, ["a", "b", "c"]);
  assert.deepEqual([...server.sales.keys()], ["n"]);
  assert.equal(server.stock, 97, "el borrado no repone stock; solo la venta nueva lo descuenta");
  assert.deepEqual(persisted.pendingSalePurge, []);
});

test("borrado pendiente mientras otra caja sigue en línea: sus ventas nuevas se conservan y su cancelación posterior no recrea la venta", async () => {
  // Caja A vendió a y b (subidas). La caja B las descargó.
  const a = sale("a", "NB-00001");
  const b = sale("b", "NB-00002");
  await syncSales([a, b]);
  // Caja B: su propio estado de sincronización (otra computadora).
  const tillB = { sales: [a, b], synced: new Map([["a", saleSyncFingerprint(a)], ["b", saleSyncFingerprint(b)]]) };

  // A borra sin internet: el borrado queda pendiente.
  const { state: tillA } = wipeLocalSalesState(stateWith([a, b]));
  // Mientras tanto B (en línea) vende y cancela «a».
  const bSale = sale("b-new", "NB-00001");
  const cancelledA = { ...a, status: "cancelada", cancelReason: "cliente" } as CompletedSale;
  storage.clear();
  recordSynced([...tillB.synced].map(([id, fingerprint]) => ({ id, fingerprint })));
  const bRound1 = await syncSales([bSale, cancelledA, b]);
  assert.deepEqual(bRound1.deleted, []);
  assert.equal(server.sales.get("a")?.status, "cancelada");

  // A recupera internet: el borrado se envía y borra a y b (no la venta de B).
  const purge = await pushSalePurge(tillA.pendingSalePurge);
  assert.deepEqual(purge, { ok: true, confirmed: ["a", "b"] });
  assert.deepEqual([...server.sales.keys()], ["b-new"]);

  // B hace una devolución de «b» después: el servidor responde «deleted», no la recrea, y B la quita.
  const returnedB = { ...b, status: "devuelta", returns: [{ id: "r", date: "d", type: "total", items: [{ lineId: "l1", productId: "p1", sku: "P1", name: "P1", quantity: 1, unitPrice: 10 }] }] } as CompletedSale;
  const bRound2 = await syncSales([bSale, cancelledA, returnedB]);
  assert.deepEqual(bRound2.deleted, ["b"]);
  assert.equal(server.sales.has("b"), false);
  const bState = removeSalesState(stateWith([bSale, cancelledA, returnedB]), bRound2.deleted).state;
  assert.deepEqual(bState.sales.map((s) => s.id), ["b-new", "a"]);
  assert.ok(bState.wipedSaleIds.includes("b"));
});

test("pushSalePurge: tandas de 500 y se detiene en la primera falla", async () => {
  const ids = Array.from({ length: 1200 }, (_, i) => `s${i}`);
  let calls = 0;
  const handle = server.handle;
  g.fetch = async (url: string, init: { body: string }) => {
    calls += 1;
    if (calls === 3) return { ok: false, status: 403, json: async () => ({ message: "Forbidden resource" }) };
    return handle(url, init);
  };
  const out = await pushSalePurge(ids);
  assert.equal(out.ok, false);
  assert.equal(out.error, "Forbidden resource");
  assert.equal(out.confirmed.length, 1000);
  assert.deepEqual(server.requests.map((r) => r.ids.length), [500, 500]);
});

test("sin el borrado (v0.1.20): tras borrar en el servidor, una venta vieja cancelada en caja se reenvía", async () => {
  const s = sale("a", "NB-00001");
  recordSynced([{ id: "a", fingerprint: saleSyncFingerprint(s) }]);
  await syncSales([s]);
  assert.equal(server.requests.length, 0, "sin cambios no se reenvía");
  await syncSales([{ ...s, status: "cancelada", cancelReason: "x" } as CompletedSale]);
  assert.deepEqual(server.requests.map((r) => r.ids), [["a"]], "un cambio de estado la reenvía completa");
  assert.equal(getWipedSaleIds().size, 0);
});
