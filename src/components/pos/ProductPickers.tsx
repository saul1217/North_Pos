"use client";

import type { PosProduct, ProductVariant } from "@/lib/pos/types";

export function VariantPickerModal({
  product,
  onSelect,
  onClose,
}: {
  product: PosProduct;
  onSelect: (variant: ProductVariant) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-north-dark/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white p-5 shadow-xl">
        <h3 className="font-display text-lg font-bold uppercase tracking-wide">
          Seleccionar variante
        </h3>
        <p className="mt-1 text-sm text-north-muted">{product.name}</p>
        <div className="mt-4 space-y-2">
          {product.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={v.stock <= 0}
              onClick={() => onSelect(v)}
              className="flex w-full items-center justify-between border border-north-border px-3 py-3 text-left hover:border-north-primary disabled:opacity-40"
            >
              <span className="text-sm font-medium">{v.label}</span>
              <span className="text-xs text-north-muted">
                Stock: {v.stock} · {v.location}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SerialPickerModal({
  product,
  variantId,
  onSelect,
  onClose,
}: {
  product: PosProduct;
  variantId: string;
  onSelect: (serial: string) => void;
  onClose: () => void;
}) {
  const units = product.serialUnits.filter(
    (s) => s.variantId === variantId && s.status === "disponible",
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-north-dark/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white p-5 shadow-xl">
        <h3 className="font-display text-lg font-bold uppercase tracking-wide">
          Número de serie
        </h3>
        <p className="mt-1 text-sm text-north-muted">{product.name}</p>
        <div className="mt-4 space-y-2">
          {units.length === 0 ? (
            <p className="text-sm text-north-muted">No hay unidades disponibles</p>
          ) : (
            units.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => onSelect(u.serialNumber)}
                className="flex w-full items-center justify-between border border-north-border px-3 py-3 text-left hover:border-north-primary"
              >
                <span className="font-mono text-sm">{u.serialNumber}</span>
                <span className="text-xs text-north-muted">{u.location}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
