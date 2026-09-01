"use client";

import { Plus, Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { LayawayReceipt } from "@/components/pos/LayawayReceipt";
import { usePos } from "@/context/PosContext";
import { formatPosPrice, makeLineId } from "@/lib/pos/inventory";
import type { Layaway, PosProduct, SaleLineItem } from "@/lib/pos/types";

export default function PosApartadosPage() {
  const { layaways, products, createLayaway, addLayawayPayment, cancelLayaway } =
    usePos();
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deposit, setDeposit] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<
    { product: PosProduct; qty: number }[]
  >([]);
  const [paymentLayaway, setPaymentLayaway] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [receipt, setReceipt] = useState<{
    layaway: Layaway;
    payment: number;
    received: number;
    change: number;
  } | null>(null);
  const selectedLayaway = paymentLayaway ? layaways.find((l) => l.id === paymentLayaway) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return layaways;
    return layaways.filter(
      (l) =>
        l.folio.toLowerCase().includes(q) ||
        l.customer.name.toLowerCase().includes(q),
    );
  }, [layaways, query]);

  function toggleProduct(p: PosProduct) {
    setSelectedProducts((prev) => {
      const exists = prev.find((x) => x.product.id === p.id);
      if (exists) return prev.filter((x) => x.product.id !== p.id);
      return [...prev, { product: p, qty: 1 }];
    });
  }

  function submitLayaway() {
    const items: SaleLineItem[] = selectedProducts.map(({ product, qty }) => ({
      lineId: makeLineId(product.id),
      productId: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      quantity: qty,
    }));
    const dep = Number(deposit) || 0;
    if (!customerName || items.length === 0 || dep <= 0) return;
    createLayaway({
      customer: { name: customerName, phone: customerPhone },
      items,
      deposit: dep,
    });
    setShowNew(false);
    setCustomerName("");
    setCustomerPhone("");
    setDeposit("");
    setSelectedProducts([]);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-north-border bg-white px-4 py-5 md:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em]">
              Apartados
            </h1>
            <p className="mt-1 text-sm text-north-muted">
              Reservas con anticipo y abonos
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="inline-flex h-10 items-center gap-2 bg-north-primary px-4 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Nuevo apartado
          </button>
        </div>
        <div className="relative mt-4 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-north-steel" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar apartado..."
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
              <th className="px-4 py-3">Anticipo</th>
              <th className="px-4 py-3">Saldo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id} className="border-b border-north-border">
                <td className="px-4 py-3 font-medium">{l.folio}</td>
                <td className="px-4 py-3">
                  <p>{l.customer.name}</p>
                  <p className="text-xs text-north-muted">{l.customer.phone}</p>
                </td>
                <td className="px-4 py-3">{formatPosPrice(l.total)}</td>
                <td className="px-4 py-3">{formatPosPrice(l.deposit)}</td>
                <td className="px-4 py-3 font-semibold text-north-primary">
                  {formatPosPrice(l.balance)}
                </td>
                <td className="px-4 py-3 capitalize">{l.status}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setReceipt({
                          layaway: l,
                          payment: l.payments.at(-1)?.amount ?? l.deposit,
                          received: l.payments.at(-1)?.amount ?? l.deposit,
                          change: 0,
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs text-north-primary hover:underline"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Ticket
                    </button>
                    {l.status === "activo" && (
                      <>
                      <button
                        type="button"
                        onClick={() => setPaymentLayaway(l.id)}
                        className="text-xs text-north-primary hover:underline"
                      >
                        Abonar
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelLayaway(l.id)}
                        className="text-xs text-red-600 hover:underline"
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

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-north-dark/60"
            onClick={() => setShowNew(false)}
          />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-5">
            <h3 className="font-display text-lg font-bold">Nuevo apartado</h3>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nombre del cliente"
              className="mt-4 h-10 w-full border border-north-border px-3 text-sm"
            />
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Teléfono"
              className="mt-2 h-10 w-full border border-north-border px-3 text-sm"
            />
            <input
              type="number"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="Anticipo"
              className="mt-2 h-10 w-full border border-north-border px-3 text-sm"
            />
            <p className="mt-4 text-xs font-semibold uppercase text-north-steel">
              Productos
            </p>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {products
                .filter((p) => p.status === "activo" && p.stock > 0)
                .slice(0, 12)
                .map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 border border-north-border px-2 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProducts.some(
                        (x) => x.product.id === p.id,
                      )}
                      onChange={() => toggleProduct(p)}
                    />
                    {p.name} — {formatPosPrice(p.price)}
                  </label>
                ))}
            </div>
            <button
              type="button"
              onClick={submitLayaway}
              className="mt-4 h-10 w-full bg-north-primary text-sm text-white"
            >
              Crear apartado
            </button>
          </div>
        </div>
      )}

      {paymentLayaway && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-north-dark/60"
            onClick={() => setPaymentLayaway(null)}
          />
          <div className="relative w-full max-w-sm bg-white p-5">
            <h3 className="font-display text-lg font-bold">Registrar abono</h3>
            <input
              type="number"
              min="0"
              step="0.01"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="Monto"
              className="mt-4 h-10 w-full border border-north-border px-3"
            />
            {selectedLayaway && <p className="mt-2 text-xs text-north-muted">Saldo pendiente: {formatPosPrice(selectedLayaway.balance)}. Si entregas más, se calculará el cambio.</p>}
            <button
              type="button"
              onClick={() => {
                const requested = Number(paymentAmount) || 0;
                const applied = Math.min(
                  selectedLayaway?.balance ?? 0,
                  Math.max(0, requested),
                );
                const change = Math.max(0, requested - applied);
                const updatedLayaway = addLayawayPayment(paymentLayaway, requested);
                if (updatedLayaway && applied > 0) {
                  setReceipt({
                    layaway: updatedLayaway,
                    payment: applied,
                    received: requested,
                    change,
                  });
                }
                setPaymentLayaway(null);
                setPaymentAmount("");
              }}
              className="mt-4 h-10 w-full bg-north-primary text-sm text-white"
            >
              Confirmar abono
            </button>
          </div>
        </div>
      )}

      {receipt && (
        <div className="pos-no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-north-dark/60 p-4 pt-12">
          <div className="relative w-full max-w-sm">
            <LayawayReceipt
              layaway={receipt.layaway}
              payment={receipt.payment}
              received={receipt.received}
              change={receipt.change}
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 bg-north-primary text-sm text-white"
              >
                <Printer className="h-4 w-4" />
                Imprimir ticket
              </button>
              <button
                type="button"
                onClick={() => setReceipt(null)}
                className="h-10 flex-1 border border-north-border bg-white text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
