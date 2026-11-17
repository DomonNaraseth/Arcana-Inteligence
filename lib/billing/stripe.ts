import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BillingProviderError,
  WebhookSignatureError,
  type BillingEvent,
  type CheckoutInput,
  type PaymentProvider,
  type SessionState,
} from "./provider";

/**
 * Stripe Checkout over plain HTTPS (no SDK): hosted payment page, signed
 * webhooks. Payment methods (cards, PromptPay, …) are whatever is switched on
 * in the Stripe dashboard — nothing is hard-coded here.
 */

const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Pinned so a change of the account's default API version cannot alter the
 * shape of what this adapter sends or reads. Bump deliberately, then re-run
 * the sandbox purchase test.
 */
export const STRIPE_API_VERSION = "2026-10-28.endive";

/** Labels these sessions in the Stripe dashboard's checkout analytics. */
const CHECKOUT_INTEGRATION_IDENTIFIER = "arcana-credits-qkzvhmtw";

function apiBase(): string {
  // overridable only outside production, for the local mock gateway
  if (process.env.NODE_ENV !== "production" && process.env.STRIPE_API_BASE) {
    return process.env.STRIPE_API_BASE.replace(/\/$/, "");
  }
  return "https://api.stripe.com";
}

/** Encodes nested params the way Stripe expects: a[b][0]=x */
export function encodeForm(params: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item && typeof item === "object") {
          parts.push(encodeForm(item as Record<string, unknown>, `${name}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof value === "object") {
      parts.push(encodeForm(value as Record<string, unknown>, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

interface StripeSession {
  id: string;
  url?: string | null;
  status?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  payment_intent?: string | { id: string } | null;
}

export function toSessionState(s: StripeSession): SessionState {
  const status = s.status === "complete" ? "complete" : s.status === "expired" ? "expired" : "open";
  return {
    sessionId: s.id,
    paymentId: s.metadata?.payment_id ?? s.client_reference_id ?? null,
    paid: s.payment_status === "paid",
    status,
    amountMinor: typeof s.amount_total === "number" ? s.amount_total : null,
    currency: s.currency ?? null,
    paymentRef:
      typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
  };
}

/**
 * Verifies a `Stripe-Signature` header: HMAC-SHA256 over `${t}.${rawBody}`,
 * compared in constant time, with a tolerance window against replays.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): void {
  if (!header) throw new WebhookSignatureError("missing signature header");
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.trim().split("=");
    if (k === "t") timestamp = v ?? "";
    else if (k === "v1" && v) signatures.push(v);
  }
  const t = Number(timestamp);
  if (!timestamp || !Number.isFinite(t) || signatures.length === 0) {
    throw new WebhookSignatureError("malformed signature header");
  }
  if (Math.abs(nowSeconds - t) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new WebhookSignatureError("timestamp outside tolerance");
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  const ok = signatures.some((sig) => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
    return timingSafeEqual(Buffer.from(sig, "hex"), expected);
  });
  if (!ok) throw new WebhookSignatureError("signature mismatch");
}

export function mapStripeEvent(event: {
  id?: string;
  type?: string;
  data?: { object?: StripeSession };
}): BillingEvent {
  const type = event.type ?? "";
  const object = event.data?.object;
  const isSession = type.startsWith("checkout.session.") && object?.id;
  const session = isSession ? toSessionState(object!) : null;
  let kind: BillingEvent["kind"] = "ignored";
  if (session) {
    if (type === "checkout.session.completed") {
      // delayed methods complete the session before the money arrives
      kind = session.paid ? "paid" : "ignored";
    } else if (type === "checkout.session.async_payment_succeeded") {
      kind = "paid";
      session.paid = true;
    } else if (type === "checkout.session.async_payment_failed") {
      kind = "failed";
    } else if (type === "checkout.session.expired") {
      kind = "expired";
    }
  }
  return { id: event.id ?? "", type, kind, session };
}

export function createStripeProvider(secretKey: string, webhookSecret: string | null): PaymentProvider {
  async function call<T>(method: "GET" | "POST", path: string, body?: string, idempotencyKey?: string): Promise<T> {
    const res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${secretKey}`,
        "stripe-version": STRIPE_API_VERSION,
        ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let message = text.slice(0, 300);
      try {
        message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        // keep the raw text
      }
      throw new BillingProviderError(`Stripe ${res.status}: ${message}`, res.status);
    }
    return (await res.json()) as T;
  }

  return {
    id: "stripe",
    livemode: secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_"),
    webhookConfigured: Boolean(webhookSecret),

    async createCheckout(input: CheckoutInput) {
      const session = await call<StripeSession>(
        "POST",
        "/v1/checkout/sessions",
        encodeForm({
          mode: "payment",
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          client_reference_id: input.paymentId,
          customer_email: input.customerEmail || undefined,
          locale: "th",
          integration_identifier: CHECKOUT_INTEGRATION_IDENTIFIER,
          expires_at: input.expiresAt,
          metadata: { payment_id: input.paymentId, credits: input.credits },
          payment_intent_data: { metadata: { payment_id: input.paymentId } },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: input.currency,
                unit_amount: input.amountMinor,
                product_data: {
                  name: `ARCANA — ${input.packageName} (${input.credits} เครดิต)`,
                },
              },
            },
          ],
        }),
        `arcana-checkout-${input.paymentId}`,
      );
      if (!session.id || !session.url) {
        throw new BillingProviderError("Stripe returned a session without a URL");
      }
      return { sessionId: session.id, url: session.url };
    },

    async getSession(sessionId: string) {
      if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
        throw new BillingProviderError("invalid session id");
      }
      return toSessionState(await call<StripeSession>("GET", `/v1/checkout/sessions/${sessionId}`));
    },

    parseWebhook(rawBody: string, signatureHeader: string | null) {
      if (!webhookSecret) throw new WebhookSignatureError("webhook secret is not configured");
      verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
      return mapStripeEvent(JSON.parse(rawBody));
    },
  };
}
