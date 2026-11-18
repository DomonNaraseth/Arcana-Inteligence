import { createStripeProvider } from "./stripe";

/**
 * Payment provider adapter. Business logic talks to this interface only, so
 * another gateway (e.g. Omise) can be added without touching checkout,
 * fulfilment or the UI. Card data never touches this application: the user
 * pays on the provider's own hosted page.
 */

export interface CheckoutInput {
  paymentId: string;
  packageName: string;
  credits: number;
  /** smallest currency unit (satang for THB) */
  amountMinor: number;
  currency: "thb";
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  /**
   * Unix seconds at which an unpaid checkout closes. Fixed by the caller so a
   * retry with the same input sends identical parameters (the provider rejects
   * an idempotency key reused with different ones).
   */
  expiresAt: number;
}

/** Just above Stripe's 30-minute minimum, so abandoned checkouts close quickly. */
export function checkoutExpiry(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000) + 31 * 60;
}

export interface SubscriptionCheckoutInput {
  paymentId: string;
  /** the tier the plan grants; also names the provider-side product */
  planId: "basic" | "premium";
  planName: string;
  /** price per month, smallest currency unit */
  amountMinor: number;
  currency: "thb";
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  expiresAt: number;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
}

/** Provider-reported state of a checkout, normalised. */
export interface SessionState {
  sessionId: string;
  /** our arcana_payments.id, echoed back by the provider */
  paymentId: string | null;
  paid: boolean;
  status: "open" | "complete" | "expired";
  amountMinor: number | null;
  currency: string | null;
  paymentRef: string | null;
  mode: "payment" | "subscription";
  subscriptionId: string | null;
  customerId: string | null;
}

/** Provider-reported state of a recurring membership, normalised. */
export interface SubscriptionState {
  id: string;
  /** "active" also covers a payment being retried — access ends when the paid period does */
  status: "active" | "canceled" | "other";
  /** unix seconds */
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  customerId: string | null;
}

export interface InvoiceState {
  id: string;
  subscriptionId: string | null;
  amountPaid: number;
  currency: string | null;
  /** "subscription_create" for the first invoice, "subscription_cycle" for renewals */
  billingReason: string | null;
}

export interface BillingEvent {
  id: string;
  type: string;
  livemode: boolean;
  kind:
    | "paid"
    | "failed"
    | "expired"
    | "subscription_changed"
    | "subscription_ended"
    | "invoice_paid"
    | "refunded"
    | "disputed"
    | "ignored";
  session: SessionState | null;
  subscription: SubscriptionState | null;
  invoice: InvoiceState | null;
  /** provider payment reference of a refunded or disputed charge */
  paymentRef: string | null;
}

export interface PaymentProvider {
  id: "stripe";
  /** false = test mode: no real money moves */
  livemode: boolean;
  webhookConfigured: boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  createSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<CheckoutSession>;
  getSession(sessionId: string): Promise<SessionState>;
  getSubscription(subscriptionId: string): Promise<SubscriptionState>;
  /** A provider-hosted page where the customer cancels or changes the card. */
  createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
  /** Verifies the signature and parses the event. Throws WebhookSignatureError. */
  parseWebhook(rawBody: string, signatureHeader: string | null): BillingEvent;
}

export class BillingNotConfiguredError extends Error {
  constructor() {
    super("Payment provider is not configured");
  }
}

export class BillingProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
  ) {
    super(message);
  }
}

export class WebhookSignatureError extends Error {}

/** null when no provider credentials are configured — never a fake provider. */
export function billingProvider(): PaymentProvider | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return createStripeProvider(key, process.env.STRIPE_WEBHOOK_SECRET?.trim() || null);
}

export function billingStatus(): {
  configured: boolean;
  provider: "stripe" | null;
  livemode: boolean;
  webhookConfigured: boolean;
} {
  const p = billingProvider();
  return {
    configured: Boolean(p),
    provider: p?.id ?? null,
    livemode: p?.livemode ?? false,
    webhookConfigured: p?.webhookConfigured ?? false,
  };
}

/**
 * Whether the card checkout may be offered to this visitor. A test-mode key on
 * the production site takes test cards, which cost nothing — so there it is
 * open to admins only, or anyone could give themselves credits.
 */
export function cardCheckoutOpen(isAdmin: boolean): boolean {
  const status = billingStatus();
  if (!status.configured) return false;
  return status.livemode || isAdmin || process.env.NODE_ENV !== "production";
}

/** THB price → satang, rounded to the nearest satang. */
export function toMinor(priceThb: number): number {
  return Math.round(priceThb * 100);
}

export function formatThb(amountMinor: number): string {
  return `฿${(amountMinor / 100).toLocaleString("th-TH", {
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
