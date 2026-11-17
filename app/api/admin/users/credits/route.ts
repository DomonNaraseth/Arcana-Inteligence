import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, rpcFailure } from "@/lib/admin";
import { fail } from "@/lib/api";

const bodySchema = z.object({
  ref: z.string().trim().min(4).max(80),
  amount: z.number().int().min(-100000).max(100000).refine((n) => n !== 0),
  note: z.string().trim().max(200).optional().default(""),
});

/** Grant (or, with a negative amount, correct) a user's credits. Audited. */
export const POST = adminRoute(async (admin, req) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", "กรอกจำนวนเครดิตเป็นจำนวนเต็มที่ไม่ใช่ 0", 400);
  const { data, error } = await admin.supabase.rpc("arcana_admin_grant_credits", {
    p_ref: parsed.data.ref,
    p_amount: parsed.data.amount,
    p_note: parsed.data.note,
  });
  if (error) return rpcFailure(error);
  return NextResponse.json({ ok: true, balance: (data as { balance: number }).balance });
});
