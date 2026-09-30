import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import type { CompletedSale, InventoryMovement, PosPersistedState } from "@/lib/pos/types";
import { getDefaultState, loadPosState, POS_STATE_KEY, saveWipedSalesState } from "@/lib/pos/storage";
import { confirmSalePurge, removeSalesState, wipeLocalSalesState } from "@/lib/pos/wipeSales";
import { DOWNLOADED_ORIGIN, splitSalesByOrigin, withLocalOrigin } from "@/lib/pos/saleOrigin";
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

const TILL_A = "aaaaaaaa-0000-4000-8000-000000000001";
const TILL_B = "bbbbbbbb-0000-4000-8000-000000000002";

function sale(id: string, folio: string, extra: Partial<CompletedSale> = {}): CompletedSale {
  return {
    id, folio, date: "2026-09-29T12:00:00.000Z",
    items: [{ lineId: "l1", productId: "p1", sku: "P1", name: "P1", price: 10, quantity: 1 }],
    subtotal: 10, discount: 0, total: 10, payments: [{ method: "efectivo", amount: 10 }],
    status: "completada", returns: [], originTillId: TILL_A, ...extra,
  } as CompletedSale;
}

function movement(id: string, type: InventoryMovement["type"], reference: string): InventoryMovement {
  return { id, date: "d", productId: "p1", productName: "P1", type, quantity: -1, stockBefore: 5, stockAfter: 4, reference, user: "admin" };
}

// ---- Servidor simulado con la semántica del backend (/sales/sync, /sales/purge) ----
type Req = { path: string; ids: string[] };
class FakeServer {
  sales = new Map<string, CompletedSale & { terminalId?: string }>();
  tombstones = new Map<string, string | null>();
  stock = 100;
  online = true;
  requests: Req[] = [];
  handle = async (url: string, init: { body: string }) => {
    const path = url.replace(/^.*\/api/, "");
    if (!this.online) throw new TypeError("Failed to fetch");
    const body = JSON.parse(init.body);
    if (path === "/sales/purge") {
      const ids = body.ids as string[];
      const terminalId = body.terminalId as string;
      this.requests.push({ path, ids });
      if (!terminalId) return { ok: false, status: 400, json: async () => ({ message: "terminalId inválido" }) };
      const confirmedIds: string[] = [];
      const keptIds: string[] = [];
      for (const id of ids) {
        const existing = this.sales.get(id);
        if (existing && existing.terminalId !== terminalId) {
          keptIds.push(id); // no es de esta caja: no se toca
          continue;
        }
        if (existing) this.sales.delete(id); // el stock NO cambia
        if (!this.tombstones.has(id)) this.tombstones.set(id, terminalId);
        confirmedIds.push(id);
      }
      return { ok: true, status: 200, json: async () => ({ confirmedIds, keptIds }) };
    }
    const sales = body.sales as CompletedSale[];
    this.requests.push({ path, ids: sales.map((s) => s.id) });
    const out = { applied: [] as string[], skipped: [] as string[], failed: [], deleted: [] as string[] };
    for (const s of sales as (CompletedSale & { terminalId?: string })[]) {
      const tomb = this.tombstones.get(s.id);
      if (this.tombstones.has(s.id) && (!tomb || !s.terminalId || s.terminalId === tomb)) out.deleted.push(s.id);
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
  return { ...getDefaultState(), tillId: TILL_A, sales, folioCounter: sales.length, ...extra };
}

test("wipeLocalSalesState borra ventas y sus movimientos, conserva lo demás y encola el borrado", () => {
  const base = getDefaultState();
  const state: PosPersistedState = {
    ...base,
    tillId: TILL_A,
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
    serverPurgeQueue: ["old"],
  };
  const { state: next, removedSaleIds, removedMovements, serverSaleIds } = wipeLocalSalesState(state);
  assert.deepEqual(serverSaleIds, ["a", "b", "c"]);
  assert.deepEqual(next.sales, []);
  assert.deepEqual(removedSaleIds, ["a", "b", "c"]);
  assert.equal(removedMovements, 3);
  assert.deepEqual(next.movements.map((m) => m.id), ["m4", "m5", "m6"]);
  assert.equal(next.folioCounter, 0);
  assert.deepEqual(next.wipedSaleIds, ["old", "a", "b", "c"]);
  assert.deepEqual(next.serverPurgeQueue, ["old", "a", "b", "c"]);
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
  assert.deepEqual(next.serverPurgeQueue, [], "no se encola: el servidor ya las borró");
});

test("borrado + lápidas + cola se guardan juntos y sobreviven a cerrar la app", async () => {
  const { state } = wipeLocalSalesState(stateWith([sale("a", "NB-00001")]));
  await saveWipedSalesState(state);
  const loaded = loadPosState();
  assert.deepEqual(loaded.sales, []);
  assert.deepEqual(loaded.wipedSaleIds, ["a"]);
  assert.deepEqual(loaded.serverPurgeQueue, ["a"]);
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
  const offline = await syncSalesRound({ tillId: TILL_A, sales: state.sales, pendingPurge: state.serverPurgeQueue, canPurge: true, onPurgeConfirmed: () => assert.fail("sin internet no se confirma nada") });
  assert.equal(offline.purge?.ok, false);
  assert.equal(server.sales.size, 2, "sin internet el servidor no cambia");

  // Cierre forzado: la memoria se pierde; al abrir se lee SQLite.
  setWipedSaleIds([]);
  persisted = loadPosState();
  setWipedSaleIds(persisted.wipedSaleIds);
  assert.deepEqual(persisted.serverPurgeQueue, ["a", "b", "c"]);

  // Vuelve el internet; hay una venta nueva antes de sincronizar.
  server.online = true;
  const fresh = sale("n", "NB-00001");
  const round = await syncSalesRound({
    tillId: TILL_A,
    sales: [fresh],
    pendingPurge: persisted.serverPurgeQueue,
    canPurge: true,
    onPurgeConfirmed: (ids) => { persisted = { ...persisted, serverPurgeQueue: confirmSalePurge(persisted, ids) }; },
  });
  assert.equal(round.purge?.ok, true);
  assert.deepEqual(server.requests.map((r) => r.path), ["/sales/purge", "/sales/sync"], "el borrado va antes que las subidas");
  assert.deepEqual(server.requests[0].ids, ["a", "b", "c"]);
  assert.deepEqual([...server.sales.keys()], ["n"]);
  assert.equal(server.stock, 97, "el borrado no repone stock; solo la venta nueva lo descuenta");
  assert.deepEqual(persisted.serverPurgeQueue, []);
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
  const purge = await pushSalePurge(tillA.serverPurgeQueue, TILL_A);
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
  const out = await pushSalePurge(ids, TILL_A);
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

test("origen: sello local, descargas marcadas y nunca se acepta un sello del servidor", () => {
  const local = sale("a", "NB-00001");
  const remote = { ...local, status: "cancelada", originTillId: TILL_B } as CompletedSale;
  assert.equal(withLocalOrigin(remote, local).originTillId, TILL_A, "conserva el sello local");
  assert.equal(withLocalOrigin(remote, undefined).originTillId, DOWNLOADED_ORIGIN, "nueva para esta caja = descargada");
  const legacy = sale("l", "NB-00002", { originTillId: undefined });
  assert.equal(withLocalOrigin(remote, legacy).originTillId, undefined, "legado sigue desconocido");
  const split = splitSalesByOrigin([local, sale("d", "NB-9", { originTillId: DOWNLOADED_ORIGIN }), legacy], TILL_A);
  assert.deepEqual([split.mine.map((s) => s.id), split.downloaded.map((s) => s.id), split.unknown.map((s) => s.id)], [["a"], ["d"], ["l"]]);
});

test("la caja A borra con ventas descargadas de B: el servidor NO borra las ventas de B", async () => {
  // B crea y sube b1; A crea y sube a1 y descarga b1.
  const b1 = sale("b1", "NB-00001", { originTillId: TILL_B });
  const a1 = sale("a1", "NB-00001");
  const legacyA = sale("old", "NB-00000", { originTillId: undefined });
  await syncSales([b1]);
  storage.clear();
  await syncSales([a1, legacyA]);
  assert.equal(server.sales.get("b1")?.terminalId, TILL_B);
  assert.equal(server.sales.get("a1")?.terminalId, TILL_A);
  assert.equal(server.sales.get("old")?.terminalId, undefined, "legado sin caja");
  const downloadedB1 = withLocalOrigin(server.sales.get("b1")!, undefined);

  const { state, serverSaleIds } = wipeLocalSalesState(stateWith([a1, downloadedB1, legacyA]));
  assert.deepEqual(serverSaleIds, ["a1"]);
  assert.deepEqual(state.serverPurgeQueue, ["a1"]);
  assert.deepEqual(state.wipedSaleIds.sort(), ["a1", "b1", "old"], "todas quedan como lápidas locales");
  const purge = await pushSalePurge(state.serverPurgeQueue, TILL_A);
  assert.equal(purge.ok, true);
  assert.deepEqual([...server.sales.keys()].sort(), ["b1", "old"]);
  // Aunque una versión vieja pidiera borrar b1 u «old», el servidor no las toca.
  const forced = await pushSalePurge(["b1", "old"], TILL_A);
  assert.deepEqual(forced.confirmed, ["b1", "old"], "salen de la cola como «kept»");
  assert.deepEqual([...server.sales.keys()].sort(), ["b1", "old"]);
});

test("solo las ventas creadas en esta caja llevan terminalId al subir", async () => {
  const bodies: string[] = [];
  const handle = server.handle;
  g.fetch = async (url: string, init: { body: string }) => { bodies.push(init.body); return handle(url, init); };
  await syncSales([sale("mine", "1"), sale("dl", "2", { originTillId: DOWNLOADED_ORIGIN }), sale("old", "3", { originTillId: undefined })]);
  const sent = bodies.map((b) => JSON.parse(b).sales[0]);
  assert.deepEqual(sent.map((s: { id: string; terminalId?: string }) => [s.id, s.terminalId]), [["mine", TILL_A], ["dl", undefined], ["old", undefined]]);
  assert.ok(sent.every((s: Record<string, unknown>) => !("originTillId" in s)));
});

test("id de caja: se genera una vez, vive en el estado (SQLite) y se conserva al recargar", () => {
  const first = loadPosState();
  assert.match(first.tillId, /^[0-9a-f-]{36}$/);
  storage.set(POS_STATE_KEY, JSON.stringify(first));
  assert.equal(loadPosState().tillId, first.tillId);
});

test("migraciones: lápidas de v0.1.21 y la cola de v0.1.22-beta.1 quedan solo locales", () => {
  storage.set(LEGACY_WIPED_KEY, JSON.stringify(["x"]));
  storage.set(POS_STATE_KEY, JSON.stringify({ ...stateWith([]), serverPurgeQueue: undefined, pendingSalePurge: ["y", "z"], wipedSaleIds: ["y", "z"] }));
  const loaded = loadPosState();
  assert.deepEqual(loaded.serverPurgeQueue, [], "nada de origen desconocido va al servidor");
  assert.deepEqual(loaded.wipedSaleIds.sort(), ["x", "y", "z"]);
});

test("caja limpiada en v0.1.21 que actualiza a beta.2: cero peticiones de borrado", async () => {
  // v0.1.21: ventas borradas solo en la caja, lista en localStorage; el estado ya no tiene ventas.
  storage.set(LEGACY_WIPED_KEY, JSON.stringify(Array.from({ length: 139 }, (_, i) => `v21-${i}`)));
  storage.set(POS_STATE_KEY, JSON.stringify({ ...stateWith([]), serverPurgeQueue: undefined, tillId: undefined }));
  const loaded = loadPosState();
  setWipedSaleIds(loaded.wipedSaleIds);
  assert.equal(loaded.wipedSaleIds.length, 139);
  assert.deepEqual(loaded.serverPurgeQueue, []);
  const round = await syncSalesRound({ sales: loaded.sales, pendingPurge: loaded.serverPurgeQueue, tillId: loaded.tillId, canPurge: true, onPurgeConfirmed: () => assert.fail() });
  assert.equal(round.purge, null);
  assert.equal(server.requests.filter((r) => r.path === "/sales/purge").length, 0);
  // Y la descarga no vuelve a guardar esas ventas.
  assert.deepEqual(withoutWipedSales([sale("v21-5", "x"), sale("nueva", "y")]).map((s) => s.id), ["nueva"]);
});
