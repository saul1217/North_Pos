import type { HelpArticle, TutorialDefinition, TutorialId } from "./types";

export const tutorials: TutorialDefinition[] = [
  {
    id: "create-product", version: 1, title: "Registrar un producto", category: "Puesta en marcha",
    description: "Crea el primer artículo del catálogo con la información necesaria para venderlo.",
    route: "/pos/productos", roles: ["admin"],
    steps: [
      { id: "open", title: "Abre el alta", body: "Selecciona Nuevo producto para registrar un artículo en el catálogo.", target: "products.create", advanceOn: "target" },
      { id: "identity", title: "Identifica el producto", body: "Captura nombre, categoría y precio. El SKU se asigna automáticamente; el UPC es opcional y sirve para recepción con lector.", target: "products.form.identity", advanceOn: "next" },
      { id: "save", title: "Guarda cuando esté listo", body: "El producto quedará disponible para las operaciones del POS después de guardarlo.", target: "products.form.save", advanceOn: "milestone", milestone: "product-created" },
      { id: "done", title: "Producto registrado", body: "El catálogo ya tiene una base para vender. Puedes volver a ejecutar esta guía cuando lo necesites.", advanceOn: "next", nextLabel: "Finalizar" },
    ],
  },
  {
    id: "receive-inventory", version: 1, title: "Recibir inventario", category: "Puesta en marcha",
    description: "Suma existencias usando el UPC global registrado en cada producto.",
    route: "/pos/productos", roles: ["admin", "cajero", "taller"], prerequisite: "active-product",
    steps: [
      { id: "open", title: "Inicia una recepción", body: "Selecciona Añadir inventario para abrir la recepción rápida.", target: "products.receipt", advanceOn: "target" },
      { id: "scan", title: "Escanea el UPC", body: "Cada lectura agrega una unidad. Revisa las cantidades y variantes antes de confirmar.", target: "receipt.scan", advanceOn: "next" },
      { id: "confirm", title: "Confirma la entrada", body: "Al confirmar, las existencias se actualizan y queda registrado el movimiento.", target: "receipt.confirm", advanceOn: "milestone", milestone: "inventory-received" },
      { id: "done", title: "Inventario actualizado", body: "La recepción quedó registrada. Consulta Inventario para revisar el movimiento.", advanceOn: "next", nextLabel: "Finalizar" },
    ],
  },
  {
    id: "complete-sale", version: 1, title: "Completar una venta", category: "Ventas",
    description: "Agrega productos al carrito, revisa importes y registra el pago.",
    route: "/pos/venta", roles: ["admin", "cajero"], prerequisite: "active-product",
    steps: [
      { id: "search", title: "Busca o escanea", body: "Busca por nombre, SKU o UPC. Con un lector, el código se agrega al enviar Enter.", target: "sale.search", advanceOn: "next" },
      { id: "add", title: "Agrega al carrito", body: "Selecciona un producto disponible. Si requiere variante o serie, el POS te pedirá elegirla.", target: "sale.catalog", advanceOn: "target" },
      { id: "cart", title: "Revisa la venta", body: "Desde el carrito puedes cambiar cantidades, quitar artículos y aplicar descuentos autorizados.", target: "sale.cart", advanceOn: "next" },
      { id: "checkout", title: "Abre el cobro", body: "Cuando la venta esté correcta, selecciona Cobrar.", target: "sale.checkout", advanceOn: "target" },
      { id: "payment", title: "Registra el pago", body: "Puedes dividir el pago entre efectivo, tarjeta y transferencia. Verifica el total antes de confirmar.", target: "checkout.payment", advanceOn: "next" },
      { id: "confirm", title: "Confirma sólo cuando cobres", body: "La venta y el movimiento de inventario se registran al confirmar el cobro.", target: "checkout.confirm", advanceOn: "milestone", milestone: "sale-completed" },
      { id: "done", title: "Venta completada", body: "El ticket puede imprimirse desde la confirmación y el historial conservará el registro.", advanceOn: "next", nextLabel: "Finalizar" },
    ],
  },
  {
    id: "receive-workshop", version: 1, title: "Recibir una bicicleta", category: "Taller",
    description: "Registra la bicicleta, el cliente y el estado de recepción antes de iniciar el servicio.",
    route: "/pos/taller", roles: ["admin", "taller"],
    steps: [
      { id: "open", title: "Crea una recepción", body: "Selecciona Nueva recepción para iniciar la orden de servicio.", target: "workshop.new", advanceOn: "target" },
      { id: "customer", title: "Identifica al cliente", body: "Nombre y teléfono son obligatorios para dar seguimiento a la orden.", target: "workshop.customer", advanceOn: "next" },
      { id: "bike", title: "Describe la bicicleta", body: "Registra marca y modelo; añade observaciones o número de serie cuando estén disponibles.", target: "workshop.bike", advanceOn: "next" },
      { id: "checklist", title: "Documenta la recepción", body: "Completa los puntos obligatorios del checklist antes de guardar la orden.", target: "workshop.checklist", advanceOn: "next" },
      { id: "save", title: "Completa la recepción", body: "La orden se conserva localmente incluso si la sincronización pendiente debe reintentarse.", target: "workshop.submit", advanceOn: "milestone", milestone: "workshop-received" },
      { id: "done", title: "Orden registrada", body: "La bicicleta aparece en órdenes activas para continuar con diagnóstico y presupuesto.", advanceOn: "next", nextLabel: "Finalizar" },
    ],
  },
];

export const helpArticles: HelpArticle[] = [
  { id: "product-catalog", title: "Catálogo de productos y refacciones", summary: "SKU, UPC, variantes, series y estado de los artículos.", category: "Puesta en marcha", route: "/pos/productos", roles: ["admin", "cajero", "taller"], tutorialId: "create-product" },
  { id: "inventory", title: "Inventario y movimientos", summary: "Consulta existencias, alertas y ajustes manuales autorizados.", category: "Inventario", route: "/pos/inventario", roles: ["admin", "taller"], tutorialId: "receive-inventory" },
  { id: "sales", title: "Operación de venta", summary: "Busca artículos, cobra con uno o varios métodos y consulta el ticket.", category: "Ventas", route: "/pos/venta", roles: ["admin", "cajero"], tutorialId: "complete-sale" },
  { id: "sales-history", title: "Historial, devoluciones y cancelaciones", summary: "Consulta ventas anteriores y registra correcciones con cuidado.", category: "Ventas", route: "/pos/ventas", roles: ["admin", "cajero"] },
  { id: "layaways", title: "Apartados", summary: "Crea reservas, registra anticipos y aplica abonos.", category: "Ventas", route: "/pos/apartados", roles: ["admin", "cajero"] },
  { id: "quotes", title: "Cotizaciones", summary: "Prepara presupuestos sin afectar inventario y conviértelos en ventas.", category: "Ventas", route: "/pos/cotizaciones", roles: ["admin", "cajero"] },
  { id: "workshop", title: "Órdenes de taller", summary: "Recepción, diagnóstico, presupuesto, cobro y entrega.", category: "Taller", route: "/pos/taller", roles: ["admin", "cajero", "taller"], tutorialId: "receive-workshop" },
  { id: "barcodes", title: "Códigos de barras", summary: "Selecciona artículos y prepara etiquetas para impresión.", category: "Inventario", route: "/pos/codigos-barras", roles: ["admin", "cajero"] },
  { id: "analytics", title: "Analíticas", summary: "Revisa ventas, métodos de pago y productos más vendidos.", category: "Administración", route: "/pos/analiticas", roles: ["admin"] },
  { id: "users", title: "Usuarios", summary: "Crea, activa y desactiva accesos de caja y taller.", category: "Administración", route: "/pos/usuarios", roles: ["admin"] },
  { id: "exports", title: "Exportar ventas", summary: "Filtra un periodo y genera un archivo Excel con ventas y movimientos.", category: "Administración", route: "/pos/respaldo", roles: ["admin"] },
];

export function getTutorial(id: TutorialId) {
  return tutorials.find((tutorial) => tutorial.id === id);
}
