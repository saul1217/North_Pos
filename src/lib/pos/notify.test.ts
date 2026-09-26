import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { MAX_NOTICES, dismissNotice, getNotices, resetNotices, restoreFocus, showNotice, subscribeNotices } from "@/lib/pos/notify";

// Minimal DOM stand-in: body + a focusable search input.
type El = { name: string; isConnected: boolean; focus: () => void };
const body = { name: "body", isConnected: true, focus: () => {} } as El;
const doc = { body, activeElement: body as El | null };
const el = (name: string): El => {
  const e: El = { name, isConnected: true, focus: () => { doc.activeElement = e; } };
  return e;
};
(globalThis as Record<string, unknown>).document = doc;

beforeEach(() => {
  resetNotices();
  doc.activeElement = body;
});

test("showNotice does not block and remembers the focused field", () => {
  const search = el("search");
  search.focus();
  const id = showNotice("No se pudo imprimir el ticket: No se encontró la impresora térmica EC-PM-58110");
  assert.equal(getNotices().length, 1);
  assert.equal(getNotices()[0].returnFocusTo, search);
  // Nothing stole the focus.
  assert.equal(doc.activeElement, search);
  dismissNotice(id);
  assert.equal(getNotices().length, 0);
  assert.equal(doc.activeElement, search);
});

test("dismiss restores focus to the previous field when focus was lost", () => {
  const search = el("search");
  search.focus();
  const id = showNotice("Error");
  doc.activeElement = body; // e.g. a modal closed and focus fell to <body>
  dismissNotice(id);
  assert.equal(doc.activeElement, search);
});

test("dismiss does not move focus away from a field the user moved to", () => {
  const search = el("search");
  const other = el("other");
  search.focus();
  const id = showNotice("Error");
  other.focus();
  dismissNotice(id);
  assert.equal(doc.activeElement, other);
});

test("restoreFocus ignores elements no longer in the page", () => {
  const gone = el("gone");
  gone.isConnected = false;
  assert.equal(restoreFocus(gone), false);
  assert.equal(restoreFocus(null), false);
});

test("same message is not stacked and at most MAX_NOTICES are kept", () => {
  showNotice("A");
  showNotice("A");
  assert.equal(getNotices().length, 1);
  for (const m of ["B", "C", "D", "E"]) showNotice(m);
  assert.deepEqual(getNotices().map((n) => n.message), ["C", "D", "E"].slice(-MAX_NOTICES));
});

test("subscribers are notified", () => {
  const seen: number[] = [];
  const off = subscribeNotices((n) => seen.push(n.length));
  showNotice("x");
  off();
  showNotice("y");
  assert.deepEqual(seen, [0, 1]);
});
