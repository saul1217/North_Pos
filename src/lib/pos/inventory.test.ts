import assert from "node:assert/strict";
import test from "node:test";
import { lookupProductByCode, productsForCodeQuery, scannerLayoutCandidates } from "@/lib/pos/inventory";
import type { PosProduct } from "@/lib/pos/types";

function product(id: string, sku: string, variants: Array<{ id: string; sku: string }> = []): PosProduct {
  return {
    id,
    sku,
    barcode: sku,
    upc: "",
    name: id,
    variants: variants.map((variant) => ({ ...variant, barcode: variant.sku, upc: "", label: variant.id, price: 1, stock: 1 })),
  } as unknown as PosProduct;
}

test("scannerLayoutCandidates reverses the US → LatAm/ES layout swap", () => {
  assert.deepEqual(scannerLayoutCandidates("CSS'001"), ["CSS-001"]);
  // Consistent full reversal: every "-" in a crossed scan came from "/".
  assert.deepEqual(scannerLayoutCandidates("CascoA-M"), ["CascoA/M"]);
  assert.deepEqual(scannerLayoutCandidates("BIC'0001'V02"), ["BIC-0001-V02"]);
  assert.deepEqual(scannerLayoutCandidates("AñB"), ["A;B"]);
  assert.deepEqual(scannerLayoutCandidates("AÑB"), ["A:B"]);
  assert.deepEqual(scannerLayoutCandidates("A?B"), ["A_B"]);
  // Mixed input: full reversal plus the apostrophe-only variant.
  assert.deepEqual(scannerLayoutCandidates("A'B-C"), ["A-B/C", "A-B-C"]);
  // Plain alphanumeric codes have no alternatives.
  assert.deepEqual(scannerLayoutCandidates("7501234567890"), []);
  assert.deepEqual(scannerLayoutCandidates("ABC123"), []);
});

const catalog = [
  product("css", "CSS-001"),
  product("casco", "CASCO-A", [{ id: "m", sku: "CascoA/M" }, { id: "s", sku: "CascoA/S" }]),
  product("bic", "BIC-0001", [{ id: "v2", sku: "BIC-0001-V02" }]),
];

test("lookupProductByCode: exact codes keep matching as before (case-insensitive)", () => {
  const exact = lookupProductByCode(catalog, " css-001 ");
  assert.equal(exact.status, "found");
  assert.equal(exact.status === "found" && exact.product.id, "css");
  const variant = lookupProductByCode(catalog, "cascoa/m");
  assert.equal(variant.status === "found" && variant.variant?.id, "m");
});

test("lookupProductByCode: falls back to the scanner layout correction", () => {
  const apostrophe = lookupProductByCode(catalog, "CSS'001");
  assert.equal(apostrophe.status === "found" && apostrophe.product.id, "css");
  const slash = lookupProductByCode(catalog, "CascoA-S");
  assert.equal(slash.status === "found" && slash.variant?.id, "s");
  const variant = lookupProductByCode(catalog, "bic'0001'v02");
  assert.equal(variant.status === "found" && variant.variant?.id, "v2");
  assert.equal(lookupProductByCode(catalog, "NOPE'1").status, "not-found");
});

test("lookupProductByCode: an exact match wins over the layout correction", () => {
  // Known limitation: with both "X/1" and "X-1", a crossed scan of "X/1"
  // arrives as "X-1" and matches the other valid code.
  const both = [product("slash", "X/1"), product("dash", "X-1")];
  const result = lookupProductByCode(both, "X-1");
  assert.equal(result.status === "found" && result.product.id, "dash");
});

test("productsForCodeQuery: text searches fall back to the corrected code", () => {
  assert.deepEqual(productsForCodeQuery(catalog, "CSS'001").map((p) => p.id), ["css"]);
  assert.deepEqual(productsForCodeQuery(catalog, "cascoa-m").map((p) => p.id), ["casco"]);
  // Free text (spaces) or unknown codes return nothing.
  assert.deepEqual(productsForCodeQuery(catalog, "casco giro"), []);
  assert.deepEqual(productsForCodeQuery(catalog, "ZZZ'9"), []);
});
