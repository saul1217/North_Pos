export type PosProductCategory =
  | "bicicletas"
  | "cascos"
  | "llantas"
  | "pedales"
  | "guantes"
  | "jerseys"
  | "accesorios"
  | "herramientas";

export type PosProductStatus = "activo" | "inactivo";

export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia";

export type LineDiscount = {
  type: "percent" | "fixed";
  value: number;
};

export type ProductVariant = {
  id: string;
  sku: string;
  barcode: string;
  label: string;
  size?: string;
  wheelSize?: string;
  color?: string;
  model?: string;
  price: number;
  stock: number;
  minStock: number;
  location: string;
};

export type SerialUnit = {
  id: string;
  serialNumber: string;
  variantId?: string;
  status: "disponible" | "vendido" | "apartado";
  location: string;
};

export type PosProduct = {
  id: string;
  sku: string;
  name: string;
  category: PosProductCategory;
  price: number;
  stock: number;
  minStock: number;
  image: string;
  images?: string[];
  barcode: string;
  status: PosProductStatus;
  location: string;
  hasVariants: boolean;
  variants: ProductVariant[];
  requiresSerial: boolean;
  serialUnits: SerialUnit[];
};

export type SaleLineItem = {
  lineId: string;
  productId: string;
  variantId?: string;
  serialNumber?: string;
  sku: string;
  name: string;
  variantLabel?: string;
  price: number;
  quantity: number;
  lineDiscount?: LineDiscount;
};

export type PaymentSplit = {
  method: PaymentMethod;
  amount: number;
};

export type SaleReturnRecord = {
  id: string;
  date: string;
  type: "total" | "parcial";
  reason?: string;
  items: {
    lineId: string;
    productId: string;
    variantId?: string;
    serialNumber?: string;
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }[];
};

export type SaleStatus =
  | "completada"
  | "cancelada"
  | "parcialmente_devuelta"
  | "devuelta";

export type CompletedSale = {
  id: string;
  folio: string;
  date: string;
  items: SaleLineItem[];
  subtotal: number;
  discount: number;
  total: number;
  payments: PaymentSplit[];
  amountReceived?: number;
  change?: number;
  status: SaleStatus;
  cancelReason?: string;
  returns: SaleReturnRecord[];
};

export type CurrentSale = {
  items: SaleLineItem[];
  discount: number;
};

export type InventoryMovementType =
  | "venta"
  | "devolucion"
  | "cancelacion"
  | "apartado"
  | "liberacion_apartado"
  | "ajuste"
  | "entrada"
  | "salida"
  | "cotizacion_convertida";

export type InventoryMovement = {
  id: string;
  date: string;
  productId: string;
  variantId?: string;
  productName: string;
  variantLabel?: string;
  type: InventoryMovementType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reference: string;
  user: string;
  reason?: string;
};

export type InventoryAdjustmentType =
  | "entrada"
  | "salida"
  | "correccion"
  | "dano"
  | "perdida"
  | "conteo"
  | "otro";

export type LayawayStatus = "activo" | "liquidado" | "cancelado";

export type Layaway = {
  id: string;
  folio: string;
  customer: { name: string; phone: string; email?: string };
  items: SaleLineItem[];
  total: number;
  deposit: number;
  balance: number;
  payments: { id: string; date: string; amount: number }[];
  status: LayawayStatus;
  createdAt: string;
};

export type QuotationStatus = "vigente" | "convertida" | "cancelada";

export type Quotation = {
  id: string;
  folio: string;
  customer?: { name: string; phone?: string };
  items: SaleLineItem[];
  notes?: string;
  subtotal: number;
  discount: number;
  total: number;
  status: QuotationStatus;
  createdAt: string;
};

export type ChecklistTemplateItem = {
  id: string;
  name: string;
  required: boolean;
};

export type ChecklistEntry = {
  itemId: string;
  status: "ok" | "issue" | "na";
  notes?: string;
};

export type WorkshopBudgetItem = {
  id: string;
  description: string;
  type: "servicio" | "refaccion";
  quantity: number;
  price: number;
};

export type WorkshopBudget = {
  items: WorkshopBudgetItem[];
  subtotal: number;
  total: number;
  status: "pendiente" | "aprobado" | "rechazado";
};

export type WorkshopStatus =
  | "recibida"
  | "diagnosticada"
  | "terminada"
  | "entregada"
  | "cancelada";

export type WorkshopOrder = {
  id: string;
  folio: string;
  customer: { name: string; phone: string; email?: string };
  bike: {
    brand: string;
    model: string;
    color?: string;
    serialNumber?: string;
    bikeType: string;
    notes?: string;
  };
  photos: string[];
  checklist: ChecklistEntry[];
  clientProblem?: string;
  diagnosis?: string;
  technicalNotes?: string;
  budget?: WorkshopBudget;
  paymentStatus?: "pendiente" | "pagada";
  paidAt?: string;
  paidBy?: string;
  saleId?: string;
  status: WorkshopStatus;
  receivedAt: string;
  assignedTo: string;
};

export type PosPersistedState = {
  products: PosProduct[];
  sales: CompletedSale[];
  movements: InventoryMovement[];
  layaways: Layaway[];
  quotations: Quotation[];
  workshopOrders: WorkshopOrder[];
  folioCounter: number;
  layawayFolioCounter: number;
  quoteFolioCounter: number;
  workshopFolioCounter: number;
};
