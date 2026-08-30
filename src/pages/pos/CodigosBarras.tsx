import { Printer, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { usePos } from "@/context/PosContext";
import { getCategoryLabel } from "@/lib/pos/inventory";
import { code128Bits } from "@/lib/pos/code128";
import type { PosProduct } from "@/lib/pos/types";

type BarcodeEntry = {
  key: string;
  productId: string;
  name: string;
  variantLabel?: string;
  category: PosProduct["category"];
  sku: string;
  upc?: string;
  stock: number;
};

function getBarcodeEntries(products: PosProduct[]): BarcodeEntry[] {
  return products.flatMap((product) => {
    if (product.variants.length > 0) {
      return product.variants.map((variant) => ({
        key: `${product.id}:${variant.id}`,
        productId: product.id,
        name: product.name,
        variantLabel: variant.label,
        category: product.category,
        sku: variant.sku,
        upc: variant.upc,
        stock: variant.stock,
      }));
    }
    return [{
      key: product.id,
      productId: product.id,
      name: product.name,
      category: product.category,
      sku: product.sku,
      upc: product.upc,
      stock: product.stock,
    }];
  }).filter((entry) => entry.sku.trim());
}

function BarcodeGraphic({ value }: { value: string }) {
  const bits = code128Bits(value);
  const paddedBits = `0000000000${bits}0000000000`;
  return (
    <svg
      viewBox={`0 0 ${paddedBits.length} 46`}
      preserveAspectRatio="none"
      className="h-14 w-full"
      role="img"
      aria-label={`Código de barras ${value}`}
      shapeRendering="crispEdges"
    >
      <rect width="100%" height="100%" fill="white" />
      {paddedBits.split("").map((bit, index) => bit === "1" && (
        <rect key={index} x={index} y="0" width="1" height="34" fill="black" />
      ))}
    </svg>
  );
}

function BarcodeLabel({ entry, onlyBarcode }: { entry: BarcodeEntry; onlyBarcode: boolean }) {
  return (
    <article className="pos-barcode-label bg-white text-black">
      {!onlyBarcode && <>
        <p className="truncate text-[10px] font-semibold uppercase">North Bike</p>
        <p className="truncate text-xs font-medium">{entry.name}</p>
        {entry.variantLabel && <p className="truncate text-[10px]">{entry.variantLabel}</p>}
      </>}
      <BarcodeGraphic value={entry.sku} />
      {!onlyBarcode && <p className="text-center font-mono text-[11px] tracking-wide">{entry.sku}</p>}
    </article>
  );
}

export default function PosCodigosBarrasPage() {
  const { products, catalogLoading, refreshCatalog } = usePos();
  const [query, setQuery] = useState("");
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [onlyBarcode, setOnlyBarcode] = useState(false);
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
  const allVisibleSelected = filtered.length > 0 && filtered.every((entry) => (copies[entry.key] ?? 0) > 0);

  function toggleEntry(entry: BarcodeEntry) {
    setCopies((current) => ({ ...current, [entry.key]: current[entry.key] ? 0 : 1 }));
  }

  function setEntryCopies(entry: BarcodeEntry, value: string) {
    const count = Math.max(0, Math.min(100, Number.parseInt(value, 10) || 0));
    setCopies((current) => ({ ...current, [entry.key]: count }));
  }

  function toggleVisible() {
    setCopies((current) => {
      const next = { ...current };
      filtered.forEach((entry) => { next[entry.key] = allVisibleSelected ? 0 : 1; });
      return next;
    });
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
            <button type="button" onClick={() => window.print()} disabled={selectedCount === 0} className="inline-flex h-10 items-center gap-2 bg-north-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              <Printer className="h-4 w-4" />Imprimir {selectedCount > 0 ? `(${selectedCount})` : "etiquetas"}
            </button>
          </div>
        </div>
        <div className="mt-4 border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          El código local se genera con el SKU exacto. Al imprimir, elige la impresora de etiquetas instalada en esta computadora.
        </div>
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
                  <td className="px-4 py-3 font-mono text-xs">{entry.sku}</td>
                  <td className="px-4 py-3 font-mono text-xs">{entry.upc || "—"}</td>
                  <td className="px-4 py-3">{entry.stock}</td>
                  <td className="px-4 py-3"><input type="number" min="0" max="100" value={count} onChange={(event) => setEntryCopies(entry, event.target.value)} aria-label={`Copias de ${entry.name}`} className="h-9 w-20 border border-north-border px-2 text-sm" /></td>
                </tr>;
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="px-6 py-12 text-center text-sm text-north-muted">No hay productos que coincidan con la búsqueda.</p>}
        </div>
      </main>

      {selectedEntries.length > 0 && <section className="pos-barcode-print grid grid-cols-[repeat(auto-fill,minmax(58mm,1fr))] gap-4 p-4">
        {selectedEntries.map((entry, index) => <BarcodeLabel key={`${entry.key}-${index}`} entry={entry} onlyBarcode={onlyBarcode} />)}
      </section>}
    </div>
  );
}
