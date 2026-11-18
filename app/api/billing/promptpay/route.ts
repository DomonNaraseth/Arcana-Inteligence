import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminCaller } from "@/lib/admin";
import { fail } from "@/lib/api";
import { gatewayFor } from "@/lib/billing/gateway";
import { toMinor } from "@/lib/billing/provider";
import { promptPayConfig } from "@/lib/billing/promptpay";
import { planLabel } from "@/lib/billing/service";
import { getSettings, planFor } from "@/lib/settings";
import { ConfigError, getContext } from "@/lib/supabase/server";

const bodySchema = z.union([
  z.object({ packageId: z.string().min(1).max(40) }).strict(),
  z.object({ planId: z.enum(["basic", "premium"]) }).strict(),
]);

/**
 * Starts a PromptPay purchase: records what is being bought at the server-side
 * price and sends the customer to the payment page, where the QR carries that
 * exact amount. Nothing is granted here.
 */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", "ไม่พบแพ็กเกจที่เลือก", 400);

    const { supabase, isGuest } = await getContext();
    const settings = await getSettings(supabase);
    if (!settings.credits.enabled) return fail("bad_request", "ระบบเครดิตยังไม่เปิดใช้งาน", 400);
    // automatic QR (gateway) or a transfer to the owner's own PromptPay
    const gateway = gatewayFor(await isAdminCaller(supabase));
    if (!gateway && !promptPayConfig(settings)) {
      return fail("billing_not_configured", "ระบบชำระเงินยังไม่เปิดให้บริการ (Configuration Missing)", 503);
    }

    const isPlan = "planId" in parsed.data;
    // a membership must belong to an account that can be signed in to again
    const devGuest = process.env.NODE_ENV !== "production" && process.env.ARCANA_DEV_GUEST_SUBSCRIBE === "1";
    const requireAccount = isPlan ? !devGuest : settings.billing.require_account;
    if (requireAccount && isGuest) {
      return fail("forbidden", isPlan ? "กรุณาเข้าสู่ระบบก่อนสมัครสมาชิก" : "กรุณาเข้าสู่ระบบก่อนซื้อเครดิต", 403);
    }

    let item: { kind: "credits" | "subscription"; id: string; name: string; credits: number; priceThb: number; planId: string | null };
    if ("planId" in parsed.data) {
      const plan = planFor(settings, parsed.data.planId);
      if (!plan) return fail("not_found", "แพ็กเกจสมาชิกนี้ยังไม่เปิดจำหน่าย", 404);
      item = { kind: "subscription", id: `plan:${plan.id}`, name: planLabel(plan.name, "prepaid"), credits: plan.monthly_credits, priceThb: plan.price_thb, planId: plan.id };
    } else {
      const packageId = parsed.data.packageId;
      const pkg = settings.packages.find((p) => p.id === packageId);
      if (!pkg) return fail("not_found", "ไม่พบแพ็กเกจที่เลือก", 404);
      item = { kind: "credits", id: pkg.id, name: pkg.name, credits: pkg.credits, priceThb: pkg.price_thb, planId: null };
    }
    const amountMinor = toMinor(item.priceThb);
    if (amountMinor < 100) return fail("bad_request", "แพ็กเกจนี้ยังไม่พร้อมจำหน่าย", 400);

    const { data: paymentId, error } = await supabase.rpc("arcana_create_promptpay_payment", {
      p_kind: item.kind,
      p_package_id: item.id,
      p_package_name: item.name,
      p_credits: item.credits,
      p_amount_minor: amountMinor,
      p_plan_id: item.planId,
      // a development build or a gateway test (playground) key never records real revenue
      p_livemode: process.env.NODE_ENV === "production" && (gateway ? gateway.live : true),
      p_require_account: requireAccount,
    });
    if (error || typeof paymentId !== "string") {
      if (error?.message.includes("too many payment attempts")) {
        return fail("quota_exceeded", "มีการเริ่มชำระเงินถี่เกินไป กรุณารอสักครู่แล้วลองใหม่", 429);
      }
      console.error("[arcana] create promptpay payment failed:", error?.message);
      return fail("server_error", "เริ่มการชำระเงินไม่สำเร็จ กรุณาลองใหม่", 500);
    }
    return NextResponse.json({ url: `/pay/${paymentId}`, paymentId });
  } catch (err) {
    if (err instanceof ConfigError) return fail("config_missing", "ระบบฐานข้อมูลยังไม่ได้ตั้งค่า", 503);
    console.error("[arcana] promptpay start failed:", err);
    return fail("server_error", "เริ่มการชำระเงินไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
