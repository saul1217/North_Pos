import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Cloud, CloudOff, RefreshCw } from "lucide-react";
import { usePos } from "@/context/PosContext";
import { fetchSales, pendingSales, syncSales } from "@/lib/sync/sync";
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
  const syncingRef = useRef(false);
  const failureCountRef = useRef(0);
  const firstSyncShownRef = useRef(false);

  const runSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setError(null);
    if (!firstSyncShownRef.current) {
      firstSyncShownRef.current = true;
      setShowStatus(true);
    }
    let failed = Boolean(catalogError || workshopError);
    const role = getAuthSession()?.user.role;
    const canSyncSales = role === "admin" || role === "cajero";
    if (canSyncSales) {
      const res = await syncSales(salesRef.current);
      setPending(res.pending);
      if (!res.ok) {
        failed = true;
        setError(res.error ?? "error");
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
  }, [mergeRemoteSales, refreshCatalog, syncWorkshopOrders]);

  // Recompute pending when sales change, and push shortly after.
  useEffect(() => {
    setPending(pendingSales(sales).length);
    const t = setTimeout(() => void runSync(), 800);
    return () => clearTimeout(t);
  }, [sales, runSync]);

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
        ? `${totalPending} elemento${totalPending === 1 ? "" : "s"} pendientes`
        : hasSyncError
          ? "Error de sincronización — reintentar"
          : "Datos sincronizados";
  const Icon = !online ? CloudOff : state === "pending" ? Cloud : Check;

  return (
    <div className={`pos-no-print ${showStatus ? "flex" : "hidden"} shrink-0 flex-wrap items-center justify-end gap-2 border-b border-north-border bg-white px-4 py-1.5`}>
      {hasSyncError && (
        <span className="max-w-[min(70vw,520px)] truncate text-[11px] text-red-700" title={syncErrorMessage ?? undefined}>
          Motivo: {syncErrorMessage}
        </span>
      )}
      <button
        type="button"
        onClick={() => void runSync()}
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
