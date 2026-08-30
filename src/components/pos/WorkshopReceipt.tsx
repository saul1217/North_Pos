import type { WorkshopOrder } from "@/lib/pos/types";
import { defaultReceptionChecklist } from "@/lib/pos/data/checklist";
import Image from "next/image";

export function WorkshopReceipt({ order }: { order: WorkshopOrder }) {
  const date = new Date(order.receivedAt);
  const checklistItems = defaultReceptionChecklist;

  return (
    <div className="pos-ticket-print mx-auto max-w-md bg-white p-6 text-black">
      <div className="text-center">
        <Image
          src="/brand/logo.png"
          alt="North Bike"
          width={56}
          height={56}
          className="mx-auto mb-2 h-12 w-12 object-contain"
        />
        <p className="font-display text-lg font-bold uppercase">North Bike</p>
        <p className="text-xs">Ticket del taller</p>
        <p className="text-[10px] text-gray-500">No fiscal</p>
      </div>

      <div className="my-4 space-y-1 border-y border-dashed border-gray-300 py-3 text-xs">
        <div className="flex justify-between">
          <span>Folio</span>
          <span className="font-semibold">{order.folio}</span>
        </div>
        <div className="flex justify-between">
          <span>Fecha</span>
          <span>{date.toLocaleString("es-MX")}</span>
        </div>
        <div className="flex justify-between">
          <span>Estado</span>
          <span className="capitalize">{order.status}</span>
        </div>
      </div>

      <div className="text-xs">
        <p className="font-semibold">Cliente</p>
        <p>{order.customer.name}</p>
        <p>{order.customer.phone}</p>
        {order.customer.email && <p>{order.customer.email}</p>}
      </div>

      <div className="mt-3 text-xs">
        <p className="font-semibold">Bicicleta</p>
        <p>
          {order.bike.brand} {order.bike.model}
        </p>
        {order.bike.color && <p>Color: {order.bike.color}</p>}
        {order.bike.serialNumber && (
          <p className="font-mono">Serie: {order.bike.serialNumber}</p>
        )}
        <p>Tipo: {order.bike.bikeType}</p>
        {order.bike.notes && <p>Obs: {order.bike.notes}</p>}
      </div>

      {order.clientProblem && (
        <div className="mt-3 text-xs">
          <p className="font-semibold">Problema reportado</p>
          <p>{order.clientProblem}</p>
        </div>
      )}

      <div className="mt-3 text-xs">
        <p className="mb-1 font-semibold">Checklist de recepción</p>
        <ul className="space-y-1">
          {checklistItems.map((item) => {
            const entry = order.checklist.find((c) => c.itemId === item.id);
            return (
              <li key={item.id} className="flex justify-between">
                <span>
                  {item.name}
                  {item.required && " *"}
                </span>
                <span className="uppercase">{entry?.status ?? "—"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {order.photos.length > 0 && (
        <p className="mt-3 text-xs text-gray-600">
          {order.photos.length} fotografía(s) registradas en la orden
        </p>
      )}

      {order.budget && (
        <div className="mt-3 border-t border-gray-200 pt-2 text-xs">
          <p className="font-semibold">Presupuesto: {order.budget.status}</p>
          <div className="mt-2 space-y-1">
            {order.budget.items.map((item) => (
              <div key={item.id} className="flex justify-between gap-3">
                <span>{item.quantity} × {item.description} <span className="text-gray-500">({item.type === "refaccion" ? "Refacción" : "Servicio"})</span></span>
                <span>${(item.quantity * item.price).toLocaleString("es-MX")}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-gray-200 pt-1 font-semibold">
            <span>Total</span>
            <span>${order.budget.total.toLocaleString("es-MX")}</span>
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-gray-600">
        Conserva este comprobante para seguimiento en taller.
      </p>
    </div>
  );
}
