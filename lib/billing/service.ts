import type { SupabaseClient } from "@supabase/supabase-js";
import { planFor, type Settings } from "../settings";
import type { BillingEvent, PaymentProvider, SessionState } from "./provider";

export interface PaymentRow {
  id: string;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  credits: number;
  amount_minor: number;
  currency: string;
  package_name: string;
  created_at: string;
  paid_at: string | null;
}

export interface FulfillResult {
  ok: boolean;
  credited?: number;
  status?: string;
  reason?: string;
  kind?: "credits" | "subscription";
}

export interface MySubscription {
  tier: "free" | "basic" | "premium" | "unlimited";
  status: "active" | "canceled" | "expired";
  plan_id: string | null;
  source: "admin" | "stripe";
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /** the provider knows this customer, so the billing portal can be opened */
  manageable: boolean;
  active: boolean;
}

/** Plan names as stored with a payment and shown in history. */
export const planLabel = (name: string) => `${name} (รายเดือน)`;

const isoFromUnix = (seconds: number | null) =>
  typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;

/**
 * Grants the credits of a payment the provider reports as paid. The database
 * function re-checks the session id, amount and currency against what was
 * recorded when the checkout was created, and is idempotent — the webhook and
 * the return-page confirmation can both call this safely.
 */
export async function fulfillFromSession(
  supabase: SupabaseClient,
  session: SessionState,
): Promise<FulfillResult> {
  if (!session.paid || !session.paymentId) return { ok: false, reason: "not_paid" };
  if (!/^[0-9a-f-]{36}$/i.test(session.paymentId)) return { ok: false, reason: "bad_payment_id" };
  const { data, error } = await supabase.rpc("arcana_fulfill_payment", {
    p_id: session.paymentId,
    p_session_id: session.sessionId,
    p_amount_minor: session.amountMinor,
    p_currency: session.currency,
    p_payment_ref: session.paymentRef ?? "",
  });
  if (error) throw new Error(`fulfil failed: ${error.message}`);
  return data as FulfillResult;
}

/**
 * Fulfils a paid checkout and, for a membership checkout, starts the
 * membership. The subscription's state is read from the provider, never from
 * the browser. Safe to call repeatedly.
 */
export async function settlePaidSession(
  supabase: SupabaseClient,
  provider: PaymentProvider,
  session: SessionState,
): Promise<FulfillResult> {
  const result = await fulfillFromSession(supabase, session);
  if (!result.ok || session.mode !== "subscription") return result;
  if (!session.subscriptionId) return { ok: false, reason: "no_subscription" };

  const subscription = await provider.getSubscription(session.subscriptionId);
  // a late redelivery of an old checkout must not revive a membership that has ended
  if (subscription.status !== "active") return result;
  const { data, error } = await supabase.rpc("arcana_activate_subscription", {
    p_payment_id: session.paymentId,
    p_subscription_id: subscription.id,
    p_customer_id: subscription.customerId ?? session.customerId ?? "",
    p_period_end: isoFromUnix(subscription.currentPeriodEnd),
    p_cancel_at_period_end: subscription.cancelAtPeriodEnd,
  });
  if (error) throw new Error(`activate subscription failed: ${error.message}`);
  const activated = data as { ok: boolean; reason?: string };
  return activated.ok ? result : { ok: false, reason: activated.reason ?? "activation_failed" };
}

export async function markUnsuccessful(
  supabase: SupabaseClient,
  session: SessionState,
  status: "failed" | "expired",
): Promise<void> {
  if (!session.paymentId || !/^[0-9a-f-]{36}$/i.test(session.paymentId)) return;
  const { error } = await supabase.rpc("arcana_mark_payment", {
    p_id: session.paymentId,
    p_session_id: session.sessionId,
    p_status: status,
  });
  if (error) throw new Error(`mark payment failed: ${error.message}`);
}

/**
 * Applies one verified provider event. Returns a reason when the event could
 * not be applied (logged by the caller); throws only for our own failures, so
 * the provider retries.
 */
export async function handleBillingEvent(
  supabase: SupabaseClient,
  provider: PaymentProvider,
  event: BillingEvent,
  settings: Settings,
): Promise<{ ok: boolean; reason?: string }> {
  switch (event.kind) {
    case "paid": {
      if (!event.session) return { ok: false, reason: "no_session" };
      const result = await settlePaidSession(supabase, provider, event.session);
      return result.ok ? { ok: true } : { ok: false, reason: result.reason };
    }
    case "failed":
    case "expired":
      if (event.session) await markUnsuccessful(supabase, event.session, event.kind);
      return { ok: true };

    case "subscription_changed":
    case "subscription_ended": {
      const s = event.subscription;
      if (!s) return { ok: false, reason: "no_subscription" };
      const { data, error } = await supabase.rpc("arcana_sync_subscription", {
        p_subscription_id: s.id,
        p_status: event.kind === "subscription_ended" ? "canceled" : "active",
        p_period_end: isoFromUnix(s.currentPeriodEnd),
        p_cancel_at_period_end: s.cancelAtPeriodEnd,
      });
      if (error) throw new Error(`sync subscription failed: ${error.message}`);
      // an update can arrive before the checkout that creates our row: not an error
      return { ok: true, reason: (data as { ok: boolean }).ok ? undefined : "unknown_subscription" };
    }

    case "invoice_paid": {
      const invoice = event.invoice;
      if (!invoice?.subscriptionId) return { ok: false, reason: "no_subscription" };
      // the first invoice is credited through the checkout session it belongs to
      if (invoice.billingReason === "subscription_create") return { ok: true };

      const planId = await supabase.rpc("arcana_subscription_plan", {
        p_subscription_id: invoice.subscriptionId,
      });
      if (planId.error) throw new Error(`plan lookup failed: ${planId.error.message}`);
      if (typeof planId.data !== "string") return { ok: false, reason: "unknown_subscription" };
      const plan = planFor(settings, planId.data);
      if (!plan) return { ok: false, reason: `plan_not_configured:${planId.data}` };

      const subscription = await provider.getSubscription(invoice.subscriptionId);
      const { data, error } = await supabase.rpc("arcana_renew_subscription", {
        p_subscription_id: invoice.subscriptionId,
        p_invoice_id: invoice.id,
        p_amount_minor: invoice.amountPaid,
        p_currency: invoice.currency ?? "thb",
        p_credits: plan.monthly_credits,
        p_plan_name: planLabel(plan.name),
        p_period_end: isoFromUnix(subscription.currentPeriodEnd),
        p_livemode: event.livemode,
      });
      if (error) throw new Error(`renew subscription failed: ${error.message}`);
      const renewed = data as { ok: boolean; reason?: string };
      return renewed.ok ? { ok: true } : { ok: false, reason: renewed.reason };
    }

    case "refunded":
    case "disputed": {
      if (!event.paymentRef) return { ok: false, reason: "no_payment_ref" };
      const { data, error } = await supabase.rpc("arcana_refund_payment", {
        p_payment_ref: event.paymentRef,
        p_reason: event.kind === "disputed" ? "dispute" : "refund",
      });
      if (error) throw new Error(`refund failed: ${error.message}`);
      const refunded = data as { ok: boolean; reason?: string };
      // membership charges are not in scope here: corrected by an admin
      return { ok: true, reason: refunded.ok ? undefined : refunded.reason };
    }

    default:
      return { ok: true };
  }
}
