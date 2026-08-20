import { API_BASE } from "@/lib/sync/sync";
import type { PosProduct, ProductVariant } from "@/lib/pos/types";

export type ProductInput = Omit<PosProduct, "id" | "serialUnits" | "stock"> & {
  stock?: number;
  variants?: Array<Omit<ProductVariant, "id"> & { id?: string }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
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
