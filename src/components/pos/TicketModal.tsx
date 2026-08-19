"use client";

import { X } from "lucide-react";
import { usePos } from "@/context/PosContext";
import { TicketReceipt } from "@/components/pos/TicketReceipt";

export function TicketModal() {
  const { ticketOpen, closeTicket, lastCompletedSale } = usePos();

  if (!ticketOpen || !lastCompletedSale) return null;

  return (
    <div className="pos-no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-north-dark/60 p-4 pt-12">
      <div className="relative w-full max-w-sm">
        <button
          type="button"
          onClick={closeTicket}
          className="absolute -right-2 -top-2 z-10 rounded-full bg-white p-2 shadow-md"
          aria-label="Cerrar ticket"
        >
          <X className="h-4 w-4" />
        </button>
        <TicketReceipt sale={lastCompletedSale} />
        <div className="pos-no-print mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="h-10 flex-1 bg-north-primary text-sm font-semibold text-white"
          >
            Imprimir
          </button>
          <button
            type="button"
            onClick={closeTicket}
            className="h-10 flex-1 border border-north-border bg-white text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
