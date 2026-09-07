import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, createContext, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CircleHelp, Compass, X } from "lucide-react";
import type { AuthSession } from "@/lib/auth";
import { usePos } from "@/context/PosContext";
import { subscribeToOnboardingMilestones } from "./events";
import { getTutorial, tutorials } from "./registry";
import { emptyOnboardingProgress, loadOnboardingProgress, saveOnboardingProgress } from "./storage";
import type { ActiveTutorial, MilestoneId, OnboardingProgress, TutorialId, TutorialStatus } from "./types";

type OnboardingContextValue = {
  progress: OnboardingProgress;
  hydrated: boolean;
  activeTutorial: ActiveTutorial | null;
  startTutorial: (id: TutorialId) => boolean;
  closeTutorial: () => void;
  tutorialStatus: (id: TutorialId) => TutorialStatus;
  isTutorialAvailable: (id: TutorialId) => boolean;
  hasMilestone: (id: MilestoneId) => boolean;
  dismissIntro: () => void;
  contextualTutorials: TutorialId[];
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);
const SESSION_PREFIX = "northbike-onboarding-run-v1";

export function OnboardingProvider({ session, children }: { session: AuthSession; children: ReactNode }) {
  const { products } = usePos();
  const location = useLocation();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<OnboardingProgress>(emptyOnboardingProgress);
  const [hydrated, setHydrated] = useState(false);
  const [activeTutorial, setActiveTutorial] = useState<ActiveTutorial | null>(null);
  const progressRef = useRef(progress);
  const activeRef = useRef(activeTutorial);
  const userId = session.user.id;
  const sessionKey = `${SESSION_PREFIX}:${userId}`;

  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { activeRef.current = activeTutorial; }, [activeTutorial]);

  useEffect(() => {
    let alive = true;
    setHydrated(false);
    setActiveTutorial(null);
    void loadOnboardingProgress(userId).then((loaded) => {
      if (!alive) return;
      progressRef.current = loaded;
      setProgress(loaded);
      try {
        const saved = sessionStorage.getItem(sessionKey);
        const active = saved ? JSON.parse(saved) as ActiveTutorial : null;
        const tutorial = active ? getTutorial(active.tutorialId) : undefined;
        if (active && tutorial && tutorial.roles.includes(session.user.role) && active.stepIndex < tutorial.steps.length) {
          setActiveTutorial(active);
        }
      } catch {
        sessionStorage.removeItem(sessionKey);
      }
      setHydrated(true);
    });
    return () => { alive = false; };
  }, [session.user.role, sessionKey, userId]);

  useEffect(() => {
    if (activeTutorial) sessionStorage.setItem(sessionKey, JSON.stringify(activeTutorial));
    else sessionStorage.removeItem(sessionKey);
  }, [activeTutorial, sessionKey]);

  const updateProgress = useCallback((recipe: (current: OnboardingProgress) => OnboardingProgress) => {
    const next = recipe(progressRef.current);
    progressRef.current = next;
    setProgress(next);
    void saveOnboardingProgress(userId, next);
  }, [userId]);

  const isTutorialAvailable = useCallback((id: TutorialId) => {
    const tutorial = getTutorial(id);
    if (!tutorial || !tutorial.roles.includes(session.user.role)) return false;
    return tutorial.prerequisite !== "active-product" || products.some((product) => product.status === "activo");
  }, [products, session.user.role]);

  const tutorialStatus = useCallback((id: TutorialId): TutorialStatus => {
    const tutorial = getTutorial(id);
    const stored = progress.tutorials[id];
    if (!tutorial || !stored || stored.version !== tutorial.version) return "not_started";
    return stored.status;
  }, [progress.tutorials]);

  const closeTutorial = useCallback(() => setActiveTutorial(null), []);

  const completeTutorial = useCallback((id: TutorialId) => {
    const tutorial = getTutorial(id);
    if (!tutorial) return;
    updateProgress((current) => ({
      ...current,
      tutorials: {
        ...current.tutorials,
        [id]: { version: tutorial.version, status: "completed", completedAt: new Date().toISOString() },
      },
    }));
    setActiveTutorial(null);
  }, [updateProgress]);

  const advanceTutorial = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    const tutorial = getTutorial(active.tutorialId);
    if (!tutorial) return closeTutorial();
    if (active.stepIndex >= tutorial.steps.length - 1) return completeTutorial(tutorial.id);
    setActiveTutorial({ ...active, stepIndex: active.stepIndex + 1 });
  }, [closeTutorial, completeTutorial]);

  const startTutorial = useCallback((id: TutorialId) => {
    if (!isTutorialAvailable(id)) return false;
    const tutorial = getTutorial(id);
    if (!tutorial) return false;
    updateProgress((current) => ({
      ...current,
      tutorials: { ...current.tutorials, [id]: { version: tutorial.version, status: "in_progress" } },
    }));
    setActiveTutorial({ tutorialId: id, stepIndex: 0 });
    if (location.pathname !== tutorial.route) navigate(tutorial.route);
    return true;
  }, [isTutorialAvailable, location.pathname, navigate, updateProgress]);

  const dismissIntro = useCallback(() => updateProgress((current) => ({
    ...current,
    introDismissedAt: new Date().toISOString(),
  })), [updateProgress]);

  useEffect(() => subscribeToOnboardingMilestones((milestone) => {
    updateProgress((current) => ({
      ...current,
      milestones: { ...current.milestones, [milestone]: { occurredAt: new Date().toISOString() } },
    }));
    const active = activeRef.current;
    const step = active ? getTutorial(active.tutorialId)?.steps[active.stepIndex] : undefined;
    if (step?.advanceOn === "milestone" && step.milestone === milestone) {
      window.setTimeout(advanceTutorial, 0);
    }
  }), [advanceTutorial, updateProgress]);

  const contextualTutorials = useMemo(() => tutorials
    .filter((tutorial) => tutorial.route === location.pathname && tutorial.roles.includes(session.user.role))
    .map((tutorial) => tutorial.id), [location.pathname, session.user.role]);

  const value = useMemo<OnboardingContextValue>(() => ({
    progress, hydrated, activeTutorial, startTutorial, closeTutorial, tutorialStatus, isTutorialAvailable,
    hasMilestone: (id) => Boolean(progress.milestones[id]), dismissIntro, contextualTutorials,
  }), [activeTutorial, closeTutorial, contextualTutorials, dismissIntro, hydrated, isTutorialAvailable, progress, startTutorial, tutorialStatus]);

  return <OnboardingContext.Provider value={value}>{children}<IntroNudge session={session} /><TourLayer onAdvance={advanceTutorial} onComplete={completeTutorial} /></OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error("useOnboarding must be used within OnboardingProvider");
  return context;
}

function IntroNudge({ session }: { session: AuthSession }) {
  const { hydrated, progress, dismissIntro } = useOnboarding();
  const navigate = useNavigate();
  const location = useLocation();
  if (!hydrated || progress.introDismissedAt || location.pathname === "/pos/ayuda") return null;
  return (
    <aside className="pos-no-print fixed bottom-5 right-5 z-40 w-[22rem] border border-north-primary/25 bg-white p-4 shadow-xl" aria-label="Guía de inicio">
      <div className="flex gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center bg-north-primary text-white"><Compass className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="font-display text-base font-bold uppercase tracking-[0.05em]">Guía de inicio</p><p className="mt-1 text-sm text-north-muted">{session.user.role === "admin" ? "Configura el catálogo y conoce los flujos principales." : "Encuentra recorridos y ayuda para tu operación diaria."}</p></div><button type="button" onClick={dismissIntro} className="h-7 w-7 text-north-muted" aria-label="Cerrar aviso"><X className="mx-auto h-4 w-4" /></button></div>
      <div className="mt-4 flex gap-2"><button type="button" onClick={() => { dismissIntro(); navigate("/pos/ayuda"); }} className="h-9 bg-north-primary px-3 text-sm font-semibold text-white">Ver guía</button><button type="button" onClick={dismissIntro} className="h-9 px-2 text-sm text-north-muted">Ahora no</button></div>
    </aside>
  );
}

function TourLayer({ onAdvance, onComplete }: { onAdvance: () => void; onComplete: (id: TutorialId) => void }) {
  const { activeTutorial, closeTutorial } = useOnboarding();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const active = activeTutorial;
  const tutorial = active ? getTutorial(active.tutorialId) : undefined;
  const step = tutorial && active ? tutorial.steps[active.stepIndex] : undefined;

  useLayoutEffect(() => {
    if (!step?.target) { setRect(null); return; }
    let frame = 0;
    const update = () => {
      const target = document.querySelector<HTMLElement>(`[data-guide="${step.target}"]`);
      setRect(target?.getBoundingClientRect() ?? null);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); };
  }, [step?.target]);

  useEffect(() => {
    if (!active || step?.advanceOn !== "target" || !step.target) return;
    const onClick = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target.closest<HTMLElement>(`[data-guide="${step.target}"]`) : null;
      if (element) window.setTimeout(onAdvance, 0);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active, onAdvance, step]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeTutorial(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, closeTutorial]);

  if (!active || !tutorial || !step) return null;
  const isLast = active.stepIndex === tutorial.steps.length - 1;
  const top = rect ? Math.min(window.innerHeight - 190, Math.max(16, rect.bottom + 14)) : undefined;
  const left = rect ? Math.min(window.innerWidth - 360, Math.max(16, rect.left)) : undefined;

  return <>
    {rect && <div className="pointer-events-none fixed z-[70] rounded-sm ring-2 ring-white" style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8, boxShadow: "0 0 0 9999px rgba(8, 19, 25, 0.52)" }} />}
    <section className="fixed z-[71] w-[min(21rem,calc(100vw-2rem))] border border-white/15 bg-north-dark p-4 text-white shadow-2xl" style={rect ? { left, top } : { right: 16, bottom: 16 }} role="dialog" aria-live="polite" aria-label={`Guía: ${tutorial.title}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-north-steel-muted">{tutorial.title} · {active.stepIndex + 1}/{tutorial.steps.length}</p><h2 className="mt-1 font-display text-xl font-bold uppercase tracking-[0.04em]">{step.title}</h2></div><button type="button" onClick={closeTutorial} className="p-1 text-north-steel-muted hover:text-white" aria-label="Cerrar guía"><X className="h-4 w-4" /></button></div>
      <p className="mt-3 text-sm leading-5 text-white/80">{step.body}</p>
      {step.target && !rect && <p className="mt-3 border-l-2 border-amber-400 pl-2 text-xs text-amber-100">Esperando esta sección. Puedes navegar normalmente o cerrar la guía.</p>}
      <div className="mt-5 flex items-center justify-between gap-3"><button type="button" onClick={closeTutorial} className="text-xs font-semibold text-north-steel-muted hover:text-white">Salir</button>{step.advanceOn === "next" && <button type="button" onClick={() => isLast ? onComplete(tutorial.id) : onAdvance()} className="h-9 bg-white px-3 text-sm font-semibold text-north-dark">{step.nextLabel ?? "Siguiente"}</button>}{step.advanceOn === "target" && <span className="text-xs text-north-steel-muted">Selecciona el elemento resaltado</span>}{step.advanceOn === "milestone" && <span className="text-xs text-north-steel-muted">Completa la acción para continuar</span>}</div>
    </section>
  </>;
}

export function ContextualHelpButton() {
  const { contextualTutorials, startTutorial } = useOnboarding();
  const navigate = useNavigate();
  if (!contextualTutorials.length) return null;
  const tutorialId = contextualTutorials[0];
  return <div className="pos-no-print fixed bottom-5 left-[15.5rem] z-30"><button type="button" onClick={() => startTutorial(tutorialId) || navigate("/pos/ayuda")} className="inline-flex h-9 items-center gap-2 border border-north-border bg-white px-3 text-xs font-semibold text-north-primary shadow-sm hover:border-north-primary"><CircleHelp className="h-4 w-4" />Guía de esta pantalla</button></div>;
}
