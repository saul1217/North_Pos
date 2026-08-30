"use client";

import Image from "next/image";
import { Check, Eye, Minus, PackagePlus, Pencil, Plus, RefreshCw, ScanBarcode, Search, Trash2, Upload, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { usePos } from "@/context/PosContext";
import { categoryLabels, formatPosPrice, getCategoryLabel } from "@/lib/pos/inventory";
import type { PosProduct, ProductVariant, SerialUnit } from "@/lib/pos/types";
import type { ProductInput } from "@/lib/catalog/api";
import { uploadProductImage } from "@/lib/catalog/api";
import { getAuthSession } from "@/lib/auth";

type ProductForm = {
  sku: string;
  name: string;
  category: PosProduct["category"];
  price: string;
  stock: string;
  minStock: string;
  upc: string;
  barcode: string;
  image: string;
  images: string[];
  status: PosProduct["status"];
  requiresSerial: boolean;
  variants: ProductVariant[];
  serialUnits: SerialUnit[];
};

type InventoryReceiptLine = {
  id: string;
  productId: string;
  variantId?: string;
  upc: string;
  quantity: number;
};

const emptyForm: ProductForm = {
  sku: "",
  name: "",
  category: "accesorios",
  price: "",
  stock: "0",
  minStock: "0",
  upc: "",
  barcode: "",
  image: "",
  images: [],
  status: "activo",
  requiresSerial: false,
  variants: [],
  serialUnits: [],
};

function formFromProduct(product: PosProduct): ProductForm {
  return {
    sku: product.sku,
    name: product.name,
    category: product.category,
    price: String(product.price),
    stock: String(product.stock),
    minStock: String(product.minStock),
    upc: product.upc ?? (product.barcode !== product.sku ? product.barcode : ""),
    barcode: product.sku,
    image: product.image,
    images: product.images ?? [],
    status: product.status,
    requiresSerial: product.requiresSerial,
    variants: product.variants,
    serialUnits: product.serialUnits,
  };
}

export default function PosProductosPage({ onlyCategory, title = "Productos" }: { onlyCategory?: string; title?: string }) {
  const {
    products,
    catalogLoading,
    catalogError,
    refreshCatalog,
    receiveInventory,
    createProduct,
    updateProduct,
    deleteProduct,
  } = usePos();
  const canManageProducts = getAuthSession()?.user.role === "admin";
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PosProduct | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PosProduct | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [productMessage, setProductMessage] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptCode, setReceiptCode] = useState("");
  const [receiptLines, setReceiptLines] = useState<InventoryReceiptLine[]>([]);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = onlyCategory ? products.filter((product) => product.category === onlyCategory) : products;
    if (!q) return source;
    return source.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.upc ?? "").toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        getCategoryLabel(p.category).toLowerCase().includes(q),
    );
  }, [products, query, onlyCategory]);

  const categoryOptions = useMemo(() => {
    const options = new Map(Object.entries(categoryLabels));
    products.forEach((product) => {
      if (!options.has(product.category)) options.set(product.category, getCategoryLabel(product.category));
    });
    return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [products]);

  const receiptUnits = useMemo(
    () => receiptLines.reduce((sum, line) => sum + line.quantity, 0),
    [receiptLines],
  );
  const hasUnassignedVariant = receiptLines.some((line) => {
    const product = products.find((item) => item.id === line.productId);
    return Boolean(product?.hasVariants && product.variants.length > 0 && !line.variantId);
  });

  useEffect(() => {
    if (!receiptOpen) return;
    const focusTimer = window.setTimeout(() => receiptInputRef.current?.focus(), 0);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !receiptSaving) setReceiptOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [receiptOpen, receiptSaving]);

  function openReceipt() {
    setReceiptCode("");
    setReceiptLines([]);
    setReceiptError(null);
    setReceiptMessage(null);
    setReceiptOpen(true);
  }

  function closeReceipt() {
    if (receiptSaving) return;
    setReceiptOpen(false);
  }

  function scanInventoryUpc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const upc = receiptCode.trim();
    if (!upc) {
      setReceiptError("Escanea o captura un UPC global.");
      receiptInputRef.current?.focus();
      return;
    }

    const variantMatches = products.flatMap((product) =>
      product.variants
        .filter((variant) => variant.upc?.trim() === upc)
        .map((variant) => ({ product, variant })),
    );
    const productMatches = products.filter((product) => product.upc?.trim() === upc);

    if (variantMatches.length > 1 || (variantMatches.length === 0 && productMatches.length > 1)) {
      setReceiptError(`El UPC ${upc} está asignado a más de un artículo. Corrígelo antes de recibir inventario.`);
      setReceiptCode("");
      receiptInputRef.current?.focus();
      return;
    }

    const variantMatch = variantMatches[0];
    const product = variantMatch?.product ?? productMatches[0];
    if (!product) {
      setReceiptError(`El UPC ${upc} no está registrado. Agrégalo al producto antes de recibirlo.`);
      setReceiptCode("");
      receiptInputRef.current?.focus();
      return;
    }
    if (product.requiresSerial) {
      setReceiptError(`${product.name} requiere números de serie y no puede recibirse con la entrada rápida.`);
      setReceiptCode("");
      receiptInputRef.current?.focus();
      return;
    }

    const variantId = variantMatch?.variant.id
      ?? (product.variants.length === 1 ? product.variants[0].id : undefined);
    setReceiptLines((current) => {
      const existing = current.find((line) =>
        line.productId === product.id
        && line.variantId === variantId
        && (variantId !== undefined || line.upc === upc),
      );
      if (existing) {
        return current.map((line) =>
          line.id === existing.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, {
        id: crypto.randomUUID(),
        productId: product.id,
        variantId,
        upc,
        quantity: 1,
      }];
    });
    setReceiptCode("");
    setReceiptError(null);
    receiptInputRef.current?.focus();
  }

  function setReceiptQuantity(lineId: string, quantity: number) {
    setReceiptLines((current) => current.map((line) =>
      line.id === lineId ? { ...line, quantity: Math.max(1, Math.floor(quantity || 1)) } : line,
    ));
  }

  function setReceiptVariant(lineId: string, variantId: string) {
    setReceiptLines((current) => {
      const source = current.find((line) => line.id === lineId);
      if (!source) return current;
      const duplicate = current.find((line) =>
        line.id !== lineId && line.productId === source.productId && line.variantId === variantId,
      );
      if (duplicate) {
        return current
          .filter((line) => line.id !== lineId)
          .map((line) => line.id === duplicate.id
            ? { ...line, quantity: line.quantity + source.quantity }
            : line);
      }
      return current.map((line) => line.id === lineId
        ? { ...line, variantId: variantId || undefined }
        : line);
    });
    setReceiptError(null);
    receiptInputRef.current?.focus();
  }

  async function confirmReceipt() {
    if (receiptLines.length === 0) {
      setReceiptError("Escanea al menos un artículo.");
      return;
    }
    if (hasUnassignedVariant) {
      setReceiptError("Selecciona la variante de todos los artículos antes de confirmar.");
      return;
    }

    setReceiptSaving(true);
    setReceiptError(null);
    try {
      const units = receiveInventory(receiptLines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
      })));
      if (units <= 0) throw new Error("No se pudo aplicar la entrada de inventario.");
      await refreshCatalog();
      setReceiptOpen(false);
      setReceiptMessage(`${units} unidad${units === 1 ? "" : "es"} añadida${units === 1 ? "" : "s"} al inventario.`);
    } catch (error) {
      setReceiptError((error as Error).message || "No se pudo confirmar la entrada.");
    } finally {
      setReceiptSaving(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, category: onlyCategory ?? emptyForm.category });
    setImageFile(null);
    setImageFiles([]);
    setFormError(null);
    setProductMessage(null);
    setNewCategory("");
    setFormOpen(true);
  }

  function openEdit(product: PosProduct) {
    setEditing(product);
    setForm(formFromProduct(product));
    setImageFile(null);
    setImageFiles([]);
    setFormError(null);
    setProductMessage(null);
    setFormOpen(true);
  }

  function addCategory() {
    const label = newCategory.trim().replace(/\s+/g, " ");
    if (!label) return;
    const value = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setForm((current) => ({ ...current, category: value }));
    setNewCategory("");
  }

  async function toggleStatus(product: PosProduct) {
    setStatusSaving(product.id);
    setProductMessage(null);
    try {
      await updateProduct(product.id, {
        sku: product.sku,
        name: product.name,
        category: product.category,
        price: product.price,
        minStock: product.minStock,
        upc: product.upc,
        barcode: product.barcode,
        image: product.image,
        images: product.images ?? [],
        status: product.status === "activo" ? "inactivo" : "activo",
        hasVariants: product.hasVariants,
        requiresSerial: product.requiresSerial,
        variants: product.variants,
        serialUnits: product.serialUnits,
      });
      setProductMessage(`${product.name} ahora está ${product.status === "activo" ? "inactivo" : "activo"}.`);
    } catch (error) {
      setProductMessage(`No se pudo cambiar el estado: ${(error as Error).message || "intenta nuevamente"}`);
    } finally {
      setStatusSaving(null);
    }
  }

  function addVariant() {
    setForm((current) => ({
      ...current,
      variants: [...current.variants, { id: crypto.randomUUID(), sku: "", barcode: "", label: "", price: Number(current.price) || 0, stock: 0, minStock: 0, location: "" }],
    }));
  }

  function addSerialUnit() {
    setForm((current) => ({
      ...current,
      serialUnits: [...current.serialUnits, { id: crypto.randomUUID(), serialNumber: "", status: "disponible", location: "", variantId: current.variants[0]?.id }],
    }));
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.sku.trim() || Number(form.price) < 0) {
      setFormError("Captura nombre, SKU y un precio válido.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      let imageUrl = form.image.trim();
      if (imageFile) {
        try {
          imageUrl = (await uploadProductImage(imageFile)).url;
        } catch {
          // La imagen puede esperar; los datos del producto deben conservarse
          // localmente incluso cuando el servidor no está disponible.
        }
      }
      const galleryResults = imageFiles.length > 0
        ? await Promise.allSettled(imageFiles.map((file) => uploadProductImage(file)))
        : [];
      const uploadedGallery = galleryResults
        .filter((result): result is PromiseFulfilledResult<{ bucket: string; path: string; url: string }> => result.status === "fulfilled")
        .map((result) => result.value);
      const input: ProductInput = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      category: form.category,
      price: Number(form.price),
      stock: Number(form.stock) || 0,
      minStock: Number(form.minStock) || 0,
      upc: form.upc.trim(),
      barcode: form.sku.trim(),
      image: imageUrl,
      images: [...form.images, ...uploadedGallery.map((image) => image.url)],
      status: form.status,
      hasVariants: form.variants.length > 0,
      requiresSerial: form.requiresSerial,
      variants: form.variants.filter((variant) => variant.sku.trim() && variant.label.trim()).map((variant) => ({ ...variant, price: Number(variant.price) || 0, stock: Number(variant.stock) || 0, minStock: Number(variant.minStock) || 0 })),
      serialUnits: form.serialUnits.filter((unit) => unit.serialNumber.trim()).map((unit) => ({ ...unit, serialNumber: unit.serialNumber.trim() })),
      };
      if (editing) await updateProduct(editing.id, input);
      else await createProduct(input);
      setFormOpen(false);
      setProductMessage(`${editing ? "Producto actualizado" : "Producto creado"} correctamente.`);
    } catch (error) {
      setFormError((error as Error).message || "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const name = deleteTarget.name;
      await deleteProduct(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteMessage(`${name} se eliminó del catálogo y no volverá a sincronizarse.`);
    } catch (error) {
      setDeleteError((error as Error).message || "No se pudo eliminar el producto.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-north-border bg-white px-4 py-5 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em]">
              {title}
            </h1>
            <p className="mt-1 text-sm text-north-muted">
              {onlyCategory ? "Refacciones y piezas disponibles para el taller" : "Catálogo interno con SKU, variantes y series"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openReceipt}
              className="inline-flex h-10 items-center gap-2 border border-north-primary px-4 text-sm font-semibold text-north-primary transition hover:bg-north-primary/5 focus-visible:ring-2 focus-visible:ring-north-primary focus-visible:ring-offset-2"
            >
              <PackagePlus className="h-4 w-4" />
              Añadir inventario
            </button>
            {canManageProducts && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-10 items-center gap-2 bg-north-primary/80 px-4 text-sm font-semibold text-white transition hover:bg-north-primary focus-visible:ring-2 focus-visible:ring-north-primary focus-visible:ring-offset-2"
              >
                <Plus className="h-4 w-4" />
                Nuevo producto
              </button>
            )}
            <button
              type="button"
              onClick={() => void refreshCatalog()}
              disabled={catalogLoading}
              className="inline-flex h-10 items-center gap-2 border border-north-border px-3 text-sm font-semibold text-north-ink transition hover:bg-north-background focus-visible:ring-2 focus-visible:ring-north-primary focus-visible:ring-offset-2 disabled:opacity-50"
              title="Actualizar catálogo"
            >
              <RefreshCw className={`h-4 w-4 ${catalogLoading ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </div>
        {catalogError && (
          <p className="mt-3 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Sin conexión al backend. Se muestra el catálogo guardado localmente.
          </p>
        )}
        {deleteMessage && (
          <p className="mt-3 border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">
            {deleteMessage}
          </p>
        )}
        {receiptMessage && (
          <p className="mt-3 flex items-center gap-2 border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">
            <Check className="h-4 w-4" />
            {receiptMessage}
          </p>
        )}
        {productMessage && (
          <p className="mt-3 flex items-center gap-2 border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">
            <Check className="h-4 w-4" />
            {productMessage}
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
                <th className="px-4 py-3">UPC global</th>
                <th className="px-4 py-3">Code 128 local</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Stock</th>
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
                              {getCategoryLabel(product.category)}
                              {product.hasVariants && " · Con variantes"}
                              {product.requiresSerial && " · Con serie"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{product.sku}</td>
                      <td className="px-4 py-3 font-mono text-xs">{product.upc || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{product.barcode}</td>
                      <td className="px-4 py-3">{formatPosPrice(product.price)}</td>
                      <td className="px-4 py-3">{product.stock}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 text-[11px] font-semibold uppercase ${
                            product.status === "activo"
                              ? "bg-north-primary/10 text-north-primary"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {product.status === "activo" ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {canManageProducts && <button type="button" onClick={() => void toggleStatus(product)} disabled={statusSaving === product.id} className="inline-flex h-9 items-center gap-1 px-2 text-xs font-semibold text-north-primary hover:bg-north-background disabled:opacity-50" aria-label={`${product.status === "activo" ? "Desactivar" : "Activar"} ${product.name}`}>
                            <Eye className="h-4 w-4" />
                            {statusSaving === product.id ? "Guardando" : product.status === "activo" ? "Desactivar" : "Activar"}
                          </button>}
                          {canManageProducts && (
                            <>
                              <button type="button" onClick={() => openEdit(product)} className="p-2 text-north-muted" aria-label={`Editar ${product.name}`}>
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteMessage(null);
                                  setDeleteTarget(product);
                                }}
                                className="p-2 text-red-700 hover:bg-red-50"
                                aria-label={`Eliminar ${product.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
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
                                    <p>UPC global: {v.upc || "—"}</p>
                                    <p>Code 128 local: {v.barcode}</p>
                                    <p>
                                      Stock: {v.stock} · Mín: {v.minStock}
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
            {query ? "No hay productos que coincidan con la búsqueda." : onlyCategory ? "Aún no hay refacciones registradas." : "Aún no hay productos. Crea el primero para comenzar a vender."}
          </div>
        )}
      </div>

      {receiptOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inventory-receipt-title"
        >
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col border border-north-border bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-north-border px-5 py-4">
              <div>
                <h2 id="inventory-receipt-title" className="font-display text-lg font-bold uppercase tracking-[0.06em]">
                  Añadir inventario
                </h2>
                <p className="mt-1 text-xs text-north-muted">
                  Escanea el UPC global. Cada lectura suma una unidad al lote.
                </p>
              </div>
              <button
                type="button"
                onClick={closeReceipt}
                disabled={receiptSaving}
                className="grid h-11 w-11 place-items-center text-north-muted hover:bg-north-background focus-visible:ring-2 focus-visible:ring-north-primary disabled:opacity-50"
                aria-label="Cerrar recepción de inventario"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <form onSubmit={scanInventoryUpc} className="border border-north-border bg-north-background p-4">
                <label htmlFor="inventory-upc" className="text-sm font-semibold">
                  UPC global
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-north-steel" />
                    <input
                      ref={receiptInputRef}
                      id="inventory-upc"
                      value={receiptCode}
                      onChange={(event) => setReceiptCode(event.target.value)}
                      autoComplete="off"
                      inputMode="numeric"
                      placeholder="Escanea el código y presiona Enter"
                      className="h-12 w-full border border-north-border bg-white pl-11 pr-3 font-mono text-base focus-visible:ring-2 focus-visible:ring-north-primary focus-visible:ring-offset-2"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-12 items-center justify-center gap-2 bg-north-primary px-5 text-sm font-semibold text-white hover:bg-north-primary/90 focus-visible:ring-2 focus-visible:ring-north-primary focus-visible:ring-offset-2"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar
                  </button>
                </div>
                {receiptError && (
                  <p className="mt-3 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                    {receiptError}
                  </p>
                )}
              </form>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-base font-bold uppercase">Artículos escaneados</h3>
                    <p className="text-xs text-north-muted">Revisa cantidades antes de confirmar la entrada.</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-north-primary">
                    {receiptUnits} unidad{receiptUnits === 1 ? "" : "es"}
                  </span>
                </div>

                {receiptLines.length === 0 ? (
                  <div className="mt-3 border border-dashed border-north-border px-5 py-10 text-center">
                    <ScanBarcode className="mx-auto h-8 w-8 text-north-steel" />
                    <p className="mt-3 text-sm font-medium">Aún no has escaneado artículos</p>
                    <p className="mt-1 text-xs text-north-muted">El lector debe enviar Enter después de cada UPC.</p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {receiptLines.map((line) => {
                      const product = products.find((item) => item.id === line.productId);
                      if (!product) return null;
                      const variant = product.variants.find((item) => item.id === line.variantId);
                      const needsVariant = product.hasVariants && product.variants.length > 0 && !variant;
                      const currentStock = variant?.stock ?? product.stock;
                      return (
                        <div key={line.id} className="grid gap-3 border border-north-border p-3 md:grid-cols-[minmax(0,1fr)_100px_180px_44px] md:items-center">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{product.name}</p>
                            <p className="mt-0.5 truncate font-mono text-xs text-north-muted">
                              {variant?.sku ?? product.sku} · UPC {line.upc}
                            </p>
                            {needsVariant ? (
                              <label className="mt-2 block text-xs font-semibold text-amber-800">
                                Selecciona la variante
                                <select
                                  value=""
                                  onChange={(event) => setReceiptVariant(line.id, event.target.value)}
                                  className="mt-1 h-10 w-full border border-amber-300 bg-amber-50 px-2 text-sm font-normal text-north-ink focus-visible:ring-2 focus-visible:ring-north-primary"
                                >
                                  <option value="">Pendiente de seleccionar</option>
                                  {product.variants.map((option) => (
                                    <option key={option.id} value={option.id}>{option.label} · {option.sku}</option>
                                  ))}
                                </select>
                              </label>
                            ) : variant ? (
                              <p className="mt-1 text-xs text-north-primary">{variant.label}</p>
                            ) : null}
                          </div>
                          <div className="text-sm">
                            <p className="text-xs uppercase text-north-steel">Actual</p>
                            <p className="mt-1 font-semibold">{currentStock}</p>
                          </div>
                          <div>
                            <p className="mb-1 text-xs uppercase text-north-steel">Cantidad</p>
                            <div className="grid grid-cols-[44px_1fr_44px]">
                              <button
                                type="button"
                                onClick={() => setReceiptQuantity(line.id, line.quantity - 1)}
                                className="grid h-11 place-items-center border border-north-border hover:bg-north-background focus-visible:ring-2 focus-visible:ring-north-primary"
                                aria-label={`Restar una unidad de ${product.name}`}
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <input
                                aria-label={`Cantidad de ${product.name}`}
                                type="number"
                                min="1"
                                step="1"
                                value={line.quantity}
                                onChange={(event) => setReceiptQuantity(line.id, Number(event.target.value))}
                                className="h-11 min-w-0 border-y border-north-border text-center font-semibold focus-visible:ring-2 focus-visible:ring-north-primary"
                              />
                              <button
                                type="button"
                                onClick={() => setReceiptQuantity(line.id, line.quantity + 1)}
                                className="grid h-11 place-items-center border border-north-border hover:bg-north-background focus-visible:ring-2 focus-visible:ring-north-primary"
                                aria-label={`Sumar una unidad de ${product.name}`}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReceiptLines((current) => current.filter((item) => item.id !== line.id))}
                            className="grid h-11 w-11 place-items-center text-red-700 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600"
                            aria-label={`Quitar ${product.name} del lote`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-north-border bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-north-muted">
                Se registrará una entrada de <strong className="text-north-ink">{receiptUnits}</strong> unidad{receiptUnits === 1 ? "" : "es"}.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeReceipt}
                  disabled={receiptSaving}
                  className="h-11 border border-north-border px-4 text-sm font-semibold hover:bg-north-background focus-visible:ring-2 focus-visible:ring-north-primary disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmReceipt()}
                  disabled={receiptSaving || receiptLines.length === 0 || hasUnassignedVariant}
                  className="inline-flex h-11 items-center gap-2 bg-north-primary px-5 text-sm font-semibold text-white hover:bg-north-primary/90 focus-visible:ring-2 focus-visible:ring-north-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {receiptSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {receiptSaving ? "Guardando..." : "Confirmar entrada"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <label className="text-sm font-medium">SKU<input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value, barcode: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /><span className="mt-1 block text-xs font-normal text-north-muted">Identificador interno. El código local se genera con este valor.</span></label>
              <label className="text-sm font-medium">Categoría<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ProductForm["category"] })} className="mt-1 h-10 w-full border border-north-border bg-white px-3 font-normal">{categoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="mt-2 flex gap-2"><input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }} placeholder="Nueva categoría" className="h-9 min-w-0 flex-1 border border-north-border px-2 text-xs font-normal" /><button type="button" onClick={addCategory} className="h-9 border border-north-primary px-2 text-xs font-semibold text-north-primary">Agregar</button></span></label>
              <label className="text-sm font-medium">Precio<input required min="0" step="0.01" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label>
              <label className="text-sm font-medium">Stock<input min="0" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label>
              <label className="text-sm font-medium">Stock mínimo<input min="0" type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label>
              <label className="text-sm font-medium">UPC (código global, opcional)<input value={form.upc} onChange={(e) => setForm({ ...form, upc: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /><span className="mt-1 block text-xs font-normal text-north-muted">Captúralo solo si lo proporciona el fabricante.</span></label>
              <label className="text-sm font-medium">Estado<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProductForm["status"] })} className="mt-1 h-10 w-full border border-north-border bg-white px-3 font-normal"><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium"><input type="checkbox" checked={form.requiresSerial} onChange={(e) => setForm({ ...form, requiresSerial: e.target.checked })} /> Requiere número de serie</label>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Imagen del producto
                  <span className="mt-1 flex h-10 items-center gap-2 border border-north-border px-3 font-normal">
                    <Upload className="h-4 w-4 text-north-muted" />
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} className="min-w-0 flex-1 text-xs" />
                  </span>
                </label>
                <p className="mt-1 text-xs text-north-muted">JPG, PNG o WebP. Máximo 5 MB.</p>
                <label className="mt-3 block text-sm font-medium">URL existente (opcional)<input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label>
                {imageFile && <p className="mt-1 text-xs text-north-primary">Seleccionada: {imageFile.name}</p>}
                <label className="mt-3 block text-sm font-medium">Imágenes adicionales
                  <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))} className="mt-1 block w-full text-xs" />
                </label>
                {imageFiles.length > 0 && <p className="mt-1 text-xs text-north-primary">{imageFiles.length} imágenes nuevas seleccionadas</p>}
                {form.images.length > 0 && <div className="mt-3 flex gap-2 overflow-x-auto">{form.images.map((url, index) => <div key={`${url}-${index}`} className="relative shrink-0"><img src={url} alt={`Imagen ${index + 2}`} className="h-14 w-14 object-cover" /><button type="button" onClick={() => setForm({ ...form, images: form.images.filter((_, i) => i !== index) })} className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-red-700 text-xs text-white" aria-label={`Eliminar imagen ${index + 2}`}>×</button></div>)}</div>}
              </div>
            </div>
            <section className="border-t border-north-border px-5 py-4">
              <div className="flex items-center justify-between"><div><h3 className="font-display text-base font-bold uppercase">Variantes</h3><p className="text-xs text-north-muted">Talla, rueda, color o modelo con stock propio.</p></div><button type="button" onClick={addVariant} className="h-9 border border-north-border px-3 text-xs font-semibold">+ Agregar variante</button></div>
              <div className="mt-3 space-y-3">{form.variants.map((variant, index) => <div key={variant.id} className="grid gap-2 border border-north-border bg-north-background p-3 md:grid-cols-4"><input aria-label="Etiqueta de variante" placeholder="Etiqueta (Talla M / Negro)" value={variant.label} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, label: e.target.value } : v) })} className="h-9 border border-north-border bg-white px-2 text-xs" /><input aria-label="SKU de variante" placeholder="SKU" value={variant.sku} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, sku: e.target.value, barcode: e.target.value } : v) })} className="h-9 border border-north-border bg-white px-2 text-xs" /><input aria-label="UPC de variante" placeholder="UPC global (opcional)" value={variant.upc ?? ""} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, upc: e.target.value } : v) })} className="h-9 border border-north-border bg-white px-2 text-xs" /><input aria-label="Talla" placeholder="Talla" value={variant.size ?? ""} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, size: e.target.value } : v) })} className="h-9 border border-north-border bg-white px-2 text-xs" /><input aria-label="Rueda" placeholder="Rueda (29)" value={variant.wheelSize ?? ""} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, wheelSize: e.target.value } : v) })} className="h-9 border border-north-border bg-white px-2 text-xs" /><input aria-label="Color" placeholder="Color" value={variant.color ?? ""} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, color: e.target.value } : v) })} className="h-9 border border-north-border bg-white px-2 text-xs" /><input aria-label="Precio de variante" type="number" min="0" placeholder="Precio" value={variant.price} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, price: Number(e.target.value) || 0 } : v) })} className="h-9 border border-north-border bg-white px-2 text-xs" /><input aria-label="Stock de variante" type="number" min="0" placeholder="Stock" value={variant.stock} onChange={(e) => setForm({ ...form, variants: form.variants.map((v, i) => i === index ? { ...v, stock: Number(e.target.value) || 0 } : v) })} className="h-9 border border-north-border bg-white px-2 text-xs" /><button type="button" onClick={() => setForm({ ...form, variants: form.variants.filter((_, i) => i !== index) })} className="h-9 text-left text-xs text-red-700">Eliminar variante</button></div>)}</div>
            </section>
            <section className="border-t border-north-border px-5 py-4">
              <div className="flex items-center justify-between"><div><h3 className="font-display text-base font-bold uppercase">Números de serie</h3><p className="text-xs text-north-muted">Registra cada bicicleta individual.</p></div><button type="button" onClick={addSerialUnit} className="h-9 border border-north-border px-3 text-xs font-semibold">+ Agregar serie</button></div>
              <div className="mt-3 space-y-2">{form.serialUnits.map((unit, index) => <div key={unit.id} className="grid gap-2 md:grid-cols-[1fr_180px_auto]"><input aria-label="Número de serie" placeholder="Número de serie" value={unit.serialNumber} onChange={(e) => setForm({ ...form, serialUnits: form.serialUnits.map((s, i) => i === index ? { ...s, serialNumber: e.target.value } : s) })} className="h-9 border border-north-border px-2 text-xs" /><select aria-label="Variante de serie" value={unit.variantId ?? ""} onChange={(e) => setForm({ ...form, serialUnits: form.serialUnits.map((s, i) => i === index ? { ...s, variantId: e.target.value || undefined } : s) })} className="h-9 border border-north-border bg-white px-2 text-xs"><option value="">Producto base</option>{form.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label || "Variante sin etiqueta"}</option>)}</select><button type="button" onClick={() => setForm({ ...form, serialUnits: form.serialUnits.filter((_, i) => i !== index) })} className="h-9 text-xs text-red-700">Eliminar</button></div>)}</div>
            </section>
            {formError && <p className="mx-5 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
            <div className="flex justify-end gap-2 border-t border-north-border px-5 py-4">
              <button type="button" onClick={() => setFormOpen(false)} className="h-10 border border-north-border px-4 text-sm font-semibold">Cancelar</button>
              <button type="submit" disabled={saving} className="h-10 bg-north-primary px-5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando..." : "Guardar producto"}</button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title" aria-describedby="delete-product-description">
          <div className="w-full max-w-md border border-north-border bg-white shadow-xl">
            <div className="border-b border-north-border px-5 py-4">
              <h2 id="delete-product-title" className="font-display text-lg font-bold uppercase tracking-[0.06em]">
                Eliminar producto
              </h2>
            </div>
            <div className="space-y-3 px-5 py-5">
              <p id="delete-product-description" className="text-sm text-north-ink">
                ¿Seguro que deseas eliminar <strong>{deleteTarget.name}</strong>?
              </p>
              <p className="text-xs text-north-muted">
                SKU: {deleteTarget.sku}. Esta es la única acción que lo eliminará tanto del equipo como de la base de datos.
              </p>
              {deleteError && (
                <p className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {deleteError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-north-border px-5 py-4">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className="h-10 border border-north-border px-4 text-sm font-semibold disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" onClick={() => void confirmDelete()} disabled={deleting} className="inline-flex h-10 items-center gap-2 bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
                {deleting ? "Eliminando..." : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
