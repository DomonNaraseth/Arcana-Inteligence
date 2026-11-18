import { NextResponse } from "next/server";
import { isAdminCaller } from "@/lib/admin";
import { fail } from "@/lib/api";
import { BeamError } from "@/lib/billing/beam";
import { gatewayFor, settlePayment } from "@/lib/billing/gateway";
import { formatThb } from "@/lib/billing/provider";
import { getWallet } from "@/lib/credits";
import { notifyAdmin } from "@/lib/notify";
import { ConfigError, getContext, getSystemClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MyPayment = { id: string; status: string; provider: string; credits: number; amount_minor: number; package_name: string };

/**
 * The pay page asks this every few seconds while the customer pays. When the
 * gateway says the QR was paid, the purchase is granted here (and by the
 * webhook, whichever comes first — the grant is idempotent).
 */
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("bad_request", "ไม่พบรายการชำระเงิน", 400);
    const { supabase } = await getContext();
    const read = async () => (await supabase.rpc("arcana_my_payment", { p_id: id })).data as MyPayment | null;

    let payment = await read();
    if (!payment || payment.provider !== "promptpay") return fail("not_found", "ไม่พบรายการชำระเงิน", 404);

    if (payment.status === "pending") {
      const beam = gatewayFor(await isAdminCaller(supabase));
      if (beam) {
        const settled = await settlePayment(supabase, getSystemClient(), beam, id);
        if (settled?.ok) {
          if ((settled.credited ?? 0) > 0) {
            await notifyAdmin(`ARCANA: รับชำระ ${formatThb(payment.amount_minor)} (${payment.package_name}) ผ่าน QR อัตโนมัติ — เพิ่มเครดิตแล้ว`);
          }
          payment = (await read()) ?? payment;
        }
      }
    }

    const wallet = payment.status === "paid" ? await getWallet(supabase) : null;
    return NextResponse.json(
      { status: payment.status, credits: payment.credits, balance: wallet?.balance ?? null },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof ConfigError) return fail("config_missing", "ระบบฐานข้อมูลยังไม่ได้ตั้งค่า", 503);
    if (err instanceof BeamError) {
      // the gateway is briefly unreachable: the page simply asks again
      console.warn("[arcana] beam status check:", err.message);
      return NextResponse.json({ status: "pending", retry: true }, { headers: { "cache-control": "no-store" } });
    }
    console.error("[arcana] payment status failed:", err);
    return fail("server_error", "ตรวจสถานะไม่สำเร็จ", 500);
  }
}
