"use client";

import { CheckCircle2, LockKeyhole, Plus, Printer, RefreshCw, Wrench } from "lucide-react";
import { useState } from "react";
import { usePos } from "@/context/PosContext";
import { formatPosPrice } from "@/lib/pos/inventory";
import type {
  ChecklistEntry,
  WorkshopBudgetItem,
  WorkshopOrder,
  WorkshopStatus,
} from "@/lib/pos/types";
import { WorkshopReceipt } from "@/components/pos/WorkshopReceipt";
import { getAuthSession } from "@/lib/auth";

const statusOptions: WorkshopStatus[] = [
  "diagnosticada",
  "terminada",
];

const statusLabels: Record<WorkshopStatus, string> = {
  recibida: "Pendiente de diagnóstico",
  diagnosticada: "Diagnosticada",
  terminada: "Terminada",
  entregada: "Entregada",
  cancelada: "Cancelada",
};

export default function PosTallerPage() {
  const {
    workshopOrders,
    products,
    checklistTemplate,
    createWorkshopOrder,
    updateWorkshopOrder,
    updateWorkshopBudget,
    payWorkshopOrder,
    workshopLoading,
    workshopError,
    refreshWorkshopOrders,
  } = usePos();

  const role = getAuthSession()?.user.role;
  const isCashier = role === "cajero";

  const [view, setView] = useState<"list" | "new">("list");
  const [orderFilter, setOrderFilter] = useState<"activas" | "procesadas">("activas");
  const [selected, setSelected] = useState<WorkshopOrder | null>(null);
  const [printOrder, setPrintOrder] = useState<WorkshopOrder | null>(null);

  // Reception form
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [bikeBrand, setBikeBrand] = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [bikeColor, setBikeColor] = useState("");
  const [bikeSerial, setBikeSerial] = useState("");
  const [bikeType, setBikeType] = useState("MTB");
  const [bikeNotes, setBikeNotes] = useState("");
  const [clientProblem, setClientProblem] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<ChecklistEntry[]>(
    checklistTemplate.map((item) => ({
      itemId: item.id,
      status: "ok" as const,
    })),
  );
  const [formError, setFormError] = useState("");

  // Detail editing
  const [diagnosis, setDiagnosis] = useState("");
  const [technicalNotes, setTechnicalNotes] = useState("");
  const [budgetItems, setBudgetItems] = useState<WorkshopBudgetItem[]>([]);
  const [refactionPickerIndex, setRefactionPickerIndex] = useState<number | null>(null);
  const [refactionQuery, setRefactionQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo");
  const [savingBudget, setSavingBudget] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const filteredOrders = workshopOrders.filter((order) =>
    orderFilter === "activas"
      ? order.status !== "entregada" && order.status !== "cancelada"
      : order.status === "entregada" || order.status === "cancelada",
  );
  const isClosed = selected?.status === "entregada" || selected?.status === "cancelada";
  const isBudgetLocked = isClosed || selected?.paymentStatus === "pagada";

  function handlePhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setPhotos((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function updateChecklist(itemId: string, status: ChecklistEntry["status"]) {
    setChecklist((prev) =>
      prev.map((c) => (c.itemId === itemId ? { ...c, status } : c)),
    );
  }

  function submitReception() {
    const missingRequired = checklistTemplate.filter(
      (item) =>
        item.required &&
        checklist.find((c) => c.itemId === item.id)?.status === "na",
    );
    if (missingRequired.length > 0) {
      setFormError(
        `Completa los elementos obligatorios: ${missingRequired.map((i) => i.name).join(", ")}`,
      );
      return;
    }
    if (!customerName || !customerPhone || !bikeBrand || !bikeModel) {
      setFormError("Nombre, teléfono, marca y modelo son requeridos.");
      return;
    }

    const order = createWorkshopOrder({
      customer: {
        name: customerName,
        phone: customerPhone,
        email: customerEmail || undefined,
      },
      bike: {
        brand: bikeBrand,
        model: bikeModel,
        color: bikeColor || undefined,
        serialNumber: bikeSerial || undefined,
        bikeType,
        notes: bikeNotes || undefined,
      },
      photos,
      checklist,
      clientProblem: clientProblem || undefined,
    });

    setView("list");
    resetForm();
  }

  function resetForm() {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setBikeBrand("");
    setBikeModel("");
    setBikeColor("");
    setBikeSerial("");
    setBikeType("MTB");
    setBikeNotes("");
    setClientProblem("");
    setPhotos([]);
    setChecklist(
      checklistTemplate.map((item) => ({ itemId: item.id, status: "ok" as const })),
    );
    setFormError("");
  }

  function saveDiagnosis() {
    if (!selected) return;
    updateWorkshopOrder(selected.id, {
      diagnosis,
      technicalNotes,
      clientProblem: selected.clientProblem,
    });
    setSelected({ ...selected, diagnosis, technicalNotes });
    setSaveMessage("Diagnóstico guardado correctamente.");
  }

  async function saveBudget() {
    if (!selected) return;
    setSavingBudget(true);
    setFormError("");
    if (budgetItems.some((item) => !item.description.trim() || item.quantity <= 0 || item.price < 0)) {
      setFormError("Cada línea necesita una descripción, cantidad y precio válidos.");
      setSavingBudget(false);
      return;
    }
    const subtotal = budgetItems.reduce(
      (s, i) => s + i.price * i.quantity,
      0,
    );
    try {
      const updated = await updateWorkshopBudget(selected.id, {
        budget: {
          items: budgetItems,
          subtotal,
          total: subtotal,
          status: "pendiente",
        },
        clientProblem: selected.clientProblem,
        diagnosis,
        technicalNotes,
      });
      setSelected(updated);
      setSaveMessage("Presupuesto guardado correctamente.");
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSavingBudget(false);
    }
  }

  async function payOrder() {
    if (!selected || !selected.budget || selected.paymentStatus === "pagada") return;
    try {
      const updated = await payWorkshopOrder(selected.id, paymentMethod);
      setSelected(updated);
      setSaveMessage("Pago registrado correctamente.");
    } catch (error) {
      setFormError((error as Error).message);
    }
  }

  function confirmDelivery() {
    if (!selected || selected.status !== "terminada" || selected.paymentStatus !== "pagada") return;
    updateWorkshopOrder(selected.id, { status: "entregada" });
    setSelected({ ...selected, status: "entregada" });
    setOrderFilter("procesadas");
    setSaveMessage("Orden marcada como entregada.");
  }

  function addBudgetLine() {
    setBudgetItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: "Servicio / refacción",
        type: "servicio",
        quantity: 1,
        price: 0,
      },
    ]);
  }

  function addRefactionLine() {
    setBudgetItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productId: undefined,
        description: "",
        type: "refaccion",
        quantity: 1,
        price: 0,
      },
    ]);
  }

  const availableRefactions = products.filter(
    (product) => product.category.toLowerCase() === "refacciones" && product.status === "activo",
  );
  const matchingRefactions = availableRefactions.filter((product) => {
    const query = refactionQuery.trim().toLowerCase();
    if (!query) return true;
    return [product.name, product.sku, product.upc, product.barcode]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query));
  });

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-north-border bg-white px-4 py-5 md:px-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em]">
                {isCashier ? "Órdenes de taller" : "Taller"}
              </h1>
              <p className="mt-1 text-sm text-north-muted">
                Recepción, diagnóstico y órdenes de servicio
              </p>
            </div>
            {!isCashier && (
              <button
                type="button"
                onClick={() => setView(view === "list" ? "new" : "list")}
                className="inline-flex h-10 items-center gap-2 bg-north-primary px-4 text-sm font-semibold text-white"
              >
                {view === "list" ? (
                  <>
                    <Plus className="h-4 w-4" />
                    Nueva recepción
                  </>
                ) : (
                  "Ver órdenes"
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => void refreshWorkshopOrders()}
              disabled={workshopLoading}
              className="inline-flex h-10 items-center gap-2 border border-north-border px-3 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${workshopLoading ? "animate-spin" : ""}`} />
              Actualizar órdenes
            </button>
          </div>
          <div className="mt-5 flex gap-1 border-b border-north-border">
            {(["activas", "procesadas"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => {
                  setOrderFilter(filter);
                  setSelected(null);
                }}
                className={`border-b-2 px-3 py-2 text-sm font-semibold ${
                  orderFilter === filter
                    ? "border-north-primary text-north-primary"
                    : "border-transparent text-north-muted"
                }`}
              >
                {filter === "activas" ? "Órdenes activas" : "Órdenes procesadas"}
                <span className="ml-2 text-xs font-normal">
                  ({filter === "activas"
                    ? workshopOrders.filter((o) => o.status !== "entregada" && o.status !== "cancelada").length
                    : workshopOrders.filter((o) => o.status === "entregada" || o.status === "cancelada").length})
                </span>
              </button>
            ))}
          </div>
          {saveMessage && <p className="mt-3 border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{saveMessage}</p>}
        </header>

        {view === "list" ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
            {!selected && <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-6">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-north-border bg-north-background text-xs uppercase text-north-steel">
                  <tr>
                    <th className="px-4 py-3">Folio</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Bicicleta</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Pago</th>
                    <th className="px-4 py-3">Presupuesto</th>
                  </tr>
                </thead>
                <tbody>
                  {workshopLoading ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-north-muted">Cargando órdenes centralizadas...</td></tr>
                  ) : workshopError ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-red-700">No se pudieron cargar las órdenes: {workshopError}</td></tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-north-muted">No hay órdenes en esta sección.</td></tr>
                  ) : filteredOrders.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => {
                        setSelected(o);
                        setDiagnosis(o.diagnosis ?? "");
                        setTechnicalNotes(o.technicalNotes ?? "");
                        setBudgetItems(o.budget?.items ?? []);
                      }}
                      className="cursor-pointer border-b border-north-border hover:bg-north-background/50"
                    >
                      <td className="px-4 py-3 font-medium">{o.folio}</td>
                      <td className="px-4 py-3">{o.customer.name}</td>
                      <td className="px-4 py-3">
                        {o.bike.brand} {o.bike.model}
                      </td>
                      <td className="px-4 py-3 text-xs text-north-muted">
                        {new Date(o.receivedAt).toLocaleDateString("es-MX")}
                      </td>
                      <td className="px-4 py-3">{statusLabels[o.status] ?? o.status}</td>
                      <td className="px-4 py-3">
                        <span className={o.paymentStatus === "pagada" ? "font-semibold text-emerald-700" : "text-amber-700"}>
                          {o.paymentStatus === "pagada" ? "Pagado" : "Pendiente"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {o.budget
                          ? formatPosPrice(o.budget.total)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}

            {selected && (
              <aside className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-white p-5 md:p-8">
                <div className="mx-auto w-full max-w-5xl">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="mb-5 h-10 border border-north-border px-4 text-sm font-semibold"
                >
                  ← Volver a órdenes
                </button>
                <h2 className="font-display text-2xl font-bold">{selected.folio}</h2>
                <p className="text-sm capitalize text-north-muted">
                  {statusLabels[selected.status] ?? selected.status} · {selected.assignedTo}
                  {selected.paymentStatus === "pagada" && " · Pago confirmado"}
                </p>

                {isCashier && (
                  <div className="mt-4 space-y-2 border border-north-border bg-north-background p-3 text-sm">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-north-steel">Cliente</p>
                        <p>{selected.customer.name}</p>
                        <p className="text-xs text-north-muted">{selected.customer.phone}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-north-steel">Bicicleta</p>
                        <p>{selected.bike.brand} {selected.bike.model}</p>
                        <p className="text-xs text-north-muted">{selected.bike.color || selected.bike.bikeType}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-north-steel">Problema reportado</p>
                      <p>{selected.clientProblem || "Sin problema registrado"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-north-steel">Diagnóstico</p>
                      <p>{selected.diagnosis || "Sin diagnóstico registrado"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-north-steel">Trabajo indicado</p>
                      <p>{selected.technicalNotes || "Sin observaciones técnicas"}</p>
                    </div>
                  </div>
                )}

                {selected.photos.length > 0 && (
                  <div className="mt-4 flex gap-2 overflow-x-auto">
                    {selected.photos.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="h-16 w-16 shrink-0 object-cover"
                      />
                    ))}
                  </div>
                )}

                {!isCashier && !isClosed && <div className="mt-4 space-y-2">
                  <label className="text-xs font-semibold uppercase text-north-steel">
                    Diagnóstico
                  </label>
                  <textarea
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    className="h-20 w-full border border-north-border p-2 text-sm"
                  />
                  <textarea
                    value={technicalNotes}
                    onChange={(e) => setTechnicalNotes(e.target.value)}
                    placeholder="Observaciones técnicas..."
                    className="h-16 w-full border border-north-border p-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={saveDiagnosis}
                    className="h-9 w-full border border-north-border text-sm"
                  >
                    Guardar diagnóstico
                  </button>
                </div>}

                <div className="mt-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-north-steel">Presupuesto</p>
                      <p className="mt-1 max-w-xl text-xs text-north-muted">
                        Agrega refacciones registradas o trabajos manuales. Los conceptos manuales no afectan el inventario.
                      </p>
                    </div>
                    {!isBudgetLocked && <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={addRefactionLine} className="h-9 border border-north-border px-3 text-xs font-semibold text-north-primary">
                        + Refacción
                      </button>
                      <button type="button" onClick={addBudgetLine} className="h-9 border border-north-border px-3 text-xs font-semibold text-north-primary">
                        + Concepto manual
                      </button>
                    </div>}
                  </div>
                  {budgetItems.length > 0 && <div className="max-h-72 overflow-y-auto divide-y divide-north-border border border-north-border bg-north-background/30">
                    {budgetItems.map((item, idx) => (
                      <div key={item.id} className="p-3">
                        {item.type === "refaccion" ? (
                          <div className="grid items-center gap-2 md:grid-cols-[minmax(0,1fr)_90px_110px_32px]">
                            <button type="button" disabled={isBudgetLocked} onClick={() => { setRefactionPickerIndex(idx); setRefactionQuery(""); }} className="h-9 min-w-0 overflow-hidden border border-north-border bg-white px-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60">
                              <span className={item.productId ? "text-north-dark" : "text-north-muted"}>
                                {item.productId ? `${item.description} · ${item.price ? formatPosPrice(item.price) : ""}` : "Buscar refacción registrada..."}
                              </span>
                            </button>
                            <input type="number" min={1} step={1} value={item.quantity || ""} disabled={isBudgetLocked} onChange={(e) => setBudgetItems((prev) => prev.map((b, i) => i === idx ? { ...b, quantity: Math.max(1, Number(e.target.value) || 1) } : b))} className="h-9 border border-north-border bg-white px-2 text-sm" aria-label={`Cantidad de refacción ${idx + 1}`} />
                            <div className="flex h-9 items-center border border-north-border bg-slate-100 px-2 text-sm text-north-muted" title="Precio tomado del catálogo">
                              {item.productId ? formatPosPrice(item.price) : "Precio del catálogo"}
                            </div>
                            {!isBudgetLocked && <button type="button" onClick={() => setBudgetItems((prev) => prev.filter((_, i) => i !== idx))} className="h-9 text-lg leading-none text-red-700" aria-label={`Eliminar refacción ${idx + 1}`}>×</button>}
                          </div>
                        ) : (
                          <div className="grid items-center gap-2 md:grid-cols-[minmax(0,1fr)_90px_110px_32px]">
                            <input value={item.description} placeholder="Describe el trabajo manual" disabled={isBudgetLocked} onChange={(e) => setBudgetItems((prev) => prev.map((b, i) => i === idx ? { ...b, description: e.target.value } : b))} className="h-9 min-w-0 border border-north-border bg-white px-2 text-sm" />
                            <input type="number" min={1} step={1} value={item.quantity || ""} disabled={isBudgetLocked} onChange={(e) => setBudgetItems((prev) => prev.map((b, i) => i === idx ? { ...b, quantity: Math.max(1, Number(e.target.value) || 1) } : b))} className="h-9 border border-north-border bg-white px-2 text-sm" aria-label={`Cantidad de trabajo ${idx + 1}`} />
                            <input type="number" min={0} value={item.price || ""} disabled={isBudgetLocked} onChange={(e) => setBudgetItems((prev) => prev.map((b, i) => i === idx ? { ...b, price: Number(e.target.value) || 0 } : b))} className="h-9 border border-north-border bg-white px-2 text-sm" aria-label={`Precio del trabajo ${idx + 1}`} placeholder="Precio" />
                            {!isBudgetLocked && <button type="button" onClick={() => setBudgetItems((prev) => prev.filter((_, i) => i !== idx))} className="h-9 text-lg leading-none text-red-700" aria-label={`Eliminar trabajo ${idx + 1}`}>×</button>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>}
                  {!isBudgetLocked && <button
                    type="button"
                    disabled={savingBudget}
                    onClick={() => void saveBudget()}
                    className="h-9 w-full bg-north-primary text-sm text-white"
                  >
                    {savingBudget ? "Guardando..." : isCashier ? "Guardar presupuesto" : "Guardar diagnóstico y enviar a caja"}
                  </button>}
                  {formError && (
                    <p className="mt-2 border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-700">
                      No se pudo guardar: {formError}
                    </p>
                  )}
                </div>

                {isCashier && selected.budget && (selected.status === "diagnosticada" || selected.status === "terminada") && selected.paymentStatus !== "pagada" && (
                  <div className="mt-4 border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold uppercase text-amber-800">Cobro en caja</p>
                    <p className="mt-1 text-sm text-amber-900">Total: {formatPosPrice(selected.budget.total)}</p>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                      className="mt-3 h-10 w-full border border-north-border bg-white px-2 text-sm"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="transferencia">Transferencia</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void payOrder()}
                      className="mt-3 h-10 w-full bg-north-primary text-sm font-semibold text-white"
                    >
                      Confirmar pago
                    </button>
                  </div>
                )}

                {!isCashier && !isClosed && selected.status !== "recibida" && !(selected.status === "terminada" && selected.paymentStatus === "pagada") && <select
                  value={selected.status}
                  onChange={(e) => {
                    const nextStatus = e.target.value as WorkshopStatus;
                    updateWorkshopOrder(selected.id, { status: nextStatus });
                    setSelected({ ...selected, status: nextStatus });
                    setSaveMessage(nextStatus === "terminada" && selected.paymentStatus !== "pagada"
                      ? "Trabajo terminado. Espera a que se registre el pago para confirmar la entrega."
                      : "Estado de la orden actualizado.");
                  }}
                  className="mt-4 h-10 w-full border border-north-border px-2 text-sm"
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {statusLabels[s]}
                    </option>
                  ))}
                </select>}

                {!isCashier && selected.status === "terminada" && selected.paymentStatus === "pagada" && (
                  <button
                    type="button"
                    onClick={confirmDelivery}
                    className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 bg-north-primary text-sm font-semibold text-white"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Confirmar entrega
                  </button>
                )}

                {selected.status === "terminada" && selected.paymentStatus !== "pagada" && (
                  <p className="mt-4 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Trabajo terminado. Espera a que se registre el pago para confirmar la entrega.
                  </p>
                )}

                {isClosed && (
                  <p className="mt-4 inline-flex w-full items-center justify-center gap-2 border border-north-border bg-north-background px-3 py-2 text-xs text-north-muted">
                    <LockKeyhole className="h-3.5 w-3.5" />
                    Orden cerrada: edición bloqueada
                  </p>
                )}

                {selected.paymentStatus === "pagada" && <button
                  type="button"
                  onClick={() => setPrintOrder(selected)}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 border border-north-border text-sm"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir ticket final
                </button>}
                </div>
              </aside>
            )}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
            <h2 className="mb-6 flex items-center gap-2 font-display text-xl font-bold uppercase">
              <Wrench className="h-5 w-5" />
              Nueva recepción
            </h2>

            <section className="mb-6 space-y-3">
              <p className="text-xs font-semibold uppercase text-north-steel">
                Cliente
              </p>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre *"
                className="h-10 w-full border border-north-border px-3 text-sm"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Teléfono *"
                className="h-10 w-full border border-north-border px-3 text-sm"
              />
              <input
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="Correo (opcional)"
                className="h-10 w-full border border-north-border px-3 text-sm"
              />
            </section>

            <section className="mb-6 space-y-3">
              <p className="text-xs font-semibold uppercase text-north-steel">
                Bicicleta
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={bikeBrand}
                  onChange={(e) => setBikeBrand(e.target.value)}
                  placeholder="Marca *"
                  className="h-10 border border-north-border px-3 text-sm"
                />
                <input
                  value={bikeModel}
                  onChange={(e) => setBikeModel(e.target.value)}
                  placeholder="Modelo *"
                  className="h-10 border border-north-border px-3 text-sm"
                />
                <input
                  value={bikeColor}
                  onChange={(e) => setBikeColor(e.target.value)}
                  placeholder="Color"
                  className="h-10 border border-north-border px-3 text-sm"
                />
                <input
                  value={bikeSerial}
                  onChange={(e) => setBikeSerial(e.target.value)}
                  placeholder="Número de serie"
                  className="h-10 border border-north-border px-3 text-sm"
                />
                <select
                  value={bikeType}
                  onChange={(e) => setBikeType(e.target.value)}
                  className="h-10 border border-north-border px-3 text-sm"
                >
                  <option>MTB</option>
                  <option>Ruta</option>
                  <option>Gravel</option>
                  <option>Urbana</option>
                </select>
              </div>
              <textarea
                value={bikeNotes}
                onChange={(e) => setBikeNotes(e.target.value)}
                placeholder="Observaciones de la bicicleta..."
                className="h-16 w-full border border-north-border p-2 text-sm"
              />
              <textarea
                value={clientProblem}
                onChange={(e) => setClientProblem(e.target.value)}
                placeholder="Problema reportado por el cliente..."
                className="h-16 w-full border border-north-border p-2 text-sm"
              />
            </section>

            <section className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase text-north-steel">
                Fotografías
              </p>
              <input type="file" accept="image/*" multiple onChange={handlePhotos} />
              {photos.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {photos.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={src} alt="" className="h-16 w-16 object-cover" />
                  ))}
                </div>
              )}
            </section>

            <section className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase text-north-steel">
                Checklist configurable *
              </p>
              <div className="space-y-2">
                {checklistTemplate.map((item) => {
                  const entry = checklist.find((c) => c.itemId === item.id);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 border border-north-border px-3 py-2"
                    >
                      <span className="text-sm">
                        {item.name}
                        {item.required && (
                          <span className="text-red-600"> *</span>
                        )}
                      </span>
                      <select
                        value={entry?.status ?? "na"}
                        onChange={(e) =>
                          updateChecklist(
                            item.id,
                            e.target.value as ChecklistEntry["status"],
                          )
                        }
                        className="h-8 border border-north-border px-2 text-xs"
                      >
                        <option value="na">—</option>
                        <option value="ok">OK</option>
                        <option value="issue">Observación</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </section>

            {formError && (
              <p className="mb-4 text-sm text-red-600">{formError}</p>
            )}

            <button
              type="button"
              onClick={submitReception}
              className="h-12 w-full bg-north-primary text-sm font-semibold text-white"
            >
              Completar recepción
            </button>
          </div>
        )}
      </div>

      {printOrder && (
        <div className="pos-no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-north-dark/60 p-4 pt-12">
          <div className="w-full max-w-md">
            <WorkshopReceipt order={printOrder} />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="h-10 flex-1 bg-north-primary text-sm text-white"
              >
                Imprimir comprobante
              </button>
              <button
                type="button"
                onClick={() => setPrintOrder(null)}
                className="h-10 flex-1 border border-north-border bg-white text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {refactionPickerIndex !== null && (
        <div className="pos-no-print fixed inset-0 z-50 flex items-center justify-center bg-north-dark/60 p-4">
          <div className="flex max-h-[80vh] w-full max-w-xl flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-north-border px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-bold uppercase">Buscar refacción</h2>
                <p className="mt-1 text-xs text-north-muted">Busca por nombre, SKU, UPC o código de barras.</p>
              </div>
              <button type="button" onClick={() => setRefactionPickerIndex(null)} className="h-10 w-10 text-2xl leading-none" aria-label="Cerrar búsqueda">×</button>
            </div>
            <div className="border-b border-north-border p-4">
              <input autoFocus value={refactionQuery} onChange={(e) => setRefactionQuery(e.target.value)} placeholder="Escribe para buscar..." className="h-11 w-full border border-north-border px-3 text-sm" />
            </div>
            <div className="min-h-0 overflow-y-auto p-2">
              {matchingRefactions.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-north-muted">No se encontraron refacciones activas.</p>
              ) : (
                matchingRefactions.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      const idx = refactionPickerIndex;
                      setBudgetItems((prev) => prev.map((item, itemIndex) => itemIndex === idx ? { ...item, productId: product.id, description: product.name, price: product.price } : item));
                      setRefactionPickerIndex(null);
                    }}
                    className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-north-border px-3 py-2 text-left hover:bg-north-background"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{product.name}</span>
                      <span className="block truncate text-xs text-north-muted">SKU: {product.sku}{product.upc ? ` · UPC: ${product.upc}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold">{formatPosPrice(product.price)}</span>
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-north-border p-3 text-right">
              <button type="button" onClick={() => setRefactionPickerIndex(null)} className="h-10 border border-north-border px-5 text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
