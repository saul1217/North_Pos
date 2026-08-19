"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { usePos } from "@/context/PosContext";
import { formatPosPrice, paymentMethodLabels } from "@/lib/pos/inventory";
import type { PaymentMethod, PaymentSplit } from "@/lib/pos/types";

const methods: PaymentMethod[] = ["efectivo", "tarjeta", "transferencia"];

export function CheckoutModal() {
  const { checkoutOpen, closeCheckout, total, completeSale } = usePos();
  const [splits, setSplits] = useState<PaymentSplit[]>([
    { method: "efectivo", amount: 0 },
  ]);
  const [cashReceived, setCashReceived] = useState("");
  const [error, setError] = useState("");

  const covered = useMemo(
    () => splits.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [splits],
  );
  const pending = Math.max(0, total - covered);
  const over = Math.max(0, covered - total);

  if (!checkoutOpen) return null;

  function updateSplit(index: number, patch: Partial<PaymentSplit>) {
    setSplits((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
    setError("");
  }

  function addSplit() {
    setSplits((prev) => [...prev, { method: "tarjeta", amount: 0 }]);
  }

  function removeSplit(index: number) {
    if (splits.length <= 1) return;
    setSplits((prev) => prev.filter((_, i) => i !== index));
  }

  function fillRemaining(index: number) {
    const others = splits.reduce(
      (s, p, i) => (i === index ? s : s + (Number(p.amount) || 0)),
      0,
    );
    updateSplit(index, { amount: Math.max(0, total - others) });
  }

  function handleConfirm() {
    const valid = splits.filter((s) => s.amount > 0);
    if (valid.reduce((s, p) => s + p.amount, 0) < total - 0.01) {
      setError("El total cubierto debe igualar el monto de la venta.");
      return;
    }
    const cashSplit = valid.find((s) => s.method === "efectivo");
    const received = cashSplit ? Number(cashReceived) || cashSplit.amount : undefined;
    if (cashSplit && received !== undefined && received < cashSplit.amount) {
      setError("El efectivo recibido debe cubrir la parte en efectivo.");
      return;
    }
    completeSale(valid, received);
    setSplits([{ method: "efectivo", amount: 0 }]);
    setCashReceived("");
    setError("");
  }

  const cashAmount =
    splits.find((s) => s.method === "efectivo")?.amount ?? 0;
  const change =
    cashAmount > 0 && cashReceived
      ? Math.max(0, Number(cashReceived) - cashAmount)
      : 0;

  return (
    <div className="pos-no-print fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-north-dark/60" onClick={closeCheckout} />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-north-border bg-white px-5 py-4">
          <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em]">
            Cobrar
          </h2>
          <button type="button" onClick={closeCheckout} className="p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm text-north-muted">Total a cobrar</p>
          <p className="font-display text-4xl font-bold text-north-primary">
            {formatPosPrice(total)}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-sm bg-north-background p-2">
              <p className="text-[10px] uppercase text-north-muted">Cubierto</p>
              <p className="font-semibold">{formatPosPrice(covered)}</p>
            </div>
            <div className="rounded-sm bg-north-background p-2">
              <p className="text-[10px] uppercase text-north-muted">Pendiente</p>
              <p className="font-semibold text-amber-700">
                {formatPosPrice(pending)}
              </p>
            </div>
            <div className="rounded-sm bg-north-background p-2">
              <p className="text-[10px] uppercase text-north-muted">Excedente</p>
              <p className="font-semibold">{formatPosPrice(over)}</p>
            </div>
          </div>

          <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-north-steel">
            Pagos mixtos
          </p>
          <div className="space-y-3">
            {splits.map((split, index) => (
              <div key={index} className="flex gap-2">
                <select
                  value={split.method}
                  onChange={(e) =>
                    updateSplit(index, {
                      method: e.target.value as PaymentMethod,
                    })
                  }
                  className="h-10 flex-1 border border-north-border px-2 text-sm"
                >
                  {methods.map((m) => (
                    <option key={m} value={m}>
                      {paymentMethodLabels[m]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  value={split.amount || ""}
                  onChange={(e) =>
                    updateSplit(index, { amount: Number(e.target.value) || 0 })
                  }
                  className="h-10 w-28 border border-north-border px-2 text-sm"
                  placeholder="Monto"
                />
                <button
                  type="button"
                  onClick={() => fillRemaining(index)}
                  className="h-10 px-2 text-xs text-north-primary hover:underline"
                >
                  Resto
                </button>
                {splits.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSplit(index)}
                    className="h-10 px-2 text-north-muted"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addSplit}
            className="mt-2 text-sm text-north-primary hover:underline"
          >
            + Agregar método de pago
          </button>

          {cashAmount > 0 && (
            <div className="mt-5 space-y-2">
              <label className="text-xs font-semibold uppercase text-north-steel">
                Efectivo recibido
              </label>
              <input
                type="number"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="h-11 w-full border border-north-border px-3"
              />
              <div className="flex justify-between text-sm">
                <span className="text-north-muted">Cambio</span>
                <span className="font-semibold">{formatPosPrice(change)}</span>
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-north-border bg-white p-4">
          <button
            type="button"
            onClick={closeCheckout}
            className="h-11 flex-1 border border-north-border text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending > 0.01}
            className="h-11 flex-1 bg-north-primary text-sm font-semibold text-white disabled:opacity-40"
          >
            Confirmar cobro
          </button>
        </div>
      </div>
    </div>
  );
}
