import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminCaller } from "@/lib/admin";
import { fail } from "@/lib/api";
import { BeamError } from "@/lib/billing/beam";
import { createCardCheckout, gatewayFor } from "@/lib/billing/gateway";
import { ConfigError, getContext } from "@/lib/supabase/server";

const bodySchema = z.object({ paymentId: z.string().uuid() }).strict();

/**
 * Card payment for the caller's own pending order: a single-use checkout on
 * Beam's hosted page (card details never touch our site). The price is the
 * order's server-side amount; success is confirmed by Beam, as for QR.
 */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", "ไม่พบรายการชำระเงิน", 400);
    const { supabase } = await getContext();
    const beam = gatewayFor(await isAdminCaller(supabase));
    if (!beam) return fail("billing_not_configured", "การชำระด้วยบัตรยังไม่เปิดใช้งาน", 503);

    const { data } = await supabase.rpc("arcana_my_payment", { p_id: parsed.data.paymentId });
    const payment = data as {
      id: string;
      status: string;
      provider: string;
      amount_minor: number;
      package_name: string;
    } | null;
    if (!payment || payment.provider !== "promptpay") return fail("not_found", "ไม่พบรายการชำระเงิน", 404);
    if (payment.status !== "pending") return fail("bad_request", "รายการนี้ปิดไปแล้ว", 409);

    const url = await createCardCheckout(supabase, beam, payment, new URL(req.url).origin);
    return NextResponse.json({ url }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof ConfigError) return fail("config_missing", "ระบบฐานข้อมูลยังไม่ได้ตั้งค่า", 503);
    if (err instanceof BeamError) {
      console.error("[arcana] beam card link failed:", err.message);
      return fail("billing_unavailable", "เปิดหน้าชำระด้วยบัตรไม่สำเร็จชั่วคราว กรุณาลองใหม่ หรือสแกน QR แทน", 502);
    }
    console.error("[arcana] card checkout failed:", err);
    return fail("server_error", "เปิดหน้าชำระด้วยบัตรไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
