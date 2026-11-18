import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { configureModels } from "./ai/provider";
import { PROMPT_VERSION } from "./ai/schemas";

/**
 * Runtime settings — editable from the Admin dashboard, stored in
 * arcana_settings, validated here. Anything missing or invalid falls back to
 * the defaults below, so a bad row can never take the product down.
 */

const int = (min: number, max: number) => z.number().int().min(min).max(max);

export const settingsSchemas = {
  reversal_probability: z.number().min(0).max(1),
  limits: z.object({
    daily_readings: int(1, 1000),
    daily_followups: int(0, 5000),
    daily_analyses: int(1, 5000),
  }),
  credits: z.object({
    enabled: z.boolean(),
    daily_free: z.object({
      free: int(0, 10000),
      basic: int(0, 10000),
      premium: int(0, 10000),
      unlimited: int(0, 10000),
    }),
    /** by spread size: small ≤3 cards, medium 4–7, large ≥8 */
    cost_interpret: z.object({ small: int(0, 100), medium: int(0, 100), large: int(0, 100) }),
    cost_followup: int(0, 100),
    cost_clarifier: int(0, 100),
    /** follow-up questions per reading that cost nothing, by tier */
    free_followups: z
      .object({ free: int(0, 1000), basic: int(0, 1000), premium: int(0, 1000), unlimited: int(0, 1000) })
      .default({ free: 2, basic: 5, premium: 10, unlimited: 50 }),
    /** one-time credits for a new account / a new guest session (0 = none) */
    signup_bonus: int(0, 1000).default(6),
    guest_trial: int(0, 1000).default(0),
  }),
  disabled_spreads: z.array(z.string().max(64)).max(50),
  models: z.object({
    anthropic_deep: z.string().max(80),
    anthropic_fast: z.string().max(80),
    gateway_deep: z.string().max(80),
    gateway_chat: z.string().max(80),
    gateway_fast: z.string().max(80),
  }),
  prompt_addendum: z.object({ text: z.string().max(2000) }),
  /** USD per 1M tokens — used only to estimate cost in the dashboard */
  model_prices: z.record(
    z.string().max(80),
    z.object({ input: z.number().min(0).max(1000), output: z.number().min(0).max(1000) }),
  ),
  packages: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().min(1).max(80),
        credits: int(1, 100000),
        price_thb: z.number().min(0).max(1000000),
      }),
    )
    .max(12),
  /** monthly memberships; id is the tier the plan grants */
  plans: z
    .array(
      z.object({
        id: z.enum(["basic", "premium"]),
        name: z.string().min(1).max(40),
        price_thb: z.number().min(0).max(1000000),
        monthly_credits: int(1, 100000),
      }),
    )
    .max(2),
  daily: z.object({
    /** an AI-written message of the day (one shared call per card per day) */
    ai_message: z.boolean(),
    /** every N consecutive days a signed-in account earns the reward */
    streak_days: int(0, 365),
    streak_reward: int(0, 100),
  }),
  /** transfers to the owner's own PromptPay account, confirmed by slip */
  promptpay: z.object({
    enabled: z.boolean(),
    /** PromptPay ID: 10-digit mobile, 13-digit national/tax id or 15-digit e-wallet id */
    id: z.string().max(20).regex(/^d*$/),
    /** shown to the payer so they can confirm the recipient in their banking app */
    account_name: z.string().max(80),
    /** optional text that must appear in the slip's recipient details */
    receiver_hint: z.string().max(40),
  }),
  /** who the customer is buying from — shown on the payment and terms pages */
  business: z.object({
    name: z.string().min(1).max(80),
    contact_email: z.string().max(120),
    contact_line: z.string().max(60),
    address: z.string().max(240),
  }),
  billing: z.object({
    /** used only to express AI cost (USD) and revenue (THB) in one currency */
    usd_thb: z.number().min(1).max(1000),
    /** when true, only signed-in accounts may buy credits */
    require_account: z.boolean(),
  }),
} as const;

export type SettingKey = keyof typeof settingsSchemas;
export type Settings = { [K in SettingKey]: z.infer<(typeof settingsSchemas)[K]> };

export const SETTING_KEYS = Object.keys(settingsSchemas) as SettingKey[];

export const DEFAULT_SETTINGS: Settings = {
  reversal_probability: 0.35,
  limits: { daily_readings: 15, daily_followups: 60, daily_analyses: 60 },
  credits: {
    enabled: false,
    daily_free: { free: 0, basic: 0, premium: 0, unlimited: 150 },
    cost_interpret: { small: 2, medium: 3, large: 4 },
    cost_followup: 1,
    cost_clarifier: 1,
    free_followups: { free: 2, basic: 5, premium: 10, unlimited: 50 },
    signup_bonus: 6,
    guest_trial: 0,
  },
  disabled_spreads: [],
  models: {
    anthropic_deep: "",
    anthropic_fast: "",
    gateway_deep: "",
    gateway_chat: "",
    gateway_fast: "",
  },
  prompt_addendum: { text: "" },
  model_prices: {
    "claude-sonnet-5-5": { input: 2, output: 10 },
    "claude-sonnet-5": { input: 2, output: 10 },
    "claude-sonnet-4-6": { input: 3, output: 15 },
    "claude-sonnet-4-5": { input: 3, output: 15 },
    "claude-haiku-5-5": { input: 0.1, output: 0.5 },
    "claude-haiku-4-5": { input: 1, output: 5 },
    "claude-opus-5-5": { input: 4, output: 20 },
    "gpt-5": { input: 1.25, output: 10 },
    "gpt-5-mini": { input: 0.25, output: 2 },
    "gpt-4-1": { input: 2, output: 8 },
    "gpt-4-1-mini": { input: 0.4, output: 1.6 },
    "gemini-2-5-flash": { input: 0.3, output: 2.5 },
  },
  packages: [
    { id: "starter", name: "Starter", credits: 30, price_thb: 99 },
    { id: "seeker", name: "Seeker", credits: 70, price_thb: 199 },
    { id: "oracle", name: "Oracle", credits: 150, price_thb: 399 },
  ],
  plans: [
    { id: "basic", name: "Plus", price_thb: 149, monthly_credits: 60 },
    { id: "premium", name: "Premium", price_thb: 299, monthly_credits: 150 },
  ],
  daily: { ai_message: true, streak_days: 7, streak_reward: 3 },
  promptpay: { enabled: false, id: "", account_name: "", receiver_hint: "" },
  business: { name: "ARCANA INTELLIGENCE", contact_email: "", contact_line: "", address: "" },
  billing: { usd_thb: 36, require_account: false },
};

export function parseSettings(raw: unknown): Settings {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SETTINGS } as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) {
    if (!(key in source)) continue;
    const parsed = settingsSchemas[key].safeParse(source[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as Settings;
}

const TTL_MS = 30_000;
let cache: { value: Settings; at: number } | null = null;

export function invalidateSettings() {
  cache = null;
}

export async function getSettings(
  supabase: SupabaseClient,
  opts: { fresh?: boolean } = {},
): Promise<Settings> {
  if (!opts.fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const { data, error } = await supabase.rpc("arcana_public_settings");
  if (error) {
    console.error("[arcana] settings load failed, using defaults:", error.message);
    return cache?.value ?? DEFAULT_SETTINGS;
  }
  const value = parseSettings(data);
  cache = { value, at: Date.now() };
  configureModels(value.models);
  return value;
}

// ── derived helpers ────────────────────────────────────────────────────────
export function interpretCost(settings: Settings, cardCount: number): number {
  const c = settings.credits.cost_interpret;
  return cardCount <= 3 ? c.small : cardCount <= 7 ? c.medium : c.large;
}

export type Tier = "free" | "basic" | "premium" | "unlimited";

/**
 * @param askedSoFar follow-up questions already answered in this reading
 * @param tier the asker's tier — decides how many follow-ups are free
 */
export function followUpCost(
  settings: Settings,
  drawCard: boolean,
  askedSoFar = 0,
  tier: Tier = "free",
): number {
  const c = settings.credits;
  const free = askedSoFar < c.free_followups[tier];
  return (free ? 0 : c.cost_followup) + (drawCard ? c.cost_clarifier : 0);
}

export function planFor(settings: Settings, id: string) {
  return settings.plans.find((p) => p.id === id) ?? null;
}

function fnv1a(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Version stamp stored with each reading — changes whenever the addendum does. */
export function promptVersionFor(settings: Settings): string {
  const text = settings.prompt_addendum.text.trim();
  return text ? `${PROMPT_VERSION}+addendum-${fnv1a(text)}` : PROMPT_VERSION;
}

function normalizeModel(model: string): string {
  return model
    .toLowerCase()
    .replace(/^[a-z0-9-]+\//, "")
    .replace(/\./g, "-");
}

export function priceFor(
  model: string | null | undefined,
  prices: Settings["model_prices"],
): { input: number; output: number } | null {
  if (!model) return null;
  const target = normalizeModel(model);
  let best: { key: string; price: { input: number; output: number } } | null = null;
  for (const [key, price] of Object.entries(prices)) {
    const k = normalizeModel(key);
    if (target === k) return price;
    // dated ids such as claude-sonnet-5-5-20261001 match their family
    if (target.startsWith(`${k}-`) && (!best || k.length > best.key.length)) {
      best = { key: k, price };
    }
  }
  return best?.price ?? null;
}

export function estimateCostUsd(
  usage: { model: string | null; input_tokens: number; output_tokens: number },
  prices: Settings["model_prices"],
): number | null {
  const p = priceFor(usage.model, prices);
  if (!p) return null;
  return (usage.input_tokens * p.input + usage.output_tokens * p.output) / 1_000_000;
}
