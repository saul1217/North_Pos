"use client";

import { Plus, Printer, Wrench } from "lucide-react";
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

const statusOptions: WorkshopStatus[] = [
  "recibida",
  "diagnostico",
  "esperando_aprobacion",
  "en_proceso",
  "lista",
  "entregada",
  "cancelada",
];

export default function PosTallerPage() {
  const {
    workshopOrders,
    checklistTemplate,
    createWorkshopOrder,
    updateWorkshopOrder,
  } = usePos();

  const [view, setView] = useState<"list" | "new">("list");
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
      status: "na" as const,
    })),
  );
  const [formError, setFormError] = useState("");

  // Detail editing
  const [diagnosis, setDiagnosis] = useState("");
  const [technicalNotes, setTechnicalNotes] = useState("");
  const [budgetItems, setBudgetItems] = useState<WorkshopBudgetItem[]>([]);

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

    setPrintOrder(order);
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
      checklistTemplate.map((item) => ({ itemId: item.id, status: "na" })),
    );
    setFormError("");
  }

  function saveDiagnosis() {
    if (!selected) return;
    updateWorkshopOrder(selected.id, {
      diagnosis,
      technicalNotes,
      clientProblem: selected.clientProblem,
      status: "diagnostico",
    });
    setSelected({ ...selected, diagnosis, technicalNotes, status: "diagnostico" });
  }

  function saveBudget() {
    if (!selected) return;
    const subtotal = budgetItems.reduce(
      (s, i) => s + i.price * i.quantity,
      0,
    );
    updateWorkshopOrder(selected.id, {
      budget: {
        items: budgetItems,
        subtotal,
        total: subtotal,
        status: "pendiente",
      },
      status: "esperando_aprobacion",
    });
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

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-north-border bg-white px-4 py-5 md:px-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em]">
                Taller
              </h1>
              <p className="mt-1 text-sm text-north-muted">
                Recepción, diagnóstico y órdenes de servicio
              </p>
            </div>
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
          </div>
        </header>

        {view === "list" ? (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-north-border bg-north-background text-xs uppercase text-north-steel">
                  <tr>
                    <th className="px-4 py-3">Folio</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Bicicleta</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Presupuesto</th>
                  </tr>
                </thead>
                <tbody>
                  {workshopOrders.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => {
                        setSelected(o);
                        setDiagnosis(o.diagnosis ?? "");
                        setTechnicalNotes(o.technicalNotes ?? "");
                        setBudgetItems(o.budget?.items ?? []);
                      }}
                      className={`cursor-pointer border-b border-north-border hover:bg-north-background/50 ${
                        selected?.id === o.id ? "bg-north-primary/5" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">{o.folio}</td>
                      <td className="px-4 py-3">{o.customer.name}</td>
                      <td className="px-4 py-3">
                        {o.bike.brand} {o.bike.model}
                      </td>
                      <td className="px-4 py-3 text-xs text-north-muted">
                        {new Date(o.receivedAt).toLocaleDateString("es-MX")}
                      </td>
                      <td className="px-4 py-3 capitalize">{o.status}</td>
                      <td className="px-4 py-3">
                        {o.budget
                          ? formatPosPrice(o.budget.total)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected && (
              <aside className="w-full border-t border-north-border bg-white p-5 lg:w-96 lg:border-l lg:border-t-0">
                <h2 className="font-display text-lg font-bold">{selected.folio}</h2>
                <p className="text-sm capitalize text-north-muted">
                  {selected.status} · {selected.assignedTo}
                </p>

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

                <div className="mt-4 space-y-2">
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
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-north-steel">
                      Presupuesto
                    </p>
                    <button
                      type="button"
                      onClick={addBudgetLine}
                      className="text-xs text-north-primary"
                    >
                      + Línea
                    </button>
                  </div>
                  {budgetItems.map((item, idx) => (
                    <div key={item.id} className="mb-2 flex gap-1">
                      <input
                        value={item.description}
                        onChange={(e) =>
                          setBudgetItems((prev) =>
                            prev.map((b, i) =>
                              i === idx
                                ? { ...b, description: e.target.value }
                                : b,
                            ),
                          )
                        }
                        className="h-8 flex-1 border border-north-border px-2 text-xs"
                      />
                      <input
                        type="number"
                        value={item.price || ""}
                        onChange={(e) =>
                          setBudgetItems((prev) =>
                            prev.map((b, i) =>
                              i === idx
                                ? { ...b, price: Number(e.target.value) || 0 }
                                : b,
                            ),
                          )
                        }
                        className="h-8 w-20 border border-north-border px-2 text-xs"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={saveBudget}
                    className="h-9 w-full bg-north-primary text-sm text-white"
                  >
                    Generar presupuesto
                  </button>
                </div>

                <select
                  value={selected.status}
                  onChange={(e) =>
                    updateWorkshopOrder(selected.id, {
                      status: e.target.value as WorkshopStatus,
                    })
                  }
                  className="mt-4 h-10 w-full border border-north-border px-2 text-sm"
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setPrintOrder(selected)}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 border border-north-border text-sm"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir comprobante
                </button>
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
    </>
  );
}
