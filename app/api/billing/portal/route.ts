import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { BillingProviderError, billingProvider } from "@/lib/billing/provider";
import { ConfigError, getContext } from "@/lib/supabase/server";

/**
 * Opens the provider's billing portal for the caller's own membership (cancel,
 * change card, invoices). The customer id is looked up server-side from the
 * caller's subscription — it is never accepted from, or sent to, the browser.
 */
export async function POST(req: Request) {
  try {
    const provider = billingProvider();
    if (!provider) {
      return fail("billing_not_configured", "ระบบชำระเงินยังไม่เปิดให้บริการ", 503);
    }
    const { supabase } = await getContext();
    const { data: customerId } = await supabase.rpc("arcana_my_billing_customer");
    if (typeof customerId !== "string" || !customerId) {
      return fail("not_found", "ไม่พบสมาชิกรายเดือนที่จัดการได้ในบัญชีนี้", 404);
    }
    const origin = new URL(req.url).origin;
    const session = await provider.createPortalSession(customerId, `${origin}/account`);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof ConfigError) return fail("config_missing", "ระบบฐานข้อมูลยังไม่ได้ตั้งค่า", 503);
    if (err instanceof BillingProviderError) {
      console.error("[arcana] billing portal error:", err.message);
      return fail("billing_unavailable", "เปิดหน้าจัดการสมาชิกไม่ได้ในขณะนี้ กรุณาลองใหม่", 502);
    }
    console.error("[arcana] portal failed:", err);
    return fail("server_error", "เปิดหน้าจัดการสมาชิกไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
