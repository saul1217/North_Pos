import type { AuthUser } from "@/lib/auth";

const rolePaths: Record<AuthUser["role"], string[]> = {
  admin: ["/pos/"],
  cajero: ["/pos/venta", "/pos/productos", "/pos/ventas", "/pos/apartados", "/pos/cotizaciones"],
  taller: ["/pos/taller", "/pos/productos", "/pos/inventario"],
};

export function canAccess(role: AuthUser["role"], pathname: string) {
  return rolePaths[role].some((path) => path === "/pos/" ? pathname.startsWith("/pos/") : pathname === path || pathname.startsWith(`${path}/`));
}

export function allowedPaths(role: AuthUser["role"]) {
  return rolePaths[role];
}

export function defaultPath(role: AuthUser["role"]) {
  return role === "taller" ? "/pos/taller" : "/pos/venta";
}
