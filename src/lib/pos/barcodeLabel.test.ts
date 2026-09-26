import assert from "node:assert/strict";
import test from "node:test";
import { barcodeLabelQuality, buildBarcodeLabelsHtml } from "@/lib/pos/barcodeLabel";

const labels = [
  { code: "ACS-0010", name: "LLANTA ARISUN MOUNT CRONOS 29X2.35", model: "1730105" },
  { code: "ACS-0010", name: "LLANTA ARISUN MOUNT CRONOS 29X2.35", model: "1730105" },
  { code: "ACC-0003-V01", name: "Casco", variantLabel: "Talla M" },
];

test("label document has an explicit 50.8 × 25.4 mm page with no margins", () => {
  const html = buildBarcodeLabelsHtml(labels, { logoSrc: "logo.png" });
  assert.match(html, /@page \{ size: 50\.8mm 25\.4mm; margin: 0; \}/);
  assert.match(html, /html, body \{ margin: 0; padding: 0;/);
  // Caja fija un poco menor que la página: el redondeo nunca pasa a otra hoja.
  assert.match(html, /height: 25mm;/);
  assert.match(html, /overflow: hidden;/);
});

test("one section per label (copies included) and page breaks only between labels", () => {
  const html = buildBarcodeLabelsHtml(labels, { logoSrc: "logo.png" });
  assert.equal(html.match(/<section class="label/g)?.length, 3);
  assert.match(html, /\.label \+ \.label \{ page-break-before: always; break-before: page; \}/);
  assert.doesNotMatch(html, /break-after:\s*(page|always)/);
});

test("labels keep ~3 mm lateral padding", () => {
  const html = buildBarcodeLabelsHtml(labels, { logoSrc: "logo.png" });
  assert.match(html, /padding: 0\.8mm 3mm;/);
});

test("variant SKUs still fit at 0.25 mm per module using the quiet zones in the side margin", () => {
  assert.equal(barcodeLabelQuality("ACS-0010"), "ok");
  assert.equal(barcodeLabelQuality("ACC-0003-V01"), "ok");
  assert.equal(barcodeLabelQuality("ABCDEFGHIJKLMNOPQRS"), "long");
  assert.equal(barcodeLabelQuality("AÑO"), "invalid");
});
