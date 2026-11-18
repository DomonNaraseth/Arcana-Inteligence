import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/api";
import { formatThb } from "@/lib/billing/provider";
import { notifyAdmin } from "@/lib/notify";
import { ConfigError, getContext } from "@/lib/supabase/server";

const bodySchema = z.object({
  paymentId: z.string().uuid(),
  /** what helps the admin find the transfer: time, sending bank, sender name */
  note: z.string().trim().min(3).max(200),
});

/**
 * "I have transferred" — used when no slip-verification service is configured
 * or it could not read the slip. It grants nothing: an admin compares it with
 * the bank statement and approves or rejects the payment.
 */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail("bad_request", "กรุณาระบุเวลาที่โอนและชื่อบัญชีผู้โอนเพื่อให้ผู้ดูแลตรวจสอบได้", 400);
    }
    const { supabase } = await getContext();
    const { data, error } = await supabase.rpc("arcana_claim_promptpay", {
      p_id: parsed.data.paymentId,
      p_note: parsed.data.note,
    });
    if (error) {
      console.error("[arcana] promptpay claim failed:", error.message);
      return fail("server_error", "แจ้งโอนไม่สำเร็จ กรุณาลองใหม่", 500);
    }
    if (data !== true) return fail("not_found", "ไม่พบรายการที่รอชำระเงิน", 404);

    // no customer details in the notice: amount, package and where to look
    const { data: payment } = await supabase.rpc("arcana_my_payment", { p_id: parsed.data.paymentId });
    const row = payment as { amount_minor: number; package_name: string } | null;
    if (row) {
      await notifyAdmin(
        `ARCANA: มีลูกค้าแจ้งโอน ${formatThb(row.amount_minor)} (${row.package_name}) — ตรวจยอดเข้าแล้วอนุมัติที่ ${new URL(req.url).origin}/admin/payments`,
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ConfigError) return fail("config_missing", "ระบบฐานข้อมูลยังไม่ได้ตั้งค่า", 503);
    console.error("[arcana] promptpay claim failed:", err);
    return fail("server_error", "แจ้งโอนไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
