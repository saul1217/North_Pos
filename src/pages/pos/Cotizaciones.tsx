"use client";

import { FileText, Plus, Printer, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { usePos } from "@/context/PosContext";
import { formatPosPrice, makeLineId } from "@/lib/pos/inventory";
import type { PosProduct, Quotation, SaleLineItem } from "@/lib/pos/types";
import Image from "next/image";
import { logoSrc } from "@/lib/brand";

function QuotePrint({ quote }: { quote: Quotation }) {
  return (
    <div className="pos-ticket-print mx-auto max-w-md bg-white p-6 text-black">
      <div className="text-center">
        <Image src={logoSrc} alt="North Bike" width={56} height={56} className="mx-auto mb-2 h-12 w-12 object-contain" />
        <p className="font-display text-lg font-bold uppercase">North Bike</p>
        <p className="text-xs">Cotización — no fiscal</p>
      </div>
      <div className="my-4 border-y border-dashed border-gray-300 py-3 text-xs">
        <div className="flex justify-between">
          <span>Folio</span>
          <span>{quote.folio}</span>
        </div>
        <div className="flex justify-between">
          <span>Fecha</span>
          <span>{new Date(quote.createdAt).toLocaleDateString("es-MX")}</span>
        </div>
        {quote.customer?.name && (
          <div className="flex justify-between">
            <span>Cliente</span>
            <span>{quote.customer.name}</span>
          </div>
        )}
      </div>
      <ul className="space-y-2 text-xs">
        {quote.items.map((i) => (
          <li key={i.lineId} className="flex justify-between">
            <span>
              {i.name} × {i.quantity}
            </span>
            <span>{formatPosPrice(i.price * i.quantity)}</span>
          </li>
        ))}
      </ul>
      {quote.notes && (
        <p className="mt-4 text-xs text-gray-600">Obs: {quote.notes}</p>
      )}
      <div className="mt-4 border-t border-gray-300 pt-2 text-sm font-bold">
        Total: {formatPosPrice(quote.total)}
      </div>
    </div>
  );
}

export default function PosCotizacionesPage() {
  const {
    quotations,
    products,
    createQuotation,
    convertQuotation,
    cancelQuotation,
  } = usePos();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [printQuote, setPrintQuote] = useState<Quotation | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<
    { product: PosProduct; qty: number }[]
  >([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quotations;
    return quotations.filter((c) => c.folio.toLowerCase().includes(q));
  }, [quotations, query]);

  const availableProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (p.status !== "activo") return false;
      if (!q) return true;
      return [p.name, p.sku, p.upc, p.barcode].some((value) => value?.toLowerCase().includes(q));
    });
  }, [products, productQuery]);

  function toggleProduct(p: PosProduct) {
    setSelected((prev) => {
      if (prev.find((x) => x.product.id === p.id)) {
        return prev.filter((x) => x.product.id !== p.id);
      }
      return [...prev, { product: p, qty: 1 }];
    });
  }

  function submitQuote() {
    const items: SaleLineItem[] = selected.map(({ product, qty }) => ({
      lineId: makeLineId(product.id),
      productId: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      quantity: qty,
    }));
    if (items.length === 0) return;
    createQuotation({
      customer: customerName ? { name: customerName } : undefined,
      items,
      notes,
    });
    setShowNew(false);
    setShowProductPicker(false);
    setSelected([]);
    setCustomerName("");
    setNotes("");
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-north-border bg-white px-4 py-5 md:px-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em]">
                Cotizaciones
              </h1>
              <p className="mt-1 text-sm text-north-muted">
                Presupuestos sin afectar inventario
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="inline-flex h-10 items-center gap-2 bg-north-primary px-4 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Nueva cotización
            </button>
          </div>
          <div className="relative mt-4 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-north-steel" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar folio..."
              className="h-10 w-full border border-north-border bg-north-background pl-10 pr-3 text-sm"
            />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-north-border bg-north-background text-xs uppercase text-north-steel">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.id} className="border-b border-north-border">
                  <td className="px-4 py-3 font-medium">{q.folio}</td>
                  <td className="px-4 py-3">{q.customer?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-semibold text-north-primary">
                    {formatPosPrice(q.total)}
                  </td>
                  <td className="px-4 py-3 capitalize">{q.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setPrintQuote(q)}
                        className="text-north-primary hover:underline"
                      >
                        <Printer className="inline h-3 w-3" /> Imprimir
                      </button>
                      {q.status === "vigente" && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              convertQuotation(q.id);
                              router.push("/pos/venta");
                            }}
                            className="text-north-primary hover:underline"
                          >
                            Convertir en venta
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelQuotation(q.id)}
                            className="text-red-600 hover:underline"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-north-dark/60"
            onClick={() => setShowNew(false)}
          />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-5">
            <h3 className="flex items-center gap-2 font-display text-lg font-bold">
              <FileText className="h-5 w-5" />
              Nueva cotización
            </h3>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Cliente (opcional)"
              className="mt-4 h-10 w-full border border-north-border px-3 text-sm"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones..."
              className="mt-2 h-20 w-full border border-north-border p-2 text-sm"
            />
            <div className="mt-4 border border-north-border bg-north-background px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>{selected.length ? `${selected.length} producto${selected.length === 1 ? "" : "s"} seleccionado${selected.length === 1 ? "" : "s"}` : "Ningún producto seleccionado"}</span>
                <button type="button" onClick={() => setShowProductPicker(true)} className="border border-north-primary px-3 py-2 text-xs font-semibold text-north-primary">
                  Buscar productos
                </button>
              </div>
              {selected.length > 0 && <p className="mt-2 text-xs text-north-muted">{selected.map(({ product }) => product.name).join(", ")}</p>}
            </div>
            <button
              type="button"
              onClick={submitQuote}
              className="mt-4 h-10 w-full bg-north-primary text-sm text-white"
            >
              Generar cotización
            </button>
          </div>
        </div>
      )}

      {showProductPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-north-dark/60" onClick={() => setShowProductPicker(false)} />
          <div className="relative flex max-h-[85vh] w-full max-w-xl flex-col bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold">Buscar productos</h3>
                <p className="mt-1 text-xs text-north-muted">Busca por nombre, SKU, UPC o código local.</p>
              </div>
              <button type="button" onClick={() => setShowProductPicker(false)} className="text-sm text-north-muted hover:text-black">Cerrar</button>
            </div>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-north-steel" />
              <input autoFocus value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Buscar producto..." className="h-10 w-full border border-north-border pl-10 pr-3 text-sm" />
            </div>
            <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
              {availableProducts.length === 0 && <p className="py-8 text-center text-sm text-north-muted">No se encontraron productos.</p>}
              {availableProducts.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center justify-between gap-3 border border-north-border px-3 py-2 text-sm hover:bg-north-background">
                  <span><input className="mr-2" type="checkbox" checked={selected.some((x) => x.product.id === p.id)} onChange={() => toggleProduct(p)} />{p.name}<span className="ml-2 text-xs text-north-muted">{p.sku}</span></span>
                  <span className="font-semibold text-north-primary">{formatPosPrice(p.price)}</span>
                </label>
              ))}
            </div>
            <button type="button" onClick={() => setShowProductPicker(false)} className="mt-4 h-10 w-full bg-north-primary text-sm text-white">Usar productos seleccionados ({selected.length})</button>
          </div>
        </div>
      )}

      {printQuote && (
        <div className="pos-no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-north-dark/60 p-4 pt-12">
          <div className="w-full max-w-md">
            <QuotePrint quote={printQuote} />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="h-10 flex-1 bg-north-primary text-sm text-white"
              >
                Imprimir
              </button>
              <button
                type="button"
                onClick={() => setPrintQuote(null)}
                className="h-10 flex-1 border border-north-border bg-white text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
