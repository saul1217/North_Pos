import type { CompletedSale } from "@/lib/pos/types";
import { sanitizeReturnsForSync } from "@/lib/pos/quantities";

// Huella de los campos de una venta que el backend acepta en un reenvío
// (estado, motivo de cancelación y devoluciones; los importes son inmutables).
// Si la huella actual difiere de la última confirmada por el servidor, la
// venta tiene un cambio pendiente de enviar.

/** Huella «desconocida»: ventas sincronizadas antes de que existiera la huella. */
export const LEGACY_FINGERPRINT = "";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function saleSyncFingerprint(sale: Pick<CompletedSale, "status" | "cancelReason" | "returns">): string {
  return JSON.stringify(
    stable({
      status: sale.status ?? null,
      cancelReason: sale.cancelReason ?? null,
      // Igual que lo que se envía: sin líneas con cantidad 0 ni registros mal formados.
      returns: sanitizeReturnsForSync(sale.returns),
    }),
  );
}
