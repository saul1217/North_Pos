import type { CompletedSale } from "@/lib/pos/types";

// Origen de una venta: la caja (instalación) que la creó. Cada caja tiene un
// id propio guardado en su SQLite (tillId) y lo sella en las ventas que crea
// (originTillId). El sello no se envía al servidor. Una venta que llega por la
// descarga sin existir antes en esta caja se marca DOWNLOADED_ORIGIN. Ventas
// guardadas antes de v0.1.22-beta.2 no tienen sello: origen desconocido.

export const DOWNLOADED_ORIGIN = "downloaded";

export type SalesByOrigin = {
  /** Creadas en esta caja: se borran aquí y en el servidor. */
  mine: CompletedSale[];
  /** Descargadas del servidor (creadas en otra caja): solo se borran aquí. */
  downloaded: CompletedSale[];
  /** Sin sello (ventas anteriores a v0.1.22-beta.2): solo se borran aquí. */
  unknown: CompletedSale[];
};

export function splitSalesByOrigin(sales: CompletedSale[], tillId: string): SalesByOrigin {
  const out: SalesByOrigin = { mine: [], downloaded: [], unknown: [] };
  for (const sale of sales) {
    if (tillId && sale.originTillId === tillId) out.mine.push(sale);
    else if (sale.originTillId) out.downloaded.push(sale);
    else out.unknown.push(sale);
  }
  return out;
}

/**
 * Copia del servidor que se guarda en esta caja. Nunca acepta un sello venido
 * de fuera: si la venta ya existía aquí conserva el sello local (o su falta);
 * si es nueva para esta caja, queda marcada como descargada.
 */
export function withLocalOrigin(remote: CompletedSale, local: CompletedSale | undefined): CompletedSale {
  const { originTillId: _ignored, ...rest } = remote;
  if (!local) return { ...rest, originTillId: DOWNLOADED_ORIGIN };
  return local.originTillId ? { ...rest, originTillId: local.originTillId } : rest;
}
