// Unidades enteras para devoluciones y presupuestos de Taller.
// El servidor (/sales/sync y el cobro de Taller) solo acepta enteros >= 1:
// una línea con 0 o con fracción hace que la venta completa quede en «failed».

/** Trunca a unidades enteras no negativas («0.5» → 0, «2.9» → 2, basura → 0). */
export function wholeUnits(raw: unknown): number {
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export const NO_RETURN_LINES_MESSAGE =
  "Indica al menos 1 unidad entera a devolver en alguna línea.";

/** Líneas a devolver: solo las que quedan con 1 unidad entera o más. */
export function returnLinesToSubmit(
  returnQty: Record<string, number>,
): { lineId: string; quantity: number }[] {
  return Object.entries(returnQty)
    .map(([lineId, quantity]) => ({ lineId, quantity: wholeUnits(quantity) }))
    .filter((line) => line.quantity >= 1);
}

/**
 * Devoluciones listas para /sales/sync: nunca envía líneas con cantidad < 1
 * (p. ej. datos guardados antes de este arreglo) ni devoluciones vacías.
 */
export function sanitizeReturnsForSync<R extends { items: { quantity: number }[] }>(
  returns: R[] | undefined,
): R[] {
  if (!Array.isArray(returns)) return [];
  return returns
    // Registros mal formados (p. ej. «[[]]» devuelto por GET /sales) no deben
    // romper toda la sincronización: se descartan.
    .filter((record) => record && typeof record === "object" && Array.isArray((record as { items?: unknown }).items))
    .map((record) => ({
      ...record,
      items: record.items.filter((item) => item && Number(item.quantity) >= 1),
    }))
    .filter((record) => record.items.length > 0);
}

/** true si la cantidad es un entero >= 1. */
export function isWholeQuantity(quantity: unknown): boolean {
  return typeof quantity === "number" && Number.isInteger(quantity) && quantity >= 1;
}

/**
 * Mensaje de error si alguna línea del presupuesto no tiene una cantidad
 * entera >= 1 (el cobro crearía una venta que el servidor rechaza), o null.
 */
export function budgetQuantityError(items: { quantity: number }[] | undefined): string | null {
  const lines = items ?? [];
  if (lines.length === 0) return "El presupuesto no tiene líneas para cobrar.";
  const bad = lines
    .map((item, idx) => (isWholeQuantity(item.quantity) ? 0 : idx + 1))
    .filter((n) => n > 0);
  if (bad.length === 0) return null;
  return `Cantidad inválida en la línea ${bad.join(", ")} del presupuesto: debe ser un número entero de al menos 1. Corrige el presupuesto antes de cobrar.`;
}
