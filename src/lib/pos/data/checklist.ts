import type { ChecklistTemplateItem } from "@/lib/pos/types";

/** Plantilla configurable — el dueño podrá editarla en producción */
export const defaultReceptionChecklist: ChecklistTemplateItem[] = [
  { id: "chk-1", name: "Estado general", required: true },
  { id: "chk-2", name: "Rayones visibles", required: true },
  { id: "chk-3", name: "Ruedas", required: true },
  { id: "chk-4", name: "Frenos", required: true },
  { id: "chk-5", name: "Transmisión", required: true },
  { id: "chk-6", name: "Accesorios entregados", required: false },
  { id: "chk-7", name: "Componentes faltantes", required: false },
];
