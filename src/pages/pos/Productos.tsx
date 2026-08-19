"use client";

import Image from "next/image";
import { Eye, Pencil, Plus, Search } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { usePos } from "@/context/PosContext";
import { categoryLabels, formatPosPrice } from "@/lib/pos/inventory";

export default function PosProductosPage() {
  const { products } = usePos();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        categoryLabels[p.category]?.toLowerCase().includes(q),
    );
  }, [products, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-north-border bg-white px-4 py-5 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em]">
              Productos
            </h1>
            <p className="mt-1 text-sm text-north-muted">
              Catálogo interno con SKU, variantes y series
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 bg-north-primary/80 px-4 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Nuevo producto
          </button>
        </div>
        <div className="relative mt-4 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-north-steel" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto..."
            className="h-10 w-full border border-north-border bg-north-background pl-10 pr-3 text-sm"
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <div className="overflow-hidden rounded-sm border border-north-border bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-north-border bg-north-background text-xs uppercase text-north-steel">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
                {filtered.map((product) => {
                  const isOpen = expanded === product.id;
                return (
                  <Fragment key={product.id}>
                    <tr
                      key={product.id}
                      className="border-b border-north-border hover:bg-north-background/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden bg-north-border">
                            <Image
                              src={product.image}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="40px"
                            />
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded(isOpen ? null : product.id)
                              }
                              className="text-left font-medium hover:text-north-primary"
                            >
                              {product.name}
                            </button>
                            <p className="text-xs text-north-muted">
                              {categoryLabels[product.category]}
                              {product.hasVariants && " · Con variantes"}
                              {product.requiresSerial && " · Con serie"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{product.sku}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {product.barcode}
                      </td>
                      <td className="px-4 py-3">{formatPosPrice(product.price)}</td>
                      <td className="px-4 py-3">{product.stock}</td>
                      <td className="px-4 py-3 text-xs">{product.location}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 text-[11px] font-semibold uppercase ${
                            product.status === "activo"
                              ? "bg-north-primary/10 text-north-primary"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {product.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button type="button" className="p-2 text-north-muted">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button type="button" className="p-2 text-north-muted">
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${product.id}-detail`}>
                        <td colSpan={8} className="bg-north-background px-6 py-4">
                          {product.variants.length > 0 && (
                            <div className="mb-4">
                              <p className="mb-2 text-xs font-semibold uppercase text-north-steel">
                                Variantes
                              </p>
                              <div className="grid gap-2 md:grid-cols-2">
                                {product.variants.map((v) => (
                                  <div
                                    key={v.id}
                                    className="border border-north-border bg-white px-3 py-2 text-xs"
                                  >
                                    <p className="font-medium">{v.label}</p>
                                    <p>SKU: {v.sku}</p>
                                    <p>Código: {v.barcode}</p>
                                    <p>
                                      Stock: {v.stock} · Mín: {v.minStock} ·{" "}
                                      {v.location}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {product.serialUnits.length > 0 && (
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase text-north-steel">
                                Unidades con serie
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {product.serialUnits.map((s) => (
                                  <span
                                    key={s.id}
                                    className="border border-north-border bg-white px-2 py-1 font-mono text-xs"
                                  >
                                    {s.serialNumber} ({s.status})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
