import type {
  InventoryMovement,
  InventoryMovementType,
  PosProduct,
  ProductVariant,
  SaleLineItem,
  SerialUnit,
} from "@/lib/pos/types";

export function getVariant(
  product: PosProduct,
  variantId?: string,
): ProductVariant | undefined {
  if (!variantId) return undefined;
  return product.variants.find((v) => v.id === variantId);
}

export function getAvailableStock(
  product: PosProduct,
  variantId?: string,
): number {
  const variant = getVariant(product, variantId);
  if (variant) return variant.stock;
  return product.stock;
}

export function getStockStatus(product: PosProduct, variantId?: string) {
  const variant = getVariant(product, variantId);
  const stock = variant ? variant.stock : product.stock;
  const min = variant ? variant.minStock : product.minStock;
  if (stock <= 0) return "agotado" as const;
  if (stock <= min) return "bajo" as const;
  return "normal" as const;
}

export function getProductDisplayStock(product: PosProduct): number {
  if (product.hasVariants) {
    return product.variants.reduce((sum, v) => sum + v.stock, 0);
  }
  return product.stock;
}

export function getReservedStock(product: PosProduct): number {
  return product.serialUnits.filter((s) => s.status === "apartado").length;
}

export function lineUnitPrice(item: SaleLineItem): number {
  if (!item.lineDiscount || item.lineDiscount.value <= 0) return item.price;
  if (item.lineDiscount.type === "percent") {
    return Math.max(0, item.price * (1 - item.lineDiscount.value / 100));
  }
  return Math.max(0, item.price - item.lineDiscount.value);
}

export function lineTotal(item: SaleLineItem): number {
  return lineUnitPrice(item) * item.quantity;
}

export function lineDiscountAmount(item: SaleLineItem): number {
  return (item.price - lineUnitPrice(item)) * item.quantity;
}

export function calcSaleSubtotal(items: SaleLineItem[]): number {
  return items.reduce((sum, i) => sum + lineTotal(i), 0);
}

export function calcSaleOriginalSubtotal(items: SaleLineItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

export function calcLineDiscountsTotal(items: SaleLineItem[]): number {
  return items.reduce((sum, i) => sum + lineDiscountAmount(i), 0);
}

export function makeLineId(
  productId: string,
  variantId?: string,
  serialNumber?: string,
): string {
  return [productId, variantId ?? "base", serialNumber ?? ""].join("::");
}

export function findByBarcode(
  products: PosProduct[],
  code: string,
): { product: PosProduct; variant?: ProductVariant } | null {
  const q = code.trim();
  if (!q) return null;

  for (const product of products) {
    if (product.barcode === q) return { product };
    for (const variant of product.variants) {
      if (variant.barcode === q || variant.sku === q) {
        return { product, variant };
      }
    }
    if (product.sku === q) return { product };
  }
  return null;
}

export function updateProductStock(
  products: PosProduct[],
  productId: string,
  variantId: string | undefined,
  delta: number,
  serialNumber?: string,
): PosProduct[] {
  return products.map((p) => {
    if (p.id !== productId) return p;

    const next = { ...p };

    if (variantId) {
      next.variants = p.variants.map((v) =>
        v.id === variantId
          ? { ...v, stock: Math.max(0, v.stock + delta) }
          : v,
      );
      next.stock = next.variants.reduce((s, v) => s + v.stock, 0);
    } else {
      next.stock = Math.max(0, p.stock + delta);
    }

    if (serialNumber) {
      next.serialUnits = p.serialUnits.map((s) =>
        s.serialNumber === serialNumber
          ? {
              ...s,
              status:
                delta < 0
                  ? ("vendido" as SerialUnit["status"])
                  : ("disponible" as SerialUnit["status"]),
            }
          : s,
      );
    }

    return next;
  });
}

export function createMovement(input: {
  productId: string;
  variantId?: string;
  productName: string;
  variantLabel?: string;
  type: InventoryMovementType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reference: string;
  reason?: string;
}): InventoryMovement {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    user: "Admin demo",
    ...input,
  };
}

export const categoryLabels: Record<string, string> = {
  bicicletas: "Bicicletas",
  cascos: "Cascos",
  llantas: "Llantas",
  pedales: "Pedales",
  guantes: "Guantes",
  jerseys: "Jerseys",
  accesorios: "Accesorios",
  herramientas: "Herramientas",
};

export const paymentMethodLabels: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

export const movementTypeLabels: Record<string, string> = {
  venta: "Venta",
  devolucion: "Devolución",
  cancelacion: "Cancelación",
  apartado: "Apartado",
  liberacion_apartado: "Liberación apartado",
  ajuste: "Ajuste manual",
  entrada: "Entrada",
  salida: "Salida",
  cotizacion_convertida: "Cotización convertida",
};

export const saleStatusLabels: Record<string, string> = {
  completada: "Completada",
  cancelada: "Cancelada",
  parcialmente_devuelta: "Parcialmente devuelta",
  devuelta: "Devuelta",
};

export function formatPosPrice(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(amount);
}
