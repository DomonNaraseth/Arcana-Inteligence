import type { SupabaseClient } from "@supabase/supabase-js";
import { beamConfig, createQrCharge, getCharge, QR_MINUTES, type BeamConfig } from "./beam";

/**
 * Automatic PromptPay: a QR issued by the gateway for one payment, confirmed
 * by the gateway — no slip. Live keys serve everyone; playground (test) keys
 * serve admins only, like a test card key (rule 10).
 */
export function gatewayFor(isAdmin: boolean): BeamConfig | null {
  const c = beamConfig();
  if (!c) return null;
  return c.live || isAdmin ? c : null;
}

export interface GatewayQr {
  /** data: URL of the QR image */
  qr: string;
  expiresAt: string;
}

type ChargeRow = { charge_id: string; qr_image: string; expires_at: string } | null;

/** The payment's current QR, or a new one when there is none or it is about to expire. */
export async function ensureQr(
  supabase: SupabaseClient,
  beam: BeamConfig,
  payment: { id: string; amount_minor: number },
  origin: string,
  opts: { renew?: boolean } = {},
): Promise<GatewayQr> {
  if (!opts.renew) {
    const { data } = await supabase.rpc("arcana_my_gateway_charge", { p_payment_id: payment.id });
    const row = data as ChargeRow;
    if (row && Date.parse(row.expires_at) - Date.now() > 60_000) {
      return { qr: `data:image/png;base64,${row.qr_image}`, expiresAt: row.expires_at };
    }
  }
  const expiresAt = new Date(Date.now() + QR_MINUTES * 60_000);
  const charge = await createQrCharge(beam, {
    amountMinor: payment.amount_minor,
    referenceId: payment.id,
    returnUrl: `${origin}/pay/${payment.id}`,
    expiresAt,
  });
  const { data: ok, error } = await supabase.rpc("arcana_attach_gateway_charge", {
    p_payment_id: payment.id,
    p_charge_id: charge.chargeId,
    p_qr_image: charge.imageBase64,
    p_expires_at: charge.expiresAt,
  });
  if (error || !ok) throw new Error(`could not record gateway charge: ${error?.message ?? "not allowed"}`);
  return { qr: `data:image/png;base64,${charge.imageBase64}`, expiresAt: charge.expiresAt };
}

export interface FulfilResult {
  ok: boolean;
  reason?: string;
  credited?: number;
  status?: string;
}

/**
 * Asks the gateway about one charge and, when it is paid, grants the payment.
 * `system` must be the server-credential client: the grant re-checks the
 * reference, amount and currency in SQL.
 */
export async function settleCharge(system: SupabaseClient, beam: BeamConfig, chargeId: string): Promise<FulfilResult> {
  const charge = await getCharge(beam, chargeId);
  if (charge.status !== "SUCCEEDED") return { ok: false, reason: charge.status.toLowerCase() };
  const { data, error } = await system.rpc("arcana_fulfill_gateway", {
    p_charge_id: charge.chargeId,
    p_reference_id: charge.referenceId,
    p_amount_minor: charge.amount,
    p_currency: charge.currency,
    p_provider: "beam",
  });
  if (error) throw new Error(`fulfil failed: ${error.message}`);
  return data as FulfilResult;
}

/** While the pay page waits: checks every charge of the payment (an older QR may be the one paid). */
export async function settlePayment(
  supabase: SupabaseClient,
  system: SupabaseClient,
  beam: BeamConfig,
  paymentId: string,
): Promise<FulfilResult | null> {
  const { data } = await supabase.rpc("arcana_my_gateway_charge_ids", { p_payment_id: paymentId });
  for (const id of ((data as string[] | null) ?? []).slice(0, 5)) {
    const r = await settleCharge(system, beam, id);
    if (r.ok) return r;
  }
  return null;
}
