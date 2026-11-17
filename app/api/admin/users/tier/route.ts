import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, rpcFailure } from "@/lib/admin";
import { fail } from "@/lib/api";

const bodySchema = z.object({
  ref: z.string().trim().min(4).max(80),
  tier: z.enum(["free", "basic", "premium", "unlimited"]),
  /** ISO date; null = no expiry */
  periodEnd: z.string().datetime().nullable().optional(),
});

/** Set a user's subscription tier manually (no payment gateway yet). Audited. */
export const POST = adminRoute(async (admin, req) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", "ข้อมูลแพ็กเกจไม่ถูกต้อง", 400);
  const { error } = await admin.supabase.rpc("arcana_admin_set_tier", {
    p_ref: parsed.data.ref,
    p_tier: parsed.data.tier,
    p_period_end: parsed.data.periodEnd ?? null,
  });
  if (error) return rpcFailure(error);
  return NextResponse.json({ ok: true });
});
