import assert from "node:assert/strict";
import test from "node:test";
import { barcodeLabelQuality, buildBarcodeLabelsHtml, formatLabelPrice } from "@/lib/pos/barcodeLabel";

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

test("label price uses the POS format (MXN, no decimals) and keeps real cents", () => {
  assert.equal(formatLabelPrice(1250), "$1,250");
  assert.equal(formatLabelPrice(129), "$129");
  assert.equal(formatLabelPrice(1899.5), "$1,899.50");
  assert.equal(formatLabelPrice(1250.004), "$1,250");
  assert.equal(formatLabelPrice(0), "");
  assert.equal(formatLabelPrice(undefined), "");
  assert.equal(formatLabelPrice(Number.NaN), "");
});

test("price is printed bold on the SKU line; labels without price omit it", () => {
  const html = buildBarcodeLabelsHtml([
    { code: "ACS-0010", name: "Llanta", price: 1250 },
    { code: "REF-0042", name: "Cámara" },
  ], { logoSrc: "logo.png" });
  assert.equal(html.match(/<div class="price" style="font-size:[\d.]+pt">\$1,250<\/div>/g)?.length, 1);
  assert.equal(html.match(/<div class="price"/g)?.length, 1);
  assert.match(html, /\.price \{[^}]*font-weight: 700;/);
  const size = Number(html.match(/<div class="price" style="font-size:([\d.]+)pt"/)?.[1]);
  assert.ok(size >= 8 && size <= 11, `price size ${size}pt`);
});

test("only-barcode mode prints neither text nor price", () => {
  const html = buildBarcodeLabelsHtml([{ code: "ACS-0010", name: "Llanta", price: 1250 }], { logoSrc: "logo.png", onlyBarcode: true });
  assert.doesNotMatch(html, /\$1,250|class="price"|class="name/);
});
