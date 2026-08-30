import type {
  CompletedSale,
  PaymentMethod,
  PosProductCategory,
} from "@/lib/pos/types";
import { categoryLabels, lineTotal } from "@/lib/pos/inventory";
import { generateHistoricalSales, monthSeason } from "@/lib/pos/data/salesHistory";

const TZ = "America/Chihuahua";

export const categoryMargin: Record<string, number> = {
  bicicletas: 0.18,
  cascos: 0.35,
  llantas: 0.28,
  pedales: 0.32,
  guantes: 0.4,
  jerseys: 0.42,
  accesorios: 0.38,
  herramientas: 0.3,
};

const productCategory: Record<string, PosProductCategory> = {
  "pos-001": "bicicletas",
  "pos-002": "bicicletas",
  "pos-003": "cascos",
  "pos-004": "llantas",
  "pos-005": "pedales",
  "pos-006": "guantes",
  "pos-007": "jerseys",
  "pos-008": "accesorios",
  "pos-009": "herramientas",
  "pos-010": "llantas",
};

export function formatCompactMxn(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)} M`;
  }
  if (Math.abs(amount) >= 10_000) {
    return `$${(amount / 1000).toFixed(0)} k`;
  }
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPosDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString("es-MX", {
    month: "short",
  });
  return `${name.replace(".", "")} ${String(y).slice(2)}`;
}

export function fullMonthLabel(month: number): string {
  return new Date(2026, month - 1, 1).toLocaleDateString("es-MX", {
    month: "long",
  });
}

function countable(sale: CompletedSale): boolean {
  return sale.status === "completada" || sale.status === "parcialmente_devuelta";
}

export function saleNetTotal(sale: CompletedSale): number {
  if (!countable(sale)) return 0;
  const returned = sale.returns.reduce(
    (sum, rec) =>
      sum + rec.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    0,
  );
  return Math.max(0, sale.total - returned);
}

export function saleProfit(sale: CompletedSale): number {
  if (!countable(sale)) return 0;
  const lineProfit = sale.items.reduce((sum, item) => {
    const cat = productCategory[item.productId] ?? "accesorios";
    return sum + lineTotal(item) * categoryMargin[cat];
  }, 0);
  const ratio = sale.subtotal > 0 ? saleNetTotal(sale) / sale.subtotal : 1;
  return lineProfit * ratio;
}

export function mergeAnalyticsSales(live: CompletedSale[]): CompletedSale[] {
  const history = generateHistoricalSales();
  const liveOnly = live.filter((s) => !s.id.startsWith("hist-"));
  return [...history, ...liveOnly];
}

export type ProductRank = {
  productId: string;
  name: string;
  category: string;
  units: number;
  revenue: number;
  profit: number;
};

export type DayPoint = {
  date: string;
  label: string;
  tickets: number;
  revenue: number;
  profit: number;
  avgTicket: number;
};

export type MonthPoint = {
  key: string;
  month: number;
  year: number;
  label: string;
  season: "Alta" | "Media" | "Baja";
  tickets: number;
  revenue: number;
  profit: number;
  avgTicket: number;
};

export type AnalyticsSnapshot = {
  favorite: ProductRank | null;
  avgTicketToday: number;
  avgTicketMonth: number;
  avgTicketYear: number;
  salesToday: number;
  ticketsToday: number;
  salesYesterday: number;
  salesMonth: number;
  salesPrevMonth: number;
  profitYear: number;
  profitAll: number;
  revenueYear: number;
  revenueAll: number;
  ticketsYear: number;
  daily30: DayPoint[];
  months: MonthPoint[];
  yearCompare: {
    month: number;
    label: string;
    season: "Alta" | "Media" | "Baja";
    y2025: number;
    y2026: number;
    profit2025: number;
    profit2026: number;
    tickets2025: number;
    tickets2026: number;
  }[];
  weekday: { day: string; revenue: number; tickets: number }[];
  categories: { name: string; revenue: number; profit: number; units: number }[];
  products: ProductRank[];
  payments: { name: string; value: number }[];
  seasons: { name: "Alta" | "Media" | "Baja"; revenue: number; tickets: number; avgTicket: number }[];
  heatmap: { date: string; revenue: number }[];
};

export type AnalyticsDaySummary = {
  date: string;
  sales: CompletedSale[];
  revenue: number;
  profit: number;
  tickets: number;
  units: number;
  avgTicket: number;
  payments: Record<PaymentMethod, number>;
  products: ProductRank[];
};

export type AnalyticsMonthSummary = Omit<AnalyticsDaySummary, "date"> & {
  month: string;
  days: { date: string; label: string; revenue: number; tickets: number; units: number }[];
};

export function buildDaySummary(
  liveSales: CompletedSale[],
  dateKey: string,
): AnalyticsDaySummary {
  const sales = mergeAnalyticsSales(liveSales).filter(
    (sale) => formatPosDateKey(sale.date) === dateKey && countable(sale),
  );
  const productMap = new Map<string, ProductRank>();
  const payments: Record<PaymentMethod, number> = {
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
  };

  let revenue = 0;
  let profit = 0;
  let units = 0;

  for (const sale of sales) {
    revenue += saleNetTotal(sale);
    profit += saleProfit(sale);

    for (const payment of sale.payments) {
      payments[payment.method] += payment.amount;
    }

    for (const item of sale.items) {
      const category = productCategory[item.productId] ?? "accesorios";
      const lineRevenue = lineTotal(item);
      const existing = productMap.get(item.productId) ?? {
        productId: item.productId,
        name: item.name,
        category: categoryLabels[category] ?? category,
        units: 0,
        revenue: 0,
        profit: 0,
      };
      existing.units += item.quantity;
      existing.revenue += lineRevenue;
      existing.profit += lineRevenue * categoryMargin[category];
      productMap.set(item.productId, existing);
      units += item.quantity;
    }
  }

  return {
    date: dateKey,
    sales,
    revenue,
    profit,
    tickets: sales.length,
    units,
    avgTicket: sales.length ? revenue / sales.length : 0,
    payments,
    products: [...productMap.values()].sort((a, b) => b.units - a.units),
  };
}

export function buildMonthSummary(
  liveSales: CompletedSale[],
  monthKey: string,
): AnalyticsMonthSummary {
  const sales = mergeAnalyticsSales(liveSales).filter(
    (sale) => formatPosDateKey(sale.date).slice(0, 7) === monthKey && countable(sale),
  );
  const productMap = new Map<string, ProductRank>();
  const dayMap = new Map<string, { revenue: number; tickets: number; units: number }>();
  const payments: Record<PaymentMethod, number> = {
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
  };

  let revenue = 0;
  let profit = 0;
  let units = 0;

  for (const sale of sales) {
    const net = saleNetTotal(sale);
    const key = formatPosDateKey(sale.date);
    revenue += net;
    profit += saleProfit(sale);

    const day = dayMap.get(key) ?? { revenue: 0, tickets: 0, units: 0 };
    day.revenue += net;
    day.tickets += 1;
    day.units += sale.items.reduce((sum, item) => sum + item.quantity, 0);
    dayMap.set(key, day);

    for (const payment of sale.payments) {
      payments[payment.method] += payment.amount;
    }

    for (const item of sale.items) {
      const category = productCategory[item.productId] ?? "accesorios";
      const lineRevenue = lineTotal(item);
      const existing = productMap.get(item.productId) ?? {
        productId: item.productId,
        name: item.name,
        category: categoryLabels[category] ?? category,
        units: 0,
        revenue: 0,
        profit: 0,
      };
      existing.units += item.quantity;
      existing.revenue += lineRevenue;
      existing.profit += lineRevenue * categoryMargin[category];
      productMap.set(item.productId, existing);
      units += item.quantity;
    }
  }

  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    const date = `${monthKey}-${day}`;
    const values = dayMap.get(date) ?? { revenue: 0, tickets: 0, units: 0 };
    return {
      date,
      label: `${index + 1}`,
      ...values,
    };
  });

  return {
    month: monthKey,
    sales,
    revenue,
    profit,
    tickets: sales.length,
    units,
    avgTicket: sales.length ? revenue / sales.length : 0,
    payments,
    products: [...productMap.values()].sort((a, b) => b.units - a.units),
    days,
  };
}

function emptyDay(date: string): DayPoint {
  const [, m, d] = date.split("-");
  return {
    date,
    label: `${Number(d)}/${Number(m)}`,
    tickets: 0,
    revenue: 0,
    profit: 0,
    avgTicket: 0,
  };
}

export function buildAnalytics(liveSales: CompletedSale[], now = new Date()): AnalyticsSnapshot {
  const sales = mergeAnalyticsSales(liveSales);
  const todayKey = formatPosDateKey(now.toISOString());
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = formatPosDateKey(yesterday.toISOString());
  const thisMonthKey = todayKey.slice(0, 7);
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = formatPosDateKey(prevMonthDate.toISOString()).slice(0, 7);
  const thisYear = now.getFullYear();

  const productMap = new Map<string, ProductRank>();
  const dayMap = new Map<string, DayPoint>();
  const monthMap = new Map<string, MonthPoint>();
  const weekdayAcc = Array.from({ length: 7 }, () => ({ revenue: 0, tickets: 0 }));
  const catMap = new Map<string, { revenue: number; profit: number; units: number }>();
  const payMap = new Map<string, number>();
  const seasonAcc = {
    Alta: { revenue: 0, tickets: 0, profit: 0 },
    Media: { revenue: 0, tickets: 0, profit: 0 },
    Baja: { revenue: 0, tickets: 0, profit: 0 },
  };

  let salesToday = 0;
  let ticketsToday = 0;
  let salesYesterday = 0;
  let salesMonth = 0;
  let ticketsMonth = 0;
  let salesPrevMonth = 0;
  let profitYear = 0;
  let profitAll = 0;
  let revenueYear = 0;
  let revenueAll = 0;
  let ticketsYear = 0;
  let ticketSumToday = 0;

  for (const sale of sales) {
    const net = saleNetTotal(sale);
    const profit = saleProfit(sale);
    const key = formatPosDateKey(sale.date);
    const mk = monthKeyFromDateKey(key);
    const [y, m] = mk.split("-").map(Number);
    const season = monthSeason[m];
    const weekday = new Date(`${key}T12:00:00`).getDay();

    if (countable(sale)) {
      profitAll += profit;
      revenueAll += net;

      if (!dayMap.has(key)) dayMap.set(key, emptyDay(key));
      const day = dayMap.get(key)!;
      day.tickets += 1;
      day.revenue += net;
      day.profit += profit;
      day.avgTicket = day.tickets ? day.revenue / day.tickets : 0;

      if (!monthMap.has(mk)) {
        monthMap.set(mk, {
          key: mk,
          month: m,
          year: y,
          label: monthLabel(mk),
          season: season.label,
          tickets: 0,
          revenue: 0,
          profit: 0,
          avgTicket: 0,
        });
      }
      const month = monthMap.get(mk)!;
      month.tickets += 1;
      month.revenue += net;
      month.profit += profit;
      month.avgTicket = month.tickets ? month.revenue / month.tickets : 0;

      weekdayAcc[weekday].tickets += 1;
      weekdayAcc[weekday].revenue += net;
      seasonAcc[season.label].revenue += net;
      seasonAcc[season.label].tickets += 1;
      seasonAcc[season.label].profit += profit;

      const pay = sale.payments[0]?.method ?? "tarjeta";
      payMap.set(pay, (payMap.get(pay) ?? 0) + net);

      for (const item of sale.items) {
        const cat = productCategory[item.productId] ?? "accesorios";
        const rev = lineTotal(item);
        const itemProfit = rev * categoryMargin[cat];
        const existing = productMap.get(item.productId) ?? {
          productId: item.productId,
          name: item.name,
          category: categoryLabels[cat] ?? cat,
          units: 0,
          revenue: 0,
          profit: 0,
        };
        existing.units += item.quantity;
        existing.revenue += rev;
        existing.profit += itemProfit;
        productMap.set(item.productId, existing);

        const c = catMap.get(cat) ?? { revenue: 0, profit: 0, units: 0 };
        c.revenue += rev;
        c.profit += itemProfit;
        c.units += item.quantity;
        catMap.set(cat, c);
      }

      if (key === todayKey) {
        salesToday += net;
        ticketsToday += 1;
        ticketSumToday += net;
      }
      if (key === yesterdayKey) salesYesterday += net;
      if (mk === thisMonthKey) {
        salesMonth += net;
        ticketsMonth += 1;
      }
      if (mk === prevMonthKey) salesPrevMonth += net;
      if (y === thisYear) {
        profitYear += profit;
        revenueYear += net;
        ticketsYear += 1;
      }
    }
  }

  const daily30: DayPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = formatPosDateKey(d.toISOString());
    daily30.push(dayMap.get(key) ?? emptyDay(key));
  }

  const months = [...monthMap.values()].sort((a, b) => a.key.localeCompare(b.key));

  const yearCompare = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const a = months.find((x) => x.year === 2025 && x.month === month);
    const b = months.find((x) => x.year === 2026 && x.month === month);
    return {
      month,
      label: new Date(2026, i, 1)
        .toLocaleDateString("es-MX", { month: "short" })
        .replace(".", ""),
      season: monthSeason[month].label,
      y2025: a?.revenue ?? 0,
      y2026: b?.revenue ?? 0,
      profit2025: a?.profit ?? 0,
      profit2026: b?.profit ?? 0,
      tickets2025: a?.tickets ?? 0,
      tickets2026: b?.tickets ?? 0,
    };
  });

  const weekdayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const weekday = weekdayNames.map((day, i) => ({
    day,
    revenue: weekdayAcc[i].revenue,
    tickets: weekdayAcc[i].tickets,
  }));

  const products = [...productMap.values()].sort((a, b) => b.units - a.units);
  const favorite = products[0] ?? null;

  const heatmap: { date: string; revenue: number }[] = [];
  for (let i = 111; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = formatPosDateKey(d.toISOString());
    heatmap.push({ date: key, revenue: dayMap.get(key)?.revenue ?? 0 });
  }

  return {
    favorite,
    avgTicketToday: ticketsToday ? ticketSumToday / ticketsToday : 0,
    avgTicketMonth: ticketsMonth ? salesMonth / ticketsMonth : 0,
    avgTicketYear: ticketsYear ? revenueYear / ticketsYear : 0,
    salesToday,
    ticketsToday,
    salesYesterday,
    salesMonth,
    salesPrevMonth,
    profitYear,
    profitAll,
    revenueYear,
    revenueAll,
    ticketsYear,
    daily30,
    months,
    yearCompare,
    weekday,
    categories: [...catMap.entries()].map(([id, v]) => ({
      name: categoryLabels[id] ?? id,
      ...v,
    })),
    products,
    payments: [
      { name: "Tarjeta", value: payMap.get("tarjeta") ?? 0 },
      { name: "Efectivo", value: payMap.get("efectivo") ?? 0 },
      { name: "Transferencia", value: payMap.get("transferencia") ?? 0 },
    ],
    seasons: (["Alta", "Media", "Baja"] as const).map((name) => ({
      name,
      revenue: seasonAcc[name].revenue,
      tickets: seasonAcc[name].tickets,
      avgTicket: seasonAcc[name].tickets
        ? seasonAcc[name].revenue / seasonAcc[name].tickets
        : 0,
    })),
    heatmap,
  };
}

export function pctDelta(current: number, previous: number): number | null {
  if (!previous) return current ? 100 : null;
  return ((current - previous) / previous) * 100;
}
