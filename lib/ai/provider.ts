import { headers } from "next/headers";

/**
 * AI Provider Adapter.
 *
 * Business logic calls generate() and never talks to a vendor directly, so
 * the model/provider can be swapped by environment configuration alone.
 *
 *  1. ANTHROPIC_API_KEY set  → Anthropic Messages API (preferred)
 *  2. otherwise              → Vercel AI Gateway (AI_GATEWAY_API_KEY, or the
 *                              deployment's OIDC token on Vercel)
 *  3. neither                → AiNotConfiguredError (no fake readings, ever)
 */

export type ModelTier = "deep" | "fast";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateInput {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  tier?: ModelTier;
}

export interface GenerateResult {
  text: string;
  provider: "anthropic" | "vercel-ai-gateway";
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI provider is not configured");
  }
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

function anthropicModel(tier: ModelTier): string {
  return tier === "fast"
    ? process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-5-5"
    : process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
}

/**
 * Gateway model candidates, best first. If the account has no access to a
 * model (plan restriction, model retired) the next candidate is tried and the
 * first one that works is remembered for the lifetime of the instance.
 */
const GATEWAY_FALLBACKS: Record<ModelTier, string[]> = {
  deep: [
    "anthropic/claude-sonnet-5.5",
    "anthropic/claude-sonnet-5",
    "anthropic/claude-sonnet-4.6",
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-haiku-4.5",
    // interim fallbacks for gateway plans without Claude access
    "openai/gpt-5",
    "openai/gpt-5-mini",
    "google/gemini-2.5-flash",
  ],
  fast: [
    "anthropic/claude-haiku-5.5",
    "anthropic/claude-haiku-4.5",
    "anthropic/claude-sonnet-4.5",
    "openai/gpt-4.1-mini",
    "google/gemini-2.5-flash",
  ],
};

/** Reasoning models spend part of max_tokens on hidden reasoning. */
function isReasoningModel(model: string): boolean {
  return model.startsWith("openai/gpt-5") || model.startsWith("openai/o");
}

const workingGatewayModel: Partial<Record<ModelTier, string>> = {};

function gatewayCandidates(tier: ModelTier): string[] {
  const configured =
    tier === "fast" ? process.env.AI_GATEWAY_FAST_MODEL : process.env.AI_GATEWAY_MODEL;
  const list = [workingGatewayModel[tier], configured, ...GATEWAY_FALLBACKS[tier]].filter(
    (m): m is string => Boolean(m),
  );
  return [...new Set(list)];
}

async function gatewayToken(): Promise<string | null> {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  try {
    const h = await headers();
    const oidc = h.get("x-vercel-oidc-token");
    if (oidc) return oidc;
  } catch {
    // not in a request scope
  }
  return process.env.VERCEL_OIDC_TOKEN || null;
}

export async function aiStatus(): Promise<{
  configured: boolean;
  provider: "anthropic" | "vercel-ai-gateway" | null;
}> {
  if (process.env.ANTHROPIC_API_KEY) return { configured: true, provider: "anthropic" };
  if (await gatewayToken()) return { configured: true, provider: "vercel-ai-gateway" };
  return { configured: false, provider: null };
}

export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const tier = input.tier ?? "deep";
  if (process.env.ANTHROPIC_API_KEY) {
    return callAnthropic(input, tier, process.env.ANTHROPIC_API_KEY);
  }
  const token = await gatewayToken();
  if (token) return callGateway(input, tier, token);
  throw new AiNotConfiguredError();
}

async function callAnthropic(
  input: GenerateInput,
  tier: ModelTier,
  apiKey: string,
): Promise<GenerateResult> {
  const model = anthropicModel(tier);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: input.messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AiProviderError(`Anthropic API ${res.status}: ${body.slice(0, 300)}`, res.status);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    model?: string;
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  return {
    text,
    provider: "anthropic",
    model: data.model ?? model,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

async function callGateway(
  input: GenerateInput,
  tier: ModelTier,
  token: string,
): Promise<GenerateResult> {
  let lastError: AiProviderError | null = null;
  for (const model of gatewayCandidates(tier)) {
    try {
      const result = await callGatewayModel(input, model, token);
      workingGatewayModel[tier] = model;
      return result;
    } catch (err) {
      if (!(err instanceof AiProviderError)) throw err;
      lastError = err;
      // only an access/availability problem justifies trying another model
      if (err.status !== 403 && err.status !== 404) throw err;
      console.warn(`[arcana] gateway model ${model} unavailable (${err.status}), trying next`);
    }
  }
  throw lastError ?? new AiProviderError("No AI Gateway model available");
}

async function callGatewayModel(
  input: GenerateInput,
  model: string,
  token: string,
): Promise<GenerateResult> {
  const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: isReasoningModel(model) ? input.maxTokens + 4000 : input.maxTokens,
      ...(isReasoningModel(model) ? { reasoning_effort: "low" } : {}),
      messages: [{ role: "system", content: input.system }, ...input.messages],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AiProviderError(`AI Gateway ${res.status}: ${body.slice(0, 300)}`, res.status);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    provider: "vercel-ai-gateway",
    model: data.model ?? model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

/** Operator health check: which gateway models can this deployment reach? */
export async function probeModels(
  models: string[],
): Promise<{ model: string; ok: boolean; status?: number; detail: string }[]> {
  const token = await gatewayToken();
  if (!token) return models.map((model) => ({ model, ok: false, detail: "no gateway token" }));
  return Promise.all(
    models.map(async (model) => {
      try {
        const r = await callGatewayModel(
          {
            system: "Reply in Thai.",
            messages: [{ role: "user", content: "ตอบคำว่า พร้อม คำเดียว" }],
            maxTokens: 400,
          },
          model,
          token,
        );
        return { model, ok: true, detail: r.text.slice(0, 60) };
      } catch (err) {
        const e = err as AiProviderError;
        return { model, ok: false, status: e.status, detail: String(e.message).slice(0, 160) };
      }
    }),
  );
}

/** Extract the first complete JSON object from a model response. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in model output");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("Unterminated JSON object in model output");
}
