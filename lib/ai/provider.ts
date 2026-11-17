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

function gatewayModel(tier: ModelTier): string {
  return tier === "fast"
    ? process.env.AI_GATEWAY_FAST_MODEL || "anthropic/claude-haiku-5.5"
    : process.env.AI_GATEWAY_MODEL || "anthropic/claude-sonnet-5.5";
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
  const model = gatewayModel(tier);
  const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens,
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
