"use client";

import { Download, HardDrive, Upload } from "lucide-react";
import { useState } from "react";

export default function PosRespaldoPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const isElectron = typeof window !== "undefined" && Boolean(window.pos?.isElectron);

  async function exportBackup() {
    if (!window.pos) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await window.pos.exportBackup();
      if (!result.canceled) setMessage("Respaldo exportado correctamente.");
    } catch (error) {
      setMessage(`No se pudo exportar: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function importBackup() {
    if (!window.pos) return;
    if (!window.confirm("La restauración reemplazará los datos locales de esta PC. ¿Deseas continuar?")) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await window.pos.importBackup();
      if (!result.canceled) {
        setMessage("Respaldo restaurado. La aplicación se recargará.");
        window.setTimeout(() => window.location.reload(), 900);
      }
    } catch (error) {
      setMessage(`No se pudo restaurar: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-north-border bg-white px-4 py-5 md:px-6">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em]">Respaldo local</h1>
        <p className="mt-1 text-sm text-north-muted">Protege la información guardada en esta computadora.</p>
      </header>
      <div className="max-w-2xl space-y-5 p-4 md:p-6">
        {!isElectron && <p className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Los respaldos están disponibles en la aplicación de escritorio.</p>}
        <section className="border border-north-border bg-white p-5">
          <div className="flex items-start gap-3">
            <HardDrive className="mt-1 h-5 w-5 text-north-primary" />
            <div>
              <h2 className="font-semibold">Datos locales del POS</h2>
              <p className="mt-1 text-sm text-north-muted">Incluye ventas, productos locales, movimientos, órdenes y pendientes de sincronización.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={!isElectron || busy} onClick={() => void exportBackup()} className="inline-flex h-10 items-center gap-2 bg-north-primary px-4 text-sm font-semibold text-white disabled:opacity-50"><Download className="h-4 w-4" />Exportar respaldo</button>
            <button type="button" disabled={!isElectron || busy} onClick={() => void importBackup()} className="inline-flex h-10 items-center gap-2 border border-north-border px-4 text-sm font-semibold disabled:opacity-50"><Upload className="h-4 w-4" />Restaurar respaldo</button>
          </div>
          <p className="mt-4 text-xs text-north-muted">Antes de restaurar se crea automáticamente una copia de seguridad de los datos actuales.</p>
        </section>
        {message && <p className="border border-north-border bg-white px-4 py-3 text-sm text-north-muted">{message}</p>}
      </div>
    </div>
  );
}
