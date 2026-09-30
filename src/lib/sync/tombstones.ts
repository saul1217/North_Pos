// Ventas borradas en esta caja («Borrar ventas locales») o que el servidor
// reportó como borradas. La lista persistente vive en el estado del POS
// (SQLite, misma transacción que el borrado); aquí solo hay una copia en
// memoria para que la sincronización la consulte sin depender de React.
let wiped = new Set<string>();

export function setWipedSaleIds(ids: Iterable<string>): void {
  wiped = new Set(ids);
}

export function getWipedSaleIds(): ReadonlySet<string> {
  return wiped;
}
