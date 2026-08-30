import { saleNetTotal } from "@/lib/pos/analytics";
import { movementTypeLabels, paymentMethodLabels, saleStatusLabels } from "@/lib/pos/inventory";
import type { CompletedSale, InventoryMovement } from "@/lib/pos/types";

export type SalesExportPeriod = "day" | "month" | "year" | "range";
export type SalesExportFilter = { period: SalesExportPeriod; startDate?: string; endDate?: string };
export type SalesExportBounds = { start: Date; end: Date; label: string };

function dateKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function startOfDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function endOfDay(value: string): Date {
  const date = startOfDay(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function getSalesExportBounds(filter: SalesExportFilter, now = new Date()): SalesExportBounds {
  if (filter.period === "day") {
    const key = dateKey(now);
    return { start: startOfDay(key), end: endOfDay(key), label: `Día ${key}` };
  }
  if (filter.period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end, label: `Mes ${now.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}` };
  }
  if (filter.period === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { start, end, label: `Año ${now.getFullYear()}` };
  }
  const start = startOfDay(filter.startDate || dateKey(now));
  const end = endOfDay(filter.endDate || filter.startDate || dateKey(now));
  return { start, end, label: `Rango ${dateKey(start)} a ${dateKey(end)}` };
}

export function filterSalesForExport(sales: CompletedSale[], bounds: SalesExportBounds): CompletedSale[] {
  return sales.filter((sale) => {
    const time = new Date(sale.date).getTime();
    return time >= bounds.start.getTime() && time <= bounds.end.getTime();
  });
}

export function filterMovementsForExport(movements: InventoryMovement[], bounds: SalesExportBounds): InventoryMovement[] {
  return movements.filter((movement) => {
    const time = new Date(movement.date).getTime();
    return time >= bounds.start.getTime() && time <= bounds.end.getTime();
  });
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let value = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
}

type Cell = string | number;
const EXPORT_COLUMN_COUNT = 19;
const MOVEMENT_COLUMN_COUNT = 11;

function sharedStringTable(rows: Cell[][]): { values: string[]; indexes: Map<string, number> } {
  const values: string[] = [];
  const indexes = new Map<string, number>();
  rows.flat().forEach((cell) => {
    if (typeof cell !== "string" || cell === "" || indexes.has(cell)) return;
    indexes.set(cell, values.length);
    values.push(cell);
  });
  return { values, indexes };
}

type SheetConfig = {
  columnCount: number;
  widths: number[];
  currencyColumns?: number[];
  quantityColumns?: number[];
};

function buildSheet(rows: Cell[][], shared: Map<string, number>, config: SheetConfig): string {
  const lastColumn = columnName(config.columnCount - 1);
  const columns = config.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const currencyColumns = config.currencyColumns ?? [];
  const quantityColumns = config.quantityColumns ?? [];
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      const style = rowIndex === 0
        ? 1
        : rowIndex === 5
          ? 2
          : rowIndex === 3 && [0, 2].includes(columnIndex)
            ? 6
            : rowIndex === 3 && columnIndex === 3 && config.columnCount === EXPORT_COLUMN_COUNT
              ? 3
              : rowIndex === 3
                ? 4
                : rowIndex >= 6 && currencyColumns.includes(columnIndex)
                  ? 3
                  : rowIndex >= 6 && quantityColumns.includes(columnIndex)
                    ? 4
                    : rowIndex >= 6
                      ? 5
                      : 0;
      if (typeof cell === "number") return `<c r="${ref}" s="${style}"><v>${cell}</v></c>`;
      if (cell === "") return `<c r="${ref}" s="${style}"/>`;
      return `<c r="${ref}" s="${style}" t="s"><v>${shared.get(cell) ?? 0}</v></c>`;
    }).join("");
    const height = rowIndex === 0 ? ` ht="25" customHeight="1"` : rowIndex === 5 ? ` ht="34" customHeight="1"` : "";
    return `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><outlinePr summaryBelow="1" summaryRight="1"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastColumn}${rows.length}"/><sheetViews><sheetView showGridLines="1" workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="19"/><cols>${columns}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A6:${lastColumn}${rows.length}"/><mergeCells count="3"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/><mergeCell ref="A3:${lastColumn}3"/></mergeCells></worksheet>`;
}

function buildStyles(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FF081319"/><sz val="10"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF20566A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF0F3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD1DCE2"/></left><right style="thin"><color rgb="FFD1DCE2"/></right><top style="thin"><color rgb="FFD1DCE2"/></top><bottom style="thin"><color rgb="FFD1DCE2"/></bottom><diagonal/></border></borders><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="1" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf></cellXfs></styleSheet>`;
}

function buildWorkbook(salesRows: Cell[][], movementRows: Cell[][]): Uint8Array {
  const encoder = new TextEncoder();
  const { values, indexes } = sharedStringTable([...salesRows, ...movementRows]);
  const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${values.length}" uniqueCount="${values.length}">${values.map((value) => `<si><t xml:space="preserve">${xmlEscape(value)}</t></si>`).join("")}</sst>`;
  const files: Array<[string, string]> = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ventas" sheetId="1" r:id="rId1"/><sheet name="Movimientos de inventario" sheetId="2" r:id="rId4"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", buildSheet(salesRows, indexes, { columnCount: EXPORT_COLUMN_COUNT, widths: [13, 11, 13, 17, 28, 20, 20, 10, 15, 15, 15, 13, 15, 15, 15, 17, 13, 15, 18], currencyColumns: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], quantityColumns: [7] })],
    ["xl/worksheets/sheet2.xml", buildSheet(movementRows, indexes, { columnCount: MOVEMENT_COLUMN_COUNT, widths: [13, 11, 28, 20, 22, 12, 13, 13, 18, 18, 28], quantityColumns: [5, 6, 7] })],
    ["xl/styles.xml", buildStyles()],
    ["xl/sharedStrings.xml", sharedStrings],
  ];
  const crcTable = Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : crc >>> 1;
    return crc >>> 0;
  });
  const crc32 = (data: Uint8Array) => data.reduce((crc, byte) => crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8), 0xffffffff) ^ 0xffffffff;
  const u16 = (value: number) => new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
  const u32 = (value: number) => new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
  const concat = (...parts: Uint8Array[]) => {
    const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    let offset = 0;
    parts.forEach((part) => { result.set(part, offset); offset += part.length; });
    return result;
  };
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  files.forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = concat(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data);
    localParts.push(local);
    const central = concat(new Uint8Array([0x50, 0x4b, 0x01, 0x02]), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes);
    centralParts.push(central);
    offset += local.length;
  });
  const central = concat(...centralParts);
  const local = concat(...localParts);
  return concat(local, central, new Uint8Array([0x50, 0x4b, 0x05, 0x06]), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(local.length), u16(0));
}

function exportRows(sales: CompletedSale[], bounds: SalesExportBounds): Cell[][] {
  const headers = ["Fecha", "Hora", "Folio", "Estado", "Producto", "Variante", "SKU", "Cantidad", "Precio unitario", "Importe línea", "Subtotal venta", "Descuento", "Total venta", "Efectivo", "Tarjeta", "Transferencia", "Devuelto", "Total neto", "Usuario"];
  const rows: Cell[][] = [
    ["North Bike POS"],
    [`Reporte de ventas · ${bounds.label}`],
    [`Generado: ${new Date().toLocaleString("es-MX")}`],
    ["Ventas incluidas", sales.length, "Total neto", sales.reduce((sum, sale) => sum + saleNetTotal(sale), 0)],
    [],
    headers,
  ];
  sales.forEach((sale) => {
    const date = new Date(sale.date);
    const returned = sale.returns.reduce((sum, record) => sum + record.items.reduce((itemSum, item) => itemSum + item.unitPrice * item.quantity, 0), 0);
    const paymentAmount = (method: keyof typeof paymentMethodLabels) => sale.payments.filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0);
    sale.items.forEach((item, index) => rows.push([
      date.toLocaleDateString("es-MX"), date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }), sale.folio,
      saleStatusLabels[sale.status] ?? sale.status, item.name, item.variantLabel ?? "", item.sku, item.quantity, item.price, item.price * item.quantity,
      index === 0 ? sale.subtotal : "", index === 0 ? sale.discount : "", index === 0 ? sale.total : "", index === 0 ? paymentAmount("efectivo") : "", index === 0 ? paymentAmount("tarjeta") : "", index === 0 ? paymentAmount("transferencia") : "", index === 0 ? returned : "", index === 0 ? saleNetTotal(sale) : "", index === 0 ? sale.cashier ?? "Sin usuario" : "",
    ]));
  });
  return rows;
}

function movementRows(movements: InventoryMovement[], bounds: SalesExportBounds): Cell[][] {
  const headers = ["Fecha", "Hora", "Producto", "Variante", "Movimiento", "Cantidad", "Stock antes", "Stock después", "Referencia", "Usuario", "Motivo"];
  const rows: Cell[][] = [
    ["North Bike POS"],
    [`Movimientos de inventario · ${bounds.label}`],
    [`Generado: ${new Date().toLocaleString("es-MX")}`],
    ["Movimientos incluidos", movements.length],
    [],
    headers,
  ];
  movements.forEach((movement) => {
    const date = new Date(movement.date);
    rows.push([
      date.toLocaleDateString("es-MX"), date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }), movement.productName,
      movement.variantLabel ?? "", movementTypeLabels[movement.type] ?? movement.type, movement.quantity, movement.stockBefore, movement.stockAfter,
      movement.reference, movement.user, movement.reason ?? "",
    ]);
  });
  return rows;
}

export function downloadSalesXlsx(sales: CompletedSale[], bounds: SalesExportBounds, movements: InventoryMovement[]): void {
  const bytes = createSalesXlsxBytes(sales, bounds, movements);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeLabel = bounds.label.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  link.href = url;
  link.download = `northbike-ventas-${safeLabel}.xlsx`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createSalesXlsxBytes(
  sales: CompletedSale[],
  bounds: SalesExportBounds,
  movements: InventoryMovement[],
): Uint8Array {
  return buildWorkbook(exportRows(sales, bounds), movementRows(movements, bounds));
}
