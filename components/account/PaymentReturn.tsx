"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

type View =
  | { state: "checking" }
  | { state: "paid"; credits: number; packageName: string; balance: number | null }
  | { state: "waiting" }
  | { state: "unsuccessful"; message: string }
  | { state: "cancelled" };

const MAX_ATTEMPTS = 6;

/**
 * Shown when the user comes back from the hosted checkout. The outcome is
 * always re-checked with the server — the query string alone proves nothing.
 */
export function PaymentReturn({
  outcome,
  paymentId,
}: {
  outcome: "success" | "cancelled";
  paymentId: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(
    outcome === "cancelled" || !paymentId ? { state: "cancelled" } : { state: "checking" },
  );
  const started = useRef(false);

  useEffect(() => {
    if (outcome !== "success" || !paymentId || started.current) return;
    started.current = true;
    let cancelled = false;

    async function check(attempt: number) {
      try {
        const res = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ paymentId }),
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data?.status === "paid") {
          setView({
            state: "paid",
            credits: data.credits,
            packageName: data.packageName,
            balance: data.balance,
          });
          // re-render the wallet below; this banner keeps its state
          router.refresh();
          return;
        }
        if (res.ok && (data?.status === "failed" || data?.status === "expired")) {
          setView({ state: "unsuccessful", message: "การชำระเงินไม่สำเร็จหรือหมดเวลา ยังไม่มีการเพิ่มเครดิต" });
          return;
        }
        if (res.status === 404) {
          setView({ state: "unsuccessful", message: "ไม่พบรายการชำระเงินนี้ในบัญชีของคุณ" });
          return;
        }
        // still pending (e.g. PromptPay not yet settled) or a transient error
        if (attempt < MAX_ATTEMPTS) {
          setTimeout(() => void check(attempt + 1), 2500);
        } else {
          setView({ state: "waiting" });
        }
      } catch {
        if (cancelled) return;
        if (attempt < MAX_ATTEMPTS) setTimeout(() => void check(attempt + 1), 2500);
        else setView({ state: "waiting" });
      }
    }
    void check(1);
    return () => {
      cancelled = true;
    };
  }, [outcome, paymentId, router]);

  if (view.state === "checking") {
    return (
      <p role="status" className="panel mt-6 flex items-center gap-3 p-5 text-ivory">
        <Loader2 className="h-5 w-5 animate-spin text-gold" /> กำลังยืนยันการชำระเงินกับผู้ให้บริการ…
      </p>
    );
  }
  if (view.state === "paid") {
    return (
      <div role="status" className="panel-gold mt-6 flex items-start gap-3 p-5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
        <p className="text-ivory">
          ชำระเงินสำเร็จ — เพิ่ม <strong>{view.credits} เครดิต</strong> ({view.packageName}) เข้ากระเป๋าของคุณแล้ว
          {view.balance !== null && <span className="text-ivory-dim"> · คงเหลือ {view.balance} เครดิต</span>}
        </p>
      </div>
    );
  }
  if (view.state === "waiting") {
    return (
      <div role="status" className="panel mt-6 flex items-start gap-3 p-5">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
        <p className="text-ivory">
          ยังไม่ได้รับการยืนยันการชำระเงิน — หากคุณชำระเรียบร้อยแล้ว เครดิตจะเข้าอัตโนมัติเมื่อผู้ให้บริการยืนยัน
          (บางวิธีชำระเงินใช้เวลาสักครู่) รีเฟรชหน้านี้เพื่อตรวจสอบอีกครั้งได้
        </p>
      </div>
    );
  }
  if (view.state === "unsuccessful") {
    return (
      <div role="alert" className="panel mt-6 flex items-start gap-3 border-red-400/30 p-5">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
        <p className="text-ivory">{view.message}</p>
      </div>
    );
  }
  return (
    <p role="status" className="panel mt-6 p-5 text-ivory-dim">
      คุณยกเลิกการชำระเงิน — ยังไม่มีการตัดเงินและไม่มีการเพิ่มเครดิต
    </p>
  );
}
