"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  ClipboardList,
  FileText,
  LineChart,
  Package,
  Receipt,
  ShoppingCart,
  Wrench,
  LogOut,
  Users,
  Download,
  Printer,
} from "lucide-react";
import type { AuthUser } from "@/lib/auth";
import { allowedPaths } from "@/lib/permissions";

const nav = [
  { href: "/pos/venta", label: "Venta", icon: ShoppingCart },
  { href: "/pos/productos", label: "Productos", icon: Package },
  { href: "/pos/inventario", label: "Inventario", icon: Boxes },
  { href: "/pos/ventas", label: "Ventas", icon: Receipt },
  { href: "/pos/apartados", label: "Apartados", icon: ClipboardList },
  { href: "/pos/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/pos/taller", label: "Taller", icon: Wrench },
  { href: "/pos/analiticas", label: "Analíticas", icon: LineChart },
];

export function PosSidebar({ onLogout, username, role }: { onLogout: () => void; username: string; role: AuthUser["role"] }) {
  const pathname = usePathname();

  return (
    <aside className="pos-no-print flex w-56 shrink-0 flex-col bg-north-dark text-white lg:w-60">
      <div className="border-b border-white/10 px-4 py-5">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/logo.png"
            alt="North Bike"
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
          />
          <div>
            <p className="font-display text-sm font-bold uppercase tracking-[0.12em]">
              North Bike POS
            </p>
            <p className="text-[11px] text-north-steel">Demo interna</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {[...nav, { href: "/pos/codigos-barras", label: "Códigos de barras", icon: Printer }, ...(role === "admin" ? [{ href: "/pos/usuarios", label: "Usuarios", icon: Users }, { href: "/pos/respaldo", label: "Exportar ventas", icon: Download }] : [])].filter(({ href }) => allowedPaths(role).some((path) => path === "/pos/" || path === href)).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-north-primary text-white"
                  : "text-white/75 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {href === "/pos/taller" && role === "cajero" ? "Órdenes taller" : label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4 text-xs text-north-steel">
        <p>Sucursal Chihuahua</p>
        <p>Caja 01</p>
        <p className="mt-2 text-white/80">Usuario: {username} · {role}</p>
        <button type="button" onClick={onLogout} className="mt-3 inline-flex items-center gap-1.5 text-north-steel-muted hover:text-white">
          <LogOut className="h-3.5 w-3.5" />
          Cerrar sesión
        </button>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-1.5 text-north-steel-muted hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a tienda
        </Link>
      </div>
    </aside>
  );
}
