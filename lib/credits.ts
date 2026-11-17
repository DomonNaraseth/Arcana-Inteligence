import type { SupabaseClient } from "@supabase/supabase-js";

export interface WalletTransaction {
  amount: number;
  kind: "daily_grant" | "admin_grant" | "purchase" | "spend" | "refund";
  feature: string | null;
  note: string | null;
  created_at: string;
}

export interface Wallet {
  enabled: boolean;
  /** public, non-secret user reference (safe to show and to give to support) */
  ref: string;
  tier: "free" | "basic" | "premium" | "unlimited";
  daily: number;
  balance: number;
  transactions: WalletTransaction[];
}

export const TIER_TH: Record<Wallet["tier"], string> = {
  free: "Free",
  basic: "Basic",
  premium: "Premium",
  unlimited: "Unlimited",
};

/** Loads the wallet; when credits are enabled this also applies today's top-up. */
export async function getWallet(supabase: SupabaseClient): Promise<Wallet | null> {
  const { data, error } = await supabase.rpc("arcana_wallet");
  if (error || !data) {
    if (error) console.error("[arcana] wallet load failed:", error.message);
    return null;
  }
  return data as Wallet;
}

/**
 * Deducts credits atomically. Idempotent on `idempotencyKey`, so a retried
 * request can never be charged twice. Call only after the paid work succeeded.
 */
export async function spendCredits(
  supabase: SupabaseClient,
  args: { amount: number; feature: string; readingId: string; idempotencyKey: string },
): Promise<{ ok: boolean; charged: number; balance?: number }> {
  if (args.amount <= 0) return { ok: true, charged: 0 };
  const { data, error } = await supabase.rpc("arcana_spend_credits", {
    p_amount: args.amount,
    p_feature: args.feature,
    p_reading_id: args.readingId,
    p_idem: args.idempotencyKey,
  });
  if (error) {
    console.error("[arcana] credit spend failed:", error.message);
    return { ok: false, charged: 0 };
  }
  return data as { ok: boolean; charged: number; balance?: number };
}
