"use client";

import { Download, FileSpreadsheet, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { usePos } from "@/context/PosContext";
import { formatPosPrice } from "@/lib/pos/inventory";
import { downloadSalesXlsx, filterMovementsForExport, filterSalesForExport, getSalesExportBounds, type SalesExportPeriod } from "@/lib/pos/salesExport";
import type { PaymentMethod } from "@/lib/pos/types";
import { getAuthSession } from "@/lib/auth";
import { showNotice } from "@/lib/pos/notify";
import { changedSales, pendingSales } from "@/lib/sync/sync";
import { splitSalesByOrigin } from "@/lib/pos/saleOrigin";

function localDateKey(): string {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

export default function PosRespaldoPage() {
  const { sales, movements, wipeLocalSales, tillId } = usePos();
  const isAdmin = getAuthSession()?.user.role === "admin";
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);
  const byOrigin = useMemo(() => splitSalesByOrigin(sales, tillId), [sales, tillId]);
  const newNotUploaded = useMemo(() => pendingSales(sales).length, [sales]);
  const changesNotUploaded = useMemo(() => changedSales(sales).length, [sales]);
  const [period, setPeriod] = useState<SalesExportPeriod>("month");
  const [paymentMethod, setPaymentMethod] = useState<"todos" | PaymentMethod>("todos");
  const [cashier, setCashier] = useState("todos");
  const [startDate, setStartDate] = useState(localDateKey);
  const [endDate, setEndDate] = useState(localDateKey);
  const [message, setMessage] = useState("");
  const bounds = useMemo(() => getSalesExportBounds({ period, startDate, endDate }), [period, startDate, endDate]);
  const periodSales = useMemo(() => filterSalesForExport(sales, bounds), [sales, bounds]);
  const filteredMovements = useMemo(() => filterMovementsForExport(movements, bounds), [movements, bounds]);
  const cashierOptions = useMemo(() => [...new Set(periodSales.map((sale) => sale.cashier ?? "Sin usuario"))].sort((a, b) => a.localeCompare(b, "es")), [periodSales]);
  const filteredSales = useMemo(() => periodSales.filter((sale) => {
    const matchesPayment = paymentMethod === "todos" || sale.payments.some((payment) => payment.method === paymentMethod);
    const matchesCashier = cashier === "todos" || (sale.cashier ?? "Sin usuario") === cashier;
    return matchesPayment && matchesCashier;
  }), [periodSales, paymentMethod, cashier]);
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

  async function runWipe() {
    setWiping(true);
    try {
      const { removed, server } = await wipeLocalSales();
      showNotice(
        server > 0
          ? `Se borraron ${removed} venta${removed === 1 ? "" : "s"} de esta caja. El borrado de ${server} en el servidor se enviará en cuanto haya internet (verás «Borrado pendiente de subir» hasta que se confirme).`
          : `Se borraron ${removed} venta${removed === 1 ? "" : "s"} solo de esta caja. Ninguna se creó en esta caja, así que no se borra nada en el servidor.`,
        "info",
      );
    } catch (error) {
      showNotice(`No se pudieron borrar las ventas locales: ${(error as Error).message}`);
    } finally {
      setWiping(false);
      setConfirmWipe(false);
    }
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
            <label className="mt-4 block text-sm font-medium">Usuario que registró<select value={cashier} onChange={(event) => setCashier(event.target.value)} className="mt-1 h-10 w-full border border-north-border bg-white px-3 font-normal"><option value="todos">Todos los usuarios</option>{cashierOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            {period === "range" && <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Desde<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label><label className="text-sm font-medium">Hasta<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 h-10 w-full border border-north-border px-3 font-normal" /></label></div>}
            <div className="mt-5 border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900">Se exportan las ventas guardadas en esta computadora. Las cancelaciones aparecen para mantener el historial y el total neto excluye ventas canceladas y devoluciones.</div>
          </section>
          <aside className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1"><div className="border border-north-border bg-white p-4"><p className="text-xs uppercase text-north-steel">Periodo</p><p className="mt-1 text-sm font-medium">{bounds.label}</p></div><div className="border border-north-border bg-white p-4"><p className="text-xs uppercase text-north-steel">Ventas</p><p className="mt-1 text-2xl font-semibold">{filteredSales.length}</p></div><div className="border border-north-border bg-white p-4"><p className="text-xs uppercase text-north-steel">Movimientos</p><p className="mt-1 text-2xl font-semibold">{filteredMovements.length}</p></div><div className="border border-north-border bg-white p-4"><p className="text-xs uppercase text-north-steel">Total neto</p><p className="mt-1 text-2xl font-semibold text-north-primary">{formatPosPrice(netTotal)}</p><p className="mt-1 text-xs text-north-muted">Bruto registrado: {formatPosPrice(grossTotal)}</p></div></aside>
        </div>
        {message && <p role="status" className="mt-5 max-w-5xl border border-north-border bg-white px-4 py-3 text-sm text-north-muted">{message}</p>}
        {isAdmin && (
          <section className="mt-6 max-w-5xl border border-red-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3"><Trash2 className="mt-0.5 h-5 w-5 text-red-600" /><div><h2 className="font-semibold">Borrar ventas locales</h2><p className="mt-1 text-sm text-north-muted">Elimina todas las ventas (con sus pagos, devoluciones y cancelaciones) de esta computadora. Las creadas en esta caja también se borran del servidor; las de otras cajas o de origen desconocido solo se quitan de aquí. El stock no cambia. No borra productos, usuarios, apartados, cotizaciones ni taller.</p><p className="mt-2 text-sm">Ventas guardadas en esta caja: <strong>{sales.length}</strong></p></div></div>
              <button type="button" disabled={sales.length === 0} onClick={() => setConfirmWipe(true)} className="inline-flex h-10 items-center gap-2 bg-red-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-4 w-4" />Borrar ventas locales</button>
            </div>
          </section>
        )}
      </main>
      {isAdmin && confirmWipe && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="wipe-sales-title" className="w-full max-w-md border border-north-border bg-white p-5 shadow-xl">
            <h2 id="wipe-sales-title" className="font-display text-lg font-bold uppercase tracking-[0.06em] text-red-700">Borrar ventas locales</h2>
            <p className="mt-3 text-sm">Se borrarán <strong>{sales.length} venta{sales.length === 1 ? "" : "s"}</strong> de esta caja ahora, con sus pagos, devoluciones y cancelaciones. El folio de ventas volverá a NB-00001.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>Se borrarán en el servidor (cuando haya internet): <strong>{byOrigin.mine.length}</strong> creada{byOrigin.mine.length === 1 ? "" : "s"} en esta caja.</li>
              <li>Solo en esta caja: <strong>{byOrigin.downloaded.length}</strong> descargada{byOrigin.downloaded.length === 1 ? "" : "s"} de otras cajas.</li>
              <li>De origen desconocido: <strong>{byOrigin.unknown.length}</strong> (solo en esta caja).</li>
            </ul>
            <p className="mt-2 text-sm">El stock no cambia (ni aquí ni en el servidor).</p>
            {newNotUploaded > 0 && <p className="mt-2 text-sm text-red-700">{newNotUploaded} venta{newNotUploaded === 1 ? " nueva aún no se ha subido" : "s nuevas aún no se han subido"} al servidor.</p>}
            {changesNotUploaded > 0 && <p className="mt-2 text-sm text-red-700">{changesNotUploaded} cancelaci{changesNotUploaded === 1 ? "ón o devolución aún no se ha subido" : "ones o devoluciones aún no se han subido"} al servidor.</p>}
            <p className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">Esta acción no se puede deshacer.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" autoFocus disabled={wiping} onClick={() => setConfirmWipe(false)} className="h-10 border border-north-border px-4 text-sm font-semibold">Cancelar</button>
              <button type="button" disabled={wiping} onClick={() => void runWipe()} className="h-10 bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{wiping ? "Borrando..." : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
