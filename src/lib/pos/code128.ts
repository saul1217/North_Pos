// Code 128 encoder (B con cambio automático a C en tramos numéricos) for the local SKU labels. The payload stays equal to
// the SKU so a scanner can find the same item used by the POS.
const CODE128_PATTERNS: number[][] = [
  [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
  [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
  [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
  [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
  [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
  [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
  [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
  [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
  [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
  [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
  [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
  [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
  [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
  [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
  [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
  [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
  [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
  [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
  [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],
  [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
  [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],
  [2,1,1,2,3,2],[2,3,3,1,1,1,2],
];

/** Code 128 solo admite ASCII imprimible (0x20–0x7E): sin Ñ, acentos ni emojis. */
export function isCode128Encodable(value: string): boolean {
  return value.length > 0 && /^[\x20-\x7E]+$/.test(value);
}

function patternBits(pattern: number[]): string {
  let bits = "";
  pattern.forEach((width, index) => {
    bits += (index % 2 === 0 ? "1" : "0").repeat(width);
  });
  return bits;
}

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

function digitRunLength(value: string, start: number): number {
  let index = start;
  while (index < value.length && value.charCodeAt(index) >= 48 && value.charCodeAt(index) <= 57) index += 1;
  return index - start;
}

/**
 * Valores de símbolo Code 128 (inicio + datos + checksum + stop) con cambio
 * automático a Code C para tramos numéricos largos (2 dígitos por símbolo).
 * El valor decodificado por el lector es idéntico al de Code 128-B.
 */
export function code128Values(value: string): number[] {
  if (!isCode128Encodable(value)) return [];
  const symbols: number[] = [];
  const leadingDigits = digitRunLength(value, 0);
  let set: "B" | "C" = leadingDigits >= 4 || (leadingDigits === value.length && leadingDigits >= 2 && leadingDigits % 2 === 0) ? "C" : "B";
  const start = set === "C" ? START_C : START_B;
  let index = 0;
  while (index < value.length) {
    const run = digitRunLength(value, index);
    if (set === "C") {
      if (run >= 2) {
        symbols.push(Number(value.slice(index, index + 2)));
        index += 2;
      } else {
        symbols.push(CODE_B);
        set = "B";
      }
      continue;
    }
    // En B conviene pasar a C con 4+ dígitos al final o 6+ en medio.
    const reachesEnd = index + run === value.length;
    if (run >= 6 || (reachesEnd && run >= 4)) {
      if (run % 2 === 1) {
        symbols.push(value.charCodeAt(index) - 32);
        index += 1;
      }
      symbols.push(CODE_C);
      set = "C";
      continue;
    }
    symbols.push(value.charCodeAt(index) - 32);
    index += 1;
  }
  const checksum = (start + symbols.reduce((sum, code, position) => sum + code * (position + 1), 0)) % 103;
  return [start, ...symbols, checksum, STOP];
}

export function code128Bits(value: string): string {
  const values = code128Values(value);
  return values.map((code) => patternBits(CODE128_PATTERNS[code])).join("");
}
