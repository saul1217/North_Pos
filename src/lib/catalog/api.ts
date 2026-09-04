import { API_BASE } from "@/lib/sync/sync";
import type { PosProduct, ProductVariant, WorkshopOrder } from "@/lib/pos/types";
import { clearAuthSession, getAccessToken, type AuthSession } from "@/lib/auth";

export type ProductInput = Omit<PosProduct, "id" | "serialUnits" | "stock" | "location"> & {
  stock?: number;
  variants?: Array<Omit<ProductVariant, "id" | "location"> & { id?: string; location?: string }>;
  serialUnits?: Array<Omit<PosProduct["serialUnits"][number], "id" | "location"> & { id?: string; location?: string }>;
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
        return cleanVariant;
      }),
      serialUnits: serialUnits.map((unit) => {
        const { createdAt: _unitCreatedAt, updatedAt: _unitUpdatedAt, ...cleanUnit } = unit as typeof unit & { createdAt?: string; updatedAt?: string };
        return cleanUnit;
      }),
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
    body: JSON.stringify(input),
  });
}

export function updateProduct(id: string, input: ProductInput): Promise<PosProduct> {
  return request<PosProduct>(`/api/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
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
