import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { promptPayConfig } from "@/lib/billing/promptpay";
import { SLIP_FAILURE_TH, SlipError, checkSlip, slipVerifier, type SlipFailure } from "@/lib/billing/slip";
import { getWallet } from "@/lib/credits";
import { getSettings } from "@/lib/settings";
import { ConfigError, getContext } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const reject = (reason: SlipFailure, status = 422) => fail("bad_request", SLIP_FAILURE_TH[reason], status);

/**
 * The customer uploads the slip of their transfer. The slip-verification
 * service confirms the transfer with the banking network; only then, and only
 * if amount, time and recipient fit this payment, are the credits granted —
 * once per transfer reference. The image is passed on and not stored.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null);
    const paymentId = form?.get("paymentId");
    const slip = form?.get("slip");
    if (typeof paymentId !== "string" || !/^[0-9a-f-]{36}$/i.test(paymentId) || !(slip instanceof Blob)) {
      return fail("bad_request", "กรุณาแนบภาพสลิปการโอนเงิน", 400);
    }
    if (!IMAGE_TYPES.has(slip.type)) {
      return fail("bad_request", "รองรับเฉพาะภาพ JPG, PNG หรือ WEBP", 400);
    }
    if (slip.size === 0 || slip.size > MAX_BYTES) {
      return fail("bad_request", "ภาพสลิปต้องมีขนาดไม่เกิน 4 MB", 400);
    }

    const { supabase } = await getContext();
    const settings = await getSettings(supabase);
    const config = promptPayConfig(settings);
    const verifier = slipVerifier();
    if (!config || !verifier) {
      return fail(
        "billing_not_configured",
        "ระบบตรวจสลิปอัตโนมัติยังไม่เปิดใช้งาน กรุณากด \"แจ้งโอนแล้ว\" เพื่อให้ผู้ดูแลตรวจสอบ",
        503,
      );
    }

    const { data: payment } = await supabase.rpc("arcana_my_payment", { p_id: paymentId });
    const row = payment as {
      status: string;
      provider: string;
      amount_minor: number;
      credits: number;
      package_name: string;
      created_at: string;
    } | null;
    if (!row || row.provider !== "promptpay") return fail("not_found", "ไม่พบรายการชำระเงิน", 404);
    if (row.status === "paid") {
      const wallet = await getWallet(supabase);
      return NextResponse.json({ status: "paid", credited: 0, balance: wallet?.balance ?? null });
    }
    if (row.status !== "pending") return fail("bad_request", "รายการนี้ปิดไปแล้ว กรุณาเริ่มรายการใหม่", 409);

    let verified;
    try {
      verified = await verifier.verify(slip, "slip", row.amount_minor);
    } catch (err) {
      if (err instanceof SlipError) {
        if (err.reason === "unavailable") console.error("[arcana] slip verification failed:", err.message);
        return reject(err.reason, err.reason === "unavailable" ? 502 : 422);
      }
      throw err;
    }

    const problem = checkSlip(verified, {
      amountMinor: row.amount_minor,
      createdAt: row.created_at,
      receiverHint: config.receiverHint,
    });
    if (problem) return reject(problem);

    const { data, error } = await supabase.rpc("arcana_fulfill_promptpay", {
      p_id: paymentId,
      p_trans_ref: verified.transRef,
      p_amount_minor: verified.amountMinor,
      p_transferred_at: verified.transferredAt,
      p_verifier: verifier.id,
    });
    if (error) {
      console.error("[arcana] promptpay fulfil failed:", error.message);
      return fail("server_error", "ตรวจสลิปผ่านแล้วแต่บันทึกไม่สำเร็จ กรุณาลองส่งสลิปอีกครั้ง", 500);
    }
    const result = data as { ok: boolean; reason?: string; credited?: number };
    if (!result.ok) {
      const reason = (["slip_used", "amount_mismatch", "slip_too_old"] as const).find((r) => r === result.reason);
      return reason ? reject(reason) : fail("bad_request", "ไม่สามารถใช้สลิปนี้กับรายการนี้ได้", 422);
    }

    const wallet = await getWallet(supabase);
    return NextResponse.json({
      status: "paid",
      credited: result.credited ?? 0,
      credits: row.credits,
      packageName: row.package_name,
      balance: wallet?.balance ?? null,
    });
  } catch (err) {
    if (err instanceof ConfigError) return fail("config_missing", "ระบบฐานข้อมูลยังไม่ได้ตั้งค่า", 503);
    console.error("[arcana] slip upload failed:", err);
    return fail("server_error", "ตรวจสลิปไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
