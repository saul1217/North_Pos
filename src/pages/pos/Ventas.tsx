"use client";

import { Eye, Printer, RotateCcw, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { usePos } from "@/context/PosContext";
import {
  formatPosPrice,
  paymentMethodLabels,
  saleStatusLabels,
} from "@/lib/pos/inventory";
import type { CompletedSale } from "@/lib/pos/types";
import { TicketReceipt } from "@/components/pos/TicketReceipt";

export default function PosVentasPage() {
  const { sales, cancelSale, processReturn } = usePos();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CompletedSale | null>(null);
  const [ticketSale, setTicketSale] = useState<CompletedSale | null>(null);
  const [returnMode, setReturnMode] = useState(false);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter((s) => s.folio.toLowerCase().includes(q));
  }, [sales, query]);

  function startReturn() {
    if (!selected) return;
    const qty: Record<string, number> = {};
    selected.items.forEach((i) => {
      qty[i.lineId] = 0;
    });
    setReturnQty(qty);
    setReturnMode(true);
  }

  function submitReturn() {
    if (!selected) return;
    const items = Object.entries(returnQty)
      .filter(([, q]) => q > 0)
      .map(([lineId, quantity]) => ({ lineId, quantity }));
    if (items.length === 0) return;
    processReturn(selected.id, items, returnReason || "Devolución");
    setReturnMode(false);
    setSelected(sales.find((s) => s.id === selected.id) ?? null);
  }

  function submitCancel() {
    if (!selected || !cancelReason.trim()) return;
    cancelSale(selected.id, cancelReason);
    setShowCancel(false);
    setSelected(sales.find((s) => s.id === selected.id) ?? null);
  }

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="border-b border-north-border bg-white px-4 py-5 md:px-6">
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em]">
              Ventas
            </h1>
            <div className="relative mt-4 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-north-steel" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por folio..."
                className="h-10 w-full border border-north-border bg-north-background pl-10 pr-3 text-sm"
              />
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
            <div className="overflow-x-auto border border-north-border bg-white">
              <table className="w-full min-w-[680px] table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[19%]" />
                  <col className="w-[17%]" />
                  <col className="w-[17%]" />
                  <col className="w-[25%]" />
                  <col className="w-[22%]" />
                </colgroup>
                <thead className="border-b border-north-border bg-north-background text-xs uppercase tracking-[0.03em] text-north-steel">
                  <tr>
                    <th className="px-3 py-3 md:px-4">Folio</th>
                    <th className="px-3 py-3 md:px-4">Fecha</th>
                    <th className="px-3 py-3 md:px-4">Total</th>
                    <th className="px-3 py-3 md:px-4">Pago</th>
                    <th className="px-3 py-3 md:px-4">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sale) => {
                    const date = new Date(sale.date);
                    return (
                      <tr
                        key={sale.id}
                        onClick={() => {
                          setSelected(sale);
                          setReturnMode(false);
                          setShowCancel(false);
                        }}
                        className={`cursor-pointer border-b border-north-border hover:bg-north-background/50 ${
                          selected?.id === sale.id ? "bg-north-primary/5" : ""
                        }`}
                      >
                        <td className="whitespace-nowrap px-3 py-3 font-medium md:px-4">{sale.folio}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-north-muted md:px-4">
                          {date.toLocaleDateString("es-MX")}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-north-primary md:px-4">
                          {formatPosPrice(sale.total)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 md:px-4">
                          {sale.payments
                            .map((p) => paymentMethodLabels[p.method])
                            .join(" + ")}
                        </td>
                        <td className="px-3 py-3 md:px-4">
                          <span
                            className={`inline-block whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold uppercase ${
                              sale.status === "cancelada"
                                ? "bg-red-50 text-red-700"
                                : sale.status.includes("devuel")
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {saleStatusLabels[sale.status] ?? sale.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="min-h-0 w-full overflow-y-auto border-t border-north-border bg-white lg:w-96 lg:shrink-0 lg:border-l lg:border-t-0">
          {selected ? (
            <div className="p-5">
              <h2 className="font-display text-lg font-bold uppercase">
                {selected.folio}
              </h2>
              <p className="text-sm text-north-muted">
                {saleStatusLabels[selected.status]}
              </p>

              <ul className="mt-4 space-y-2 border-t border-north-border pt-4 text-sm">
                {selected.items.map((item) => (
                  <li key={item.lineId} className="flex justify-between">
                    <span>
                      {item.name} × {item.quantity}
                    </span>
                    <span>{formatPosPrice(item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>

              {selected.returns.length > 0 && (
                <div className="mt-4 rounded-sm bg-amber-50 p-3 text-xs">
                  <p className="font-semibold">Devoluciones registradas</p>
                  {selected.returns.map((r) => (
                    <p key={r.id} className="mt-1 text-north-muted">
                      {new Date(r.date).toLocaleDateString("es-MX")} —{" "}
                      {r.reason ?? "Sin motivo"}
                    </p>
                  ))}
                </div>
              )}

              {returnMode ? (
                <div className="mt-4 space-y-3 border-t border-north-border pt-4">
                  <p className="text-sm font-semibold">Devolución</p>
                  {selected.items.map((item) => (
                    <div key={item.lineId} className="flex items-center gap-2">
                      <span className="flex-1 text-xs">{item.name}</span>
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={returnQty[item.lineId] ?? 0}
                        onChange={(e) =>
                          setReturnQty((prev) => ({
                            ...prev,
                            [item.lineId]: Number(e.target.value) || 0,
                          }))
                        }
                        className="h-8 w-16 border border-north-border px-2 text-sm"
                      />
                    </div>
                  ))}
                  <input
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="Motivo (opcional)"
                    className="h-9 w-full border border-north-border px-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={submitReturn}
                      className="h-9 flex-1 bg-north-primary text-sm text-white"
                    >
                      Confirmar devolución
                    </button>
                    <button
                      type="button"
                      onClick={() => setReturnMode(false)}
                      className="h-9 flex-1 border border-north-border text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : showCancel ? (
                <div className="mt-4 space-y-3 border-t border-north-border pt-4">
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Motivo de cancelación..."
                    className="h-20 w-full border border-north-border p-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={submitCancel}
                      className="h-9 flex-1 bg-red-600 text-sm text-white"
                    >
                      Confirmar cancelación
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCancel(false)}
                      className="h-9 flex-1 border border-north-border text-sm"
                    >
                      Volver
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-2 border-t border-north-border pt-4">
                  <button
                    type="button"
                    onClick={() => setTicketSale(selected)}
                    className="inline-flex h-10 items-center justify-center gap-2 border border-north-border text-sm"
                  >
                    <Printer className="h-4 w-4" />
                    Ver ticket
                  </button>
                  {selected.status === "completada" ||
                  selected.status === "parcialmente_devuelta" ? (
                    <>
                      <button
                        type="button"
                        onClick={startReturn}
                        className="inline-flex h-10 items-center justify-center gap-2 border border-north-border text-sm"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Realizar devolución
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCancel(true)}
                        className="inline-flex h-10 items-center justify-center gap-2 border border-red-200 text-sm text-red-700"
                      >
                        <XCircle className="h-4 w-4" />
                        Cancelar venta
                      </button>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full min-h-[12rem] items-center justify-center p-6 text-sm text-north-muted">
              <Eye className="mr-2 h-4 w-4" />
              Selecciona una venta
            </div>
          )}
        </aside>
      </div>

      {ticketSale && (
        <div className="pos-no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-north-dark/60 p-4 pt-12">
          <div className="relative w-full max-w-sm">
            <TicketReceipt sale={ticketSale} />
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
                onClick={() => setTicketSale(null)}
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
