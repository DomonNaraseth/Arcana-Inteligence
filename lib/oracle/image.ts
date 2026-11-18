import { gatewayToken } from "../ai/provider";

/**
 * Paints one oracle picture through Vercel AI Gateway (the deployment's own
 * credential — no extra key) and returns it as compact WebP. Models are tried
 * best first; the first that works is remembered for this instance.
 * There is no fallback picture: a failure is reported, never faked (rule 2).
 */

/**
 * FLUX.2 [pro] first: verified on this deployment's gateway (2026-11-19).
 * gpt-image-2 answers 403 "Free tier users do not have access" until the
 * team buys AI Gateway credits; it is kept as the fallback for that day.
 */
export const IMAGE_MODELS = ["bfl/flux-2-pro", "openai/gpt-image-2"] as const;

export class OracleImageError extends Error {
  constructor(
    message: string,
    public reason: "not_configured" | "refused" | "unavailable",
  ) {
    super(message);
  }
}

let workingModel: string | null = null;

async function callModel(model: string, prompt: string, token: string): Promise<Buffer> {
  const res = await fetch("https://ai-gateway.vercel.sh/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model, prompt, n: 1, size: "1024x1536", response_format: "b64_json" }),
  });
  const json = (await res.json().catch(() => null)) as
    | { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } | string }
    | null;
  if (!res.ok) {
    const msg = typeof json?.error === "string" ? json.error : json?.error?.message;
    throw new OracleImageError(`${model}: HTTP ${res.status} ${msg ?? ""}`.trim(), res.status >= 500 ? "unavailable" : "refused");
  }
  const item = json?.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) {
    const img = await fetch(item.url);
    if (img.ok) return Buffer.from(await img.arrayBuffer());
  }
  throw new OracleImageError(`${model}: no image in the answer`, "unavailable");
}

/** Resizes to at most 1024 px wide WebP (~150–300 KB); keeps the original if sharp is unavailable. */
export async function toWebp(input: Buffer): Promise<{ bytes: Buffer; mime: "image/webp" | "image/png" }> {
  try {
    const sharp = (await import("sharp")).default;
    const bytes = await sharp(input).resize({ width: 1024, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    return { bytes, mime: "image/webp" };
  } catch (err) {
    console.error("[arcana] webp conversion unavailable, storing png:", (err as Error).message);
    return { bytes: input, mime: "image/png" };
  }
}

export async function paint(prompt: string): Promise<{ bytes: Buffer; mime: "image/webp" | "image/png"; model: string }> {
  const token = await gatewayToken();
  if (!token) throw new OracleImageError("AI Gateway is not configured", "not_configured");
  const candidates = [...new Set([workingModel, ...IMAGE_MODELS].filter((m): m is string => Boolean(m)))];
  const errors: string[] = [];
  for (const model of candidates) {
    try {
      let raw: Buffer;
      try {
        raw = await callModel(model, prompt, token);
      } catch (err) {
        // a busy provider (5xx) usually answers a few seconds later: one quiet retry
        if (!(err instanceof OracleImageError) || err.reason !== "unavailable") throw err;
        await new Promise((r) => setTimeout(r, 5000));
        raw = await callModel(model, prompt, token);
      }
      workingModel = model;
      const out = await toWebp(raw);
      if (out.bytes.length > 3 * 1024 * 1024) throw new OracleImageError(`${model}: picture too large`, "unavailable");
      return { ...out, model };
    } catch (err) {
      errors.push((err as Error).message);
    }
  }
  throw new OracleImageError(errors.join(" | "), errors.every((e) => / 40[13] /.test(e)) ? "refused" : "unavailable");
}
