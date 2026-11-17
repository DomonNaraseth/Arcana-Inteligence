import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BillingProviderError,
  WebhookSignatureError,
  type BillingEvent,
  type CheckoutInput,
  type InvoiceState,
  type PaymentProvider,
  type SessionState,
  type SubscriptionCheckoutInput,
  type SubscriptionState,
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
const PLAN_INTEGRATION_IDENTIFIER = "arcana-plans-wdnjxrbe";

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

type Ref = string | { id: string } | null | undefined;
const idOf = (ref: Ref): string | null => (typeof ref === "string" ? ref : (ref?.id ?? null));

interface StripeSession {
  id: string;
  url?: string | null;
  mode?: string | null;
  status?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  payment_intent?: Ref;
  subscription?: Ref;
  customer?: Ref;
  invoice?: Ref;
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
    // a subscription checkout is paid through its first invoice, not a bare payment intent
    paymentRef: idOf(s.payment_intent) ?? idOf(s.invoice),
    mode: s.mode === "subscription" ? "subscription" : "payment",
    subscriptionId: idOf(s.subscription),
    customerId: idOf(s.customer),
  };
}

interface StripeSubscription {
  id: string;
  status?: string | null;
  customer?: Ref;
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  /** top level before 2025-03-31, on the items since */
  current_period_end?: number | null;
  items?: { data?: { current_period_end?: number | null }[] } | null;
}

export function toSubscriptionState(s: StripeSubscription): SubscriptionState {
  const raw = s.status ?? "";
  const status =
    raw === "active" || raw === "trialing" || raw === "past_due"
      ? "active"
      : raw === "canceled" || raw === "unpaid" || raw === "incomplete_expired"
        ? "canceled"
        : "other";
  const periodEnd = s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
  return {
    id: s.id,
    status,
    currentPeriodEnd: typeof periodEnd === "number" ? periodEnd : null,
    cancelAtPeriodEnd: s.cancel_at_period_end === true || typeof s.cancel_at === "number",
    customerId: idOf(s.customer),
  };
}

interface StripeInvoice {
  id: string;
  amount_paid?: number | null;
  currency?: string | null;
  billing_reason?: string | null;
  /** top level before 2025-03-31, under parent since */
  subscription?: Ref;
  parent?: { subscription_details?: { subscription?: Ref } | null } | null;
}

export function toInvoiceState(inv: StripeInvoice): InvoiceState {
  return {
    id: inv.id,
    subscriptionId: idOf(inv.subscription) ?? idOf(inv.parent?.subscription_details?.subscription),
    amountPaid: typeof inv.amount_paid === "number" ? inv.amount_paid : 0,
    currency: inv.currency ?? null,
    billingReason: inv.billing_reason ?? null,
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
  livemode?: boolean;
  data?: { object?: Record<string, unknown> };
}): BillingEvent {
  const type = event.type ?? "";
  const object = event.data?.object;
  const out: BillingEvent = {
    id: event.id ?? "",
    type,
    livemode: event.livemode === true,
    kind: "ignored",
    session: null,
    subscription: null,
    invoice: null,
    paymentRef: null,
  };
  if (!object || typeof object.id !== "string") return out;

  if (type.startsWith("checkout.session.")) {
    const session = toSessionState(object as unknown as StripeSession);
    out.session = session;
    if (type === "checkout.session.completed") {
      // delayed methods complete the session before the money arrives
      out.kind = session.paid ? "paid" : "ignored";
    } else if (type === "checkout.session.async_payment_succeeded") {
      out.kind = "paid";
      session.paid = true;
    } else if (type === "checkout.session.async_payment_failed") {
      out.kind = "failed";
    } else if (type === "checkout.session.expired") {
      out.kind = "expired";
    }
  } else if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
    const subscription = toSubscriptionState(object as unknown as StripeSubscription);
    out.subscription = subscription;
    if (type === "customer.subscription.deleted") {
      subscription.status = "canceled";
      out.kind = "subscription_ended";
    } else if (subscription.status !== "other") {
      out.kind = subscription.status === "canceled" ? "subscription_ended" : "subscription_changed";
    }
  } else if (type === "invoice.paid") {
    const invoice = toInvoiceState(object as unknown as StripeInvoice);
    out.invoice = invoice;
    if (invoice.subscriptionId) out.kind = "invoice_paid";
  } else if (type === "charge.refunded") {
    // partial refunds are left to the admin: only a full refund takes credits back
    const ref = idOf(object.payment_intent as Ref);
    if (ref && object.refunded === true) {
      out.kind = "refunded";
      out.paymentRef = ref;
    }
  } else if (type === "charge.dispute.created") {
    const ref = idOf(object.payment_intent as Ref);
    if (ref) {
      out.kind = "disputed";
      out.paymentRef = ref;
    }
  }
  return out;
}

export function createStripeProvider(secretKey: string, webhookSecret: string | null): PaymentProvider {
  let portalConfiguration: string | null = null;

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
      let code: string | undefined;
      try {
        const error = (JSON.parse(text) as { error?: { message?: string; code?: string } }).error;
        message = error?.message ?? message;
        code = error?.code;
      } catch {
        // keep the raw text
      }
      throw new BillingProviderError(`Stripe ${res.status}: ${message}`, res.status, code);
    }
    return (await res.json()) as T;
  }

  /** One product per plan, created on first use; its id is derived from the plan. */
  async function ensurePlanProduct(planId: string, planName: string): Promise<string> {
    const id = `arcana_plan_${planId}`;
    try {
      await call("POST", "/v1/products", encodeForm({ id, name: `ARCANA ${planName} — สมาชิกรายเดือน` }));
    } catch (err) {
      if (!(err instanceof BillingProviderError && err.code === "resource_already_exists")) throw err;
    }
    return id;
  }

  async function ensurePortalConfiguration(): Promise<string> {
    if (portalConfiguration) return portalConfiguration;
    const existing = await call<{ data?: { id: string }[] }>(
      "GET",
      "/v1/billing_portal/configurations?active=true&limit=1",
    );
    const found = existing.data?.[0]?.id;
    if (found) return (portalConfiguration = found);
    const created = await call<{ id: string }>(
      "POST",
      "/v1/billing_portal/configurations",
      encodeForm({
        business_profile: { headline: "ARCANA INTELLIGENCE — จัดการสมาชิกของคุณ" },
        features: {
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: { enabled: true, mode: "at_period_end" },
        },
      }),
    );
    return (portalConfiguration = created.id);
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

    async createSubscriptionCheckout(input: SubscriptionCheckoutInput) {
      const product = await ensurePlanProduct(input.planId, input.planName);
      const session = await call<StripeSession>(
        "POST",
        "/v1/checkout/sessions",
        encodeForm({
          mode: "subscription",
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          client_reference_id: input.paymentId,
          customer_email: input.customerEmail || undefined,
          locale: "th",
          integration_identifier: PLAN_INTEGRATION_IDENTIFIER,
          expires_at: input.expiresAt,
          metadata: { payment_id: input.paymentId, plan: input.planId },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: input.currency,
                unit_amount: input.amountMinor,
                recurring: { interval: "month" },
                product,
              },
            },
          ],
        }),
        `arcana-subscribe-${input.paymentId}`,
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

    async getSubscription(subscriptionId: string) {
      if (!/^sub_[A-Za-z0-9_]+$/.test(subscriptionId)) {
        throw new BillingProviderError("invalid subscription id");
      }
      return toSubscriptionState(
        await call<StripeSubscription>("GET", `/v1/subscriptions/${subscriptionId}`),
      );
    },

    async createPortalSession(customerId: string, returnUrl: string) {
      if (!/^cus_[A-Za-z0-9_]+$/.test(customerId)) {
        throw new BillingProviderError("invalid customer id");
      }
      const open = (configuration?: string) =>
        call<{ url?: string }>(
          "POST",
          "/v1/billing_portal/sessions",
          encodeForm({ customer: customerId, return_url: returnUrl, locale: "th", configuration }),
        );
      let session: { url?: string };
      try {
        session = await open(portalConfiguration ?? undefined);
      } catch (err) {
        // an account that never saved its portal settings has no default configuration
        if (!(err instanceof BillingProviderError && /configuration/i.test(err.message))) throw err;
        session = await open(await ensurePortalConfiguration());
      }
      if (!session.url) throw new BillingProviderError("Stripe returned a portal session without a URL");
      return { url: session.url };
    },

    parseWebhook(rawBody: string, signatureHeader: string | null) {
      if (!webhookSecret) throw new WebhookSignatureError("webhook secret is not configured");
      verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
      return mapStripeEvent(JSON.parse(rawBody));
    },
  };
}
