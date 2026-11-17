import { describe, expect, it } from "vitest";
import { PROMPT_VERSION } from "@/lib/ai/schemas";
import {
  DEFAULT_SETTINGS,
  estimateCostUsd,
  followUpCost,
  interpretCost,
  parseSettings,
  priceFor,
  promptVersionFor,
  settingsSchemas,
} from "@/lib/settings";
import { SPREADS, enabledSpreads, fallbackSpreadId } from "@/lib/tarot/spreads";

describe("runtime settings", () => {
  it("defaults are valid against their own schemas", () => {
    for (const [key, schema] of Object.entries(settingsSchemas)) {
      const value = DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS];
      expect(schema.safeParse(value).success, key).toBe(true);
    }
  });

  it("falls back to defaults for missing, malformed or hostile rows", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("nope")).toEqual(DEFAULT_SETTINGS);
    const parsed = parseSettings({
      reversal_probability: 7, // out of range
      limits: { daily_readings: -5 }, // invalid
      disabled_spreads: ["yes_no"], // valid
      unknown_key: true,
    });
    expect(parsed.reversal_probability).toBe(DEFAULT_SETTINGS.reversal_probability);
    expect(parsed.limits).toEqual(DEFAULT_SETTINGS.limits);
    expect(parsed.disabled_spreads).toEqual(["yes_no"]);
    expect("unknown_key" in parsed).toBe(false);
  });

  it("credits are off by default so nobody is charged unexpectedly", () => {
    expect(DEFAULT_SETTINGS.credits.enabled).toBe(false);
  });
});

describe("credit pricing", () => {
  const s = DEFAULT_SETTINGS;

  it("prices interpretation by spread size", () => {
    expect(interpretCost(s, 3)).toBe(s.credits.cost_interpret.small);
    expect(interpretCost(s, 4)).toBe(s.credits.cost_interpret.medium);
    expect(interpretCost(s, 7)).toBe(s.credits.cost_interpret.medium);
    expect(interpretCost(s, 8)).toBe(s.credits.cost_interpret.large);
    expect(interpretCost(s, 12)).toBe(s.credits.cost_interpret.large);
  });

  it("adds the clarifier cost only when a card is drawn", () => {
    expect(followUpCost(s, false)).toBe(s.credits.cost_followup);
    expect(followUpCost(s, true)).toBe(s.credits.cost_followup + s.credits.cost_clarifier);
  });
});

describe("AI cost estimation", () => {
  const prices = DEFAULT_SETTINGS.model_prices;

  it("matches gateway ids, direct ids and dated ids to the same price", () => {
    expect(priceFor("anthropic/claude-sonnet-5.5", prices)).toEqual({ input: 2, output: 10 });
    expect(priceFor("claude-sonnet-5-5", prices)).toEqual({ input: 2, output: 10 });
    expect(priceFor("claude-sonnet-5-5-20261001", prices)).toEqual({ input: 2, output: 10 });
    expect(priceFor("openai/gpt-4.1-mini", prices)).toEqual({ input: 0.4, output: 1.6 });
    expect(priceFor("openai/gpt-4.1", prices)).toEqual({ input: 2, output: 8 });
  });

  it("returns null rather than guessing for unknown models", () => {
    expect(priceFor("somevendor/mystery-1", prices)).toBeNull();
    expect(priceFor(null, prices)).toBeNull();
    expect(estimateCostUsd({ model: "x/unknown", input_tokens: 10, output_tokens: 10 }, prices)).toBeNull();
  });

  it("computes cost per million tokens", () => {
    const cost = estimateCostUsd(
      { model: "claude-sonnet-5-5", input_tokens: 1_000_000, output_tokens: 500_000 },
      prices,
    );
    expect(cost).toBeCloseTo(2 + 5, 6);
  });
});

describe("prompt versioning", () => {
  it("is the base version without an addendum", () => {
    expect(promptVersionFor(DEFAULT_SETTINGS)).toBe(PROMPT_VERSION);
  });

  it("changes whenever the addendum text changes", () => {
    const a = promptVersionFor({ ...DEFAULT_SETTINGS, prompt_addendum: { text: "กระชับขึ้น" } });
    const b = promptVersionFor({ ...DEFAULT_SETTINGS, prompt_addendum: { text: "อบอุ่นขึ้น" } });
    expect(a).not.toBe(PROMPT_VERSION);
    expect(a).not.toBe(b);
    expect(a.startsWith(`${PROMPT_VERSION}+addendum-`)).toBe(true);
  });
});

describe("spread availability", () => {
  it("hides disabled spreads but never returns an empty catalog", () => {
    expect(enabledSpreads(["yes_no"]).some((s) => s.id === "yes_no")).toBe(false);
    expect(enabledSpreads(SPREADS.map((s) => s.id))).toHaveLength(SPREADS.length);
  });

  it("picks an enabled fallback", () => {
    expect(fallbackSpreadId([])).toBe("general");
    const fb = fallbackSpreadId(["general"]);
    expect(fb).not.toBe("general");
    expect(SPREADS.some((s) => s.id === fb)).toBe(true);
  });
});
