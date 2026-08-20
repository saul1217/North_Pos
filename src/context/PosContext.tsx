"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  CompletedSale,
  CurrentSale,
  InventoryAdjustmentType,
  InventoryMovement,
  Layaway,
  LineDiscount,
  PaymentSplit,
  PosPersistedState,
  PosProduct,
  ProductVariant,
  Quotation,
  SaleLineItem,
  SaleReturnRecord,
  WorkshopOrder,
} from "@/lib/pos/types";
import { defaultReceptionChecklist } from "@/lib/pos/data/checklist";
import {
  calcSaleSubtotal,
  createMovement,
  findByBarcode,
  getAvailableStock,
  getVariant,
  lineTotal,
  makeLineId,
  updateProductStock,
} from "@/lib/pos/inventory";
import {
  getDefaultState,
  loadPosState,
  nextFolio,
  nextLayawayFolio,
  nextQuoteFolio,
  nextWorkshopFolio,
  savePosState,
} from "@/lib/pos/storage";
import {
  createProduct as createProductApi,
  fetchProducts,
  fetchWorkshopOrders,
  createWorkshopOrder as createWorkshopOrderApi,
  updateWorkshopOrder as updateWorkshopOrderApi,
  updateWorkshopBudget as updateWorkshopBudgetApi,
  payWorkshopOrder as payWorkshopOrderApi,
  updateProduct as updateProductApi,
  type ProductInput,
} from "@/lib/catalog/api";
import { getAccessToken } from "@/lib/auth";

type PosStore = PosPersistedState & {
  currentSale: CurrentSale;
  lastCompletedSale: CompletedSale | null;
  checkoutOpen: boolean;
  successOpen: boolean;
  ticketOpen: boolean;
};

function initialStore(): PosStore {
  const base = getDefaultState();
  return {
    ...base,
    currentSale: { items: [], discount: 0 },
    lastCompletedSale: null,
    checkoutOpen: false,
    successOpen: false,
    ticketOpen: false,
  };
}

let store: PosStore = initialStore();
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function getSnapshot(): PosStore {
  return store;
}

function getServerSnapshot(): PosStore {
  return initialStore();
}

function subscribe(listener: () => void) {
  if (typeof window !== "undefined" && !hydrated) {
    hydrated = true;
    const loaded = loadPosState();
    store = {
      ...store,
      ...loaded,
      currentSale: store.currentSale,
      lastCompletedSale: null,
      checkoutOpen: false,
      successOpen: false,
      ticketOpen: false,
    };
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function persist(partial: Partial<PosStore>) {
  store = { ...store, ...partial };
  const {
    products,
    sales,
    movements,
    layaways,
    quotations,
    workshopOrders,
    folioCounter,
    layawayFolioCounter,
    quoteFolioCounter,
    workshopFolioCounter,
  } = store;
  savePosState({
    products,
    sales,
    movements,
    layaways,
    quotations,
    workshopOrders,
    folioCounter,
    layawayFolioCounter,
    quoteFolioCounter,
    workshopFolioCounter,
  });
  emit();
}

function recordStockChange(
  product: PosProduct,
  variantId: string | undefined,
  delta: number,
  type: InventoryMovement["type"],
  reference: string,
  reason?: string,
  serialNumber?: string,
) {
  const variant = getVariant(product, variantId);
  const stockBefore = variant ? variant.stock : product.stock;
  const stockAfter = Math.max(0, stockBefore + delta);
  const movement = createMovement({
    productId: product.id,
    variantId,
    productName: product.name,
    variantLabel: variant?.label,
    type,
    quantity: delta,
    stockBefore,
    stockAfter,
    reference,
    reason,
  });
  const products = updateProductStock(
    store.products,
    product.id,
    variantId,
    delta,
    serialNumber,
  );
  return { products, movement };
}

type PosContextValue = {
  products: PosProduct[];
  catalogLoading: boolean;
  catalogError: string | null;
  currentSale: CurrentSale;
  sales: CompletedSale[];
  movements: InventoryMovement[];
  layaways: Layaway[];
  quotations: Quotation[];
  workshopOrders: WorkshopOrder[];
  checklistTemplate: typeof defaultReceptionChecklist;
  lastCompletedSale: CompletedSale | null;
  checkoutOpen: boolean;
  successOpen: boolean;
  ticketOpen: boolean;
  subtotal: number;
  total: number;
  itemCount: number;
  addToSale: (
    product: PosProduct,
    variant?: ProductVariant,
    serialNumber?: string,
  ) => void;
  addByBarcode: (code: string) => boolean;
  removeFromSale: (lineId: string) => void;
  setLineQuantity: (lineId: string, quantity: number) => void;
  setLineDiscount: (lineId: string, discount?: LineDiscount) => void;
  setDiscount: (discount: number) => void;
  openCheckout: () => void;
  closeCheckout: () => void;
  completeSale: (
    payments: PaymentSplit[],
    cashReceived?: number,
  ) => CompletedSale | null;
  cancelSale: (saleId: string, reason: string) => void;
  processReturn: (
    saleId: string,
    items: { lineId: string; quantity: number }[],
    reason: string,
  ) => void;
  adjustInventory: (input: {
    productId: string;
    variantId?: string;
    quantity: number;
    type: InventoryAdjustmentType;
    reason: string;
  }) => void;
  createLayaway: (input: {
    customer: Layaway["customer"];
    items: SaleLineItem[];
    deposit: number;
  }) => Layaway;
  addLayawayPayment: (layawayId: string, amount: number) => void;
  cancelLayaway: (layawayId: string) => void;
  createQuotation: (input: {
    customer?: Quotation["customer"];
    items: SaleLineItem[];
    notes?: string;
    discount?: number;
  }) => Quotation;
  convertQuotation: (quotationId: string) => void;
  cancelQuotation: (quotationId: string) => void;
  loadQuotationToSale: (quotationId: string) => void;
  createWorkshopOrder: (
    order: Omit<WorkshopOrder, "id" | "folio" | "receivedAt" | "assignedTo" | "status">,
  ) => WorkshopOrder;
  updateWorkshopOrder: (
    id: string,
    patch: Partial<WorkshopOrder>,
  ) => void;
  updateWorkshopBudget: (id: string, budget: NonNullable<WorkshopOrder["budget"]>) => Promise<WorkshopOrder>;
  payWorkshopOrder: (id: string, method: string) => Promise<WorkshopOrder>;
  getProductMovements: (productId: string) => InventoryMovement[];
  closeSuccess: () => void;
  openTicket: () => void;
  closeTicket: () => void;
  newSale: () => void;
  refreshCatalog: () => Promise<void>;
  createProduct: (input: ProductInput) => Promise<PosProduct>;
  updateProduct: (id: string, input: ProductInput) => Promise<PosProduct>;
};

const PosContext = createContext<PosContextValue | null>(null);

export function PosProvider({ children }: { children: ReactNode }) {
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const refreshCatalog = useCallback(async () => {
    if (!getAccessToken()) return;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const products = await fetchProducts();
      persist({ products });
    } catch (error) {
      setCatalogError((error as Error).message);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") void refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    if (typeof window === "undefined" || !getAccessToken()) return;
    void fetchWorkshopOrders()
      .then((remoteOrders) => {
        const remoteIds = new Set(remoteOrders.map((order) => order.id));
        const localOnly = store.workshopOrders.filter((order) => !remoteIds.has(order.id));
        persist({ workshopOrders: [...remoteOrders, ...localOnly] });
        return Promise.all(
          localOnly.map((order) =>
            createWorkshopOrderApi(order).catch(() => undefined),
          ),
        );
      })
      .catch(() => undefined);
  }, []);

  const createProduct = useCallback(async (input: ProductInput) => {
    const product = await createProductApi(input);
    persist({ products: [...store.products, product].sort((a, b) => a.name.localeCompare(b.name)) });
    return product;
  }, []);

  const updateProduct = useCallback(async (id: string, input: ProductInput) => {
    const product = await updateProductApi(id, input);
    persist({ products: store.products.map((item) => item.id === id ? product : item) });
    return product;
  }, []);

  const subtotal = useMemo(
    () => calcSaleSubtotal(snapshot.currentSale.items),
    [snapshot.currentSale.items],
  );

  const total = useMemo(
    () => Math.max(0, subtotal - snapshot.currentSale.discount),
    [subtotal, snapshot.currentSale.discount],
  );

  const itemCount = useMemo(
    () => snapshot.currentSale.items.reduce((s, i) => s + i.quantity, 0),
    [snapshot.currentSale.items],
  );

  const addToSale = useCallback(
    (product: PosProduct, variant?: ProductVariant, serialNumber?: string) => {
      if (product.status === "inactivo") return;
      const variantId = variant?.id;
      const stock = getAvailableStock(product, variantId);
      if (stock <= 0) return;

      if (product.requiresSerial && !serialNumber) return;

      const lineId = makeLineId(product.id, variantId, serialNumber);
      const items = [...store.currentSale.items];
      const existing = items.find((i) => i.lineId === lineId);

      if (existing) {
        if (product.requiresSerial) return;
        if (existing.quantity >= stock) return;
        existing.quantity += 1;
      } else {
        items.push({
          lineId,
          productId: product.id,
          variantId,
          serialNumber,
          sku: variant?.sku ?? product.sku,
          name: product.name,
          variantLabel: variant?.label,
          price: variant?.price ?? product.price,
          quantity: 1,
        });
      }

      persist({ currentSale: { ...store.currentSale, items } });
    },
    [],
  );

  const addByBarcode = useCallback((code: string) => {
    const found = findByBarcode(store.products, code);
    if (!found) return false;
    const { product, variant } = found;
    if (product.requiresSerial && variant) {
      const serial = product.serialUnits.find(
        (s) => s.variantId === variant.id && s.status === "disponible",
      );
      if (!serial) return false;
      addToSale(product, variant, serial.serialNumber);
      return true;
    }
    addToSale(product, variant);
    return true;
  }, [addToSale]);

  const removeFromSale = useCallback((lineId: string) => {
    persist({
      currentSale: {
        ...store.currentSale,
        items: store.currentSale.items.filter((i) => i.lineId !== lineId),
      },
    });
  }, []);

  const setLineQuantity = useCallback((lineId: string, quantity: number) => {
    const item = store.currentSale.items.find((i) => i.lineId === lineId);
    if (!item) return;
    const product = store.products.find((p) => p.id === item.productId);
    if (!product) return;
    if (product.requiresSerial) return;
    if (quantity <= 0) {
      removeFromSale(lineId);
      return;
    }
    const max = getAvailableStock(product, item.variantId);
    persist({
      currentSale: {
        ...store.currentSale,
        items: store.currentSale.items.map((i) =>
          i.lineId === lineId
            ? { ...i, quantity: Math.min(quantity, max) }
            : i,
        ),
      },
    });
  }, [removeFromSale]);

  const setLineDiscount = useCallback(
    (lineId: string, discount?: LineDiscount) => {
      persist({
        currentSale: {
          ...store.currentSale,
          items: store.currentSale.items.map((i) =>
            i.lineId === lineId ? { ...i, lineDiscount: discount } : i,
          ),
        },
      });
    },
    [],
  );

  const setDiscount = useCallback((discount: number) => {
    persist({
      currentSale: {
        ...store.currentSale,
        discount: Math.max(0, discount),
      },
    });
  }, []);

  const openCheckout = useCallback(() => {
    if (store.currentSale.items.length === 0) return;
    persist({ checkoutOpen: true });
  }, []);

  const closeCheckout = useCallback(() => persist({ checkoutOpen: false }), []);

  const completeSale = useCallback(
    (payments: PaymentSplit[], cashReceived?: number) => {
      if (store.currentSale.items.length === 0) return null;
      const saleSubtotal = calcSaleSubtotal(store.currentSale.items);
      const saleTotal = Math.max(0, saleSubtotal - store.currentSale.discount);
      const covered = payments.reduce((s, p) => s + p.amount, 0);
      if (Math.abs(covered - saleTotal) > 0.01) return null;

      const cashPayment = payments.find((p) => p.method === "efectivo");
      const change =
        cashPayment && cashReceived !== undefined
          ? Math.max(0, cashReceived - cashPayment.amount)
          : undefined;

      const folio = nextFolio(store);
      const sale: CompletedSale = {
        id: crypto.randomUUID(),
        folio,
        date: new Date().toISOString(),
        items: [...store.currentSale.items],
        subtotal: saleSubtotal,
        discount: store.currentSale.discount,
        total: saleTotal,
        payments,
        amountReceived: cashReceived,
        change,
        status: "completada",
        returns: [],
      };

      let products = store.products;
      const movements = [...store.movements];

      for (const line of sale.items) {
        const product = products.find((p) => p.id === line.productId);
        if (!product) continue;
        const result = recordStockChange(
          product,
          line.variantId,
          -line.quantity,
          "venta",
          sale.folio,
          undefined,
          line.serialNumber,
        );
        products = result.products;
        movements.push(result.movement);
      }

      persist({
        products,
        movements,
        sales: [sale, ...store.sales],
        folioCounter: store.folioCounter + 1,
        lastCompletedSale: sale,
        currentSale: { items: [], discount: 0 },
        checkoutOpen: false,
        successOpen: true,
      });

      return sale;
    },
    [],
  );

  const cancelSale = useCallback((saleId: string, reason: string) => {
    const sale = store.sales.find((s) => s.id === saleId);
    if (!sale || sale.status === "cancelada") return;

    let products = store.products;
    const movements = [...store.movements];

    for (const line of sale.items) {
      const returnedQty =
        line.quantity -
        sale.returns.reduce((sum, r) => {
          const ri = r.items.find((i) => i.lineId === line.lineId);
          return sum + (ri?.quantity ?? 0);
        }, 0);
      if (returnedQty <= 0) continue;

      const product = products.find((p) => p.id === line.productId);
      if (!product) continue;
      const result = recordStockChange(
        product,
        line.variantId,
        returnedQty,
        "cancelacion",
        sale.folio,
        reason,
        line.serialNumber,
      );
      products = result.products;
      movements.push(result.movement);
    }

    persist({
      products,
      movements,
      sales: store.sales.map((s) =>
        s.id === saleId
          ? { ...s, status: "cancelada" as const, cancelReason: reason }
          : s,
      ),
    });
  }, []);

  const processReturn = useCallback(
    (
      saleId: string,
      returnItems: { lineId: string; quantity: number }[],
      reason: string,
    ) => {
      const sale = store.sales.find((s) => s.id === saleId);
      if (!sale || sale.status === "cancelada") return;

      const returnRecord: SaleReturnRecord = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        type:
          returnItems.length === sale.items.length ? "total" : "parcial",
        reason,
        items: [],
      };

      let products = store.products;
      const movements = [...store.movements];

      for (const ri of returnItems) {
        const line = sale.items.find((i) => i.lineId === ri.lineId);
        if (!line || ri.quantity <= 0) continue;

        const alreadyReturned = sale.returns.reduce((sum, r) => {
          const found = r.items.find((i) => i.lineId === ri.lineId);
          return sum + (found?.quantity ?? 0);
        }, 0);
        const maxReturn = line.quantity - alreadyReturned;
        const qty = Math.min(ri.quantity, maxReturn);
        if (qty <= 0) continue;

        returnRecord.items.push({
          lineId: line.lineId,
          productId: line.productId,
          variantId: line.variantId,
          serialNumber: line.serialNumber,
          sku: line.sku,
          name: line.name,
          quantity: qty,
          unitPrice: lineTotal(line) / line.quantity,
        });

        const product = products.find((p) => p.id === line.productId);
        if (!product) continue;
        const result = recordStockChange(
          product,
          line.variantId,
          qty,
          "devolucion",
          sale.folio,
          reason,
          line.serialNumber,
        );
        products = result.products;
        movements.push(result.movement);
      }

      if (returnRecord.items.length === 0) return;

      const updatedReturns = [...sale.returns, returnRecord];
      const totalReturnedLines = sale.items.every((line) => {
        const returned = updatedReturns.reduce((sum, r) => {
          const ri = r.items.find((i) => i.lineId === line.lineId);
          return sum + (ri?.quantity ?? 0);
        }, 0);
        return returned >= line.quantity;
      });

      persist({
        products,
        movements,
        sales: store.sales.map((s) =>
          s.id === saleId
            ? {
                ...s,
                returns: updatedReturns,
                status: totalReturnedLines
                  ? ("devuelta" as const)
                  : ("parcialmente_devuelta" as const),
              }
            : s,
        ),
      });
    },
    [],
  );

  const adjustInventory = useCallback(
    (input: {
      productId: string;
      variantId?: string;
      quantity: number;
      type: InventoryAdjustmentType;
      reason: string;
    }) => {
      const product = store.products.find((p) => p.id === input.productId);
      if (!product) return;

      const delta =
        input.type === "salida" ||
        input.type === "dano" ||
        input.type === "perdida"
          ? -Math.abs(input.quantity)
          : Math.abs(input.quantity);

      const result = recordStockChange(
        product,
        input.variantId,
        delta,
        input.type === "entrada" ? "entrada" : "ajuste",
        `AJ-${Date.now()}`,
        `${input.type}: ${input.reason}`,
      );

      persist({
        products: result.products,
        movements: [...store.movements, result.movement],
      });
    },
    [],
  );

  const createLayaway = useCallback(
    (input: {
      customer: Layaway["customer"];
      items: SaleLineItem[];
      deposit: number;
    }) => {
      const total = calcSaleSubtotal(input.items);
      const folio = nextLayawayFolio(store);
      const layaway: Layaway = {
        id: crypto.randomUUID(),
        folio,
        customer: input.customer,
        items: input.items,
        total,
        deposit: input.deposit,
        balance: total - input.deposit,
        payments: [
          {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            amount: input.deposit,
          },
        ],
        status: "activo",
        createdAt: new Date().toISOString(),
      };

      let products = store.products;
      const movements = [...store.movements];

      for (const line of input.items) {
        const product = products.find((p) => p.id === line.productId);
        if (!product) continue;
        const result = recordStockChange(
          product,
          line.variantId,
          -line.quantity,
          "apartado",
          layaway.folio,
        );
        products = result.products;
        movements.push(result.movement);

        if (line.serialNumber) {
          products = products.map((p) =>
            p.id === line.productId
              ? {
                  ...p,
                  serialUnits: p.serialUnits.map((s) =>
                    s.serialNumber === line.serialNumber
                      ? { ...s, status: "apartado" as const }
                      : s,
                  ),
                }
              : p,
          );
        }
      }

      persist({
        products,
        movements,
        layaways: [layaway, ...store.layaways],
        layawayFolioCounter: store.layawayFolioCounter + 1,
      });

      return layaway;
    },
    [],
  );

  const addLayawayPayment = useCallback((layawayId: string, amount: number) => {
    persist({
      layaways: store.layaways.map((l) => {
        if (l.id !== layawayId || l.status !== "activo") return l;
        const balance = Math.max(0, l.balance - amount);
        return {
          ...l,
          balance,
          deposit: l.deposit + amount,
          payments: [
            ...l.payments,
            {
              id: crypto.randomUUID(),
              date: new Date().toISOString(),
              amount,
            },
          ],
          status: balance <= 0 ? ("liquidado" as const) : l.status,
        };
      }),
    });
  }, []);

  const cancelLayaway = useCallback((layawayId: string) => {
    const layaway = store.layaways.find((l) => l.id === layawayId);
    if (!layaway || layaway.status !== "activo") return;

    let products = store.products;
    const movements = [...store.movements];

    for (const line of layaway.items) {
      const product = products.find((p) => p.id === line.productId);
      if (!product) continue;
      const result = recordStockChange(
        product,
        line.variantId,
        line.quantity,
        "liberacion_apartado",
        layaway.folio,
      );
      products = result.products;
      movements.push(result.movement);
    }

    persist({
      products,
      movements,
      layaways: store.layaways.map((l) =>
        l.id === layawayId ? { ...l, status: "cancelado" as const } : l,
      ),
    });
  }, []);

  const createQuotation = useCallback(
    (input: {
      customer?: Quotation["customer"];
      items: SaleLineItem[];
      notes?: string;
      discount?: number;
    }) => {
      const sub = calcSaleSubtotal(input.items);
      const discount = input.discount ?? 0;
      const folio = nextQuoteFolio(store);
      const quotation: Quotation = {
        id: crypto.randomUUID(),
        folio,
        customer: input.customer,
        items: input.items,
        notes: input.notes,
        subtotal: sub,
        discount,
        total: Math.max(0, sub - discount),
        status: "vigente",
        createdAt: new Date().toISOString(),
      };

      persist({
        quotations: [quotation, ...store.quotations],
        quoteFolioCounter: store.quoteFolioCounter + 1,
      });

      return quotation;
    },
    [],
  );

  const loadQuotationToSale = useCallback((quotationId: string) => {
    const quote = store.quotations.find((q) => q.id === quotationId);
    if (!quote || quote.status !== "vigente") return;
    persist({
      currentSale: {
        items: quote.items.map((i) => ({ ...i })),
        discount: quote.discount,
      },
    });
  }, []);

  const convertQuotation = useCallback((quotationId: string) => {
    const quote = store.quotations.find((q) => q.id === quotationId);
    if (!quote || quote.status !== "vigente") return;
    loadQuotationToSale(quotationId);
    persist({
      quotations: store.quotations.map((q) =>
        q.id === quotationId ? { ...q, status: "convertida" as const } : q,
      ),
    });
  }, [loadQuotationToSale]);

  const cancelQuotation = useCallback((quotationId: string) => {
    persist({
      quotations: store.quotations.map((q) =>
        q.id === quotationId ? { ...q, status: "cancelada" as const } : q,
      ),
    });
  }, []);

  const createWorkshopOrder = useCallback(
    (
      order: Omit<
        WorkshopOrder,
        "id" | "folio" | "receivedAt" | "assignedTo" | "status"
      >,
    ) => {
      const folio = nextWorkshopFolio(store);
      const workshopOrder: WorkshopOrder = {
        ...order,
        id: crypto.randomUUID(),
        folio,
        receivedAt: new Date().toISOString(),
        assignedTo: "Técnico demo",
        status: "recibida",
      };

      persist({
        workshopOrders: [workshopOrder, ...store.workshopOrders],
        workshopFolioCounter: store.workshopFolioCounter + 1,
      });

      void createWorkshopOrderApi(workshopOrder).catch(() => undefined);

      return workshopOrder;
    },
    [],
  );

  const updateWorkshopOrder = useCallback(
    (id: string, patch: Partial<WorkshopOrder>) => {
      const updated = store.workshopOrders.find((order) => order.id === id);
      persist({
        workshopOrders: store.workshopOrders.map((o) =>
          o.id === id ? { ...o, ...patch } : o,
        ),
      });
      if (updated) {
        void updateWorkshopOrderApi(id, { ...updated, ...patch }).catch(() => undefined);
      }
    },
    [],
  );

  const updateWorkshopBudget = useCallback(async (id: string, budget: NonNullable<WorkshopOrder["budget"]>) => {
    const updated = await updateWorkshopBudgetApi(id, budget);
    persist({ workshopOrders: store.workshopOrders.map((order) => order.id === id ? updated : order) });
    return updated;
  }, []);

  const payWorkshopOrder = useCallback(async (id: string, method: string) => {
    const updated = await payWorkshopOrderApi(id, { saleId: crypto.randomUUID(), method });
    persist({ workshopOrders: store.workshopOrders.map((order) => order.id === id ? updated : order) });
    return updated;
  }, []);

  const getProductMovements = useCallback(
    (productId: string) =>
      store.movements.filter((m) => m.productId === productId),
    [],
  );

  const closeSuccess = useCallback(() => persist({ successOpen: false }), []);
  const openTicket = useCallback(() => persist({ ticketOpen: true }), []);
  const closeTicket = useCallback(() => persist({ ticketOpen: false }), []);

  const newSale = useCallback(() => {
    persist({
      currentSale: { items: [], discount: 0 },
      successOpen: false,
      ticketOpen: false,
      lastCompletedSale: null,
    });
  }, []);

  const value = useMemo<PosContextValue>(
    () => ({
      products: snapshot.products,
      catalogLoading,
      catalogError,
      currentSale: snapshot.currentSale,
      sales: snapshot.sales,
      movements: snapshot.movements,
      layaways: snapshot.layaways,
      quotations: snapshot.quotations,
      workshopOrders: snapshot.workshopOrders,
      checklistTemplate: defaultReceptionChecklist,
      lastCompletedSale: snapshot.lastCompletedSale,
      checkoutOpen: snapshot.checkoutOpen,
      successOpen: snapshot.successOpen,
      ticketOpen: snapshot.ticketOpen,
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
      closeCheckout,
      completeSale,
      cancelSale,
      processReturn,
      adjustInventory,
      createLayaway,
      addLayawayPayment,
      cancelLayaway,
      createQuotation,
      convertQuotation,
      cancelQuotation,
      loadQuotationToSale,
      createWorkshopOrder,
      updateWorkshopOrder,
      updateWorkshopBudget,
      payWorkshopOrder,
      getProductMovements,
      closeSuccess,
      openTicket,
      closeTicket,
      newSale,
      refreshCatalog,
      createProduct,
      updateProduct,
    }),
    [
      snapshot,
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
      closeCheckout,
      completeSale,
      cancelSale,
      processReturn,
      adjustInventory,
      createLayaway,
      addLayawayPayment,
      cancelLayaway,
      createQuotation,
      convertQuotation,
      cancelQuotation,
      loadQuotationToSale,
      createWorkshopOrder,
      updateWorkshopOrder,
      updateWorkshopBudget,
      payWorkshopOrder,
      getProductMovements,
      closeSuccess,
      openTicket,
      closeTicket,
      newSale,
      refreshCatalog,
      createProduct,
      updateProduct,
      catalogLoading,
      catalogError,
    ],
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos must be used within PosProvider");
  return ctx;
}
