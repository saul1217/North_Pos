"use client";

import { AlertTriangle, History, PackageX, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { usePos } from "@/context/PosContext";
import {
  getAvailableStock,
  getStockStatus,
  getCategoryLabel,
  movementTypeLabels,
} from "@/lib/pos/inventory";
import type { InventoryAdjustmentType, PosProduct } from "@/lib/pos/types";
import { getAuthSession } from "@/lib/auth";

const adjTypes: { value: InventoryAdjustmentType; label: string }[] = [
  { value: "entrada", label: "Entrada" },
  { value: "salida", label: "Salida" },
  { value: "correccion", label: "Corrección" },
  { value: "dano", label: "Daño" },
  { value: "perdida", label: "Pérdida" },
  { value: "conteo", label: "Conteo físico" },
  { value: "otro", label: "Otro" },
];

export default function PosInventarioPage() {
  const { products, movements, adjustInventory, getProductMovements } = usePos();
  const canAdjust = getAuthSession()?.user.role === "admin";
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [tab, setTab] = useState<"stock" | "movimientos">("stock");
  const [selected, setSelected] = useState<PosProduct | null>(null);
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjType, setAdjType] = useState<InventoryAdjustmentType>("entrada");
  const [adjQty, setAdjQty] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjVariantId, setAdjVariantId] = useState("");
  const [adjError, setAdjError] = useState("");
  const [movementFilter, setMovementFilter] = useState("todos");

  const filtered = useMemo(() => {
    let list = products;
    if (lowOnly) {
      list = list.filter((p) => getStockStatus(p) !== "normal");
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.upc ?? "").toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q),
    );
  }, [products, query, lowOnly]);

  const lowCount = products.filter((p) => getStockStatus(p) === "bajo").length;
  const outCount = products.filter((p) => getStockStatus(p) === "agotado").length;

  function submitAdjust() {
    if (!selected) return;
    const quantity = Number(adjQty);
    const removesStock = adjType === "salida" || adjType === "dano" || adjType === "perdida";
    const available = getAvailableStock(selected, adjVariantId || undefined);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setAdjError("Captura una cantidad mayor que cero.");
      return;
    }
    if (removesStock && quantity > available) {
      setAdjError(`No puedes retirar ${quantity}; solo hay ${available} disponibles.`);
      return;
    }
    adjustInventory({
      productId: selected.id,
      variantId: adjVariantId || undefined,
      quantity,
      type: adjType,
      reason: adjReason,
    });
    setAdjOpen(false);
    setAdjQty("");
    setAdjReason("");
    setAdjError("");
  }

  const productHistory = selected ? getProductMovements(selected.id) : [];
  const visibleMovements = movements.filter((movement) => {
    if (movementFilter !== "todos" && movement.type !== movementFilter) return false;
    if (!query.trim()) return true;
    const search = query.trim().toLowerCase();
    return [movement.productName, movement.variantLabel, movement.reference, movement.user, movement.reason]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(search));
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-north-border bg-white px-4 py-5 md:px-6">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em]">
          Inventario
        </h1>
        <div className="mt-4 flex flex-wrap gap-3">
          <span className="flex items-center gap-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            {lowCount} stock bajo
          </span>
          <span className="flex items-center gap-2 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <PackageX className="h-4 w-4" />
            {outCount} agotados
          </span>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={lowOnly}
              onChange={(e) => setLowOnly(e.target.checked)}
            />
            Solo stock bajo / agotado
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("stock")}
            className={`h-9 px-4 text-sm ${tab === "stock" ? "bg-north-primary text-white" : "border border-north-border"}`}
          >
            Existencias
          </button>
          <button
            type="button"
            onClick={() => setTab("movimientos")}
            className={`h-9 px-4 text-sm ${tab === "movimientos" ? "bg-north-primary text-white" : "border border-north-border"}`}
          >
            Movimientos
          </button>
          {tab === "movimientos" && (
            <select
              aria-label="Filtrar movimientos"
              value={movementFilter}
              onChange={(e) => setMovementFilter(e.target.value)}
              className="h-9 border border-north-border bg-white px-3 text-sm"
            >
              <option value="todos">Todos los movimientos</option>
              {Object.entries(movementTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          )}
        </div>
        <div className="relative mt-4 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-north-steel" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="h-10 w-full border border-north-border bg-north-background pl-10 pr-3 text-sm"
          />
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-6">
          {tab === "stock" ? (
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-north-border bg-north-background text-xs uppercase text-north-steel">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Mín.</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const status = getStockStatus(p);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className={`cursor-pointer border-b border-north-border hover:bg-north-background/50 ${
                        selected?.id === p.id ? "bg-north-primary/5" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-north-muted">
                          {getCategoryLabel(p.category)}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                      <td className="px-4 py-3 font-mono text-xs">{p.barcode}</td>
                      <td className="px-4 py-3 font-semibold">{p.stock}</td>
                      <td className="px-4 py-3">{p.minStock}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 text-[11px] font-semibold uppercase ${
                            status === "agotado"
                              ? "bg-red-50 text-red-700"
                              : status === "bajo"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {status === "agotado"
                            ? "Agotado"
                            : status === "bajo"
                              ? "Stock bajo"
                              : "Disponible"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-north-border bg-north-background text-xs uppercase text-north-steel">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Movimiento</th>
                  <th className="px-4 py-3">Cant.</th>
                  <th className="px-4 py-3">Antes → Después</th>
                  <th className="px-4 py-3">Ref.</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {visibleMovements.map((m) => (
                  <tr key={m.id} className="border-b border-north-border">
                    <td className="px-4 py-3 text-xs text-north-muted">
                      {new Date(m.date).toLocaleString("es-MX")}
                    </td>
                    <td className="px-4 py-3">
                      {m.productName}
                      {m.variantLabel && (
                        <span className="block text-xs text-north-muted">
                          {m.variantLabel}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {movementTypeLabels[m.type] ?? m.type}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {m.stockBefore} → {m.stockAfter}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{m.reference}</td>
                    <td className="px-4 py-3 text-xs">{m.user}</td>
                    <td className="max-w-xs px-4 py-3 text-xs text-north-muted">{m.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && tab === "stock" && (
          <aside className="w-full shrink-0 border-t border-north-border bg-white p-5 lg:w-80 lg:border-l lg:border-t-0">
            <h2 className="font-display text-lg font-bold">{selected.name}</h2>
            <p className="font-mono text-xs text-north-muted">{selected.sku}</p>

            {selected.hasVariants && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase text-north-steel">
                  Variantes
                </p>
                {selected.variants.map((v) => (
                  <div
                    key={v.id}
                    className="border border-north-border px-3 py-2 text-xs"
                  >
                    <p className="font-medium">{v.label}</p>
                    <p>SKU: {v.sku} · Stock: {v.stock}</p>
                  </div>
                ))}
              </div>
            )}

            {selected.serialUnits.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase text-north-steel">
                  Números de serie
                </p>
                <ul className="mt-2 space-y-1 text-xs">
                  {selected.serialUnits.map((s) => (
                    <li key={s.id} className="flex justify-between">
                      <span className="font-mono">{s.serialNumber}</span>
                      <span className="capitalize">{s.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-north-steel">
                <History className="h-3.5 w-3.5" />
                Historial
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {productHistory.length === 0 ? (
                  <li className="text-north-muted">Sin movimientos</li>
                ) : (
                  productHistory.map((m) => (
                    <li key={m.id}>
                      {movementTypeLabels[m.type]} {m.reference} →{" "}
                      {m.quantity > 0 ? "+" : ""}
                      {m.quantity}
                    </li>
                  ))
                )}
              </ul>
            </div>

            {canAdjust && <button
              type="button"
              onClick={() => setAdjOpen(true)}
              className="mt-4 h-10 w-full bg-north-primary text-sm text-white"
            >
              Ajuste de inventario
            </button>}
          </aside>
        )}
      </div>

      {adjOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-north-dark/60"
            onClick={() => setAdjOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white p-5">
            <h3 className="font-display text-lg font-bold">Ajuste manual</h3>
            <p className="text-sm text-north-muted">{selected.name}</p>
            {selected.hasVariants && (
              <select
                value={adjVariantId}
                onChange={(e) => setAdjVariantId(e.target.value)}
                className="mt-3 h-10 w-full border border-north-border px-2 text-sm"
              >
                <option value="">Producto base</option>
                {selected.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            )}
            <select
              value={adjType}
              onChange={(e) =>
                setAdjType(e.target.value as InventoryAdjustmentType)
              }
              className="mt-3 h-10 w-full border border-north-border px-2 text-sm"
            >
              {adjTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={adjQty}
              onChange={(e) => setAdjQty(e.target.value)}
              placeholder="Cantidad"
              className="mt-3 h-10 w-full border border-north-border px-2 text-sm"
            />
            {adjError && <p className="mt-2 text-sm text-red-700" role="alert">{adjError}</p>}
            <input
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="Motivo..."
              className="mt-3 h-10 w-full border border-north-border px-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={submitAdjust}
                className="h-10 flex-1 bg-north-primary text-sm text-white"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setAdjOpen(false)}
                className="h-10 flex-1 border border-north-border text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
