import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionState } from "./provider";

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
}

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
