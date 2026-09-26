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
  if (!variantId && product.hasVariants && product.variants.length > 0) {
    const total = product.variants.reduce((sum, item) => sum + item.stock, 0);
    if (total <= 0) return "agotado" as const;
    if (product.variants.some((item) => item.stock <= item.minStock)) return "bajo" as const;
    return "normal" as const;
  }
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

export type CodeMatchKind = "UPC" | "SKU" | "Code 128";

type CodeMatch = { product: PosProduct; variant?: ProductVariant };

export type CodeLookupResult =
  | ({ status: "found"; matchedBy: CodeMatchKind } & CodeMatch)
  | { status: "ambiguous"; matchedBy: CodeMatchKind; matches: CodeMatch[] }
  | { status: "not-found" };

/** Normaliza un código para comparar: sin espacios alrededor y sin distinguir mayúsculas. */
export function normalizeCode(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

const CODE_LOOKUP_STAGES: Array<{
  kind: CodeMatchKind;
  variantField: (variant: ProductVariant) => string | undefined;
  productField: (product: PosProduct) => string | undefined;
}> = [
  { kind: "UPC", variantField: (variant) => variant.upc, productField: (product) => product.upc },
  { kind: "SKU", variantField: (variant) => variant.sku, productField: (product) => product.sku },
  { kind: "Code 128", variantField: (variant) => variant.barcode, productField: (product) => product.barcode },
];

/**
 * Búsqueda única por código escaneado (Venta y Recepción de inventario):
 * UPC global → SKU local → Code 128 local, sin espacios alrededor ni
 * distinción de mayúsculas. Dentro de cada paso, la variante tiene prioridad.
 */
export function lookupProductByCode(products: PosProduct[], code: string): CodeLookupResult {
  const needle = normalizeCode(code);
  if (!needle) return { status: "not-found" };
  for (const stage of CODE_LOOKUP_STAGES) {
    const variantMatches: CodeMatch[] = products.flatMap((product) =>
      product.variants
        .filter((variant) => normalizeCode(stage.variantField(variant)) === needle)
        .map((variant) => ({ product, variant })),
    );
    const productMatches: CodeMatch[] = products
      .filter((product) => normalizeCode(stage.productField(product)) === needle)
      .map((product) => ({ product }));
    if (variantMatches.length === 0 && productMatches.length === 0) continue;
    if (variantMatches.length > 1 || (variantMatches.length === 0 && productMatches.length > 1)) {
      return { status: "ambiguous", matchedBy: stage.kind, matches: [...variantMatches, ...productMatches] };
    }
    return { status: "found", matchedBy: stage.kind, ...(variantMatches[0] ?? productMatches[0]) };
  }
  return { status: "not-found" };
}

export function findByBarcode(
  products: PosProduct[],
  code: string,
): { product: PosProduct; variant?: ProductVariant } | null {
  const result = lookupProductByCode(products, code);
  if (result.status === "found") return { product: result.product, variant: result.variant };
  // Venta conserva su comportamiento previo ante duplicados: toma la primera coincidencia.
  if (result.status === "ambiguous") return result.matches[0] ?? null;
  return null;
}

// EAN-13-compatible internal code. Prefix 20 is reserved for in-store codes.
export function generateInternalBarcode(usedCodes: Iterable<string> = []): string {
  const used = new Set(usedCodes);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const entropy = Math.floor(Math.random() * 10);
    const base = `20${Date.now().toString().slice(-9)}${entropy}`;
    const checksum = base
      .split("")
      .reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    const code = `${base}${(10 - (checksum % 10)) % 10}`;
    if (!used.has(code)) return code;
  }
  return `20${Date.now().toString().slice(-9)}00`;
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

    const next = { ...p, updatedAt: new Date().toISOString() };

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
  user?: string;
}): InventoryMovement {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    user: input.user ?? "Usuario local",
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
  refacciones: "Refacciones",
};

export function getCategoryLabel(category: string): string {
  return categoryLabels[category] ?? category.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

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
