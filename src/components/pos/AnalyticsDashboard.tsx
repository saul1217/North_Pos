"use client";

import { useMemo, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePos } from "@/context/PosContext";
import { formatPosPrice } from "@/lib/pos/inventory";
import {
  buildAnalytics,
  formatCompactMxn,
  pctDelta,
} from "@/lib/pos/analytics";

const C = {
  primary: "#1F4D5F",
  dark: "#081319",
  steel: "#6E8E9C",
  muted: "#9BB7C3",
  baja: "#D4DEE3",
  profit: "#133948",
  grid: "#E2E9ED",
};

const pieColors = [C.primary, C.profit, C.steel, C.muted, "#4A7384", "#2A5A6C", "#8AA9B5", C.baja];

function seasonFill(season: "Alta" | "Media" | "Baja") {
  if (season === "Alta") return C.primary;
  if (season === "Media") return C.steel;
  return C.baja;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-north-muted">sin base</span>;
  const up = value >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-emerald-800" : "text-red-800"}`}>
      {up ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

function Kpi({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint: string;
  delta?: number | null;
}) {
  return (
    <article className="rounded-sm border border-north-border bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-north-steel">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-bold leading-none text-north-dark">
        {value}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-north-muted">{hint}</p>
        {delta !== undefined && <Delta value={delta} />}
      </div>
    </article>
  );
}

function ChartCard({
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
      <header className="mb-4">
        <h2 className="font-display text-lg font-bold uppercase tracking-[0.06em] text-north-dark">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-north-muted">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

const tooltipStyle = {
  background: "#081319",
  border: "none",
  borderRadius: 2,
  fontSize: 12,
  color: "#fff",
};

function moneyTooltip(value: unknown) {
  return formatPosPrice(Number(value ?? 0));
}

export function AnalyticsDashboard() {
  const { sales } = usePos();
  const data = useMemo(() => buildAnalytics(sales), [sales]);

  const monthDelta = pctDelta(data.salesMonth, data.salesPrevMonth);
  const dayDelta = pctDelta(data.salesToday, data.salesYesterday);
  const maxHeat = Math.max(...data.heatmap.map((d) => d.revenue), 1);
  const yoyGrowth =
    data.yearCompare.reduce((s, r) => s + r.y2025, 0) > 0
      ? ((data.yearCompare.reduce((s, r) => s + r.y2026, 0) -
          data.yearCompare.reduce((s, r) => s + r.y2025, 0)) /
          data.yearCompare.reduce((s, r) => s + r.y2025, 0)) *
        100
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-north-background">
      <header className="border-b border-north-border bg-white px-4 py-5 md:px-6">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em]">
          Analíticas
        </h1>
        <p className="mt-1 text-sm text-north-muted">
          Sucursal Chihuahua · temporadas MTB 2025–2026 · márgenes estimados de demo
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto grid gap-4 p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <Kpi
            label="Producto favorito"
            value={data.favorite?.name.split(" ").slice(0, 3).join(" ") ?? "—"}
            hint={
              data.favorite
                ? `${data.favorite.units} pzas · ${formatCompactMxn(data.favorite.revenue)}`
                : "Sin ventas"
            }
          />
          <Kpi
            label="Ticket promedio"
            value={formatCompactMxn(data.avgTicketMonth)}
            hint={`Año: ${formatCompactMxn(data.avgTicketYear)}`}
          />
          <Kpi
            label="Ventas diarias"
            value={formatCompactMxn(data.salesToday)}
            hint={`${data.ticketsToday} tickets hoy vs ayer`}
            delta={dayDelta}
          />
          <Kpi
            label="Venta mensual"
            value={formatCompactMxn(data.salesMonth)}
            hint="vs mes anterior"
            delta={monthDelta}
          />
          <Kpi
            label="Ganancias totales"
            value={formatCompactMxn(data.profitAll)}
            hint={`YTD ${formatCompactMxn(data.profitYear)}`}
          />
          <Kpi
            label="Ingreso 2026"
            value={formatCompactMxn(data.revenueYear)}
            hint="vs 2025"
            delta={yoyGrowth}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard
            title="Ventas diarias"
            subtitle="Últimos 30 días · Chihuahua"
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily30}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.primary} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.steel }} interval={4} />
                  <YAxis
                    tick={{ fontSize: 11, fill: C.steel }}
                    tickFormatter={(v) => formatCompactMxn(v)}
                    width={56}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={moneyTooltip}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.date ?? ""
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Venta"
                    stroke={C.primary}
                    fill="url(#revFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Venta mensual"
            subtitle="Color = temporada alta / media / baja"
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.months}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.steel }} interval={1} />
                  <YAxis
                    tick={{ fontSize: 11, fill: C.steel }}
                    tickFormatter={(v) => formatCompactMxn(v)}
                    width={56}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={moneyTooltip}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload;
                      return p ? `${p.label} · temporada ${p.season}` : "";
                    }}
                  />
                  <Bar dataKey="revenue" name="Venta" radius={[2, 2, 0, 0]}>
                    {data.months.map((m) => (
                      <Cell key={m.key} fill={seasonFill(m.season)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex gap-4 text-[11px] uppercase tracking-wider text-north-muted">
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5" style={{ background: C.primary }} /> Alta
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5" style={{ background: C.steel }} /> Media
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5" style={{ background: C.baja }} /> Baja
              </span>
            </div>
          </ChartCard>
        </div>

        <ChartCard
          title="Comparación 2025 vs 2026"
          subtitle="Mismo mes, año contra año · crecimiento de tienda"
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.yearCompare}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: C.steel }} />
                <YAxis
                  tick={{ fontSize: 11, fill: C.steel }}
                  tickFormatter={(v) => formatCompactMxn(v)}
                  width={56}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={moneyTooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="y2025" name="2025" fill={C.muted} radius={[2, 2, 0, 0]} />
                <Bar dataKey="y2026" name="2026" fill={C.primary} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Ingreso vs ganancia" subtitle="Margen estimado por categoría">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.months}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.steel }} interval={1} />
                  <YAxis
                    tick={{ fontSize: 11, fill: C.steel }}
                    tickFormatter={(v) => formatCompactMxn(v)}
                    width={56}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={moneyTooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Ingreso" fill={C.muted} radius={[2, 2, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Ganancia"
                    stroke={C.primary}
                    strokeWidth={2.5}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Ticket promedio" subtitle="Evolución mensual">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.months}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.steel }} interval={1} />
                  <YAxis
                    tick={{ fontSize: 11, fill: C.steel }}
                    tickFormatter={(v) => formatCompactMxn(v)}
                    width={56}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={moneyTooltip} />
                  <Area
                    type="monotone"
                    dataKey="avgTicket"
                    name="Ticket promedio"
                    stroke={C.profit}
                    fill={C.muted}
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard title="Temporadas" subtitle="Alta, media y baja · 2025–2026">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.seasons} layout="vertical" margin={{ left: 12 }}>
                  <CartesianGrid stroke={C.grid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: C.steel }}
                    tickFormatter={(v) => formatCompactMxn(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12, fill: C.dark }}
                    width={48}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={moneyTooltip} />
                  <Bar dataKey="revenue" name="Venta" radius={[0, 2, 2, 0]}>
                    {data.seasons.map((s) => (
                      <Cell key={s.name} fill={seasonFill(s.name)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Por día de semana" subtitle="Patrón de caja">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weekday}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: C.steel }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: C.steel }}
                    tickFormatter={(v) => formatCompactMxn(v)}
                    width={52}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={moneyTooltip} />
                  <Bar dataKey="revenue" name="Venta" fill={C.primary} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Ganancia 2025 vs 2026" subtitle="Misma comparación, margen">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.yearCompare}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.steel }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: C.steel }}
                    tickFormatter={(v) => formatCompactMxn(v)}
                    width={52}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={moneyTooltip} />
                  <Bar dataKey="profit2025" name="2025" fill={C.muted} />
                  <Bar dataKey="profit2026" name="2026" fill={C.profit} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Mix por categoría" subtitle="Participación en ingreso">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.categories}
                    dataKey="revenue"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={2}
                  >
                    {data.categories.map((c, i) => (
                      <Cell key={c.name} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={moneyTooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Métodos de pago" subtitle="Mix de cobro">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.payments}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={3}
                  >
                    {data.payments.map((p, i) => (
                      <Cell key={p.name} fill={[C.primary, C.steel, C.muted][i]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={moneyTooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div className="grid gap-4 xl:grid-cols-5">
          <ChartCard
            title="Ranking de productos"
            subtitle="Unidades vendidas"
            className="xl:col-span-3"
          >
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.products.slice(0, 8)}
                  layout="vertical"
                  margin={{ left: 8, right: 12 }}
                >
                  <CartesianGrid stroke={C.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: C.steel }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={148}
                    tick={{ fontSize: 11, fill: C.dark }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) =>
                      name === "units"
                        ? [`${value} pzas`, "Unidades"]
                        : [formatPosPrice(Number(value)), "Ingreso"]
                    }
                  />
                  <Bar dataKey="units" name="units" fill={C.primary} radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Calendario de ventas"
            subtitle="Últimas 16 semanas · intensidad = ingreso"
            className="xl:col-span-2"
          >
            <div className="mb-1 grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-north-steel">
              {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
                <span key={`${d}-${i}`} className="text-center">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({
                length: new Date(`${data.heatmap[0]?.date ?? "2026-01-01"}T12:00:00`).getDay(),
              }).map((_, i) => (
                <div key={`pad-${i}`} className="aspect-square" />
              ))}
              {data.heatmap.map((d) => {
                const t = d.revenue / maxHeat;
                const bg =
                  t === 0
                    ? "#E2E9ED"
                    : t < 0.25
                      ? "#9BB7C3"
                      : t < 0.55
                        ? "#6E8E9C"
                        : t < 0.8
                          ? "#1F4D5F"
                          : "#081319";
                return (
                  <div
                    key={d.date}
                    title={`${d.date}: ${formatPosPrice(d.revenue)}`}
                    className="aspect-square rounded-[2px]"
                    style={{ background: bg }}
                  />
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-north-muted">
              Oscuro = día fuerte. Julio–agosto se ve más claro (temporada baja por calor).
            </p>
          </ChartCard>
        </div>

        <ChartCard title="Tabla mes a mes" subtitle="Comparativo numérico 2025 / 2026">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-north-border text-[11px] uppercase tracking-wider text-north-steel">
                  <th className="py-2 font-semibold">Mes</th>
                  <th className="py-2 font-semibold">Temp.</th>
                  <th className="py-2 font-semibold">Venta 2025</th>
                  <th className="py-2 font-semibold">Venta 2026</th>
                  <th className="py-2 font-semibold">Δ</th>
                  <th className="py-2 font-semibold">Ganancia 2026</th>
                </tr>
              </thead>
              <tbody>
                {data.yearCompare.map((row) => {
                  const delta = pctDelta(row.y2026, row.y2025);
                  return (
                    <tr key={row.month} className="border-b border-north-border/80">
                      <td className="py-2.5 font-medium capitalize">{row.label}</td>
                      <td className="py-2.5">
                        <span
                          className="rounded-sm px-1.5 py-0.5 text-[11px] font-semibold uppercase"
                          style={{
                            background:
                              row.season === "Alta"
                                ? "color-mix(in srgb, #1F4D5F 12%, white)"
                                : row.season === "Baja"
                                  ? "#F3F6F8"
                                  : "#EEF3F5",
                            color: C.dark,
                          }}
                        >
                          {row.season}
                        </span>
                      </td>
                      <td className="py-2.5 text-north-muted">{formatPosPrice(row.y2025)}</td>
                      <td className="py-2.5">{formatPosPrice(row.y2026)}</td>
                      <td className="py-2.5">
                        <Delta value={delta} />
                      </td>
                      <td className="py-2.5">{formatPosPrice(row.profit2026)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
