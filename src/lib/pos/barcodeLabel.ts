// Etiqueta adhesiva de código de barras de 50.8 mm × 25.4 mm (2" × 1").
// Genera un documento HTML autónomo que se imprime en una ventana aislada
// (Electron: webContents.print con pageSize en micras) o, fuera de Electron,
// en un iframe oculto. El código de barras es Code 128-B con el mismo valor
// (SKU local) que se usaba antes, así que los lectores encuentran el mismo artículo.
import { code128Bits } from "./code128";

export const LABEL_WIDTH_MM = 50.8;
export const LABEL_HEIGHT_MM = 25.4;
/**
 * Alto de cada etiqueta en el documento: un poco menor que la página para que
 * el redondeo del controlador (p. ej. ZDesigner a 203 dpi) nunca empuje
 * contenido a una segunda hoja.
 */
export const LABEL_BOX_HEIGHT_MM = 25;
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

// Margen interior lateral: las Zebra/ZDesigner pueden desplazar la imagen ~2 mm
// si el ancho o la calibración no coinciden; con 3 mm el texto no se corta.
const PADDING_X_MM = 3;
const PADDING_Y_MM = 0.8;
// Las zonas de silencio del código son blancas: pueden ocupar el margen lateral,
// pero sin llegar a menos de este borde de la página.
const EDGE_MM = 0.4;
const LOGO_MM = 10;
const WIDE_LOGO_MM = 8.5;
const COLUMN_GAP_MM = 0.6;
const WIDE_GAP_MM = 1;
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

const INNER_WIDTH_MM = LABEL_WIDTH_MM - PADDING_X_MM * 2;
const EDGE_WIDTH_MM = LABEL_WIDTH_MM - EDGE_MM * 2;

/**
 * Módulo máximo (≤ 0.25 mm) con el que las barras caben dentro del margen
 * interior y las zonas de silencio dentro de la página.
 */
function fullWidthModuleMm(modules: number): number {
  const bars = Math.max(1, modules - QUIET_MODULES * 2);
  return Math.min(PREFERRED_MODULE_MM, INNER_WIDTH_MM / bars, EDGE_WIDTH_MM / Math.max(1, modules));
}

export const SKU_LONG_WARNING = "SKU largo: puede no leerse en impresora de 203 dpi, conviene acortarlo.";

export type BarcodeLabelQuality = "ok" | "long" | "invalid";

/**
 * "long" cuando ni a todo lo ancho de la etiqueta cabe un módulo de 0.25 mm
 * (≈ más de 12 caracteres sin tramos numéricos): las barras salen con anchos
 * irregulares a 203 dpi. "invalid" cuando el SKU no puede codificarse.
 */
export function barcodeLabelQuality(value: string): BarcodeLabelQuality {
  const modules = barcodeModules(value.trim());
  if (modules === 0) return "invalid";
  return fullWidthModuleMm(modules) >= PREFERRED_MODULE_MM ? "ok" : "long";
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

/** Detalle en su propia línea: modelo y variante (sin repetir textos). */
function labelDetails(label: BarcodeLabelData): string {
  const name = label.name.trim().toLowerCase();
  const parts = [label.model, label.variantLabel]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part) && part!.toLowerCase() !== name);
  return parts.filter((part, index) => parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index).join(" · ");
}

// Anchos de Arial Bold / Helvetica Bold (1/1000 em) para ASCII 0x20–0x7E.
const ARIAL_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778,
  722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
const NUMBER_MAX_PT = 9;
const NUMBER_MIN_PT = 4;
const NUMBER_LETTER_SPACING_EM = 0.04;
const PT_TO_MM = 25.4 / 72;

/**
 * Tamaño (pt) para que el código legible quepa completo en `availableMm`.
 * La ventana de impresión no ejecuta JavaScript, así que se calcula aquí con
 * las métricas de Arial Bold y un margen de seguridad; nunca se trunca el texto.
 */
export function numberFontSizePt(code: string, availableMm: number): number {
  const widthEm = [...code].reduce((sum, character) => {
    const width = ARIAL_BOLD_WIDTHS[character.charCodeAt(0) - 32] ?? 1000;
    return sum + width / 1000 + NUMBER_LETTER_SPACING_EM;
  }, 0);
  if (widthEm <= 0) return NUMBER_MAX_PT;
  const fit = (availableMm * 0.94) / (widthEm * PT_TO_MM);
  return Math.max(NUMBER_MIN_PT, Math.min(NUMBER_MAX_PT, Math.floor(fit * 10) / 10));
}

function renderLabel(rawLabel: BarcodeLabelData, options: Required<BarcodeLabelOptions>): string {
  // Barras y texto usan exactamente el mismo valor, sin espacios alrededor.
  const label = { ...rawLabel, code: rawLabel.code.trim() };
  if (!code128Bits(label.code)) {
    // Nunca devolver una etiqueta en blanco: el SKU no es codificable (Ñ, acentos…).
    return `<section class="label invalid"><strong>SKU NO IMPRIMIBLE</strong><span>${escapeHtml(label.code)}</span>`
      + `<span>Usa solo letras sin acento, números y símbolos básicos.</span></section>`;
  }
  const innerWidth = INNER_WIDTH_MM;
  const modules = barcodeModules(label.code);
  const fullWidthModule = fullWidthModuleMm(modules);
  if (options.onlyBarcode) {
    return `<section class="label only"><div class="bleed">${barcodeSvg(label.code, fullWidthModule, 16)}</div></section>`;
  }
  const logo = `<img class="logo" src="${escapeHtml(options.logoSrc)}" alt="North Bike" />`;
  const number = (availableMm: number) =>
    `<div class="number" style="font-size:${numberFontSizePt(label.code, availableMm)}pt">${escapeHtml(label.code)}</div>`;
  const details = labelDetails(label);
  // Nombre en 1 línea y modelo/variante en su propia línea, para que la
  // variante (p. ej. "Talla M") nunca quede oculta por un nombre largo.
  const name = `<div class="name line">${escapeHtml(label.name.trim())}</div>`
    + (details ? `<div class="details line">${escapeHtml(details)}</div>` : "");
  const compactWidth = innerWidth - LOGO_MM - COLUMN_GAP_MM;
  const wideTextWidth = innerWidth - WIDE_LOGO_MM - WIDE_GAP_MM;
  if (modules * PREFERRED_MODULE_MM <= compactWidth) {
    // Diseño principal: logo a la izquierda, barras arriba a la derecha,
    // número debajo y descripción a todo lo ancho.
    return `<section class="label compact">
  <div class="top">
    ${logo}
    <div class="code">
      ${barcodeSvg(label.code, PREFERRED_MODULE_MM, 9.6)}
      ${number(compactWidth)}
    </div>
  </div>
  <div class="desc">${name}</div>
</section>`;
  }
  // SKU largo (p. ej. variantes ACC-0003-V01): las barras usan todo el ancho para
  // no bajar de 0.25 mm por módulo; el logo pasa abajo a la izquierda.
  return `<section class="label wide">
  <div class="code bleed">${barcodeSvg(label.code, fullWidthModule, 9.2)}</div>
  <div class="bottom">
    ${logo}
    <div class="text">
      ${number(wideTextWidth)}
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
  html, body { margin: 0; padding: 0; width: ${LABEL_WIDTH_MM}mm; background: #fff; color: #000; }
  body { font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label {
    width: ${LABEL_WIDTH_MM}mm;
    height: ${LABEL_BOX_HEIGHT_MM}mm;
    padding: ${PADDING_Y_MM}mm ${PADDING_X_MM}mm;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  /* Salto de página solo ENTRE etiquetas: nunca queda una hoja en blanco al final. */
  .label + .label { page-break-before: always; break-before: page; }
  /* Barras a lo ancho: las zonas de silencio pueden entrar en el margen lateral. */
  .bleed { margin: 0 -${(PADDING_X_MM - EDGE_MM).toFixed(1)}mm; display: flex; justify-content: center; }
  .top { display: flex; align-items: center; gap: ${COLUMN_GAP_MM}mm; }
  .logo { width: ${LOGO_MM}mm; height: ${LOGO_MM}mm; object-fit: contain; flex: none; filter: grayscale(1) contrast(1.35); }
  .code { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; }
  .bars { display: block; flex: none; }
  .number {
    margin-top: 0.5mm;
    font-size: ${NUMBER_MAX_PT}pt;
    line-height: 1.05;
    font-weight: 700;
    letter-spacing: ${NUMBER_LETTER_SPACING_EM}em;
    white-space: nowrap;
  }
  .line {
    font-size: 6.2pt;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
  }
  .details { font-weight: 700; }
  .compact .desc { margin-top: 0.8mm; }
  .wide .code { flex: none; }
  .wide .bottom { display: flex; align-items: center; gap: ${WIDE_GAP_MM}mm; margin-top: 0.6mm; }
  .wide .logo { width: ${WIDE_LOGO_MM}mm; height: ${WIDE_LOGO_MM}mm; }
  .wide .text { flex: 1; min-width: 0; }
  .wide .number { margin-top: 0; margin-bottom: 0.4mm; text-align: left; }
  .label.only { justify-content: center; align-items: center; }
  .label.invalid { justify-content: center; align-items: center; text-align: center; gap: 0.6mm; font-size: 6.5pt; border: 0.4mm dashed #000; }
  .label.invalid strong { font-size: 9pt; }
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
