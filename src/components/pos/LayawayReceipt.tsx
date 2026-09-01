import Image from "next/image";
import { logoSrc } from "@/lib/brand";
import { formatPosPrice, lineTotal } from "@/lib/pos/inventory";
import type { Layaway } from "@/lib/pos/types";

export function LayawayReceipt({
  layaway,
  payment,
}: {
  layaway: Layaway;
  payment: number;
}) {
  const date = new Date(layaway.payments.at(-1)?.date ?? layaway.createdAt);

  return (
    <div className="pos-ticket-print mx-auto max-w-xs bg-white p-6 text-black">
      <div className="text-center">
        <Image
          src={logoSrc}
          alt="North Bike"
          width={64}
          height={64}
          className="mx-auto mb-2 h-14 w-14 object-contain"
        />
        <p className="font-display text-lg font-bold uppercase tracking-wider">
          North Bike
        </p>
        <p className="text-xs">Comprobante de apartado</p>
        <p className="text-[10px] uppercase tracking-wider text-gray-500">
          No fiscal
        </p>
      </div>

      <div className="my-4 space-y-1 border-y border-dashed border-gray-300 py-3 text-xs">
        <div className="flex justify-between">
          <span>Folio</span>
          <span className="font-semibold">{layaway.folio}</span>
        </div>
        <div className="flex justify-between">
          <span>Fecha</span>
          <span>{date.toLocaleString("es-MX")}</span>
        </div>
        <div className="flex justify-between">
          <span>Cliente</span>
          <span className="max-w-[9rem] text-right">{layaway.customer.name}</span>
        </div>
      </div>

      <div className="text-xs">
        <p className="mb-2 font-semibold">Productos</p>
        <div className="space-y-1">
          {layaway.items.map((item) => (
            <div key={item.lineId} className="flex justify-between gap-3">
              <span>{item.quantity} × {item.name}</span>
              <span>{formatPosPrice(lineTotal(item))}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-1 border-t border-gray-300 pt-2 text-xs">
        <div className="flex justify-between">
          <span>Total apartado</span>
          <span>{formatPosPrice(layaway.total)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Abono registrado</span>
          <span>{formatPosPrice(payment)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-300 pt-2 text-sm font-bold">
          <span>SALDO</span>
          <span>{formatPosPrice(layaway.balance)}</span>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-gray-600">
        {layaway.status === "liquidado"
          ? "Apartado liquidado. ¡Gracias por tu compra!"
          : "Conserva este comprobante para tus próximos abonos."}
      </p>
    </div>
  );
}
