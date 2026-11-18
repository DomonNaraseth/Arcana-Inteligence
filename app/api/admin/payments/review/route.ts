import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, rpcFailure } from "@/lib/admin";
import { fail } from "@/lib/api";

const bodySchema = z.object({
  paymentId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
});

/**
 * An admin confirms (or rejects) a PromptPay transfer after checking the bank
 * statement. Approval grants the credits through the same audited database
 * function the slip check uses; it is idempotent.
 */
export const POST = adminRoute(async (admin, req) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", "ข้อมูลรายการไม่ถูกต้อง", 400);

  if (parsed.data.action === "approve") {
    const { data, error } = await admin.supabase.rpc("arcana_admin_approve_promptpay", {
      p_id: parsed.data.paymentId,
    });
    if (error) return rpcFailure(error);
    const result = data as { ok: boolean; reason?: string; credited?: number };
    if (!result.ok) return fail("bad_request", `อนุมัติไม่ได้ (${result.reason ?? "unknown"})`, 409);
    return NextResponse.json({ ok: true, credited: result.credited ?? 0 });
  }

  const { data, error } = await admin.supabase.rpc("arcana_admin_reject_promptpay", {
    p_id: parsed.data.paymentId,
  });
  if (error) return rpcFailure(error);
  if (data !== true) return fail("bad_request", "รายการนี้ไม่ได้อยู่ในสถานะรอชำระเงิน", 409);
  return NextResponse.json({ ok: true });
});
