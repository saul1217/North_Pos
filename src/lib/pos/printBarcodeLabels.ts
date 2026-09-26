import { logoSrc } from "@/lib/brand";
import { buildBarcodeLabelsHtml, type BarcodeLabelData } from "@/lib/pos/barcodeLabel";
import { isCode128Encodable } from "@/lib/pos/code128";

/** Etiquetas cuyo SKU no puede codificarse (Ñ, acentos…): se imprimirían sin barras. */
export function unprintableLabels(labels: BarcodeLabelData[]): BarcodeLabelData[] {
  const seen = new Set<string>();
  return labels.filter((label) => {
    const code = label.code.trim();
    if (isCode128Encodable(code) || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
}

export function unprintableLabelsMessage(invalid: BarcodeLabelData[]): string {
  const list = invalid.map((label) => `${label.code.trim() || "(vacío)"} (${label.name})`).join(", ");
  return `No se imprimió nada: ${invalid.length === 1 ? "este SKU tiene" : "estos SKU tienen"} caracteres que no admite el código de barras (Ñ, acentos u otros): ${list}. `
    + "Corrige el SKU o quítalo de la selección.";
}

export type LabelPrintResult = { ok: boolean; cancelled?: boolean; error?: string };

function absoluteLogoUrl(): string {
  try {
    return new URL(logoSrc, window.location.href).href;
  } catch {
    return logoSrc;
  }
}

/** Fuera de Electron: imprime el documento aislado desde un iframe oculto. */
function printInIframe(html: string): Promise<LabelPrintResult> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    frame.onload = () => {
      const target = frame.contentWindow;
      if (!target) {
        frame.remove();
        resolve({ ok: false, error: "No se pudo preparar la impresión" });
        return;
      }
      const images = Array.from(target.document.images);
      Promise.all(images.map((image) => image.complete
        ? Promise.resolve()
        : new Promise<void>((done) => { image.onload = () => done(); image.onerror = () => done(); })))
        .then(() => {
          target.focus();
          target.print();
          window.setTimeout(() => frame.remove(), 1000);
          resolve({ ok: true });
        });
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

export async function printBarcodeLabels(labels: BarcodeLabelData[], onlyBarcode: boolean): Promise<LabelPrintResult> {
  if (labels.length === 0) return { ok: false, error: "Selecciona al menos una etiqueta" };
  const invalid = unprintableLabels(labels);
  if (invalid.length > 0) return { ok: false, error: unprintableLabelsMessage(invalid) };
  const iframeHtml = () => buildBarcodeLabelsHtml(labels, { onlyBarcode, logoSrc: absoluteLogoUrl() });
  if (window.pos?.printLabels) {
    try {
      // El proceso principal reemplaza el marcador por la ruta del logo empaquetado.
      return await window.pos.printLabels({ html: buildBarcodeLabelsHtml(labels, { onlyBarcode }) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Proceso principal sin el handler (p. ej. renderer actualizado sin reiniciar
      // Electron): se imprime desde el iframe con el mismo @page de 50.8 × 25.4 mm.
      if (/no handler registered/i.test(message)) {
        console.warn("[printBarcodeLabels] pos:printLabels no disponible; se usa impresión desde iframe.", message);
        return printInIframe(iframeHtml());
      }
      console.error("[printBarcodeLabels] error al imprimir:", message);
      return { ok: false, error: "No se pudieron imprimir las etiquetas. Intenta de nuevo; si continúa, reinicia la aplicación." };
    }
  }
  return printInIframe(iframeHtml());
}

/** Vista previa en pantalla con el mismo HTML que se imprime. */
export function barcodeLabelsPreviewHtml(labels: BarcodeLabelData[], onlyBarcode: boolean): string {
  return buildBarcodeLabelsHtml(labels, { onlyBarcode, logoSrc: absoluteLogoUrl() });
}
