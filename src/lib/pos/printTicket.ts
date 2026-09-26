import type { CompletedSale } from "@/lib/pos/types";
import { showNotice } from "@/lib/pos/notify";
import {
  formatPosPrice,
  lineTotal,
  paymentMethodLabels,
  saleStatusLabels,
} from "@/lib/pos/inventory";

type PrintResult = { ok: boolean; deviceName: string | null; error?: string };

export type TicketPrintLine = {
  text?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  double?: boolean;
  sep?: boolean;
};

const TICKET_SELECTORS = [
  "[data-pos-ticket='print']",
  ".pos-ticket-print",
];

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function queryVisibleTicket(): HTMLElement | null {
  for (const selector of TICKET_SELECTORS) {
    const nodes = Array.from(document.querySelectorAll(selector));
    const visible = nodes.find((node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (visible instanceof HTMLElement) return visible;
  }

  const fallback = Array.from(document.querySelectorAll("div")).find((node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.classList.contains("pos-no-print")) return false;
    const text = node.textContent ?? "";
    if (!/North Bike/i.test(text)) return false;
    if (!/(folio|nota de venta|apartado|taller|cotizaci)/i.test(text)) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 120 && rect.height > 160 && rect.width < 520;
  });
  return fallback instanceof HTMLElement ? fallback : null;
}

async function findTicketElement(timeoutMs = 400): Promise<HTMLElement | null> {
  const started = Date.now();
  const first = queryVisibleTicket();
  if (first) return first;
  while (Date.now() - started < timeoutMs) {
    await sleep(32);
    const el = queryVisibleTicket();
    if (el) return el;
  }
  return null;
}

function visibleText(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function isSkipped(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  const tag = el.tagName;
  return (
    tag === "IMG" ||
    tag === "SVG" ||
    tag === "SCRIPT" ||
    tag === "STYLE" ||
    tag === "BUTTON" ||
    el.classList.contains("pos-no-print")
  );
}

function isFlexBetween(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  return (
    (style.display === "flex" || style.display === "inline-flex") &&
    (style.justifyContent === "space-between" || el.classList.contains("justify-between"))
  );
}

function isBold(el: HTMLElement): boolean {
  const weight = Number(getComputedStyle(el).fontWeight);
  return (
    weight >= 600 ||
    el.classList.contains("font-bold") ||
    el.classList.contains("font-semibold")
  );
}

function inferAlign(el: HTMLElement): TicketPrintLine["align"] {
  const style = getComputedStyle(el);
  if (style.textAlign === "center" || el.classList.contains("text-center") || el.closest(".text-center")) {
    return "center";
  }
  if (style.textAlign === "right" || el.classList.contains("text-right")) return "right";
  return "left";
}

function extractTable(table: HTMLElement, lines: TicketPrintLine[]) {
  for (const row of Array.from(table.querySelectorAll("tr"))) {
    if (!(row instanceof HTMLElement)) continue;
    if (row.querySelector("th")) continue;
    const cells = Array.from(row.querySelectorAll("td")).map((cell) => visibleText(cell));
    if (cells.every((cell) => !cell)) continue;
    if (cells.length === 1) {
      lines.push({ text: cells[0] });
      continue;
    }
    if (cells.length === 2) {
      lines.push({ text: `${cells[0]}\t${cells[1]}` });
      continue;
    }
    const name = cells[0];
    const qty = cells[1];
    const amount = cells[cells.length - 1];
    if (name) lines.push({ text: name });
    lines.push({ text: `${qty ? `${qty} x` : ""}\t${amount}` });
  }
}

function extractTicketLines(root: HTMLElement): TicketPrintLine[] {
  const lines: TicketPrintLine[] = [];

  function walk(el: HTMLElement) {
    if (isSkipped(el)) return;

    if (el.tagName === "TABLE") {
      extractTable(el, lines);
      return;
    }

    if (el.tagName === "HR") {
      lines.push({ sep: true });
      return;
    }

    const style = getComputedStyle(el);
    const dashed =
      style.borderTopStyle === "dashed" ||
      style.borderBottomStyle === "dashed" ||
      el.className.includes("border-dashed");

    if (isFlexBetween(el)) {
      const kids = Array.from(el.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      if (kids.length >= 2) {
        const left = visibleText(kids[0]);
        const right = visibleText(kids[kids.length - 1]);
        const mid = kids
          .slice(1, -1)
          .map(visibleText)
          .filter(Boolean)
          .join(" ");
        const leftText = mid ? `${left} ${mid}`.trim() : left;
        if (leftText || right) {
          lines.push({ text: `${leftText}\t${right}`, bold: isBold(el) || kids.some(isBold) });
        }
        return;
      }
    }

    const childEls = Array.from(el.children).filter((child): child is HTMLElement => {
      return child instanceof HTMLElement && !isSkipped(child);
    });

    if (dashed) lines.push({ sep: true });

    if (childEls.length === 0) {
      const text = visibleText(el);
      if (text) {
        const fontSize = parseFloat(style.fontSize);
        lines.push({
          text,
          align: inferAlign(el),
          bold: isBold(el),
          double: fontSize >= 18 || el.classList.contains("text-lg"),
        });
      }
      if (dashed) lines.push({ sep: true });
      return;
    }

    for (const child of childEls) walk(child);
    if (dashed) lines.push({ sep: true });
  }

  walk(root);

  const compact: TicketPrintLine[] = [];
  for (const line of lines) {
    if (line.sep && compact.at(-1)?.sep) continue;
    if (!line.sep && !line.text) continue;
    compact.push(line);
  }

  if (compact.length >= 2) return compact;

  return root.innerText
    .split(/\r?\n/)
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

function saleToTicketLines(sale: CompletedSale): TicketPrintLine[] {
  const date = new Date(sale.date);
  const lines: TicketPrintLine[] = [
    { text: "NORTH BIKE", align: "center", bold: true, double: true },
    { text: "Chihuahua, Mexico", align: "center" },
    { text: "Nota de venta - no fiscal", align: "center" },
    { sep: true },
    { text: `Folio\t${sale.folio}`, bold: true },
    {
      text: `Fecha\t${date.toLocaleDateString("es-MX")} ${date.toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    },
    { text: `Estado\t${saleStatusLabels[sale.status] ?? sale.status}` },
    { sep: true },
  ];

  for (const item of sale.items) {
    lines.push({ text: item.name, bold: true });
    if (item.model) lines.push({ text: `Modelo: ${item.model}` });
    if (item.variantLabel) lines.push({ text: item.variantLabel });
    if (item.serialNumber) lines.push({ text: item.serialNumber });
    if (item.lineDiscount && item.lineDiscount.value > 0) {
      const desc =
        item.lineDiscount.type === "percent"
          ? `${item.lineDiscount.value}%`
          : formatPosPrice(item.lineDiscount.value);
      lines.push({ text: `Desc: ${desc}` });
    }
    lines.push({ text: `${item.quantity} x\t${formatPosPrice(lineTotal(item))}` });
  }

  lines.push({ sep: true });
  lines.push({ text: `Subtotal\t${formatPosPrice(sale.subtotal)}` });
  if (sale.discount > 0) {
    lines.push({ text: `Descuento\t-${formatPosPrice(sale.discount)}` });
  }
  lines.push({ text: `TOTAL\t${formatPosPrice(sale.total)}`, bold: true, double: true });
  for (const payment of sale.payments) {
    lines.push({
      text: `${paymentMethodLabels[payment.method] ?? payment.method}\t${formatPosPrice(payment.amount)}`,
    });
  }
  if (sale.change !== undefined && sale.change > 0) {
    lines.push({ text: `Cambio\t${formatPosPrice(sale.change)}` });
  }
  lines.push({ sep: true });
  lines.push({ text: "¡Gracias por tu compra!", align: "center" });
  return lines;
}

async function sendTicketLines(
  lines: TicketPrintLine[],
  options?: { silent?: boolean },
): Promise<PrintResult> {
  const ipcPrint = window.pos?.printTicket;
  if (typeof ipcPrint !== "function") {
    const message = "La impresión térmica solo está disponible en la app de escritorio";
    if (!options?.silent) showNotice(message);
    return { ok: false, deviceName: null, error: message };
  }

  const result = await Promise.race([
    ipcPrint({ lines }),
    new Promise<PrintResult>((resolve) => {
      setTimeout(() => resolve({ ok: false, deviceName: null, error: "timeout" }), 8000);
    }),
  ]);

  if (!result?.ok) {
    const raw = result?.error || "No se pudo imprimir el ticket";
    const message = /no-ticket-html|no-ticket-lines/i.test(raw)
      ? "Reinicia la app del POS e intenta imprimir de nuevo"
      : raw;
    if (options?.silent) {
      console.warn("[printTicket]", message);
    } else {
      showNotice(`No se pudo imprimir el ticket: ${message}`);
    }
  }
  return result ?? { ok: false, deviceName: null, error: "sin-respuesta" };
}

/**
 * Imprime el ticket de una venta. Por defecto es silencioso (impresión
 * automática al cobrar: si no hay térmica, la venta sigue sin alertas). Los
 * botones manuales (Imprimir / Reimprimir) pasan `silent: false` para mostrar
 * el error, igual que Apartados, Cotizaciones y Taller.
 */
export async function printSaleTicket(
  sale: CompletedSale,
  options: { silent?: boolean } = {},
): Promise<PrintResult> {
  const silent = options.silent ?? true;
  try {
    return await sendTicketLines(saleToTicketLines(sale), { silent });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo imprimir";
    console.warn("[printSaleTicket]", err);
    if (!silent) showNotice(`No se pudo imprimir el ticket: ${message}`);
    return { ok: false, deviceName: null, error: message };
  }
}

/** Imprime el ticket visible como ESC/POS RAW (reimpresiones). */
export async function printTicket(): Promise<PrintResult> {
  const ticket = await findTicketElement();
  if (!ticket) {
    const message = "No hay un ticket visible para imprimir";
    showNotice(message);
    return { ok: false, deviceName: null, error: message };
  }

  const lines = extractTicketLines(ticket);
  if (lines.length < 2) {
    const message = "El ticket no tiene contenido para imprimir";
    showNotice(message);
    return { ok: false, deviceName: null, error: message };
  }

  try {
    return await sendTicketLines(lines);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo imprimir";
    console.error("[printTicket]", err);
    showNotice(`No se pudo imprimir el ticket: ${message}`);
    return { ok: false, deviceName: null, error: message };
  }
}
