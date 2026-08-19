import type {
  CompletedSale,
  InventoryMovement,
  Layaway,
  PosPersistedState,
  Quotation,
  WorkshopOrder,
} from "@/lib/pos/types";
import { posProductsSeed } from "@/lib/pos/data/products";

export const POS_STATE_KEY = "northbike-pos-state-v2";

function seedSales(): CompletedSale[] {
  return [
    {
      id: "seed-001",
      folio: "NB-00042",
      date: new Date(Date.now() - 86400000 * 2).toISOString(),
      items: [
        {
          lineId: "pos-004::base::",
          productId: "pos-004",
          sku: "NB-MAXXIS-DHF",
          name: "Maxxis Minion DHF 29x2.5",
          price: 1499,
          quantity: 2,
        },
      ],
      subtotal: 2998,
      discount: 0,
      total: 2998,
      payments: [{ method: "tarjeta", amount: 2998 }],
      status: "completada",
      returns: [],
    },
    {
      id: "seed-002",
      folio: "NB-00041",
      date: new Date(Date.now() - 86400000).toISOString(),
      items: [
        {
          lineId: "pos-003::v-003-m::",
          productId: "pos-003",
          variantId: "v-003-m",
          sku: "NB-GIRO-MAN-M",
          name: "Casco Giro Manifest Spherical",
          variantLabel: "Talla M",
          price: 6499,
          quantity: 1,
        },
      ],
      subtotal: 6499,
      discount: 0,
      total: 6499,
      payments: [{ method: "efectivo", amount: 6499 }],
      amountReceived: 7000,
      change: 501,
      status: "completada",
      returns: [],
    },
  ];
}

export function getDefaultState(): PosPersistedState {
  return {
    products: posProductsSeed,
    sales: seedSales(),
    movements: [],
    layaways: [],
    quotations: [],
    workshopOrders: [],
    folioCounter: 42,
    layawayFolioCounter: 0,
    quoteFolioCounter: 0,
    workshopFolioCounter: 0,
  };
}

// Persistence backend: SQLite (via the Electron `window.pos` bridge) when
// running as the desktop app, else localStorage (browser dev). Existing
// localStorage data is picked up once and migrated to SQLite on the next save.
function readRawState(): string | null {
  if (typeof window === "undefined") return null;
  if (window.pos?.loadStateSync) {
    const fromDb = window.pos.loadStateSync();
    if (fromDb) return fromDb;
    return localStorage.getItem(POS_STATE_KEY); // one-time migration source
  }
  return localStorage.getItem(POS_STATE_KEY);
}

function writeRawState(raw: string): void {
  if (typeof window === "undefined") return;
  if (window.pos?.saveState) {
    void window.pos.saveState(raw);
    return;
  }
  localStorage.setItem(POS_STATE_KEY, raw);
}

export function loadPosState(): PosPersistedState {
  if (typeof window === "undefined") return getDefaultState();
  try {
    const raw = readRawState();
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw) as PosPersistedState;
    return {
      ...getDefaultState(),
      ...parsed,
      products: parsed.products?.length ? parsed.products : posProductsSeed,
    };
  } catch {
    return getDefaultState();
  }
}

export function savePosState(state: PosPersistedState): void {
  if (typeof window === "undefined") return;
  writeRawState(JSON.stringify(state));
}

export function nextFolio(state: PosPersistedState): string {
  const next = state.folioCounter + 1;
  return `NB-${String(next).padStart(5, "0")}`;
}

export function nextLayawayFolio(state: PosPersistedState): string {
  const next = state.layawayFolioCounter + 1;
  return `AP-${String(next).padStart(4, "0")}`;
}

export function nextQuoteFolio(state: PosPersistedState): string {
  const next = state.quoteFolioCounter + 1;
  return `COT-${String(next).padStart(4, "0")}`;
}

export function nextWorkshopFolio(state: PosPersistedState): string {
  const next = state.workshopFolioCounter + 1;
  return `TAL-${String(next).padStart(4, "0")}`;
}

export type { CompletedSale, InventoryMovement, Layaway, Quotation, WorkshopOrder };
