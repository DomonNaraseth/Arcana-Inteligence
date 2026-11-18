import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { getSystemClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; nothing else may run this. */
function fromCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (secret.length < 16 || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Daily housekeeping (03:00 Bangkok):
 * - closes PromptPay orders that were never paid nor reported after 48 hours,
 *   so the owner's review list only shows orders that can still arrive.
 * It grants nothing and never touches a paid, reported or Stripe payment.
 */
export async function GET(req: Request) {
  if (!fromCron(req)) return fail("not_found", "Not found", 404);
  const supabase = getSystemClient();
  const { data, error } = await supabase.rpc("arcana_expire_stale_payments", { p_hours: 48 });
  if (error) {
    console.error("[arcana] cron expire payments failed:", error.message);
    return fail("server_error", "cron failed", 500);
  }
  return NextResponse.json({ ok: true, expired_payments: data ?? 0 });
}
