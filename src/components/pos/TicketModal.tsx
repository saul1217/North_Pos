"use client";

import { X } from "lucide-react";
import { usePos } from "@/context/PosContext";
import { TicketReceipt } from "@/components/pos/TicketReceipt";
import { printSaleTicket } from "@/lib/pos/printTicket";

export function TicketModal() {
  const { ticketOpen, closeTicket, lastCompletedSale } = usePos();

  if (!ticketOpen || !lastCompletedSale) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-north-dark/60 p-4 pt-12">
      <div className="relative w-full max-w-sm">
        <button
          type="button"
          onClick={closeTicket}
          className="pos-no-print absolute -right-2 -top-2 z-10 rounded-full bg-white p-2 shadow-md"
          aria-label="Cerrar ticket"
        >
          <X className="h-4 w-4" />
        </button>
        <TicketReceipt sale={lastCompletedSale} />
        <div className="pos-no-print mt-4 grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void printSaleTicket(lastCompletedSale, { silent: false })}
            className="h-11 w-full bg-north-primary text-sm font-semibold text-white hover:bg-north-primary-hover"
          >
            Imprimir
          </button>
          <button
            type="button"
            onClick={closeTicket}
            className="h-11 w-full border border-north-border bg-white text-sm font-semibold hover:bg-north-background"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
