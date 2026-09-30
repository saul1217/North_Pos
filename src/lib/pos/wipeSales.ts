import type { InventoryMovementType, PosPersistedState } from "@/lib/pos/types";
import { splitSalesByOrigin } from "@/lib/pos/saleOrigin";

// «Borrar ventas locales»: quita de esta caja todas las ventas y lo que depende
// de ellas. Artículos, pagos, devoluciones y cancelaciones viven dentro de cada
// venta, así que se van con ella. Los movimientos de inventario que generaron
// las ventas (venta, cancelación, devolución) se quitan del historial; el stock
// de los productos NO se toca. Productos, apartados, cotizaciones, taller, el
// carrito abierto y los demás folios se conservan.
//
// Los ids borrados quedan como lápidas (wipedSaleIds) y en la cola de borrado
// del servidor (serverPurgeQueue), en el mismo estado que se guarda en una sola
// transacción de SQLite.

const SALE_MOVEMENT_TYPES = new Set<InventoryMovementType>(["venta", "cancelacion", "devolucion"]);

export type WipeLocalSalesResult = {
  state: PosPersistedState;
  removedSaleIds: string[];
  removedMovements: number;
  /** Ids que se encolaron para borrarse también en el servidor. */
  serverSaleIds: string[];
};

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** Quita las ventas indicadas y sus movimientos (si ninguna venta restante comparte el folio). */
export function removeSalesState(state: PosPersistedState, ids: Iterable<string>): WipeLocalSalesResult {
  const remove = new Set(ids);
  const removed = state.sales.filter((sale) => remove.has(sale.id));
  const kept = state.sales.filter((sale) => !remove.has(sale.id));
  const keptFolios = new Set(kept.map((sale) => sale.folio));
  const folios = new Set(removed.map((sale) => sale.folio).filter((folio) => !keptFolios.has(folio)));
  const movements = state.movements.filter(
    (movement) => !(SALE_MOVEMENT_TYPES.has(movement.type) && folios.has(movement.reference)),
  );
  return {
    state: { ...state, sales: kept, movements, wipedSaleIds: union(state.wipedSaleIds, [...remove]) },
    removedSaleIds: removed.map((sale) => sale.id),
    removedMovements: state.movements.length - movements.length,
    serverSaleIds: [],
  };
}

export function wipeLocalSalesState(state: PosPersistedState): WipeLocalSalesResult {
  const result = removeSalesState(state, state.sales.map((sale) => sale.id));
  const serverSaleIds = splitSalesByOrigin(state.sales, state.tillId).mine.map((sale) => sale.id);
  return {
    ...result,
    serverSaleIds,
    state: {
      ...result.state,
      // Sin ventas locales el folio vuelve a empezar (NB-00001). En el servidor
      // el folio no es único: las ventas se identifican por id.
      folioCounter: 0,
      serverPurgeQueue: union(state.serverPurgeQueue, serverSaleIds),
    },
  };
}

/** Quita de la cola los ids que el servidor ya confirmó. */
export function confirmSalePurge(state: PosPersistedState, confirmed: Iterable<string>): string[] {
  const done = new Set(confirmed);
  return state.serverPurgeQueue.filter((id) => !done.has(id));
}
