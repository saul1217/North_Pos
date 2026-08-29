import type { AuthUser, StoreModuleKey } from "@/lib/auth";

const rolePaths: Record<AuthUser["role"], string[]> = {
  admin: ["/pos/"],
  cajero: ["/pos/venta", "/pos/productos", "/pos/ventas", "/pos/apartados", "/pos/cotizaciones", "/pos/taller", "/pos/codigos-barras"],
  taller: ["/pos/taller", "/pos/productos", "/pos/inventario"],
};

export function canAccess(role: AuthUser["role"], pathname: string, modules?: StoreModuleKey[]) {
  return canAccessWithModules(role, pathname, modules);
}

const pathModules: Record<string, StoreModuleKey> = {
  "/pos/venta": "venta",
  "/pos/productos": "productos",
  "/pos/inventario": "inventario",
  "/pos/ventas": "ventas",
  "/pos/apartados": "apartados",
  "/pos/cotizaciones": "cotizaciones",
  "/pos/taller": "taller",
  "/pos/analiticas": "analiticas",
  "/pos/codigos-barras": "codigos_barras",
  "/pos/respaldo": "exportar_ventas",
};

export function isModuleEnabled(modules: StoreModuleKey[] | undefined, pathname: string) {
  if (!modules?.length) return true;
  const required = Object.entries(pathModules).find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1];
  return !required || modules.includes(required);
}

export function canAccessWithModules(role: AuthUser["role"], pathname: string, modules?: StoreModuleKey[]) {
  return isModuleEnabled(modules, pathname) && rolePaths[role].some((path) => path === "/pos/" ? pathname.startsWith("/pos/") : pathname === path || pathname.startsWith(`${path}/`));
}

export function allowedPaths(role: AuthUser["role"], modules?: StoreModuleKey[]) {
  return rolePaths[role].filter((path) => path === "/pos/" || isModuleEnabled(modules, path));
}

export function defaultPath(role: AuthUser["role"], modules?: StoreModuleKey[]) {
  const preferred = role === "taller"
    ? ["/pos/taller", "/pos/productos", "/pos/inventario"]
    : ["/pos/venta", "/pos/productos", "/pos/ventas", "/pos/analiticas"];
  return preferred.find((path) => rolePaths[role].includes("/pos/") || rolePaths[role].includes(path) ? isModuleEnabled(modules, path) : false) ?? "/pos/venta";
}
