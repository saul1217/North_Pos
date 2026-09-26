import assert from "node:assert/strict";
import test from "node:test";
import { chunkForSync, postInChunks, MAX_SALES_PER_REQUEST } from "@/lib/sync/chunks";

const sales = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}` }));

test("chunkForSync caps each chunk at 100 sales", () => {
  assert.equal(MAX_SALES_PER_REQUEST, 100);
  assert.deepEqual(chunkForSync(sales(250)).map((c) => c.length), [100, 100, 50]);
  assert.deepEqual(chunkForSync(sales(100)).map((c) => c.length), [100]);
  assert.deepEqual(chunkForSync([]), []);
});

test("chunkForSync also caps by JSON size; an oversized item goes alone", () => {
  const big = { id: "big", pad: "x".repeat(500) };
  const small = { id: "s", pad: "y".repeat(100) };
  const chunks = chunkForSync([small, small, big, small], 100, 300);
  assert.deepEqual(chunks.map((c) => c.map((i) => i.id)), [["s", "s"], ["big"], ["s"]]);
});

test("postInChunks merges results and keeps going after a failing chunk", async () => {
  let call = 0;
  const merged = await postInChunks(sales(250), async (chunk) => {
    call += 1;
    if (call === 2) return { okHttp: false, data: null, error: "HTTP 400" };
    if (call === 3) {
      return { okHttp: true, data: { applied: [chunk[0].id], skipped: chunk.slice(2).map((s) => s.id), failed: [{ id: chunk[1].id, reason: "Cantidad inválida" }] } };
    }
    return { okHttp: true, data: { skipped: chunk.map((s) => s.id) } };
  });
  assert.equal(call, 3);
  assert.equal(merged.chunks, 3);
  assert.deepEqual(merged.errors, ["HTTP 400"]);
  assert.deepEqual(merged.applied, ["s200"]);
  assert.equal(merged.skipped.length, 100 + 48);
  assert.deepEqual(merged.failed, [{ id: "s201", reason: "Cantidad inválida" }]);
});

test("postInChunks survives a thrown (network) error on one chunk", async () => {
  let call = 0;
  const merged = await postInChunks(sales(150), async (chunk) => {
    call += 1;
    if (call === 1) throw new Error("Failed to fetch");
    return { okHttp: true, data: { skipped: chunk.map((s) => s.id) } };
  });
  assert.deepEqual(merged.errors, ["Failed to fetch"]);
  assert.equal(merged.skipped.length, 50);
});
