"use client";

import Image from "next/image";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { usePos } from "@/context/PosContext";
import {
  getCategoryLabel,
  formatPosPrice,
  getProductDisplayStock,
  getStockStatus,
  lineDiscountAmount,
  lineTotal,
} from "@/lib/pos/inventory";
import type { LineDiscount, PosProduct, ProductVariant } from "@/lib/pos/types";
import { CheckoutModal } from "@/components/pos/CheckoutModal";
import { SaleSuccessModal } from "@/components/pos/SaleSuccessModal";
import { TicketModal } from "@/components/pos/TicketModal";
import {
  SerialPickerModal,
  VariantPickerModal,
} from "@/components/pos/ProductPickers";

function ProductTile({
  product,
  onAdd,
}: {
  product: PosProduct;
  onAdd: () => void;
}) {
  const stock = getProductDisplayStock(product);
  const status = getStockStatus(product);
  const disabled = status === "agotado" || product.status === "inactivo";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onAdd}
      className="group flex flex-col overflow-hidden rounded-sm border border-north-border bg-white text-left transition hover:border-north-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="relative aspect-square overflow-hidden bg-north-border">
        <Image
          src={product.image}
          alt={product.name}
          fill
          className="object-cover transition group-hover:scale-[1.02]"
          sizes="160px"
        />
        {status === "bajo" && (
          <span className="absolute left-1.5 top-1.5 bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
            Stock bajo
          </span>
        )}
        {status === "agotado" && (
          <span className="absolute inset-0 flex items-center justify-center bg-north-dark/50 text-xs font-semibold uppercase text-white">
            Agotado
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-north-steel">
          {getCategoryLabel(product.category)}
        </p>
        <p className="line-clamp-2 text-sm font-medium leading-tight text-north-dark">
          {product.name}
        </p>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="font-display text-sm font-bold text-north-primary">
            {formatPosPrice(product.price)}
          </span>
          <span className="text-[11px] text-north-muted">Stock: {stock}</span>
        </div>
      </div>
    </button>
  );
}

function LineDiscountControl({
  lineId,
  discount,
  onChange,
}: {
  lineId: string;
  discount?: LineDiscount;
  onChange: (lineId: string, d?: LineDiscount) => void;
}) {
  const [type, setType] = useState<"percent" | "fixed">(
    discount?.type ?? "percent",
  );
  const [value, setValue] = useState(String(discount?.value ?? ""));

  function apply() {
    const num = Number(value);
    if (!num || num <= 0) {
      onChange(lineId, undefined);
      return;
    }
    onChange(lineId, { type, value: num });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as "percent" | "fixed")}
        className="h-7 border border-north-border px-1 text-[11px]"
      >
        <option value="percent">%</option>
        <option value="fixed">$</option>
      </select>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="0"
        className="h-7 w-14 border border-north-border px-1 text-[11px]"
      />
      <button
        type="button"
        onClick={apply}
        className="h-7 px-2 text-[11px] font-medium text-north-primary hover:underline"
      >
        Aplicar
      </button>
    </div>
  );
}

export function SaleScreen() {
  const {
    products,
    currentSale,
    subtotal,
    total,
    itemCount,
    addToSale,
    addByBarcode,
    removeFromSale,
    setLineQuantity,
    setLineDiscount,
    setDiscount,
    openCheckout,
  } = usePos();

  const [query, setQuery] = useState("");
  const [barcodeMsg, setBarcodeMsg] = useState("");
  const [pickProduct, setPickProduct] = useState<PosProduct | null>(null);
  const [pickProductId, setPickProductId] = useState<string | null>(null);
  const [pickVariant, setPickVariant] = useState<ProductVariant | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.filter((p) => p.status === "activo");
    return products.filter(
      (p) =>
        p.status === "activo" &&
        (p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.upc ?? "").toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
          getCategoryLabel(p.category).toLowerCase().includes(q) ||
          p.variants.some(
            (v) =>
              v.sku.toLowerCase().includes(q) ||
              (v.upc ?? "").toLowerCase().includes(q) ||
              v.barcode.includes(q) ||
              v.label.toLowerCase().includes(q),
          )),
    );
  }, [products, query]);

  function handleProductClick(product: PosProduct) {
    if (product.hasVariants && product.variants.length > 0) {
      setPickProduct(product);
      return;
    }
    addToSale(product);
  }

  function handleVariantSelect(variant: ProductVariant) {
    if (!pickProduct) return;
    if (pickProduct.requiresSerial) {
      setPickProductId(pickProduct.id);
      setPickVariant(variant);
      setPickProduct(null);
      return;
    }
    addToSale(pickProduct, variant);
    setPickProduct(null);
  }

  function handleSerialSelect(serial: string) {
    if (!pickVariant || !pickProductId) return;
    const product = products.find((p) => p.id === pickProductId);
    if (!product) return;
    addToSale(product, pickVariant, serial);
    setPickVariant(null);
    setPickProductId(null);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = query.trim();
    if (!code) return;
    const ok = addByBarcode(code);
    if (!ok) return;
    setBarcodeMsg(`Agregado: ${code}`);
    setQuery("");
    barcodeRef.current?.focus();
    setTimeout(() => setBarcodeMsg(""), 2000);
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="border-b border-north-border bg-white px-4 py-4 md:px-6">
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em] text-north-dark">
              Nueva venta
            </h1>

            <form onSubmit={handleSearchSubmit} className="relative mt-4">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-north-steel" />
              <input
                ref={barcodeRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar producto o escanear código..."
                className="h-12 w-full border-2 border-north-primary/30 bg-north-background pl-11 pr-4 text-sm outline-none focus:border-north-primary"
                autoComplete="off"
              />
              {barcodeMsg && (
                <p className="mt-1 text-xs text-north-primary">{barcodeMsg}</p>
              )}
            </form>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((product) => (
                <ProductTile
                  key={product.id}
                  product={product}
                  onAdd={() => handleProductClick(product)}
                />
              ))}
            </div>
          </div>
        </div>

        <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-north-border bg-white lg:w-[26rem] lg:border-l lg:border-t-0">
          <div className="border-b border-north-border px-4 py-4">
            <h2 className="font-display text-lg font-bold uppercase tracking-[0.08em]">
              Venta actual
            </h2>
            <p className="text-sm text-north-muted">
              {itemCount} {itemCount === 1 ? "artículo" : "artículos"}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {currentSale.items.length === 0 ? (
              <p className="py-8 text-center text-sm text-north-muted">
                Agrega productos para iniciar la venta
              </p>
            ) : (
              <ul className="space-y-4">
                {currentSale.items.map((item) => {
                  const lineDisc = lineDiscountAmount(item);
                  return (
                    <li
                      key={item.lineId}
                      className="border-b border-north-border pb-4"
                    >
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {item.name}
                          </p>
                          {item.variantLabel && (
                            <p className="text-xs text-north-steel">
                              {item.variantLabel}
                            </p>
                          )}
                          {item.serialNumber && (
                            <p className="font-mono text-[11px] text-north-muted">
                              Serie: {item.serialNumber}
                            </p>
                          )}
                          <p className="text-[11px] text-north-muted">
                            {item.sku}
                          </p>
                          <div className="mt-1 text-sm">
                            {lineDisc > 0 ? (
                              <>
                                <span className="text-north-muted line-through">
                                  {formatPosPrice(item.price * item.quantity)}
                                </span>{" "}
                                <span className="font-semibold text-north-primary">
                                  {formatPosPrice(lineTotal(item))}
                                </span>
                                <span className="ml-1 text-[11px] text-amber-700">
                                  (-{formatPosPrice(lineDisc)})
                                </span>
                              </>
                            ) : (
                              <span className="font-semibold text-north-primary">
                                {formatPosPrice(lineTotal(item))}
                              </span>
                            )}
                          </div>
                          <LineDiscountControl
                            lineId={item.lineId}
                            discount={item.lineDiscount}
                            onChange={setLineDiscount}
                          />
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={() => removeFromSale(item.lineId)}
                            className="text-north-muted hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          {!item.serialNumber && (
                            <div className="inline-flex h-8 items-center border border-north-border">
                              <button
                                type="button"
                                className="flex h-full w-7 items-center justify-center"
                                onClick={() =>
                                  setLineQuantity(item.lineId, item.quantity - 1)
                                }
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="min-w-7 text-center text-sm tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                className="flex h-full w-7 items-center justify-center"
                                onClick={() =>
                                  setLineQuantity(item.lineId, item.quantity + 1)
                                }
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-north-border bg-north-background p-4">
            <div className="mb-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-north-muted">Subtotal</span>
                <span>{formatPosPrice(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-north-muted">Descuento global</span>
                <div className="flex items-center gap-1">
                  <select
                    value={currentSale.discountType ?? "fixed"}
                    onChange={(e) =>
                      setDiscount(
                        currentSale.discount,
                        e.target.value as "percent" | "fixed",
                      )
                    }
                    className="h-8 border border-north-border bg-white px-1 text-xs"
                    aria-label="Tipo de descuento global"
                  >
                    <option value="fixed">Pesos</option>
                    <option value="percent">Porcentaje</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={currentSale.discountType === "percent" ? 100 : undefined}
                    value={currentSale.discount || ""}
                    onChange={(e) =>
                      setDiscount(
                        Number(e.target.value) || 0,
                        currentSale.discountType ?? "fixed",
                      )
                    }
                    placeholder="0"
                    className="h-8 w-20 border border-north-border bg-white px-2 text-right text-sm"
                    aria-label="Valor del descuento global"
                  />
                  <span className="text-xs text-north-muted">
                    {currentSale.discountType === "percent" ? "%" : "$"}
                  </span>
                </div>
              </div>
              <div className="flex justify-between border-t border-north-border pt-2 font-display text-xl font-bold">
                <span>Total</span>
                <span className="text-north-primary">{formatPosPrice(total)}</span>
              </div>
            </div>
            <button
              type="button"
              disabled={currentSale.items.length === 0}
              onClick={openCheckout}
              className="h-12 w-full bg-north-primary text-sm font-semibold uppercase tracking-wider text-white hover:bg-north-primary-hover disabled:opacity-40"
            >
              Cobrar
            </button>
          </div>
        </aside>
      </div>

      {pickProduct && (
        <VariantPickerModal
          product={pickProduct}
          onSelect={handleVariantSelect}
          onClose={() => setPickProduct(null)}
        />
      )}

      {pickVariant && pickProductId && (
        <SerialPickerModal
          product={products.find((p) => p.id === pickProductId)!}
          variantId={pickVariant.id}
          onSelect={handleSerialSelect}
          onClose={() => {
            setPickVariant(null);
            setPickProductId(null);
          }}
        />
      )}

      <CheckoutModal />
      <SaleSuccessModal />
      <TicketModal />
    </>
  );
}
