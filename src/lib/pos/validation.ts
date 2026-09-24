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
