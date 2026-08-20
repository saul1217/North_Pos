import { API_BASE } from "@/lib/sync/sync";
import type { PosProduct, ProductVariant, WorkshopOrder } from "@/lib/pos/types";
import { getAccessToken, type AuthSession } from "@/lib/auth";

export type ProductInput = Omit<PosProduct, "id" | "serialUnits" | "stock"> & {
  stock?: number;
  variants?: Array<Omit<ProductVariant, "id"> & { id?: string }>;
  serialUnits?: Array<Omit<PosProduct["serialUnits"][number], "id"> & { id?: string }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
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

export function fetchWorkshopOrders(): Promise<WorkshopOrder[]> {
  return request<WorkshopOrder[]>("/api/workshop-orders");
}

export function createWorkshopOrder(input: WorkshopOrder): Promise<WorkshopOrder> {
  return request<WorkshopOrder>("/api/workshop-orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateWorkshopOrder(
  id: string,
  input: Partial<WorkshopOrder>,
): Promise<WorkshopOrder> {
  return request<WorkshopOrder>(`/api/workshop-orders/${id}`, {
    method: "PATCH",
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
