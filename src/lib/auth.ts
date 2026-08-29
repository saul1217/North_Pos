export type StoreModuleKey =
  | "venta"
  | "productos"
  | "inventario"
  | "ventas"
  | "apartados"
  | "cotizaciones"
  | "taller"
  | "analiticas"
  | "codigos_barras"
  | "exportar_ventas";

export type AuthUser = {
  id: string;
  username: string;
  role: "admin" | "cajero" | "taller";
  mustChangePassword: boolean;
  storeId: string;
  store: { id: string; name: string; code: string };
  modules: StoreModuleKey[];
};
export type AuthSession = { access_token: string; user: AuthUser };

const AUTH_KEY = "northbike-pos-auth-v1";

export function getAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function saveAuthSession(session: AuthSession) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_KEY);
}

export function getAccessToken() {
  return getAuthSession()?.access_token ?? null;
}
