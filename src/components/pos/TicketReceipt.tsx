import type { CompletedSale } from "@/lib/pos/types";
import {
  formatPosPrice,
  lineTotal,
  paymentMethodLabels,
} from "@/lib/pos/inventory";
import Image from "next/image";
import { logoSrc } from "@/lib/brand";

export function TicketReceipt({ sale }: { sale: CompletedSale }) {
  const date = new Date(sale.date);

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
        <p className="text-xs">Chihuahua, México</p>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-gray-500">
          Nota de venta — no fiscal
        </p>
      </div>

      <div className="my-4 border-y border-dashed border-gray-300 py-3 text-xs">
        <div className="flex justify-between">
          <span>Folio</span>
          <span className="font-semibold">{sale.folio}</span>
        </div>
        <div className="flex justify-between">
          <span>Fecha</span>
          <span>
            {date.toLocaleDateString("es-MX")}{" "}
            {date.toLocaleTimeString("es-MX", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Estado</span>
          <span className="capitalize">{sale.status}</span>
        </div>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-300 text-left">
            <th className="pb-1">Producto</th>
            <th className="pb-1 text-center">Cant</th>
            <th className="pb-1 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => {
            const hasDisc =
              item.lineDiscount && item.lineDiscount.value > 0;
            return (
              <tr key={item.lineId} className="border-b border-gray-100">
                <td className="py-1.5 pr-2">
                  <p>{item.name}</p>
                  {item.variantLabel && (
                    <p className="text-[10px] text-gray-500">{item.variantLabel}</p>
                  )}
                  {item.serialNumber && (
                    <p className="font-mono text-[10px] text-gray-500">
                      {item.serialNumber}
                    </p>
                  )}
                  {hasDisc && (
                    <p className="text-[10px] text-gray-500">
                      Desc:{" "}
                      {item.lineDiscount!.type === "percent"
                        ? `${item.lineDiscount!.value}%`
                        : formatPosPrice(item.lineDiscount!.value)}
                    </p>
                  )}
                </td>
                <td className="py-1.5 text-center">{item.quantity}</td>
                <td className="py-1.5 text-right">
                  {formatPosPrice(lineTotal(item))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatPosPrice(sale.subtotal)}</span>
        </div>
        {sale.discount > 0 && (
          <div className="flex justify-between">
            <span>Descuento global</span>
            <span>-{formatPosPrice(sale.discount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-gray-300 pt-2 text-sm font-bold">
          <span>TOTAL</span>
          <span>{formatPosPrice(sale.total)}</span>
        </div>
        {sale.payments.map((p, i) => (
          <div key={i} className="flex justify-between">
            <span>{paymentMethodLabels[p.method]}</span>
            <span>{formatPosPrice(p.amount)}</span>
          </div>
        ))}
        {sale.change !== undefined && sale.change > 0 && (
          <div className="flex justify-between">
            <span>Cambio</span>
            <span>{formatPosPrice(sale.change)}</span>
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-gray-600">
        ¡Gracias por tu compra!
      </p>
    </div>
  );
}
