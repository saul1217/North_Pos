import { ArrowRight, BookOpen, CheckCircle2, Circle, CircleHelp, LockKeyhole, Play } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthSession } from "@/lib/auth";
import { helpArticles, tutorials } from "@/features/onboarding/registry";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import type { TutorialId } from "@/features/onboarding/types";

export default function Ayuda() {
  const navigate = useNavigate();
  const { hasMilestone, isTutorialAvailable, progress, startTutorial, tutorialStatus } = useOnboarding();
  const role = getAuthSession()?.user.role;
  const visibleTutorials = useMemo(() => tutorials.filter((tutorial) => role && tutorial.roles.includes(role)), [role]);
  const visibleArticles = useMemo(() => helpArticles.filter((article) => role && article.roles.includes(role)), [role]);
  const setupItems = visibleTutorials.map((tutorial) => ({
    tutorial,
    milestone: milestoneForTutorial(tutorial.id),
  }));
  const completeItems = setupItems.filter(({ tutorial, milestone }) => tutorialStatus(tutorial.id) === "completed" || (milestone && hasMilestone(milestone))).length;
  const percent = setupItems.length ? Math.round((completeItems / setupItems.length) * 100) : 0;
  const groupedArticles = visibleArticles.reduce<Record<string, typeof visibleArticles>>((groups, article) => {
    (groups[article.category] ??= []).push(article);
    return groups;
  }, {});

  function launch(id: TutorialId) {
    if (!startTutorial(id)) return;
  }

  return <main className="min-h-0 flex-1 overflow-auto bg-north-background">
    <header className="border-b border-north-border bg-white px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-north-primary"><CircleHelp className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-[0.12em]">North Bike POS</span></div><h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-[0.05em] text-north-dark">Ayuda y guías</h1><p className="mt-1 text-sm text-north-muted">Consulta un proceso o repite una guía sin interrumpir tu operación.</p></div><button type="button" onClick={() => navigate("/pos/venta")} className="h-10 border border-north-border px-4 text-sm font-semibold text-north-primary">Ir al POS</button></div>
    </header>

    <div className="mx-auto grid max-w-7xl gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,1.25fr)_340px]">
      <section className="space-y-6">
        <div className="overflow-hidden border border-north-border bg-white">
          <div className="surface-dark-texture relative overflow-hidden px-5 py-5 text-white"><div className="relative"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-north-steel-muted">Puesta en marcha</p><div className="mt-2 flex items-end justify-between gap-4"><div><h2 className="font-display text-3xl font-bold uppercase tracking-[0.05em]">Tu avance</h2><p className="mt-1 text-sm text-white/70">Hitos reales y guías que puedes volver a consultar.</p></div><span className="font-display text-4xl font-bold text-white">{percent}%</span></div><div className="mt-5 h-1.5 overflow-hidden bg-white/15"><div className="h-full bg-north-steel-muted transition-all" style={{ width: `${percent}%` }} /></div></div></div>
          <div className="divide-y divide-north-border">
            {setupItems.map(({ tutorial, milestone }) => {
              const completed = tutorialStatus(tutorial.id) === "completed" || (milestone && hasMilestone(milestone));
              const available = isTutorialAvailable(tutorial.id);
              return <div key={tutorial.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="shrink-0 text-north-primary">{completed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5 text-north-border" />}</div><div className="min-w-0 flex-1"><p className="font-semibold text-north-dark">{tutorial.title}</p><p className="mt-0.5 text-sm text-north-muted">{tutorial.description}</p>{!available && <p className="mt-1 flex items-center gap-1 text-xs text-amber-700"><LockKeyhole className="h-3 w-3" />Registra primero un producto activo para iniciar esta guía.</p>}</div><button type="button" disabled={!available} onClick={() => launch(tutorial.id)} className="inline-flex h-9 items-center gap-2 bg-north-primary px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-3.5 w-3.5" />{completed ? "Repetir" : "Iniciar"}</button></div>;
            })}
          </div>
        </div>

        <section><div className="mb-3 flex items-center gap-2"><BookOpen className="h-5 w-5 text-north-primary" /><h2 className="font-display text-2xl font-bold uppercase tracking-[0.05em]">Biblioteca operativa</h2></div><div className="grid gap-4 md:grid-cols-2">{Object.entries(groupedArticles).flatMap(([category, articles]) => articles.map((article, index) => <article key={article.id} className="group border border-north-border bg-white p-4 transition hover:border-north-primary"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-north-steel">{category}</p><h3 className="mt-2 font-display text-xl font-bold uppercase tracking-[0.04em] text-north-dark">{article.title}</h3><p className="mt-2 min-h-10 text-sm leading-5 text-north-muted">{article.summary}</p><div className="mt-4 flex items-center justify-between gap-3"><button type="button" onClick={() => navigate(article.route)} className="inline-flex items-center gap-1 text-sm font-semibold text-north-primary">Ir al módulo <ArrowRight className="h-4 w-4" /></button>{article.tutorialId && isTutorialAvailable(article.tutorialId) && <button type="button" onClick={() => launch(article.tutorialId!)} className="text-xs font-semibold text-north-dark underline underline-offset-4">Iniciar guía</button>}</div></article>))}</div></section>
      </section>

      <aside className="h-fit border border-north-border bg-white p-5 xl:sticky xl:top-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-north-steel">Cómo usar las guías</p><h2 className="mt-2 font-display text-2xl font-bold uppercase tracking-[0.04em]">Aprende sin detener la operación</h2><ol className="mt-5 space-y-4 text-sm text-north-muted"><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center bg-north-dark font-display text-sm font-bold text-white">1</span><span>Elige una guía o un artículo según la tarea que deseas realizar.</span></li><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center bg-north-dark font-display text-sm font-bold text-white">2</span><span>La guía señala controles reales; tú decides cuándo realizar cada acción.</span></li><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center bg-north-dark font-display text-sm font-bold text-white">3</span><span>Puedes salir con Escape y volver a iniciar el recorrido cuando quieras.</span></li></ol><div className="mt-6 border-l-2 border-north-primary bg-north-background p-3 text-xs leading-5 text-north-muted">Las guías no cobran, cancelan ni modifican datos por ti. Confirma siempre las operaciones sensibles desde el POS.</div></aside>
    </div>
  </main>;
}

function milestoneForTutorial(id: TutorialId) {
  const mapping = { "create-product": "product-created", "receive-inventory": "inventory-received", "complete-sale": "sale-completed", "receive-workshop": "workshop-received" } as const;
  return mapping[id];
}
