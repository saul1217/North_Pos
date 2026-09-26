import { Printer, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { usePos } from "@/context/PosContext";
import { getCategoryLabel } from "@/lib/pos/inventory";
import { SKU_LONG_WARNING, barcodeLabelQuality, type BarcodeLabelData } from "@/lib/pos/barcodeLabel";
import { barcodeLabelsPreviewHtml, printBarcodeLabels, unprintableLabels, unprintableLabelsMessage } from "@/lib/pos/printBarcodeLabels";
import { isCode128Encodable } from "@/lib/pos/code128";
import { parseCopiesDraft } from "@/lib/pos/copies";
import type { PosProduct } from "@/lib/pos/types";

const MAX_COPIES = 100;

type BarcodeEntry = {
  key: string;
  productId: string;
  name: string;
  variantLabel?: string;
  model?: string;
  category: PosProduct["category"];
  sku: string;
  upc?: string;
  stock: number;
  /** Precio de venta: el mismo que cobra el POS (variante ?? producto). */
  price: number;
};

function getBarcodeEntries(products: PosProduct[]): BarcodeEntry[] {
  return products.flatMap((product) => {
    if (product.variants.length > 0) {
      return product.variants.map((variant) => ({
        key: `${product.id}:${variant.id}`,
        productId: product.id,
        name: product.name,
        variantLabel: variant.label,
        model: variant.model || product.model,
        category: product.category,
        sku: variant.sku,
        upc: variant.upc,
        stock: variant.stock,
        price: variant.price ?? product.price,
      }));
    }
    return [{
      key: product.id,
      productId: product.id,
      name: product.name,
      model: product.model,
      category: product.category,
      sku: product.sku,
      upc: product.upc,
      stock: product.stock,
      price: product.price,
    }];
  }).filter((entry) => entry.sku.trim());
}

function toLabelData(entry: BarcodeEntry): BarcodeLabelData {
  return { code: entry.sku.trim(), name: entry.name, model: entry.model, variantLabel: entry.variantLabel, price: entry.price };
}

export default function PosCodigosBarrasPage() {
  const { products, catalogLoading, refreshCatalog } = usePos();
  const [query, setQuery] = useState("");
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [copyDrafts, setCopyDrafts] = useState<Record<string, string>>({});
  const [onlyBarcode, setOnlyBarcode] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const entries = useMemo(() => getBarcodeEntries(products), [products]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => [entry.name, entry.variantLabel, entry.sku, entry.upc, getCategoryLabel(entry.category)]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(q)));
  }, [entries, query]);
  const selectedCount = Object.values(copies).reduce((sum, count) => sum + count, 0);
  const selectedEntries = entries.flatMap((entry) => Array.from({ length: copies[entry.key] ?? 0 }, () => entry));
  const previewHtml = useMemo(() => {
    const unique = entries.filter((entry) => (copies[entry.key] ?? 0) > 0).slice(0, 12);
    return unique.length > 0 ? barcodeLabelsPreviewHtml(unique.map(toLabelData), onlyBarcode) : "";
  }, [entries, copies, onlyBarcode]);
  const longSelected = entries.filter((entry) => (copies[entry.key] ?? 0) > 0 && barcodeLabelQuality(entry.sku) === "long");
  const allVisibleSelected = filtered.length > 0 && filtered.every((entry) => (copies[entry.key] ?? 0) > 0);

  async function printSelected() {
    if (selectedEntries.length === 0 || printing) return;
    const invalid = unprintableLabels(selectedEntries.map(toLabelData));
    if (invalid.length > 0) {
      setPrintError(unprintableLabelsMessage(invalid));
      return;
    }
    setPrinting(true);
    setPrintError(null);
    try {
      const result = await printBarcodeLabels(selectedEntries.map(toLabelData), onlyBarcode);
      if (!result.ok && !result.cancelled) setPrintError(result.error ?? "No se pudieron imprimir las etiquetas.");
    } catch (error) {
      console.error("[CodigosBarras] error al imprimir etiquetas:", error);
      setPrintError("No se pudieron imprimir las etiquetas. Intenta de nuevo; si continúa, reinicia la aplicación.");
    } finally {
      setPrinting(false);
    }
  }

  function toggleEntry(entry: BarcodeEntry) {
    setCopies((current) => ({ ...current, [entry.key]: current[entry.key] ? 0 : 1 }));
    setCopyDrafts(({ [entry.key]: _removed, ...rest }) => rest);
  }

  function setEntryCopies(entry: BarcodeEntry, value: string) {
    // Se conserva lo escrito mientras se edita (si «1.5» se mostrara como «1»,
    // la siguiente tecla «5» formaría «15»); la cantidad usa solo el primer
    // tramo de dígitos y el campo se normaliza al salir.
    const raw = value.slice(0, 8);
    const digits = parseCopiesDraft(raw);
    setCopyDrafts((current) => ({ ...current, [entry.key]: raw }));
    if (digits) {
      const count = Math.min(MAX_COPIES, Number.parseInt(digits, 10));
      setCopies((current) => ({ ...current, [entry.key]: count }));
    }
  }

  function commitEntryCopies(entry: BarcodeEntry) {
    const rawDraft = copyDrafts[entry.key];
    if (rawDraft === undefined) return;
    const draft = parseCopiesDraft(rawDraft);
    setCopyDrafts(({ [entry.key]: _removed, ...rest }) => rest);
    setCopies((current) => {
      const previous = current[entry.key] ?? 0;
      // Vacío al salir: una fila seleccionada queda en 1; una sin seleccionar sigue en 0.
      const count = draft ? Math.min(MAX_COPIES, Math.max(1, Number.parseInt(draft, 10))) : (previous > 0 ? 1 : 0);
      return { ...current, [entry.key]: count };
    });
  }

  function toggleVisible() {
    setCopies((current) => {
      const next = { ...current };
      filtered.forEach((entry) => { next[entry.key] = allVisibleSelected ? 0 : 1; });
      return next;
    });
    setCopyDrafts({});
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="pos-no-print border-b border-north-border bg-white px-4 py-5 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em]">Códigos de barras</h1>
            <p className="mt-1 text-sm text-north-muted">Imprime etiquetas locales Code 128 para productos y variantes.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void refreshCatalog()} className="inline-flex h-10 items-center gap-2 border border-north-border px-3 text-sm font-semibold" disabled={catalogLoading}>
              <RefreshCw className={`h-4 w-4 ${catalogLoading ? "animate-spin" : ""}`} />Actualizar
            </button>
            <button type="button" onClick={() => setOnlyBarcode((current) => !current)} aria-pressed={onlyBarcode} className={`inline-flex h-10 items-center gap-2 border px-3 text-sm font-semibold ${onlyBarcode ? "border-north-primary bg-north-primary/10 text-north-primary" : "border-north-border"}`}>
              <Printer className="h-4 w-4" />{onlyBarcode ? "Solo código activo" : "Solo código"}
            </button>
            <button type="button" onClick={() => void printSelected()} disabled={selectedCount === 0 || printing} className="inline-flex h-10 items-center gap-2 bg-north-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              <Printer className="h-4 w-4" />{printing ? "Imprimiendo..." : `Imprimir ${selectedCount > 0 ? `(${selectedCount})` : "etiquetas"}`}
            </button>
          </div>
        </div>
        {longSelected.length > 0 && <p className="mt-3 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">{SKU_LONG_WARNING} Seleccionados: {longSelected.map((entry) => entry.sku.trim()).join(", ")}.</p>}
        {printError && <p className="mt-3 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{printError}</p>}
        <div className="relative mt-4 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-north-steel" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, variante o SKU..." className="h-10 w-full border border-north-border bg-north-background pl-10 pr-3 text-sm" />
        </div>
      </header>

      <main className="pos-no-print min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-north-muted">{entries.length} códigos disponibles · {selectedCount} etiquetas seleccionadas</p>
          <button type="button" onClick={toggleVisible} disabled={filtered.length === 0} className="h-9 border border-north-border px-3 text-xs font-semibold disabled:opacity-50">
            {allVisibleSelected ? "Quitar visibles" : "Seleccionar visibles"}
          </button>
        </div>
        <div className="overflow-x-auto border border-north-border bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-north-border bg-north-background text-xs uppercase text-north-steel">
              <tr><th className="w-12 px-4 py-3">Sel.</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">SKU local</th><th className="px-4 py-3">UPC global</th><th className="px-4 py-3">Stock</th><th className="w-28 px-4 py-3">Copias</th></tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const count = copies[entry.key] ?? 0;
                return <tr key={entry.key} className={`border-b border-north-border ${count > 0 ? "bg-north-primary/5" : ""}`}>
                  <td className="px-4 py-3"><input type="checkbox" checked={count > 0} onChange={() => toggleEntry(entry)} aria-label={`Seleccionar ${entry.name} ${entry.variantLabel ?? ""}`} /></td>
                  <td className="px-4 py-3"><p className="font-medium">{entry.name}</p><p className="text-xs text-north-muted">{entry.variantLabel ?? getCategoryLabel(entry.category)}</p></td>
                  <td className="px-4 py-3 font-mono text-xs">{entry.sku}
                    {!isCode128Encodable(entry.sku.trim()) && <span className="mt-1 block font-sans text-[11px] font-semibold text-red-700">SKU no imprimible: tiene Ñ, acentos u otros caracteres no válidos.</span>}
                    {barcodeLabelQuality(entry.sku) === "long" && <span className="mt-1 block font-sans text-[11px] font-semibold text-amber-700">{SKU_LONG_WARNING}</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{entry.upc || "—"}</td>
                  <td className="px-4 py-3">{entry.stock}</td>
                  <td className="px-4 py-3"><input type="text" inputMode="numeric" pattern="[0-9]*" value={copyDrafts[entry.key] ?? String(count)} onChange={(event) => setEntryCopies(entry, event.target.value)} onBlur={() => commitEntryCopies(entry)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); /* Enter = salir del campo: misma normalización que al perder el foco («1.5» → «1»); no imprime. */ event.currentTarget.blur(); } }} aria-label={`Copias de ${entry.name}`} className="h-9 w-20 border border-north-border px-2 text-sm" /></td>
                </tr>;
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="px-6 py-12 text-center text-sm text-north-muted">No hay productos que coincidan con la búsqueda.</p>}
        </div>
      </main>

      {previewHtml && <section className="pos-no-print border-t border-north-border bg-white p-4 md:px-6">
        <p className="mb-2 text-xs font-semibold uppercase text-north-steel">Vista previa (50.8 × 25.4 mm)</p>
        <iframe title="Vista previa de etiquetas" srcDoc={previewHtml} className="h-48 w-full border border-north-border bg-north-background" />
      </section>}
    </div>
  );
}
