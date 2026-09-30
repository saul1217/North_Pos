import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Cloud, CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { usePos } from "@/context/PosContext";
import { fetchSales, syncSalesRound, unsyncedSalesCount } from "@/lib/sync/sync";
import { getAuthSession } from "@/lib/auth";

// Thin status bar shown on every POS screen. Reads sales via the public usePos
// hook (no coupling to POS internals) and pushes the pending ones to the
// backend automatically: shortly after a sale, on reconnect, and on a timer.
export function SyncBar() {
  const {
    sales,
    workshopSyncPending,
    syncWorkshopOrders,
    mergeRemoteSales,
    refreshCatalog,
    catalogError,
    workshopError,
    serverPurgeQueue,
    tillId,
    confirmSalePurge,
    dropDeletedSales,
  } = usePos();
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStatus, setShowStatus] = useState(true);

  const salesRef = useRef(sales);
  salesRef.current = sales;
  const purgeRef = useRef(serverPurgeQueue);
  purgeRef.current = serverPurgeQueue;
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const workshopPendingRef = useRef(workshopSyncPending);
  workshopPendingRef.current = workshopSyncPending;
  const catalogErrorRef = useRef(catalogError);
  catalogErrorRef.current = catalogError;
  const workshopErrorRef = useRef(workshopError);
  workshopErrorRef.current = workshopError;
  const syncingRef = useRef(false);
  const failureCountRef = useRef(0);
  const firstSyncShownRef = useRef(false);
  // The current error came from pushing sales (a reject reason), not from a download.
  const salesErrorRef = useRef(false);

  const runSync = useCallback(async (force = false) => {
    if (syncingRef.current) return;
    // New sales and already-synced sales with a pending status change.
    const hasPendingWork = unsyncedSalesCount(salesRef.current) > 0 ||
      (purgeRef.current.length > 0 && getAuthSession()?.user.role === "admin") ||
      workshopPendingRef.current > 0 ||
      Boolean(catalogErrorRef.current || workshopErrorRef.current);
    if (!force && !hasPendingWork) return;
    syncingRef.current = true;
    setSyncing(true);
    setError(null);
    salesErrorRef.current = false;
    if (!firstSyncShownRef.current) {
      firstSyncShownRef.current = true;
      setShowStatus(true);
    }
    let failed = Boolean(catalogError || workshopError);
    const role = getAuthSession()?.user.role;
    const canSyncSales = role === "admin" || role === "cajero";
    if (canSyncSales) {
      // El borrado pendiente («Borrar ventas locales») va antes que cualquier
      // subida; solo un admin puede enviarlo.
      const { purge, outcome: res } = await syncSalesRound({
        sales: salesRef.current,
        pendingPurge: purgeRef.current,
        tillId,
        canPurge: role === "admin",
        onPurgeConfirmed: confirmSalePurge,
      });
      setPurgeError(purge && !purge.ok ? purge.error ?? "error" : null);
      if (purge && !purge.ok) failed = true;
      // Ventas que otra caja borró en el servidor: se quitan también aquí.
      if (res.deleted.length > 0) dropDeletedSales(res.deleted);
      setPending(res.pending);
      // Surface server reject reasons even when some sales applied (ok:true + error).
      if (res.error) {
        setError(res.error);
        salesErrorRef.current = true;
        failed = true;
      } else if (!res.ok) {
        failed = true;
        salesErrorRef.current = true;
        setError("error");
      } else {
        setError(null);
      }
      try {
        const remoteSales = await fetchSales();
        mergeRemoteSales(remoteSales);
      } catch (salesError) {
        failed = true;
        setError((salesError as Error).message || "No se pudieron descargar las ventas");
      }
    } else {
      setPending(0);
    }
    await refreshCatalog();
    await syncWorkshopOrders();
    if (failed) {
      failureCountRef.current += 1;
      if (failureCountRef.current >= 2) setShowStatus(true);
      else setShowStatus(false);
    } else {
      failureCountRef.current = 0;
      setShowStatus(false);
    }
    setSyncing(false);
    syncingRef.current = false;
  }, [mergeRemoteSales, refreshCatalog, syncWorkshopOrders, confirmSalePurge, dropDeletedSales, tillId]);

  // Recompute pending when sales change, and push shortly after.
  useEffect(() => {
    const unsynced = unsyncedSalesCount(sales);
    setPending(unsynced);
    // A reject reason refers to sales that were pending. If the merge that
    // follows the push settles them (server copy taken as baseline), nothing is
    // pending anymore and the old reason must not stay on screen.
    if (unsynced === 0 && salesErrorRef.current) {
      salesErrorRef.current = false;
      setError(null);
    }
    const hasPendingWork = unsynced > 0 || workshopSyncPending > 0 ||
      (serverPurgeQueue.length > 0 && getAuthSession()?.user.role === "admin");
    if (!hasPendingWork) return;
    const t = setTimeout(() => void runSync(), 800);
    return () => clearTimeout(t);
  }, [sales, workshopSyncPending, serverPurgeQueue, catalogError, workshopError, runSync]);

  // Justo después de «Borrar ventas locales»: intentar el borrado en el servidor ya.
  useEffect(() => {
    const onPurge = () => void runSync(true);
    window.addEventListener("northbike-sales-purge-pending", onPurge);
    return () => window.removeEventListener("northbike-sales-purge-pending", onPurge);
  }, [runSync]);

  // Connection changes + periodic retry.
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void runSync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const iv = setInterval(() => {
      if (navigator.onLine) void runSync();
    }, 20000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(iv);
    };
  }, [runSync]);

  const totalPending = pending + workshopSyncPending;
  const hasSyncError = Boolean(error || catalogError);
  const syncErrorMessage = error || catalogError;
  const state = !online ? "offline" : totalPending > 0 || hasSyncError ? "pending" : "synced";
  const styles = {
    offline: "border-red-200 bg-red-50 text-red-700",
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    synced: "border-emerald-200 bg-emerald-50 text-emerald-700",
  }[state];
  const label = syncing
    ? "Sincronizando..."
    : !online
      ? "Sin conexión"
      : totalPending > 0
        ? `${totalPending} ${totalPending === 1 ? "elemento pendiente" : "elementos pendientes"}`
        : hasSyncError
          ? "Error de sincronización — reintentar"
          : "Datos sincronizados";
  const Icon = !online ? CloudOff : state === "pending" ? Cloud : Check;
  const purgeCount = serverPurgeQueue.length;
  const purgeHint = getAuthSession()?.user.role !== "admin"
    ? "Se enviará cuando un administrador inicie sesión con internet."
    : purgeError
      ? `Se reintentará automáticamente. Motivo: ${purgeError}`
      : "Se enviará al servidor en cuanto haya internet.";

  return (
    <div className={`pos-no-print ${showStatus || purgeCount > 0 ? "flex" : "hidden"} shrink-0 flex-wrap items-center justify-end gap-2 border-b border-north-border bg-white px-4 py-1.5`}>
      {purgeCount > 0 && (
        <span role="status" title={purgeHint} className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
          <Trash2 className="h-3.5 w-3.5" />
          Borrado pendiente de subir ({purgeCount} {purgeCount === 1 ? "venta" : "ventas"})
        </span>
      )}
      {hasSyncError && (
        <span className="max-w-[min(70vw,520px)] truncate text-[11px] text-red-700" title={syncErrorMessage ?? undefined}>
          Motivo: {syncErrorMessage}
        </span>
      )}
      <button
        type="button"
        onClick={() => void runSync(true)}
        title={syncErrorMessage ? `Error: ${syncErrorMessage}` : "Sincronizar ahora"}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${styles}`}
      >
        {syncing ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Icon className="h-3.5 w-3.5" />
        )}
        {label}
      </button>
    </div>
  );
}
