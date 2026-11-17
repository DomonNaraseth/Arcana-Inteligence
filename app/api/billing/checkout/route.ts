import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/api";
import { BillingProviderError, billingProvider, toMinor } from "@/lib/billing/provider";
import { getSettings } from "@/lib/settings";
import { ConfigError, getContext } from "@/lib/supabase/server";

const bodySchema = z.object({ packageId: z.string().min(1).max(40) });

/**
 * Starts a credit purchase: records the intent, then creates a hosted
 * checkout at the payment provider and returns its URL. The price and credit
 * amount come from server-side settings — never from the browser.
 */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", "ไม่พบแพ็กเกจที่เลือก", 400);

    const provider = billingProvider();
    if (!provider) {
      return fail(
        "billing_not_configured",
        "ระบบชำระเงินยังไม่เปิดให้บริการ (Configuration Missing)",
        503,
      );
    }

    const { supabase, user, isGuest } = await getContext();
    const settings = await getSettings(supabase);
    if (!settings.credits.enabled) {
      return fail("bad_request", "ระบบเครดิตยังไม่เปิดใช้งาน", 400);
    }
    if (settings.billing.require_account && isGuest) {
      return fail("forbidden", "กรุณาเข้าสู่ระบบก่อนซื้อเครดิต", 403);
    }

    const pkg = settings.packages.find((p) => p.id === parsed.data.packageId);
    if (!pkg) return fail("not_found", "ไม่พบแพ็กเกจที่เลือก", 404);
    const amountMinor = toMinor(pkg.price_thb);
    if (amountMinor < 1000) {
      return fail("bad_request", "แพ็กเกจนี้ยังไม่พร้อมจำหน่าย (ราคาต่ำกว่าขั้นต่ำ 10 บาท)", 400);
    }

    const { data: paymentId, error } = await supabase.rpc("arcana_create_payment", {
      p_provider: provider.id,
      p_package_id: pkg.id,
      p_package_name: pkg.name,
      p_credits: pkg.credits,
      p_amount_minor: amountMinor,
      p_currency: "thb",
      p_livemode: provider.livemode,
      p_require_account: settings.billing.require_account,
    });
    if (error || typeof paymentId !== "string") {
      if (error?.message.includes("too many payment attempts")) {
        return fail("quota_exceeded", "มีการเริ่มชำระเงินถี่เกินไป กรุณารอสักครู่แล้วลองใหม่", 429);
      }
      console.error("[arcana] create payment failed:", error?.message);
      return fail("server_error", "เริ่มการชำระเงินไม่สำเร็จ กรุณาลองใหม่", 500);
    }

    const origin = new URL(req.url).origin;
    const session = await provider.createCheckout({
      paymentId,
      packageName: pkg.name,
      credits: pkg.credits,
      amountMinor,
      currency: "thb",
      successUrl: `${origin}/account?payment=success&pid=${paymentId}`,
      cancelUrl: `${origin}/account?payment=cancelled`,
      customerEmail: user?.email ?? null,
    });

    const attached = await supabase.rpc("arcana_attach_payment_session", {
      p_id: paymentId,
      p_session_id: session.sessionId,
    });
    if (attached.error || attached.data !== true) {
      // without the binding the payment could never be fulfilled — do not send the user to pay
      console.error("[arcana] attach session failed:", attached.error?.message);
      return fail("server_error", "เริ่มการชำระเงินไม่สำเร็จ กรุณาลองใหม่", 500);
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
    console.error("[arcana] checkout failed:", err);
    return fail("server_error", "เริ่มการชำระเงินไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
