import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/api";
import { BillingProviderError, billingProvider } from "@/lib/billing/provider";
import { markUnsuccessful, settlePaidSession } from "@/lib/billing/service";
import { getWallet } from "@/lib/credits";
import { ConfigError, getContext } from "@/lib/supabase/server";

const bodySchema = z.object({ paymentId: z.string().uuid() });

/**
 * Called when the user returns from the hosted checkout. It asks the provider
 * for the real state of the session (the browser's word is never trusted) and
 * fulfils the payment if it is paid — the same idempotent path the webhook
 * uses, so credits appear even if the webhook is slow.
 */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", "ไม่พบรายการชำระเงิน", 400);

    const { supabase } = await getContext();
    const { data: payment } = await supabase.rpc("arcana_my_payment", {
      p_id: parsed.data.paymentId,
    });
    if (!payment) return fail("not_found", "ไม่พบรายการชำระเงิน", 404);

    const row = payment as {
      status: string;
      credits: number;
      package_name: string;
      provider_session_id: string | null;
    };

    let status = row.status;
    let credited = 0;

    if (status === "pending" && row.provider_session_id) {
      const provider = billingProvider();
      if (!provider) {
        return fail("billing_not_configured", "ระบบชำระเงินยังไม่เปิดให้บริการ", 503);
      }
      const session = await provider.getSession(row.provider_session_id);
      // bind the provider's answer to this payment before acting on it
      if (session.paymentId === parsed.data.paymentId) {
        if (session.paid) {
          const result = await settlePaidSession(supabase, provider, session);
          if (result.ok) {
            status = "paid";
            credited = result.credited ?? 0;
          }
        } else if (session.status === "expired") {
          await markUnsuccessful(supabase, session, "expired");
          status = "expired";
        }
      }
    }

    const wallet = await getWallet(supabase);
    return NextResponse.json({
      status,
      credits: row.credits,
      packageName: row.package_name,
      credited,
      balance: wallet?.balance ?? null,
    });
  } catch (err) {
    if (err instanceof ConfigError) return fail("config_missing", "ระบบฐานข้อมูลยังไม่ได้ตั้งค่า", 503);
    if (err instanceof BillingProviderError) {
      console.error("[arcana] payment provider error:", err.message);
      return fail(
        "billing_unavailable",
        "ยังตรวจสอบสถานะการชำระเงินไม่ได้ กรุณารีเฟรชอีกครั้งในอีกสักครู่",
        502,
      );
    }
    console.error("[arcana] confirm payment failed:", err);
    return fail("server_error", "ตรวจสอบการชำระเงินไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
