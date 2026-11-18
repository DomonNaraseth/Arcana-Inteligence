import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminCaller } from "@/lib/admin";
import { fail } from "@/lib/api";
import { BeamError } from "@/lib/billing/beam";
import { ensureQr, gatewayFor } from "@/lib/billing/gateway";
import { ConfigError, getContext } from "@/lib/supabase/server";

const bodySchema = z.object({ paymentId: z.string().uuid(), renew: z.boolean().optional() }).strict();

/** A gateway QR for the caller's own pending payment (a new one when asked, or when the old one expired). */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", "ไม่พบรายการชำระเงิน", 400);
    const { supabase } = await getContext();
    const beam = gatewayFor(await isAdminCaller(supabase));
    if (!beam) return fail("billing_not_configured", "ระบบชำระเงินอัตโนมัติยังไม่เปิดใช้งาน", 503);

    const { data } = await supabase.rpc("arcana_my_payment", { p_id: parsed.data.paymentId });
    const payment = data as { id: string; status: string; provider: string; amount_minor: number } | null;
    if (!payment || payment.provider !== "promptpay") return fail("not_found", "ไม่พบรายการชำระเงิน", 404);
    if (payment.status !== "pending") return fail("bad_request", "รายการนี้ปิดไปแล้ว", 409);

    const origin = new URL(req.url).origin;
    const qr = await ensureQr(supabase, beam, payment, origin, { renew: parsed.data.renew });
    return NextResponse.json(qr, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof ConfigError) return fail("config_missing", "ระบบฐานข้อมูลยังไม่ได้ตั้งค่า", 503);
    if (err instanceof BeamError) {
      console.error("[arcana] beam qr failed:", err.message);
      return fail("billing_unavailable", "สร้าง QR ไม่สำเร็จชั่วคราว กรุณาลองใหม่", 502);
    }
    console.error("[arcana] gateway qr failed:", err);
    return fail("server_error", "สร้าง QR ไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
