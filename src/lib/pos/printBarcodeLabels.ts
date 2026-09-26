import { logoSrc } from "@/lib/brand";
import { buildBarcodeLabelsHtml, type BarcodeLabelData } from "@/lib/pos/barcodeLabel";

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
  if (window.pos?.printLabels) {
    // El proceso principal reemplaza el marcador por la ruta del logo empaquetado.
    return window.pos.printLabels({ html: buildBarcodeLabelsHtml(labels, { onlyBarcode }) });
  }
  return printInIframe(buildBarcodeLabelsHtml(labels, { onlyBarcode, logoSrc: absoluteLogoUrl() }));
}

/** Vista previa en pantalla con el mismo HTML que se imprime. */
export function barcodeLabelsPreviewHtml(labels: BarcodeLabelData[], onlyBarcode: boolean): string {
  return buildBarcodeLabelsHtml(labels, { onlyBarcode, logoSrc: absoluteLogoUrl() });
}
