import assert from "node:assert/strict";
import test from "node:test";
import {
  budgetQuantityError,
  isWholeQuantity,
  returnLinesToSubmit,
  sanitizeReturnsForSync,
  wholeUnits,
} from "@/lib/pos/quantities";

test("wholeUnits truncates to non-negative integers", () => {
  assert.equal(wholeUnits(0.5), 0);
  assert.equal(wholeUnits("0.5"), 0);
  assert.equal(wholeUnits(1.5), 1);
  assert.equal(wholeUnits(2.9), 2);
  assert.equal(wholeUnits(-1), 0);
  assert.equal(wholeUnits("abc"), 0);
  assert.equal(wholeUnits(Number.NaN), 0);
  assert.equal(wholeUnits(3), 3);
});

test("returnLinesToSubmit drops lines that end at 0 units", () => {
  assert.deepEqual(returnLinesToSubmit({ a: 0.5, b: 0, c: 1.5, d: 2 }), [
    { lineId: "c", quantity: 1 },
    { lineId: "d", quantity: 2 },
  ]);
  // Nothing left to return → caller must disable the confirm button.
  assert.deepEqual(returnLinesToSubmit({ a: 0.5, b: 0 }), []);
  assert.deepEqual(returnLinesToSubmit({}), []);
});

test("sanitizeReturnsForSync never sends quantity 0 lines or empty returns", () => {
  const returns = [
    { id: "r1", items: [{ lineId: "a", quantity: 0 }, { lineId: "b", quantity: 1 }] },
    { id: "r2", items: [{ lineId: "a", quantity: 0 }] },
    { id: "r3", items: [{ lineId: "c", quantity: 0.5 }] },
  ];
  const clean = sanitizeReturnsForSync(returns);
  assert.deepEqual(clean, [{ id: "r1", items: [{ lineId: "b", quantity: 1 }] }]);
  for (const record of clean) {
    for (const item of record.items) assert.ok(item.quantity >= 1);
  }
  assert.deepEqual(sanitizeReturnsForSync(undefined), []);
  assert.deepEqual(sanitizeReturnsForSync([]), []);
});

test("isWholeQuantity / budgetQuantityError block Taller lines that are not whole units", () => {
  assert.equal(isWholeQuantity(1), true);
  assert.equal(isWholeQuantity(0), false);
  assert.equal(isWholeQuantity(1.5), false);
  assert.equal(isWholeQuantity(Number.NaN), false);
  assert.equal(budgetQuantityError([{ quantity: 1 }, { quantity: 3 }]), null);
  const error = budgetQuantityError([{ quantity: 1 }, { quantity: 0 }, { quantity: 1.5 }]);
  assert.ok(error);
  assert.match(error, /línea 2, 3/);
  assert.ok(budgetQuantityError([]));
});
