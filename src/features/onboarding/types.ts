import type { AuthUser } from "@/lib/auth";

export type TutorialStatus = "not_started" | "in_progress" | "completed";
export type TutorialId = "create-product" | "receive-inventory" | "complete-sale" | "receive-workshop";
export type MilestoneId = "product-created" | "inventory-received" | "sale-completed" | "workshop-received";
export type GuideTargetId = string;

export type TutorialStep = {
  id: string;
  title: string;
  body: string;
  target?: GuideTargetId;
  advanceOn: "next" | "target" | "milestone";
  milestone?: MilestoneId;
  nextLabel?: string;
};

export type TutorialDefinition = {
  id: TutorialId;
  version: number;
  title: string;
  description: string;
  category: string;
  route: string;
  roles: AuthUser["role"][];
  prerequisite?: "active-product";
  steps: TutorialStep[];
};

export type HelpArticle = {
  id: string;
  title: string;
  summary: string;
  category: string;
  route: string;
  roles: AuthUser["role"][];
  tutorialId?: TutorialId;
};

export type TutorialProgress = {
  version: number;
  status: TutorialStatus;
  completedAt?: string;
};

export type OnboardingProgress = {
  schemaVersion: 1;
  introDismissedAt?: string;
  milestones: Partial<Record<MilestoneId, { occurredAt: string }>>;
  tutorials: Partial<Record<TutorialId, TutorialProgress>>;
};

export type ActiveTutorial = {
  tutorialId: TutorialId;
  stepIndex: number;
};
