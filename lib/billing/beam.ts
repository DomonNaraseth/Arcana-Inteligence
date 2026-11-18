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

// ── card payments: Beam's hosted checkout page (a payment link) ─────────────
// Card details are typed on Beam's page, never on ours.

/** How long a card checkout link stays payable. */
export const CARD_LINK_MINUTES = 30;

/** Request body for a single-use, card-only hosted checkout for one payment (satang). */
export function paymentLinkBody(args: {
  amountMinor: number;
  referenceId: string;
  description: string;
  redirectUrl: string;
  expiresAt: Date;
}) {
  return {
    order: {
      currency: "THB",
      description: args.description.slice(0, 120),
      netAmount: args.amountMinor,
      referenceId: args.referenceId,
      orderItems: [
        {
          itemName: args.description.slice(0, 80),
          description: "ARCANA INTELLIGENCE",
          price: args.amountMinor,
          quantity: 1,
          productId: args.referenceId.slice(0, 36),
        },
      ],
    },
    // only the methods named here are offered: cards (QR has its own flow on our page)
    linkSettings: { card: { isEnabled: true } },
    collectDeliveryAddress: false,
    redirectUrl: args.redirectUrl,
    cancelUrl: args.redirectUrl,
    expiresAt: args.expiresAt.toISOString(),
  };
}

export interface BeamLink {
  id: string;
  url: string;
}

/** The checkout must be an https page; plain http only for a local mock (dev builds only). */
export function parseCreatedLink(json: unknown, allowLocalHttp = false): BeamLink | null {
  const j = json as { id?: string; url?: string } | null;
  if (!j?.id || !j.url) return null;
  const ok = /^https:\/\//.test(j.url) || (allowLocalHttp && /^http:\/\/localhost(:\d+)?\//.test(j.url));
  return ok ? { id: j.id, url: j.url } : null;
}

export interface BeamLinkStatus {
  id: string;
  status: "ACTIVE" | "PAID" | "EXPIRED" | "DISABLED" | string;
  amount: number;
  currency: string;
  referenceId: string;
}

export function parsePaymentLink(json: unknown): BeamLinkStatus | null {
  const j = json as {
    paymentLinkId?: string;
    status?: string;
    order?: { netAmount?: number; currency?: string; referenceId?: string };
  } | null;
  if (!j?.paymentLinkId || !j.status || typeof j.order?.netAmount !== "number") return null;
  return {
    id: j.paymentLinkId,
    status: j.status,
    amount: j.order.netAmount,
    currency: (j.order.currency ?? "").toUpperCase(),
    referenceId: j.order.referenceId ?? "",
  };
}

export async function createPaymentLink(
  c: BeamConfig,
  args: { amountMinor: number; referenceId: string; description: string; redirectUrl: string; expiresAt: Date },
): Promise<BeamLink> {
  let res: Response;
  try {
    res = await fetch(`${c.base}/api/v1/payment-links`, {
      method: "POST",
      headers: {
        authorization: auth(c),
        "content-type": "application/json",
        // a retried request must not open a second link for the same attempt
        "idempotency-key": `${args.referenceId}:${args.expiresAt.getTime()}`,
      },
      body: JSON.stringify(paymentLinkBody(args)),
      cache: "no-store",
    });
  } catch (err) {
    throw new BeamError(`beam unreachable: ${(err as Error).message}`);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new BeamError(`beam create link HTTP ${res.status}: ${JSON.stringify(json)?.slice(0, 300)}`, res.status);
  const link = parseCreatedLink(json, c.base.startsWith("http://localhost"));
  if (!link) throw new BeamError("beam link answer unreadable");
  return link;
}

/** Our own lookup of a payment link — the confirmation that counts. */
export async function getPaymentLink(c: BeamConfig, linkId: string): Promise<BeamLinkStatus> {
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(linkId)) throw new BeamError("invalid link id");
  let res: Response;
  try {
    res = await fetch(`${c.base}/api/v1/payment-links/${encodeURIComponent(linkId)}`, {
      headers: { authorization: auth(c) },
      cache: "no-store",
    });
  } catch (err) {
    throw new BeamError(`beam unreachable: ${(err as Error).message}`);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new BeamError(`beam get link HTTP ${res.status}`, res.status);
  const link = parsePaymentLink(json);
  if (!link) throw new BeamError("beam link answer unreadable");
  return link;
}

/** Card links are recorded beside QR charges, told apart by this prefix. */
export const LINK_PREFIX = "pl_";
