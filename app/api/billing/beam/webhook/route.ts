import { NextResponse } from "next/server";
import { BeamError, beamConfig, verifyBeamSignature } from "@/lib/billing/beam";
import { settleCharge } from "@/lib/billing/gateway";
import { formatThb } from "@/lib/billing/provider";
import { notifyAdmin } from "@/lib/notify";
import { getSystemClient } from "@/lib/supabase/server";

/**
 * Beam webhook. Authenticity: HMAC-SHA256 of the raw body with the webhook key
 * (X-Beam-Signature). Even then the body is not trusted for the grant: the
 * charge is looked up again from Beam's API, and SQL re-checks reference,
 * amount and currency. Responses: 400 forgery, 500 our failure (Beam retries),
 * 200 handled or ignored.
 */
export async function POST(req: Request) {
  const beam = beamConfig();
  if (!beam?.webhookKey) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const raw = await req.text();
  if (!verifyBeamSignature(raw, req.headers.get("x-beam-signature"), beam.webhookKey)) {
    console.warn("[arcana] beam webhook rejected: bad signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const event = req.headers.get("x-beam-event") ?? "";
  if (event !== "charge.succeeded") return NextResponse.json({ received: true });

  let chargeId: string | undefined;
  try {
    chargeId = (JSON.parse(raw) as { chargeId?: string }).chargeId;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  if (!chargeId) return NextResponse.json({ received: true });

  try {
    const result = await settleCharge(getSystemClient(), beam, chargeId);
    if (result.ok && (result.credited ?? 0) > 0) {
      const amount = (JSON.parse(raw) as { amount?: number }).amount;
      await notifyAdmin(`ARCANA: รับชำระ ${typeof amount === "number" ? formatThb(amount) : ""} ผ่าน QR อัตโนมัติ (Beam) — เพิ่มเครดิตแล้ว`);
    }
    if (!result.ok && result.reason !== "unknown_charge") {
      console.warn("[arcana] beam webhook not granted:", chargeId, result.reason);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[arcana] beam webhook failed:", err instanceof BeamError ? err.message : err);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
}
