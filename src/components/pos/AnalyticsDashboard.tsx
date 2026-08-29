"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Banknote,
  CalendarDays,
  CreditCard,
  Package,
  ReceiptText,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { usePos } from "@/context/PosContext";
import { formatPosPrice } from "@/lib/pos/inventory";
import {
  buildAnalytics,
  buildDaySummary,
  buildMonthSummary,
  formatCompactMxn,
  formatPosDateKey,
  saleNetTotal,
} from "@/lib/pos/analytics";
import type { PaymentMethod } from "@/lib/pos/types";

const TZ = "America/Chihuahua";

const paymentRows: {
  method: PaymentMethod;
  label: string;
  icon: LucideIcon;
  color: string;
}[] = [
  { method: "efectivo", label: "Efectivo", icon: Banknote, color: "#1F4D5F" },
  { method: "tarjeta", label: "Tarjeta", icon: CreditCard, color: "#6E8E9C" },
  {
    method: "transferencia",
    label: "Transferencia",
    icon: WalletCards,
    color: "#9BB7C3",
  },
];

const tooltipStyle = {
  background: "#081319",
  border: "none",
  borderRadius: 2,
  fontSize: 12,
  color: "#fff",
};

function displayDate(dateKey: string) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date(`${dateKey}T12:00:00`));
}

function shortDate(dateKey: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: TZ,
  })
    .format(new Date(`${dateKey}T12:00:00`))
    .replace(".", "");
}

function displayMonth(monthKey: string) {
  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: TZ,
  })
    .format(new Date(`${monthKey}-01T12:00:00`))
    .replace(" de ", " ");
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent = "bg-north-primary",
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  accent?: string;
}) {
  return (
    <article className="rounded-sm border border-north-border bg-white p-4 shadow-[0_1px_2px_rgba(8,19,25,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-north-steel">
          {label}
        </p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-white ${accent}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold leading-none text-north-dark">
        {value}
      </p>
      <p className="mt-2 text-xs text-north-muted">{detail}</p>
    </article>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-sm border border-north-border bg-white p-4 md:p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold uppercase tracking-[0.06em] text-north-dark">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-north-muted">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-32 items-center justify-center border border-dashed border-north-border bg-north-background px-4 text-center text-sm text-north-muted">
      {children}
    </div>
  );
}

export function AnalyticsDashboard() {
  const { sales } = usePos();
  const todayKey = useMemo(() => formatPosDateKey(new Date().toISOString()), []);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [viewMode, setViewMode] = useState<"day" | "month">("day");
  const dateInputRef = useRef<HTMLInputElement>(null);

  const selectedDateObject = useMemo(
    () => new Date(`${selectedDate}T12:00:00`),
    [selectedDate],
  );
  const overview = useMemo(
    () => buildAnalytics(sales, selectedDateObject),
    [sales, selectedDateObject],
  );
  const day = useMemo(
    () => buildDaySummary(sales, selectedDate),
    [sales, selectedDate],
  );
  const month = useMemo(
    () => buildMonthSummary(sales, selectedDate.slice(0, 7)),
    [sales, selectedDate],
  );

  const activeSummary = viewMode === "day" ? day : month;
  const maxProductUnits = Math.max(
    ...activeSummary.products.map((product) => product.units),
    1,
  );
  const maxPayment = Math.max(
    ...paymentRows.map(({ method }) => activeSummary.payments[method]),
    1,
  );
  const trend =
    viewMode === "day"
      ? overview.daily30.slice(-7)
      : month.days.map((item) => ({
          ...item,
          profit: 0,
          avgTicket: item.tickets ? item.revenue / item.tickets : 0,
        }));

  function openCalendar() {
    const input = dateInputRef.current;
    if (!input) return;
    if ("showPicker" in HTMLInputElement.prototype) {
      input.showPicker();
    } else {
      input.click();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-north-background">
      <header className="border-b border-north-border bg-white px-4 py-5 md:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-north-primary">
              Control de tienda
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-[0.06em] text-north-dark">
              Analíticas
            </h1>
            <p className="mt-1 text-sm text-north-muted">
              Resumen de ventas, caja y productos para tomar decisiones rápidas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex h-11 border border-north-border bg-north-background p-1"
              role="tablist"
              aria-label="Periodo de analíticas"
            >
              {(["day", "month"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-north-primary/30 ${
                    viewMode === mode
                      ? "bg-north-primary text-white"
                      : "text-north-muted hover:text-north-primary"
                  }`}
                >
                  {mode === "day" ? "Día" : "Mes"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={openCalendar}
              aria-haspopup="dialog"
              className="inline-flex h-11 items-center gap-2 border border-north-primary bg-white px-3 text-left text-sm font-semibold text-north-dark transition hover:bg-north-background focus:outline-none focus:ring-2 focus:ring-north-primary/30"
            >
              <CalendarDays className="h-4 w-4 text-north-primary" aria-hidden="true" />
              <span className="capitalize">{displayDate(selectedDate)}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(todayKey)}
              disabled={selectedDate === todayKey}
              className="h-11 border border-north-border bg-white px-3 text-sm font-semibold text-north-muted transition hover:border-north-primary hover:text-north-primary disabled:cursor-default disabled:opacity-45"
            >
              Hoy
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={selectedDate}
              max={todayKey}
              onChange={(event) => event.target.value && setSelectedDate(event.target.value)}
              aria-label="Seleccionar día para consultar las analíticas"
              className="pointer-events-none absolute h-0 w-0 opacity-0"
              tabIndex={-1}
            />
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[1500px] gap-4 p-4 md:gap-5 md:p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold uppercase tracking-[0.05em] text-north-dark">
                {viewMode === "day" ? "Resumen del día" : "Resumen del mes"}
              </h2>
              <p className="text-sm capitalize text-north-muted">
                {viewMode === "day" ? displayDate(selectedDate) : displayMonth(month.month)}
              </p>
            </div>
            {activeSummary.tickets > 0 && (
              <p className="text-xs text-north-muted">
                {activeSummary.tickets} {activeSummary.tickets === 1 ? "ticket registrado" : "tickets registrados"}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label={viewMode === "day" ? "Venta del día" : "Venta del mes"}
              value={formatCompactMxn(activeSummary.revenue)}
              detail={activeSummary.tickets ? "Ingresos netos del periodo" : "Sin ventas registradas"}
              icon={TrendingUp}
            />
            <MetricCard
              label="Tickets"
              value={String(activeSummary.tickets)}
              detail={`${activeSummary.units} ${activeSummary.units === 1 ? "unidad vendida" : "unidades vendidas"}`}
              icon={ReceiptText}
              accent="bg-north-dark-blue"
            />
            <MetricCard
              label="Ticket promedio"
              value={formatCompactMxn(activeSummary.avgTicket)}
              detail={viewMode === "day" ? "Promedio por venta del día" : "Promedio por venta del mes"}
              icon={WalletCards}
              accent="bg-north-steel"
            />
            <MetricCard
              label="Periodo consultado"
              value={viewMode === "day" ? "Día" : "Mes"}
              detail={viewMode === "day" ? shortDate(selectedDate) : displayMonth(month.month)}
              icon={CalendarDays}
              accent="bg-north-primary"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <Panel
              title={viewMode === "day" ? "Ventas del día" : "Resumen diario del mes"}
              subtitle={
                viewMode === "day"
                  ? "Tickets completados en la fecha seleccionada"
                  : "Ventas agrupadas por día del mes seleccionado"
              }
            >
              {activeSummary.tickets === 0 ? (
                <EmptyState>
                  {viewMode === "day"
                    ? "No hay ventas completadas para este día."
                    : "No hay ventas completadas para este mes."}
                </EmptyState>
              ) : viewMode === "day" ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-north-border text-[11px] uppercase tracking-wider text-north-steel">
                        <th className="pb-2 font-semibold">Hora</th>
                        <th className="pb-2 font-semibold">Folio</th>
                        <th className="pb-2 font-semibold">Artículos</th>
                        <th className="pb-2 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.sales.slice(0, 8).map((sale) => (
                        <tr key={sale.id} className="border-b border-north-border/70 last:border-0">
                          <td className="py-3 text-north-muted">{timeLabel(sale.date)}</td>
                          <td className="py-3 font-medium text-north-dark">{sale.folio}</td>
                          <td className="py-3 text-north-muted">
                            {sale.items.reduce((sum, item) => sum + item.quantity, 0)}
                          </td>
                          <td className="py-3 text-right font-semibold text-north-dark">
                            {formatPosPrice(saleNetTotal(sale))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {day.sales.length > 8 && (
                    <p className="mt-3 text-xs text-north-muted">
                      Mostrando 8 de {day.sales.length} tickets del día.
                    </p>
                  )}
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto pr-1">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-north-border text-[11px] uppercase tracking-wider text-north-steel">
                        <th className="pb-2 font-semibold">Día</th>
                        <th className="pb-2 text-right font-semibold">Tickets</th>
                        <th className="pb-2 text-right font-semibold">Unidades</th>
                        <th className="pb-2 text-right font-semibold">Venta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {month.days.map((item) => (
                        <tr key={item.date} className="border-b border-north-border/70 last:border-0">
                          <td className="py-2.5 font-medium text-north-dark">{item.label}</td>
                          <td className="py-2.5 text-right text-north-muted">{item.tickets}</td>
                          <td className="py-2.5 text-right text-north-muted">{item.units}</td>
                          <td className="py-2.5 text-right font-semibold text-north-dark">
                            {formatPosPrice(item.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel
              title="Métodos de pago"
              subtitle={viewMode === "day" ? "Distribución de cobros del día" : "Distribución de cobros del mes"}
            >
              {activeSummary.tickets === 0 ? (
                <EmptyState>No hay cobros para mostrar en este periodo.</EmptyState>
              ) : (
                <div className="space-y-5">
                  {paymentRows.map(({ method, label, icon: Icon, color }) => {
                    const amount = activeSummary.payments[method];
                    const percentage = activeSummary.revenue
                      ? Math.round((amount / activeSummary.revenue) * 100)
                      : 0;
                    return (
                      <div key={method}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-2 font-medium text-north-dark">
                            <Icon className="h-4 w-4" style={{ color }} aria-hidden="true" />
                            {label}
                          </span>
                          <span className="font-semibold text-north-dark">
                            {formatPosPrice(amount)}
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden bg-north-background">
                          <div
                            className="h-full transition-[width] duration-200"
                            style={{ width: `${Math.min(100, (amount / maxPayment) * 100)}%`, background: color }}
                          />
                        </div>
                        <p className="mt-1 text-right text-[11px] text-north-muted">
                          {percentage}% del periodo
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <Panel
              title="Productos más vendidos"
              subtitle={viewMode === "day" ? "Unidades colocadas en el día" : "Unidades colocadas en el mes"}
            >
              {activeSummary.products.length === 0 ? (
                <EmptyState>No hay productos vendidos en este periodo.</EmptyState>
              ) : (
                <div className="space-y-4">
                  {activeSummary.products.slice(0, 5).map((product) => (
                    <div key={product.productId}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2 font-medium text-north-dark">
                          <Package className="h-4 w-4 shrink-0 text-north-primary" aria-hidden="true" />
                          <span className="truncate">{product.name}</span>
                        </span>
                        <span className="shrink-0 font-semibold text-north-dark">
                          {product.units} pza{product.units === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="mt-2 h-2 bg-north-background">
                        <div
                          className="h-full bg-north-primary transition-[width] duration-200"
                          style={{ width: `${(product.units / maxProductUnits) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              title={viewMode === "day" ? "Tendencia reciente" : "Ventas del mes"}
              subtitle={
                viewMode === "day"
                  ? "Últimos 7 días terminando en la fecha seleccionada"
                  : "Comportamiento diario del mes seleccionado"
              }
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="analyticsRevenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1F4D5F" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#1F4D5F" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#E2E9ED" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#6E8E9C" }}
                      tickFormatter={shortDate}
                      interval={viewMode === "month" ? 4 : 0}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6E8E9C" }}
                      tickFormatter={formatCompactMxn}
                      width={56}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => [formatPosPrice(Number(value ?? 0)), "Venta"]}
                      labelFormatter={(value) => shortDate(String(value))}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#1F4D5F"
                      fill="url(#analyticsRevenueFill)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

        </div>
      </main>
    </div>
  );
}
