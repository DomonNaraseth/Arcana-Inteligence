import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/api";
import {
  BillingProviderError,
  billingProvider,
  cardCheckoutOpen,
  checkoutExpiry,
  toMinor,
} from "@/lib/billing/provider";
import { isAdminCaller } from "@/lib/admin";
import { planLabel } from "@/lib/billing/service";
import { getSettings, planFor } from "@/lib/settings";
import { ConfigError, getContext } from "@/lib/supabase/server";

const bodySchema = z.object({ planId: z.enum(["basic", "premium"]) });

/**
 * Starts a monthly membership: records the intent, then creates a hosted
 * subscription checkout at the payment provider. The price and the monthly
 * credits come from server-side settings — never from the browser.
 */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", "ไม่พบแพ็กเกจสมาชิกที่เลือก", 400);

    const { supabase, user, isGuest } = await getContext();
    if (!cardCheckoutOpen(await isAdminCaller(supabase))) {
      return fail(
        "billing_not_configured",
        "ระบบชำระเงินยังไม่เปิดให้บริการ (Configuration Missing)",
        503,
      );
    }
    const provider = billingProvider();
    if (!provider) {
      return fail(
        "billing_not_configured",
        "ระบบชำระเงินยังไม่เปิดให้บริการ (Configuration Missing)",
        503,
      );
    }
    const settings = await getSettings(supabase);
    if (!settings.credits.enabled) {
      return fail("bad_request", "ระบบเครดิตยังไม่เปิดใช้งาน", 400);
    }
    // a membership renews every month, so it must belong to an account that can
    // be signed in to again — not to a browser cookie (dev-only escape hatch for tests)
    const allowGuest =
      process.env.NODE_ENV !== "production" && process.env.ARCANA_DEV_GUEST_SUBSCRIBE === "1";
    if (isGuest && !allowGuest) {
      return fail("forbidden", "กรุณาเข้าสู่ระบบก่อนสมัครสมาชิกรายเดือน", 403);
    }

    const plan = planFor(settings, parsed.data.planId);
    if (!plan) return fail("not_found", "แพ็กเกจสมาชิกนี้ยังไม่เปิดจำหน่าย", 404);
    const amountMinor = toMinor(plan.price_thb);
    if (amountMinor < 1000) {
      return fail("bad_request", "แพ็กเกจนี้ยังไม่พร้อมจำหน่าย (ราคาต่ำกว่าขั้นต่ำ 10 บาท)", 400);
    }

    const { data: paymentId, error } = await supabase.rpc("arcana_create_subscription_payment", {
      p_provider: provider.id,
      p_plan_id: plan.id,
      p_plan_name: planLabel(plan.name),
      p_credits: plan.monthly_credits,
      p_amount_minor: amountMinor,
      p_livemode: provider.livemode,
      p_allow_guest: allowGuest,
    });
    if (error || typeof paymentId !== "string") {
      if (error?.message.includes("already subscribed")) {
        return fail(
          "bad_request",
          "คุณเป็นสมาชิกอยู่แล้ว — เปลี่ยนหรือยกเลิกแพ็กเกจได้ที่ปุ่ม \"จัดการสมาชิก\" ในหน้าบัญชี",
          409,
        );
      }
      if (error?.message.includes("too many payment attempts")) {
        return fail("quota_exceeded", "มีการเริ่มชำระเงินถี่เกินไป กรุณารอสักครู่แล้วลองใหม่", 429);
      }
      console.error("[arcana] create subscription payment failed:", error?.message);
      return fail("server_error", "เริ่มการสมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่", 500);
    }

    const origin = new URL(req.url).origin;
    const session = await provider.createSubscriptionCheckout({
      paymentId,
      planId: plan.id,
      planName: plan.name,
      amountMinor,
      currency: "thb",
      successUrl: `${origin}/account?payment=success&pid=${paymentId}`,
      cancelUrl: `${origin}/pricing?payment=cancelled`,
      customerEmail: user?.email ?? null,
      expiresAt: checkoutExpiry(),
    });

    const attached = await supabase.rpc("arcana_attach_payment_session", {
      p_id: paymentId,
      p_session_id: session.sessionId,
    });
    if (attached.error || attached.data !== true) {
      console.error("[arcana] attach session failed:", attached.error?.message);
      return fail("server_error", "เริ่มการสมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่", 500);
    }

    return NextResponse.json({ url: session.url, paymentId });
  } catch (err) {
    if (err instanceof ConfigError) return fail("config_missing", "ระบบฐานข้อมูลยังไม่ได้ตั้งค่า", 503);
    if (err instanceof BillingProviderError) {
      console.error("[arcana] payment provider error:", err.message);
      return fail(
        "billing_unavailable",
        "ไม่สามารถเชื่อมต่อผู้ให้บริการชำระเงินได้ กรุณาลองใหม่ ยังไม่มีการตัดเงิน",
        502,
      );
    }
    console.error("[arcana] subscribe failed:", err);
    return fail("server_error", "เริ่มการสมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
