"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { usePos } from "@/context/PosContext";
import { formatPosPrice } from "@/lib/pos/inventory";
import { downloadSalesXlsx, filterMovementsForExport, filterSalesForExport, getSalesExportBounds, type SalesExportPeriod } from "@/lib/pos/salesExport";
import type { PaymentMethod } from "@/lib/pos/types";

function localDateKey(): string {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

export default function PosRespaldoPage() {
  const { sales, movements } = usePos();
  const [period, setPeriod] = useState<SalesExportPeriod>("month");
  const [paymentMethod, setPaymentMethod] = useState<"todos" | PaymentMethod>("todos");
  const [startDate, setStartDate] = useState(localDateKey);
  const [endDate, setEndDate] = useState(localDateKey);
  const [message, setMessage] = useState("");
  const bounds = useMemo(() => getSalesExportBounds({ period, startDate, endDate }), [period, startDate, endDate]);
  const periodSales = useMemo(() => filterSalesForExport(sales, bounds), [sales, bounds]);
  const filteredMovements = useMemo(() => filterMovementsForExport(movements, bounds), [movements, bounds]);
  const filteredSales = useMemo(() => paymentMethod === "todos" ? periodSales : periodSales.filter((sale) => sale.payments.some((payment) => payment.method === paymentMethod)), [periodSales, paymentMethod]);
  const grossTotal = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const netTotal = filteredSales.reduce((sum, sale) => sum + (sale.status === "completada" || sale.status === "parcialmente_devuelta" ? sale.total - sale.returns.reduce((returnSum, record) => returnSum + record.items.reduce((itemSum, item) => itemSum + item.unitPrice * item.quantity, 0), 0) : 0), 0);

  function generateReport() {
    if (period === "range" && startDate > endDate) {
      setMessage("La fecha inicial no puede ser posterior a la fecha final.");
      return;
    }
    downloadSalesXlsx(filteredSales, bounds, filteredMovements);
    setMessage(`Archivo generado con ${filteredSales.length} venta${filteredSales.length === 1 ? "" : "s"} y ${filteredMovements.length} movimiento${filteredMovements.length === 1 ? "" : "s"}.`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-north-border bg-white px-4 py-5 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em]">Exportar ventas</h1>
            <p className="mt-1 text-sm text-north-muted">Genera un archivo Excel para revisar o compartir tus ventas.</p>
          </div>
          <button type="button" onClick={generateReport} className="inline-flex h-10 items-center gap-2 bg-north-primary px-4 text-sm font-semibold text-white"><Download className="h-4 w-4" />Generar Excel</button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <div className="grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="border border-north-border bg-white p-5">
            <div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 h-5 w-5 text-north-primary" /><div><h2 className="font-semibold">Periodo del reporte</h2><p className="mt-1 text-sm text-north-muted">Incluye el detalle de cada producto vendido, pagos, descuentos y devoluciones.</p></div></div>
            <label className="mt-5 block text-sm font-medium">Filtrar por<select value={period} onChange={(event) => setPeriod(event.target.value as SalesExportPeriod)} className="mt-1 h-10 w-full border border-north-border bg-white px-3 font-normal"><option value="day">Hoy</option><option value="month">Mes actual</option><option value="year">Año actual</option><option value="range">Rango personalizado</option></select></label>
            <label className="mt-4 block text-sm font-medium">Forma de pago<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "todos" | PaymentMethod)} className="mt-1 h-10 w-full border border-north-border bg-white px-3 font-normal"><option value="todos">Todos los métodos</option><option value="efectivo">Solo efectivo</option><option value="tarjeta">Solo tarjeta</option><option value="transferencia">Solo transferencia</option></select></label>
            {period === "range" && <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Desde<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label><label className="text-sm font-medium">Hasta<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label></div>}
            <div className="mt-5 border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900">Se exportan las ventas guardadas en esta computadora. Las cancelaciones aparecen para mantener el historial y el total neto excluye ventas canceladas y devoluciones.</div>
          </section>
          <aside className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1"><div className="border border-north-border bg-white p-4"><p className="text-xs uppercase text-north-steel">Periodo</p><p className="mt-1 text-sm font-medium">{bounds.label}</p></div><div className="border border-north-border bg-white p-4"><p className="text-xs uppercase text-north-steel">Ventas</p><p className="mt-1 text-2xl font-semibold">{filteredSales.length}</p></div><div className="border border-north-border bg-white p-4"><p className="text-xs uppercase text-north-steel">Movimientos</p><p className="mt-1 text-2xl font-semibold">{filteredMovements.length}</p></div><div className="border border-north-border bg-white p-4"><p className="text-xs uppercase text-north-steel">Total neto</p><p className="mt-1 text-2xl font-semibold text-north-primary">{formatPosPrice(netTotal)}</p><p className="mt-1 text-xs text-north-muted">Bruto registrado: {formatPosPrice(grossTotal)}</p></div></aside>
        </div>
        {message && <p role="status" className="mt-5 max-w-5xl border border-north-border bg-white px-4 py-3 text-sm text-north-muted">{message}</p>}
      </main>
    </div>
  );
}
