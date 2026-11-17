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
}

export interface BillingEvent {
  id: string;
  type: string;
  kind: "paid" | "failed" | "expired" | "ignored";
  session: SessionState | null;
}

export interface PaymentProvider {
  id: "stripe";
  /** false = test mode: no real money moves */
  livemode: boolean;
  webhookConfigured: boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  getSession(sessionId: string): Promise<SessionState>;
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
