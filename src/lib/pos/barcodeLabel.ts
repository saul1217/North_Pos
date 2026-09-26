// Etiqueta adhesiva de código de barras de 50.8 mm × 25.4 mm (2" × 1").
// Genera un documento HTML autónomo que se imprime en una ventana aislada
// (Electron: webContents.print con pageSize en micras) o, fuera de Electron,
// en un iframe oculto. El código de barras es Code 128-B con el mismo valor
// (SKU local) que se usaba antes, así que los lectores encuentran el mismo artículo.
import { code128Bits } from "./code128";

export const LABEL_WIDTH_MM = 50.8;
export const LABEL_HEIGHT_MM = 25.4;
/** Tamaño de página para webContents.print (micras). */
export const LABEL_PAGE_SIZE_MICRONS = { width: 50800, height: 25400 } as const;
/** Marcador que el proceso principal reemplaza por la ruta del logo empaquetado. */
export const LABEL_LOGO_PLACEHOLDER = "__NB_LABEL_LOGO__";

export type BarcodeLabelData = {
  /** Valor codificado e impreso bajo las barras (SKU local). */
  code: string;
  name: string;
  model?: string;
  variantLabel?: string;
};

export type BarcodeLabelOptions = {
  /** URL del logo; por defecto el marcador que resuelve el proceso principal. */
  logoSrc?: string;
  /** Imprime únicamente el código de barras (sin logo ni textos). */
  onlyBarcode?: boolean;
};

const PADDING_MM = 1.2;
const LOGO_MM = 10;
const WIDE_LOGO_MM = 8.5;
const COLUMN_GAP_MM = 0.6;
const QUIET_MODULES = 10;
// 0.25 mm = 2 puntos exactos en impresoras de 203 dpi (las más comunes para 2" × 1"),
// así cada barra conserva su ancho y el código se lee de forma confiable.
const PREFERRED_MODULE_MM = 0.25;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Módulos totales del Code 128 incluyendo las zonas de silencio de 10 módulos. */
export function barcodeModules(value: string): number {
  const bits = code128Bits(value);
  return bits ? bits.length + QUIET_MODULES * 2 : 0;
}

export function barcodeSvg(value: string, moduleMm: number, heightMm: number): string {
  const bits = code128Bits(value);
  if (!bits) return "";
  const padded = `${"0".repeat(QUIET_MODULES)}${bits}${"0".repeat(QUIET_MODULES)}`;
  const widthMm = padded.length * moduleMm;
  let rects = "";
  for (let index = 0; index < padded.length; index += 1) {
    if (padded[index] !== "1") continue;
    let run = 1;
    while (padded[index + run] === "1") run += 1;
    rects += `<rect x="${index}" y="0" width="${run}" height="1"/>`;
    index += run - 1;
  }
  return `<svg class="bars" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${padded.length} 1" preserveAspectRatio="none" `
    + `width="${widthMm.toFixed(3)}mm" height="${heightMm}mm" shape-rendering="crispEdges" role="img" `
    + `aria-label="Código de barras ${escapeHtml(value)}"><rect width="${padded.length}" height="1" fill="#fff"/>`
    + `<g fill="#000">${rects}</g></svg>`;
}

function labelDescription(label: BarcodeLabelData): string {
  const parts = [label.name, label.model, label.variantLabel]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  // Evita repetir textos idénticos (p. ej. modelo igual al nombre de la variante).
  return parts.filter((part, index) => parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index).join(" · ");
}

function renderLabel(label: BarcodeLabelData, options: Required<BarcodeLabelOptions>): string {
  const innerWidth = LABEL_WIDTH_MM - PADDING_MM * 2;
  const modules = barcodeModules(label.code);
  const fullWidthModule = Math.min(PREFERRED_MODULE_MM, innerWidth / Math.max(1, modules));
  if (options.onlyBarcode) {
    return `<section class="label only">${barcodeSvg(label.code, fullWidthModule, 16)}</section>`;
  }
  const logo = `<img class="logo" src="${escapeHtml(options.logoSrc)}" alt="North Bike" />`;
  const number = `<div class="number">${escapeHtml(label.code)}</div>`;
  const name = `<div class="name">${escapeHtml(labelDescription(label))}</div>`;
  const compactWidth = innerWidth - LOGO_MM - COLUMN_GAP_MM;
  if (modules * PREFERRED_MODULE_MM <= compactWidth) {
    // Diseño principal: logo a la izquierda, barras arriba a la derecha,
    // número debajo y descripción a todo lo ancho.
    return `<section class="label compact">
  <div class="top">
    ${logo}
    <div class="code">
      ${barcodeSvg(label.code, PREFERRED_MODULE_MM, 9.6)}
      ${number}
    </div>
  </div>
  ${name}
</section>`;
  }
  // SKU largo (p. ej. variantes ACC-0003-V01): las barras usan todo el ancho para
  // no bajar de 0.25 mm por módulo; el logo pasa abajo a la izquierda.
  return `<section class="label wide">
  <div class="code">${barcodeSvg(label.code, fullWidthModule, 9.2)}</div>
  <div class="bottom">
    ${logo}
    <div class="text">
      ${number}
      ${name}
    </div>
  </div>
</section>`;
}

export function buildBarcodeLabelsHtml(labels: BarcodeLabelData[], options: BarcodeLabelOptions = {}): string {
  const resolved: Required<BarcodeLabelOptions> = {
    logoSrc: options.logoSrc ?? LABEL_LOGO_PLACEHOLDER,
    onlyBarcode: options.onlyBarcode ?? false,
  };
  const body = labels
    .filter((label) => label.code.trim())
    .map((label) => renderLabel(label, resolved))
    .join("\n");
  return `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8" />
<title>Etiquetas North Bike</title>
<style>
  @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${LABEL_WIDTH_MM}mm; background: #fff; color: #000; }
  body { font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label {
    width: ${LABEL_WIDTH_MM}mm;
    height: ${LABEL_HEIGHT_MM}mm;
    padding: ${PADDING_MM}mm;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
    page-break-after: always;
    break-after: page;
    break-inside: avoid;
  }
  .label:last-child { page-break-after: auto; break-after: auto; }
  .top { display: flex; align-items: center; gap: ${COLUMN_GAP_MM}mm; }
  .logo { width: ${LOGO_MM}mm; height: ${LOGO_MM}mm; object-fit: contain; flex: none; filter: grayscale(1) contrast(1.35); }
  .code { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; }
  .bars { display: block; flex: none; }
  .number {
    margin-top: 0.5mm;
    font-size: 9pt;
    line-height: 1;
    font-weight: 700;
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .name {
    font-size: 6.2pt;
    line-height: 1.3;
    max-height: 2.6em;
    /* Oculta acentos de una tercera línea que asoman sobre la segunda. */
    clip-path: inset(0 0 0.1em 0);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    word-break: break-word;
    text-transform: uppercase;
  }
  .compact .name { margin-top: 0.8mm; }
  .wide .code { flex: none; }
  .wide .bottom { display: flex; align-items: center; gap: 1mm; margin-top: 0.6mm; }
  .wide .logo { width: ${WIDE_LOGO_MM}mm; height: ${WIDE_LOGO_MM}mm; }
  .wide .text { flex: 1; min-width: 0; }
  .wide .number { margin-top: 0; margin-bottom: 0.5mm; text-align: left; }
  .label.only { justify-content: center; align-items: center; }
  @media screen {
    html, body { width: auto; background: #eef2f4; }
    body { display: flex; flex-wrap: wrap; gap: 3mm; padding: 3mm; }
    .label { background: #fff; box-shadow: 0 0 0 1px #c9d3d8; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
