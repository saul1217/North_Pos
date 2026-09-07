import type { OnboardingProgress } from "./types";

const STORAGE_PREFIX = "northbike-onboarding-v1";

export function emptyOnboardingProgress(): OnboardingProgress {
  return { schemaVersion: 1, milestones: {}, tutorials: {} };
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

export async function loadOnboardingProgress(userId: string): Promise<OnboardingProgress> {
  try {
    const raw = window.pos?.loadOnboardingProgress
      ? await window.pos.loadOnboardingProgress(userId)
      : localStorage.getItem(storageKey(userId));
    if (!raw) return emptyOnboardingProgress();
    const parsed = JSON.parse(raw) as Partial<OnboardingProgress>;
    return {
      ...emptyOnboardingProgress(),
      ...parsed,
      milestones: parsed.milestones ?? {},
      tutorials: parsed.tutorials ?? {},
    };
  } catch {
    return emptyOnboardingProgress();
  }
}

export async function saveOnboardingProgress(userId: string, progress: OnboardingProgress) {
  try {
    const raw = JSON.stringify(progress);
    if (window.pos?.saveOnboardingProgress) {
      await window.pos.saveOnboardingProgress(userId, raw);
    } else {
      localStorage.setItem(storageKey(userId), raw);
    }
  } catch {
    // Learning state is advisory. A write failure must never interrupt POS work.
  }
}
