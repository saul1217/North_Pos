import type { MilestoneId } from "./types";

type Listener = (milestone: MilestoneId) => void;
const listeners = new Set<Listener>();

export function emitOnboardingMilestone(milestone: MilestoneId) {
  listeners.forEach((listener) => listener(milestone));
}

export function subscribeToOnboardingMilestones(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
