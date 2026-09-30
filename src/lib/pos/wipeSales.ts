import type { InventoryMovementType, PosPersistedState } from "@/lib/pos/types";

// «Borrar ventas locales»: quita de esta caja todas las ventas y lo que depende
// de ellas. Artículos, pagos, devoluciones y cancelaciones viven dentro de cada
// venta, así que se van con ella. Los movimientos de inventario que generaron
// las ventas (venta, cancelación, devolución) se quitan del historial; el stock
// de los productos NO se toca. Productos, apartados, cotizaciones, taller, el
// carrito abierto y los demás folios se conservan.

const SALE_MOVEMENT_TYPES = new Set<InventoryMovementType>(["venta", "cancelacion", "devolucion"]);

export type WipeLocalSalesResult = {
  state: PosPersistedState;
  removedSaleIds: string[];
  removedMovements: number;
};

export function wipeLocalSalesState(state: PosPersistedState): WipeLocalSalesResult {
  const folios = new Set(state.sales.map((sale) => sale.folio));
  const movements = state.movements.filter(
    (movement) => !(SALE_MOVEMENT_TYPES.has(movement.type) && folios.has(movement.reference)),
  );
  return {
    state: {
      ...state,
      sales: [],
      movements,
      // Sin ventas locales el folio vuelve a empezar (NB-00001). En el servidor
      // el folio no es único: las ventas se identifican por id.
      folioCounter: 0,
    },
    removedSaleIds: state.sales.map((sale) => sale.id),
    removedMovements: state.movements.length - movements.length,
  };
}
