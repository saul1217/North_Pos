import type {
  CompletedSale,
  PaymentMethod,
  PosProductCategory,
  SaleLineItem,
} from "@/lib/pos/types";
import { makeLineId } from "@/lib/pos/inventory";

type CatalogItem = {
  productId: string;
  sku: string;
  name: string;
  category: PosProductCategory;
  price: number;
  weight: number;
  variantId?: string;
  variantLabel?: string;
};

const catalog: CatalogItem[] = [
  {
    productId: "pos-001",
    sku: "NB-ORB-OIZ-M-BLK",
    name: "Orbea Oiz M30",
    category: "bicicletas",
    price: 89999,
    weight: 0.035,
    variantId: "v-001-m-blk",
    variantLabel: "Talla M / Negro",
  },
  {
    productId: "pos-002",
    sku: "NB-TREK-MARLIN-7",
    name: "Trek Marlin 7 Gen 3",
    category: "bicicletas",
    price: 24999,
    weight: 0.09,
  },
  {
    productId: "pos-003",
    sku: "NB-GIRO-MAN-M",
    name: "Casco Giro Manifest Spherical",
    category: "cascos",
    price: 6499,
    weight: 0.08,
    variantId: "v-003-m",
    variantLabel: "Talla M",
  },
  {
    productId: "pos-004",
    sku: "NB-MAXXIS-DHF",
    name: "Maxxis Minion DHF 29x2.5",
    category: "llantas",
    price: 1499,
    weight: 0.15,
  },
  {
    productId: "pos-005",
    sku: "NB-SHIM-XT-PED",
    name: "Pedales Shimano XT M8120",
    category: "pedales",
    price: 3299,
    weight: 0.08,
  },
  {
    productId: "pos-006",
    sku: "NB-FOX-RANGER",
    name: "Guantes Fox Ranger",
    category: "guantes",
    price: 899,
    weight: 0.16,
  },
  {
    productId: "pos-007",
    sku: "NB-PEARL-ATTACK",
    name: "Jersey Pearl Izumi Attack",
    category: "jerseys",
    price: 1599,
    weight: 0.12,
  },
  {
    productId: "pos-008",
    sku: "NB-ION-1200",
    name: "Luz Bontrager Ion 1200 RT",
    category: "accesorios",
    price: 3499,
    weight: 0.1,
  },
  {
    productId: "pos-009",
    sku: "NB-PARK-SAK6",
    name: "Kit Park Tool SAK-6",
    category: "herramientas",
    price: 899,
    weight: 0.1,
  },
  {
    productId: "pos-010",
    sku: "NB-MAXXIS-REKON",
    name: "Maxxis Rekon Race 29x2.25",
    category: "llantas",
    price: 1199,
    weight: 0.075,
  },
];

/** Chihuahua MTB: primavera y otoño altos; julio-agosto (calor) y enero bajos. */
export const monthSeason: Record<
  number,
  { label: "Alta" | "Media" | "Baja"; factor: number }
> = {
  1: { label: "Baja", factor: 0.52 },
  2: { label: "Media", factor: 0.78 },
  3: { label: "Alta", factor: 1.28 },
  4: { label: "Alta", factor: 1.42 },
  5: { label: "Alta", factor: 1.18 },
  6: { label: "Media", factor: 0.82 },
  7: { label: "Baja", factor: 0.48 },
  8: { label: "Baja", factor: 0.55 },
  9: { label: "Media", factor: 0.96 },
  10: { label: "Alta", factor: 1.32 },
  11: { label: "Alta", factor: 1.24 },
  12: { label: "Alta", factor: 1.46 },
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rng: () => number, items: CatalogItem[]): CatalogItem {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function pickPayment(rng: () => number): PaymentMethod {
  const r = rng();
  if (r < 0.46) return "tarjeta";
  if (r < 0.84) return "efectivo";
  return "transferencia";
}

function toIso(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, month - 1, day, hour + 6, minute, 0)).toISOString();
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/**
 * Historial determinista 2025–hoy para gráficas.
 * No se persiste: el POS operativo sigue con ventas reales de la demo.
 */
export function generateHistoricalSales(now = new Date()): CompletedSale[] {
  // Sin datos demo: las analíticas se calculan solo con ventas reales.
  return [];
  // eslint-disable-next-line no-unreachable
  const rng = mulberry32(20260818);
  const sales: CompletedSale[] = [];
  let folio = 180;
  let n = 0;

  const endY = now.getFullYear();
  const endM = now.getMonth() + 1;
  const endD = now.getDate();

  for (let year = 2025; year <= endY; year++) {
    const yearFactor = year === 2025 ? 0.86 : 1;
    const lastMonth = year === endY ? endM : 12;

    for (let month = 1; month <= lastMonth; month++) {
      const season = monthSeason[month];
      const lastDay =
        year === endY && month === endM ? Math.max(1, endD - 1) : daysInMonth(year, month);

      for (let day = 1; day <= lastDay; day++) {
        const weekday = new Date(year, month - 1, day).getDay();
        const weekend = weekday === 6 ? 1.65 : weekday === 0 ? 1.28 : weekday === 5 ? 1.12 : 0.88;
        const volume = 2.2 * season.factor * yearFactor * weekend;
        const count = Math.max(1, Math.min(11, Math.round(volume + rng() * 1.8 - 0.4)));

        for (let t = 0; t < count; t++) {
          const hour = 10 + Math.floor(rng() * 9);
          const minute = Math.floor(rng() * 60);
          const bikeBoost = season.label === "Alta" ? 1.35 : season.label === "Baja" ? 0.7 : 1;
          const items: SaleLineItem[] = [];
          const itemCount = rng() < 0.28 ? 2 : 1;

          for (let i = 0; i < itemCount; i++) {
            const weighted =
              i === 0 && rng() < 0.12 * bikeBoost
                ? catalog.filter((c) => c.category === "bicicletas")
                : catalog;
            const product = pickWeighted(rng, weighted.length ? weighted : catalog);
            const qty =
              product.category === "bicicletas"
                ? 1
                : product.category === "llantas" && rng() < 0.35
                  ? 2
                  : 1;
            items.push({
              lineId: makeLineId(product.productId, product.variantId),
              productId: product.productId,
              variantId: product.variantId,
              sku: product.sku,
              name: product.name,
              variantLabel: product.variantLabel,
              price: product.price,
              quantity: qty,
            });
          }

          const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
          const discount = rng() < 0.08 ? Math.round(subtotal * 0.05) : 0;
          const total = subtotal - discount;
          const method = pickPayment(rng);
          const roll = rng();
          const status =
            roll < 0.015 ? "cancelada" : roll < 0.03 ? "devuelta" : "completada";

          folio += 1;
          n += 1;
          sales.push({
            id: `hist-${n}`,
            folio: `NB-${String(folio).padStart(5, "0")}`,
            date: toIso(year, month, day, hour, minute),
            items,
            subtotal,
            discount,
            total,
            payments: [{ method, amount: total }],
            status,
            returns: [],
          });
        }
      }
    }
  }

  return sales;
}
