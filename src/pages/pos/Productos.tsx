"use client";

import Image from "next/image";
import { Eye, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { Fragment, useMemo, useState, type FormEvent } from "react";
import { usePos } from "@/context/PosContext";
import { categoryLabels, formatPosPrice } from "@/lib/pos/inventory";
import type { PosProduct } from "@/lib/pos/types";
import type { ProductInput } from "@/lib/catalog/api";

type ProductForm = {
  sku: string;
  name: string;
  category: PosProduct["category"];
  price: string;
  stock: string;
  minStock: string;
  barcode: string;
  location: string;
  image: string;
  status: PosProduct["status"];
  requiresSerial: boolean;
};

const emptyForm: ProductForm = {
  sku: "",
  name: "",
  category: "accesorios",
  price: "",
  stock: "0",
  minStock: "0",
  barcode: "",
  location: "",
  image: "",
  status: "activo",
  requiresSerial: false,
};

function formFromProduct(product: PosProduct): ProductForm {
  return {
    sku: product.sku,
    name: product.name,
    category: product.category,
    price: String(product.price),
    stock: String(product.stock),
    minStock: String(product.minStock),
    barcode: product.barcode,
    location: product.location,
    image: product.image,
    status: product.status,
    requiresSerial: product.requiresSerial,
  };
}

export default function PosProductosPage() {
  const {
    products,
    catalogLoading,
    catalogError,
    refreshCatalog,
    createProduct,
    updateProduct,
  } = usePos();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PosProduct | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(product: PosProduct) {
    setEditing(product);
    setForm(formFromProduct(product));
    setFormError(null);
    setFormOpen(true);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.sku.trim() || Number(form.price) < 0) {
      setFormError("Captura nombre, SKU y un precio válido.");
      return;
    }
    const input: ProductInput = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      category: form.category,
      price: Number(form.price),
      stock: Number(form.stock) || 0,
      minStock: Number(form.minStock) || 0,
      barcode: form.barcode.trim(),
      location: form.location.trim(),
      image: form.image.trim(),
      status: form.status,
      hasVariants: editing?.hasVariants ?? false,
      requiresSerial: form.requiresSerial,
      variants: editing?.variants ?? [],
    };
    setSaving(true);
    setFormError(null);
    try {
      if (editing) await updateProduct(editing.id, input);
      else await createProduct(input);
      setFormOpen(false);
    } catch (error) {
      setFormError((error as Error).message || "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  }

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
            onClick={openCreate}
            className="inline-flex h-10 items-center gap-2 bg-north-primary/80 px-4 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Nuevo producto
            </button>
          <button
            type="button"
            onClick={() => void refreshCatalog()}
            disabled={catalogLoading}
            className="inline-flex h-10 items-center gap-2 border border-north-border px-3 text-sm font-semibold text-north-ink disabled:opacity-50"
            title="Actualizar catálogo"
          >
            <RefreshCw className={`h-4 w-4 ${catalogLoading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
        {catalogError && (
          <p className="mt-3 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Sin conexión al backend. Se muestra el catálogo guardado localmente.
          </p>
        )}
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
                          <button type="button" className="p-2 text-north-muted" aria-label={`Ver ${product.name}`}>
                            <Eye className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => openEdit(product)} className="p-2 text-north-muted" aria-label={`Editar ${product.name}`}>
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
        {filtered.length === 0 && (
          <div className="border-x border-b border-north-border bg-white px-6 py-12 text-center text-sm text-north-muted">
            {query ? "No hay productos que coincidan con la búsqueda." : "Aún no hay productos. Crea el primero para comenzar a vender."}
          </div>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 md:p-8" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
          <form onSubmit={submitForm} className="w-full max-w-2xl border border-north-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-north-border px-5 py-4">
              <div>
                <h2 id="product-form-title" className="font-display text-lg font-bold uppercase tracking-[0.06em]">
                  {editing ? "Editar producto" : "Nuevo producto"}
                </h2>
                <p className="mt-1 text-xs text-north-muted">Los cambios se guardan en el catálogo central.</p>
              </div>
              <button type="button" onClick={() => setFormOpen(false)} className="p-2 text-north-muted" aria-label="Cerrar formulario"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="text-sm font-medium">Nombre<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label>
              <label className="text-sm font-medium">SKU<input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label>
              <label className="text-sm font-medium">Categoría<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ProductForm["category"] })} className="mt-1 h-10 w-full border border-north-border bg-white px-3 font-normal">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-sm font-medium">Precio<input required min="0" step="0.01" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label>
              <label className="text-sm font-medium">Stock<input min="0" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label>
              <label className="text-sm font-medium">Stock mínimo<input min="0" type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label>
              <label className="text-sm font-medium">Código de barras<input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label>
              <label className="text-sm font-medium">Ubicación<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label>
              <label className="text-sm font-medium">Estado<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProductForm["status"] })} className="mt-1 h-10 w-full border border-north-border bg-white px-3 font-normal"><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium"><input type="checkbox" checked={form.requiresSerial} onChange={(e) => setForm({ ...form, requiresSerial: e.target.checked })} /> Requiere número de serie</label>
              <label className="text-sm font-medium md:col-span-2">URL de imagen (opcional)<input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label>
            </div>
            {formError && <p className="mx-5 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
            <div className="flex justify-end gap-2 border-t border-north-border px-5 py-4">
              <button type="button" onClick={() => setFormOpen(false)} className="h-10 border border-north-border px-4 text-sm font-semibold">Cancelar</button>
              <button type="submit" disabled={saving} className="h-10 bg-north-primary px-5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando..." : "Guardar producto"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
