import { API_BASE } from "@/lib/sync/sync";
import type { PosProduct, ProductVariant, WorkshopOrder } from "@/lib/pos/types";
import { clearAuthSession, getAccessToken, type AuthSession } from "@/lib/auth";

/** Campos de e-commerce que el backend acepta y que el POS no edita, pero debe conservar. */
export type ProductEcommerceFields = {
  brand?: string;
  description?: string;
  features?: string[];
  specifications?: Record<string, string>;
  compareAtPrice?: number;
  featured?: boolean;
  isNew?: boolean;
  bikeType?: string;
  compatibility?: string;
};

const ECOMMERCE_FIELDS = [
  "brand", "description", "features", "specifications", "compareAtPrice",
  "featured", "isNew", "bikeType", "compatibility",
] as const satisfies ReadonlyArray<keyof ProductEcommerceFields>;

export type ProductInput = Omit<PosProduct, "id" | "serialUnits" | "stock" | "location" | "sku" | "barcode" | "variants"> & ProductEcommerceFields & {
  sku?: string;
  barcode?: string;
  stock?: number;
  location?: string;
  variants?: Array<Omit<ProductVariant, "id" | "location" | "sku" | "barcode"> & { id?: string; location?: string; sku?: string; barcode?: string }>;
  serialUnits?: Array<Omit<PosProduct["serialUnits"][number], "id" | "location"> & { id?: string; location?: string }>;
};

type VariantInput = NonNullable<ProductInput["variants"]>[number];
type SerialUnitInput = NonNullable<ProductInput["serialUnits"]>[number];

/**
 * El backend valida con whitelist + forbidNonWhitelisted: cualquier campo extra
 * (productId, createdAt, updatedAt… que llegan del servidor) responde 400.
 * Por eso las variantes y series se envían solo con los campos del DTO.
 */
export function toVariantInput(variant: Partial<ProductVariant> & { label: string; price: number }): VariantInput {
  return {
    ...(variant.id ? { id: variant.id } : {}),
    // SKU vacío = variante nueva: se omite para que el servidor asigne el consecutivo.
    ...(variant.sku?.trim() ? { sku: variant.sku.trim() } : {}),
    upc: variant.upc?.trim() ?? "",
    ...(variant.barcode?.trim() ? { barcode: variant.barcode.trim() } : {}),
    label: variant.label,
    price: Number(variant.price) || 0,
    stock: Math.max(0, Math.floor(Number(variant.stock) || 0)),
    minStock: Math.max(0, Math.floor(Number(variant.minStock) || 0)),
    ...(variant.location !== undefined ? { location: variant.location ?? "" } : {}),
    ...(variant.size ? { size: variant.size } : {}),
    ...(variant.wheelSize ? { wheelSize: variant.wheelSize } : {}),
    ...(variant.color ? { color: variant.color } : {}),
    ...(variant.model !== undefined ? { model: variant.model ?? "" } : {}),
  };
}

export function toSerialUnitInput(unit: Partial<PosProduct["serialUnits"][number]> & { serialNumber: string }): SerialUnitInput {
  return {
    ...(unit.id ? { id: unit.id } : {}),
    serialNumber: unit.serialNumber,
    ...(unit.variantId ? { variantId: unit.variantId } : {}),
    status: unit.status ?? "disponible",
    ...(unit.location !== undefined ? { location: unit.location ?? "" } : {}),
  };
}

/** Campos de e-commerce presentes en el producto del servidor (para no borrarlos al actualizar). */
export function ecommerceFieldsOf(product: PosProduct): ProductEcommerceFields {
  const source = product as PosProduct & Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  for (const key of ECOMMERCE_FIELDS) {
    if (source[key] !== undefined && source[key] !== null) fields[key] = source[key];
  }
  return fields as ProductEcommerceFields;
}

/**
 * Payload completo de actualización a partir del producto actual. El PATCH del
 * backend reemplaza el producto (UpdateProductDto = CreateProductDto), así que
 * hay que reenviar existencias, ubicación y datos de e-commerce para no perderlos.
 */
export function productToInput(product: PosProduct): ProductInput {
  return {
    sku: product.sku,
    name: product.name,
    model: product.model ?? "",
    category: product.category,
    price: Number(product.price) || 0,
    stock: Math.max(0, Math.floor(Number(product.stock) || 0)),
    minStock: Math.max(0, Math.floor(Number(product.minStock) || 0)),
    upc: product.upc ?? "",
    barcode: product.barcode,
    image: product.image ?? "",
    images: product.images ?? [],
    status: product.status,
    location: product.location ?? "",
    hasVariants: product.hasVariants,
    requiresSerial: product.requiresSerial,
    variants: product.variants.map(toVariantInput),
    serialUnits: product.serialUnits.map(toSerialUnitInput),
    ...ecommerceFieldsOf(product),
  };
}

function sanitizeProductInput(input: ProductInput): ProductInput {
  return {
    ...input,
    ...(input.variants ? { variants: input.variants.map(toVariantInput) } : {}),
    ...(input.serialUnits ? { serialUnits: input.serialUnits.map(toSerialUnitInput) } : {}),
  };
}

export type SkuCategory = {
  category: string;
  prefix: string;
  nextSequence: number;
};

export type ProductSyncState = {
  products: PosProduct[];
  deletedIds: string[];
};

async function request<T>(path: string, init?: RequestInit, accessToken?: string | null): Promise<T> {
  const token = accessToken ?? getAccessToken();
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 401 && path !== "/api/auth/login" && typeof window !== "undefined") {
    clearAuthSession();
    window.dispatchEvent(new CustomEvent("northbike-auth-expired"));
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export function uploadProductImage(file: File): Promise<{ bucket: string; path: string; url: string }> {
  const body = new FormData();
  body.append("file", file);
  return request<{ bucket: string; path: string; url: string }>("/api/uploads/product-image", {
    method: "POST",
    body,
  });
}

export function login(username: string, password: string): Promise<AuthSession> {
  return request<AuthSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function fetchProducts(): Promise<PosProduct[]> {
  return request<PosProduct[]>("/api/products");
}

export function fetchSkuCategories(): Promise<SkuCategory[]> {
  return request<SkuCategory[]>("/api/products/sku-categories");
}

export function createSkuCategory(input: Pick<SkuCategory, "category" | "prefix">): Promise<SkuCategory> {
  return request<SkuCategory>("/api/products/sku-categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchProductSync(accessToken?: string | null): Promise<ProductSyncState> {
  return request<ProductSyncState>("/api/products/sync", undefined, accessToken);
}

export function syncProducts(input: ProductSyncState, accessToken?: string | null): Promise<ProductSyncState> {
  const products = input.products.map((product) => {
    const { createdAt: _createdAt, deletedAt: _deletedAt, variants, serialUnits, ...cleanProduct } = product as PosProduct & {
      createdAt?: string;
      deletedAt?: string;
    };
    return {
      ...cleanProduct,
      // El backend no acepta existencias negativas. Normalizamos datos
      // locales antiguos o ventas pendientes antes de enviarlos.
      stock: Math.max(0, Number(cleanProduct.stock) || 0),
      minStock: Math.max(0, Number(cleanProduct.minStock) || 0),
      variants: variants.map((variant) => {
        const {
          createdAt: _variantCreatedAt,
          updatedAt: _variantUpdatedAt,
          productId: _variantProductId,
          ...cleanVariant
        } = variant as typeof variant & {
          createdAt?: string;
          updatedAt?: string;
          productId?: string;
        };
        return {
          ...cleanVariant,
          stock: Math.max(0, Number(cleanVariant.stock) || 0),
          minStock: Math.max(0, Number(cleanVariant.minStock) || 0),
        };
      }),
      // Solo campos del DTO: el servidor devuelve productId/createdAt en cada serie.
      serialUnits: serialUnits.map(toSerialUnitInput),
    };
  });
  return request<ProductSyncState>("/api/products/sync", {
    method: "POST",
    body: JSON.stringify({ ...input, products }),
  }, accessToken);
}

export function createProduct(input: ProductInput): Promise<PosProduct> {
  return request<PosProduct>("/api/products", {
    method: "POST",
    body: JSON.stringify(sanitizeProductInput(input)),
  });
}

export function updateProduct(id: string, input: ProductInput): Promise<PosProduct> {
  return request<PosProduct>(`/api/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(sanitizeProductInput(input)),
  });
}

export function deleteProduct(id: string): Promise<{ ok: true; id: string }> {
  return request<{ ok: true; id: string }>(`/api/products/${id}`, {
    method: "DELETE",
  });
}

export function fetchWorkshopOrders(): Promise<WorkshopOrder[]> {
  return request<WorkshopOrder[]>("/api/workshop-orders");
}

export function createWorkshopOrder(input: WorkshopOrder, accessToken?: string | null): Promise<WorkshopOrder> {
  return request<WorkshopOrder>("/api/workshop-orders", {
    method: "POST",
    body: JSON.stringify(input),
  }, accessToken);
}

export function updateWorkshopOrder(
  id: string,
  input: Partial<WorkshopOrder>,
  accessToken?: string | null,
): Promise<WorkshopOrder> {
  return request<WorkshopOrder>(`/api/workshop-orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }, accessToken);
}

export function updateWorkshopBudget(
  id: string,
  input: {
    budget: NonNullable<WorkshopOrder["budget"]>;
    clientProblem?: string;
    diagnosis?: string;
    technicalNotes?: string;
  },
  accessToken?: string | null,
): Promise<WorkshopOrder> {
  return request<WorkshopOrder>(`/api/workshop-orders/${id}/budget`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }, accessToken);
}

export function payWorkshopOrder(
  id: string,
  input: { saleId: string; method: string },
): Promise<WorkshopOrder> {
  return request<WorkshopOrder>(`/api/workshop-orders/${id}/pay`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type ManagedUser = AuthSession["user"] & { active: boolean; createdAt: string; updatedAt: string };

export function fetchUsers(): Promise<ManagedUser[]> {
  return request<ManagedUser[]>("/api/users");
}

export function createUser(input: { username: string; temporaryPassword: string; role: AuthSession["user"]["role"] }): Promise<ManagedUser> {
  return request<ManagedUser>("/api/users", { method: "POST", body: JSON.stringify(input) });
}

export function updateUser(id: string, input: { role?: AuthSession["user"]["role"]; active?: boolean; temporaryPassword?: string }): Promise<ManagedUser> {
  return request<ManagedUser>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/users/me/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
}

export function requestEmailVerification(email: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/auth/email/request", { method: "POST", body: JSON.stringify({ email }) });
}

export function verifyEmail(code: string): Promise<{ ok: true; email: string; emailVerified: true }> {
  return request<{ ok: true; email: string; emailVerified: true }>("/api/auth/email/verify", { method: "POST", body: JSON.stringify({ code }) });
}

export function setInitialPassword(newPassword: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/auth/password/initial", { method: "POST", body: JSON.stringify({ newPassword }) });
}

export function requestPasswordChange(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/auth/password/change/request", { method: "POST" });
}

export function confirmPasswordChange(code: string, newPassword: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/auth/password/change/confirm", { method: "POST", body: JSON.stringify({ code, newPassword }) });
}

export function requestPasswordReset(email: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/auth/password/reset/request", { method: "POST", body: JSON.stringify({ email }) });
}

export function confirmPasswordReset(email: string, code: string, newPassword: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/auth/password/reset/confirm", { method: "POST", body: JSON.stringify({ email, code, newPassword }) });
}
