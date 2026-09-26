import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { NOTICE_TIMEOUT_MS, dismissNotice, subscribeNotices, type Notice } from "@/lib/pos/notify";

// Pila de avisos en la esquina inferior derecha. No es modal y no toma el foco:
// el cajero puede seguir escaneando o escribiendo mientras se muestra.
export function NoticeHost() {
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => subscribeNotices(setNotices), []);

  return (
    <div className="pos-no-print pointer-events-none fixed bottom-4 right-4 z-[1000] flex w-[min(92vw,380px)] flex-col gap-2">
      {notices.map((notice) => (
        <NoticeItem key={notice.id} notice={notice} />
      ))}
    </div>
  );
}

function NoticeItem({ notice }: { notice: Notice }) {
  useEffect(() => {
    const timer = window.setTimeout(() => dismissNotice(notice.id), NOTICE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [notice.id]);

  const styles = notice.kind === "error"
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-slate-200 bg-white text-slate-800";

  return (
    <div role={notice.kind === "error" ? "alert" : "status"} className={`pointer-events-auto flex items-start gap-2 border px-3 py-2 text-sm shadow-lg ${styles}`}>
      <p className="min-w-0 flex-1 break-words">{notice.message}</p>
      <button
        type="button"
        aria-label="Cerrar aviso"
        // No robar el foco al hacer clic: el campo activo (p. ej. el buscador
        // donde escribe el lector) conserva el teclado.
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => dismissNotice(notice.id, event.currentTarget === document.activeElement)}
        className="shrink-0 p-0.5 opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
