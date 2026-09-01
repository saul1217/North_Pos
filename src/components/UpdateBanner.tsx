import { useEffect, useState } from "react";

type UpdateState = {
  status: "available" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
};

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateState | null>(null);

  useEffect(() => {
    const updates = window.pos?.updates;
    if (!updates) return;
    return updates.onStatus((payload) => {
      if (payload.status === "available" || payload.status === "downloading" || payload.status === "downloaded") {
        setUpdate({ ...payload, status: payload.status });
      } else if (payload.status === "error") {
        setUpdate(null);
      }
    });
  }, []);

  if (!update) return null;

  return (
    <div className="border-b border-north-border bg-north-surface px-4 py-2 text-sm text-north-text">
      {update.status === "available" && (
        <span>
          Hay una actualización disponible{update.version ? ` (${update.version})` : ""}.{" "}
          <button className="font-semibold text-north-primary underline" onClick={() => void window.pos?.updates?.download()}>
            Descargar
          </button>
        </span>
      )}
      {update.status === "downloading" && <span>Descargando actualización: {update.percent ?? 0}%</span>}
      {update.status === "downloaded" && (
        <span>
          Actualización lista{update.version ? ` (${update.version})` : ""}.{" "}
          <button className="font-semibold text-north-primary underline" onClick={() => void window.pos?.updates?.install()}>
            Reiniciar y actualizar
          </button>
        </span>
      )}
    </div>
  );
}
