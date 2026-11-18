import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Beam Checkout (https://docs.beamcheckout.com) — a Thai payment gateway that
 * issues a PromptPay QR per order and tells us when it was paid. With Beam the
 * customer scans, pays and the purchase is granted by itself: no slip.
 *
 * Success is established only by Beam: a webhook signed with HMAC-SHA256 that
 * we verify, followed by our own server-side lookup of the charge (or that
 * lookup alone while the pay page waits). Without keys nothing pretends to be
 * Beam (rule 10): the slip flow stays in charge.
 */

export interface BeamConfig {
  merchantId: string;
  apiKey: string;
  /** base64 HMAC key from Beam Lighthouse → Developers → Webhooks */
  webhookKey: string | null;
  base: string;
  /** production keys: real money. Playground: test only, admins only on production */
  live: boolean;
}

export const BEAM_BASE = {
  production: "https://api.beamcheckout.com",
  playground: "https://playground.api.beamcheckout.com",
} as const;

export function beamConfig(): BeamConfig | null {
  const merchantId = process.env.BEAM_MERCHANT_ID?.trim();
  const apiKey = process.env.BEAM_API_KEY?.trim();
  if (!merchantId || !apiKey) return null;
  const live = process.env.BEAM_ENV?.trim() === "production";
  // a local mock may stand in for Beam, never on a production build
  const override = process.env.NODE_ENV !== "production" ? process.env.BEAM_API_BASE?.trim() : undefined;
  return {
    merchantId,
    apiKey,
    webhookKey: process.env.BEAM_WEBHOOK_KEY?.trim() || null,
    base: override || (live ? BEAM_BASE.production : BEAM_BASE.playground),
    live,
  };
}

export class BeamError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

function auth(c: BeamConfig) {
  return `Basic ${Buffer.from(`${c.merchantId}:${c.apiKey}`).toString("base64")}`;
}

/** Request body for a PromptPay QR charge (amount in satang). */
export function qrChargeBody(args: { amountMinor: number; referenceId: string; returnUrl: string; expiresAt: Date }) {
  return {
    amount: args.amountMinor,
    currency: "THB",
    paymentMethod: {
      paymentMethodType: "QR_PROMPT_PAY",
      qrPromptPay: { expiryTime: args.expiresAt.toISOString().replace(/\.\d{3}Z$/, "Z") },
    },
    referenceId: args.referenceId,
    returnUrl: args.returnUrl,
    skip3dsFlow: false,
  };
}

export interface BeamQr {
  chargeId: string;
  /** PNG, base64 (no data: prefix) */
  imageBase64: string;
  expiresAt: string;
}

/** Reads the create-charge answer; null when it does not carry a QR. */
export function parseQrCharge(json: unknown): BeamQr | null {
  const j = json as {
    chargeId?: string;
    actionRequired?: string;
    encodedImage?: { imageBase64Encoded?: string; expiry?: string };
  } | null;
  if (!j?.chargeId || !j.encodedImage?.imageBase64Encoded) return null;
  return {
    chargeId: j.chargeId,
    imageBase64: j.encodedImage.imageBase64Encoded.replace(/^data:image\/\w+;base64,/, ""),
    expiresAt: j.encodedImage.expiry ?? "",
  };
}

export async function createQrCharge(
  c: BeamConfig,
  args: { amountMinor: number; referenceId: string; returnUrl: string; expiresAt: Date },
): Promise<BeamQr> {
  let res: Response;
  try {
    res = await fetch(`${c.base}/api/v1/charges`, {
      method: "POST",
      headers: { authorization: auth(c), "content-type": "application/json" },
      body: JSON.stringify(qrChargeBody(args)),
      cache: "no-store",
    });
  } catch (err) {
    throw new BeamError(`beam unreachable: ${(err as Error).message}`);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new BeamError(`beam create charge HTTP ${res.status}: ${JSON.stringify(json)?.slice(0, 300)}`, res.status);
  const qr = parseQrCharge(json);
  if (!qr) throw new BeamError("beam charge answer carried no QR");
  return { ...qr, expiresAt: qr.expiresAt || args.expiresAt.toISOString() };
}

export interface BeamCharge {
  chargeId: string;
  referenceId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | string;
  amount: number;
  currency: string;
}

export function parseCharge(json: unknown): BeamCharge | null {
  const j = json as Partial<BeamCharge> | null;
  if (!j?.chargeId || typeof j.amount !== "number" || !j.status) return null;
  return {
    chargeId: j.chargeId,
    referenceId: j.referenceId ?? "",
    status: j.status,
    amount: j.amount,
    currency: (j.currency ?? "").toUpperCase(),
  };
}

/** Our own lookup of a charge — the confirmation that counts. */
export async function getCharge(c: BeamConfig, chargeId: string): Promise<BeamCharge> {
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(chargeId)) throw new BeamError("invalid charge id");
  let res: Response;
  try {
    res = await fetch(`${c.base}/api/v1/charges/${encodeURIComponent(chargeId)}`, {
      headers: { authorization: auth(c) },
      cache: "no-store",
    });
  } catch (err) {
    throw new BeamError(`beam unreachable: ${(err as Error).message}`);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new BeamError(`beam get charge HTTP ${res.status}`, res.status);
  const charge = parseCharge(json);
  if (!charge) throw new BeamError("beam charge answer unreadable");
  return charge;
}

/**
 * Beam signs the exact raw body with HMAC-SHA256 using the base64-decoded key
 * and sends the base64 digest in X-Beam-Signature.
 */
export function verifyBeamSignature(rawBody: string, signature: string | null, keyBase64: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", Buffer.from(keyBase64, "base64")).update(rawBody, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature.trim(), "base64");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** How long a QR may be paid. Long enough to open a banking app, short enough that prices stay current. */
export const QR_MINUTES = 15;
