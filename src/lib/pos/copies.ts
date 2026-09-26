/**
 * Copias a partir de lo escrito: se ignoran signos/espacios iniciales y se
 * corta en el primer carácter que no sea dígito («1.5» → «1», «-2» → «2»,
 * «01» → «1», «0» → vacío). Nunca junta dígitos separados («1.5» ≠ «15»).
 */
export function parseCopiesDraft(value: string): string {
  const leadingDigits = value.replace(/^\D+/, "").match(/^\d*/)?.[0] ?? "";
  return leadingDigits.replace(/^0+/, "").slice(0, 3);
}
