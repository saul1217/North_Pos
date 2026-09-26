/**
 * Shared POS field validation (es-MX).
 * Phone: strip spaces/dashes/parens; require digits only (typically 10 MX).
 */

export function normalizePhoneDigits(value: string): string {
  return value.trim().replace(/[\s\-().]/g, "");
}

/** True when phone has 10–13 digits after stripping separators (rejects "abc", etc.). */
export function isValidPhone(value: string): boolean {
  const digits = normalizePhoneDigits(value);
  const cleaned = digits.startsWith("+") ? digits.slice(1) : digits;
  if (!/^\d+$/.test(cleaned)) return false;
  return cleaned.length >= 10 && cleaned.length <= 13;
}

/**
 * Hard ceiling for inventory stock and a single adjustment quantity.
 * Prevents absurd values (e.g. +999999999) from corrupting stock / reports.
 */
export const MAX_INVENTORY_UNITS = 1_000_000;

export type QtyParseResult =
  | { ok: true; quantity: number }
  | { ok: false; error: string };

/** Parse a positive whole quantity for inventory adjustments. */
export function parsePositiveInventoryQty(raw: string): QtyParseResult {
  if (raw.trim() === "") {
    return { ok: false, error: "Captura una cantidad mayor que cero." };
  }
  const quantity = Number(raw);
  if (!Number.isFinite(quantity)) {
    return { ok: false, error: "Captura una cantidad válida." };
  }
  if (quantity <= 0) {
    return { ok: false, error: "Captura una cantidad mayor que cero." };
  }
  const whole = Math.floor(quantity);
  if (whole > MAX_INVENTORY_UNITS) {
    return {
      ok: false,
      error: `La cantidad no puede ser mayor a ${MAX_INVENTORY_UNITS.toLocaleString("es-MX")}.`,
    };
  }
  return { ok: true, quantity: whole };
}

export type DiscountParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Validate global sale discount against the current model:
 * percent 0–100, fixed 0–subtotal. Empty → 0 (clear discount).
 */
export function parseGlobalDiscount(
  raw: string,
  type: "percent" | "fixed",
  subtotal: number,
): DiscountParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: 0 };

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, error: "Captura un descuento válido." };
  }
  if (value < 0) {
    return { ok: false, error: "El descuento no puede ser negativo." };
  }
  if (type === "percent" && value > 100) {
    return { ok: false, error: "El descuento no puede ser mayor a 100%." };
  }
  if (type === "fixed" && value > subtotal) {
    return { ok: false, error: "El descuento no puede ser mayor al subtotal." };
  }
  return { ok: true, value };
}

export const SKU_CHARSET_ERROR =
  "El SKU solo puede tener letras sin acento, números y símbolos básicos (sin Ñ ni acentos).";

/** Caracteres del SKU que no caben en Code 128 (fuera de ASCII imprimible 0x20–0x7E). */
export function invalidSkuCharacters(sku: string): string[] {
  return [...new Set([...sku].filter((character) => !/^[\x20-\x7E]$/.test(character)))];
}

/** Devuelve el mensaje de error si el SKU no puede imprimirse como Code 128. */
export function validateSkuCharset(sku: string): string | null {
  const invalid = invalidSkuCharacters(sku.trim());
  return invalid.length > 0 ? `${SKU_CHARSET_ERROR} Caracteres no válidos: ${invalid.join(" ")}` : null;
}
