// Avisos no bloqueantes de la app (sustituyen a window.alert()).
//
// En Electron, window.alert() abre un diálogo nativo modal y, al cerrarlo, la
// ventana puede dejar de recibir teclado en todos los campos hasta minimizarla
// y restaurarla. Como el lector de códigos funciona como teclado, eso bloquea
// la caja. Estos avisos se muestran dentro de la página, no roban el foco y,
// al cerrarse, devuelven el foco al elemento que lo tenía.

export type NoticeKind = "error" | "info";

export type Notice = {
  id: number;
  message: string;
  kind: NoticeKind;
  /** Elemento enfocado cuando se mostró el aviso (para devolverle el foco). */
  returnFocusTo: FocusTarget | null;
};

export type FocusTarget = { focus: (options?: { preventScroll?: boolean }) => void; isConnected?: boolean };

type Listener = (notices: Notice[]) => void;

export const MAX_NOTICES = 3;
export const NOTICE_TIMEOUT_MS = 8000;

let notices: Notice[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(notices);
}

function currentFocus(): FocusTarget | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement as (FocusTarget & { tagName?: string }) | null;
  if (!active || active === (document.body as unknown)) return null;
  return active;
}

/** Muestra un aviso sin bloquear la ventana. Devuelve su id. */
export function showNotice(message: string, kind: NoticeKind = "error"): number {
  const id = nextId++;
  // Mismo texto repetido: se reemplaza en vez de apilar.
  const rest = notices.filter((n) => n.message !== message);
  notices = [...rest, { id, message, kind, returnFocusTo: currentFocus() }].slice(-MAX_NOTICES);
  emit();
  return id;
}

/** Cierra un aviso y devuelve el foco al elemento previo si sigue en la página. */
export function dismissNotice(id: number, focusInsideNotice = false): void {
  const notice = notices.find((n) => n.id === id);
  if (!notice) return;
  notices = notices.filter((n) => n.id !== id);
  emit();
  if (focusInsideNotice || focusIsLost()) restoreFocus(notice.returnFocusTo);
}

function focusIsLost(): boolean {
  if (typeof document === "undefined") return false;
  return !document.activeElement || document.activeElement === document.body;
}

/** Devuelve el foco a `target` si aún está en la página. */
export function restoreFocus(target: FocusTarget | null): boolean {
  if (!target || target.isConnected === false) return false;
  try {
    target.focus({ preventScroll: true });
    return true;
  } catch {
    return false;
  }
}

export function getNotices(): Notice[] {
  return notices;
}

export function subscribeNotices(listener: Listener): () => void {
  listeners.add(listener);
  listener(notices);
  return () => void listeners.delete(listener);
}

/** Solo para pruebas. */
export function resetNotices(): void {
  notices = [];
  nextId = 1;
  emit();
}
