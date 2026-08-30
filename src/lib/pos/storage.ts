import type {
  CompletedSale,
  InventoryMovement,
  Layaway,
  PosPersistedState,
  PosProduct,
  Quotation,
  WorkshopOrder,
  WorkshopSyncOperation,
} from "@/lib/pos/types";

export const POS_STATE_KEY = "northbike-pos-state-v2";

// Estado inicial de una instalación limpia: sin datos demo. El catálogo real
// se gestiona aparte (backend / alta de productos).
export function getDefaultState(): PosPersistedState {
  return {
    products: [],
    deletedProductIds: [],
    sales: [],
    movements: [],
    layaways: [],
    quotations: [],
    workshopOrders: [],
    workshopSyncQueue: [],
    folioCounter: 0,
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

function normalizeProductIdentifiers(product: PosProduct): PosProduct {
  const legacyUpc = product.upc ?? (product.barcode && product.barcode !== product.sku ? product.barcode : "");
  return {
    ...product,
    upc: legacyUpc,
    barcode: product.sku,
    variants: product.variants.map((variant) => ({
      ...variant,
      upc: variant.upc ?? (variant.barcode && variant.barcode !== variant.sku ? variant.barcode : ""),
      barcode: variant.sku,
    })),
  };
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
      products: (parsed.products ?? []).map(normalizeProductIdentifiers),
      deletedProductIds: parsed.deletedProductIds ?? [],
      workshopSyncQueue: (parsed.workshopSyncQueue ?? []) as WorkshopSyncOperation[],
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
