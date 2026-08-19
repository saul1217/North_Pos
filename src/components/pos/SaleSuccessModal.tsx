"use client";

import { CheckCircle2 } from "lucide-react";
import { usePos } from "@/context/PosContext";
import { formatPosPrice, paymentMethodLabels } from "@/lib/pos/format";

export function SaleSuccessModal() {
  const {
    successOpen,
    lastCompletedSale,
    closeSuccess,
    newSale,
    openTicket,
  } = usePos();

  if (!successOpen || !lastCompletedSale) return null;

  const sale = lastCompletedSale;

  return (
    <div className="pos-no-print fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-north-dark/60" onClick={closeSuccess} />
      <div className="relative w-full max-w-md bg-white p-6 text-center shadow-xl">
        <CheckCircle2 className="mx-auto h-14 w-14 text-north-primary" />
        <h2 className="mt-4 font-display text-2xl font-bold uppercase tracking-[0.06em]">
          Venta realizada
        </h2>
        <p className="mt-2 text-sm text-north-muted">
          Folio <span className="font-semibold text-north-dark">{sale.folio}</span>
        </p>

        <div className="mt-6 space-y-2 rounded-sm bg-north-background px-4 py-4 text-sm">
          <div className="flex justify-between">
            <span className="text-north-muted">Total</span>
            <span className="font-display text-lg font-bold text-north-primary">
              {formatPosPrice(sale.total)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-north-muted">Pago</span>
            <span>
              {sale.payments
                .map((p) => `${paymentMethodLabels[p.method]} ${formatPosPrice(p.amount)}`)
                .join(" · ")}
            </span>
          </div>
          {sale.change !== undefined && sale.change > 0 && (
            <div className="flex justify-between">
              <span className="text-north-muted">Cambio</span>
              <span>{formatPosPrice(sale.change)}</span>
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={newSale}
            className="h-11 bg-north-primary text-sm font-semibold text-white hover:bg-north-primary-hover"
          >
            Nueva venta
          </button>
          <button
            type="button"
            onClick={() => {
              closeSuccess();
              openTicket();
            }}
            className="h-11 border border-north-border text-sm font-medium hover:bg-north-background"
          >
            Ver ticket
          </button>
          <button
            type="button"
            onClick={() => {
              closeSuccess();
              openTicket();
              setTimeout(() => window.print(), 300);
            }}
            className="h-11 border border-north-border text-sm font-medium hover:bg-north-background"
          >
            Imprimir ticket
          </button>
        </div>
      </div>
    </div>
  );
}
