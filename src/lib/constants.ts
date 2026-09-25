/** Shared vocabulary for columns SQLite stores as plain strings. */

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PLANS = ["free", "plus", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export const VISIBILITIES = ["public", "unlisted", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const CHAT_MODES = ["single", "group"] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

export const MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const SORTS = ["trending", "new", "popular", "chats"] as const;
export type Sort = (typeof SORTS)[number];

/** Reply-length presets, mapped to token budgets at generation time. */
export const RESPONSE_LENGTHS = ["short", "medium", "long"] as const;
export type ResponseLength = (typeof RESPONSE_LENGTHS)[number];

export const RESPONSE_LENGTH_TOKENS: Record<ResponseLength, number> = {
  short: 220,
  medium: 600,
  long: 1200,
};

/** Which SDK serves a model. Routing happens in src/lib/ai/index.ts. */
export const MODEL_VENDORS = ["anthropic", "gemini"] as const;
export type ModelVendor = (typeof MODEL_VENDORS)[number];

export interface ModelOption {
  id: string;
  vendor: ModelVendor;
  label: string;
  blurb: string;
  /** Credits burned per generated reply. */
  cost: number;
  /** Lowest plan tier allowed to select it. */
  minPlan: Plan;
  contextWindow: number;
}

/**
 * Selectable models. `cost` is this app's own credit pricing, not a vendor
 * price — it only drives the in-app quota system.
 */
export const MODELS: ModelOption[] = [
  {
    id: "claude-sonnet-5",
    vendor: "anthropic",
    label: "Sonnet 5",
    blurb: "Balanced. The default for everyday roleplay.",
    cost: 1,
    minPlan: "free",
    contextWindow: 200_000,
  },
  {
    id: "claude-haiku-4-5-20251001",
    vendor: "anthropic",
    label: "Haiku 4.5",
    blurb: "Fastest replies, lightest touch.",
    cost: 1,
    minPlan: "free",
    contextWindow: 200_000,
  },
  {
    id: "gemini-2.5-flash",
    vendor: "gemini",
    label: "Gemini 2.5 Flash",
    blurb: "Google's fast model. Free tier available.",
    cost: 1,
    minPlan: "free",
    contextWindow: 1_000_000,
  },
  {
    id: "gemini-2.5-pro",
    vendor: "gemini",
    label: "Gemini 2.5 Pro",
    blurb: "Google's most capable. Long memory, strong continuity.",
    cost: 3,
    minPlan: "plus",
    contextWindow: 1_000_000,
  },
  {
    id: "claude-opus-5",
    vendor: "anthropic",
    label: "Opus 5",
    blurb: "Most capable. Best long-form continuity.",
    cost: 4,
    minPlan: "plus",
    contextWindow: 200_000,
  },
];

export const DEFAULT_MODEL =
  process.env.DEFAULT_MODEL && MODELS.some((m) => m.id === process.env.DEFAULT_MODEL)
    ? (process.env.DEFAULT_MODEL as string)
    : "claude-sonnet-5";

export function getModel(id: string | null | undefined): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL)!;
}

const PLAN_RANK: Record<Plan, number> = { free: 0, plus: 1, pro: 2 };

export function planAllowsModel(plan: Plan, modelId: string): boolean {
  const model = getModel(modelId);
  return PLAN_RANK[plan] >= PLAN_RANK[model.minPlan];
}

export interface PlanInfo {
  id: Plan;
  label: string;
  priceLabel: string;
  credits: number;
  perks: string[];
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const PLAN_INFO: PlanInfo[] = [
  {
    id: "free",
    label: "Free",
    priceLabel: "$0",
    credits: envInt("CREDITS_FREE", 300),
    perks: ["Sonnet 5 and Haiku 4.5", "Unlimited characters", "3 personas", "Group chats up to 2"],
  },
  {
    id: "plus",
    label: "Plus",
    priceLabel: "$9 / mo",
    credits: envInt("CREDITS_PLUS", 3000),
    perks: ["Everything in Free", "Opus 5 access", "20 personas", "Group chats up to 4", "Longer memory"],
  },
  {
    id: "pro",
    label: "Pro",
    priceLabel: "$24 / mo",
    credits: envInt("CREDITS_PRO", 20000),
    perks: ["Everything in Plus", "Highest credit ceiling", "Unlimited personas", "Group chats up to 6", "Priority generation"],
  },
];

export function planInfo(plan: Plan): PlanInfo {
  return PLAN_INFO.find((p) => p.id === plan) ?? PLAN_INFO[0];
}

/** Feature ceilings enforced server-side. */
export const PLAN_LIMITS: Record<Plan, { personas: number; groupSize: number; memoryTurns: number }> = {
  free: { personas: 3, groupSize: 2, memoryTurns: 30 },
  plus: { personas: 20, groupSize: 4, memoryTurns: 80 },
  pro: { personas: Number.POSITIVE_INFINITY, groupSize: 6, memoryTurns: 160 },
};

/** Accent colours available to characters without an avatar image. */
export const ACCENTS = [
  "violet",
  "rose",
  "amber",
  "emerald",
  "sky",
  "indigo",
  "teal",
  "orange",
] as const;
export type Accent = (typeof ACCENTS)[number];

export function isAccent(value: string): value is Accent {
  return (ACCENTS as readonly string[]).includes(value);
}
