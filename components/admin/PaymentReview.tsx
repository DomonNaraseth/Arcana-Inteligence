"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";

/** Approve or reject one PromptPay transfer after checking the bank statement. */
export function PaymentReview({ paymentId, summary }: { paymentId: string; summary: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(action: "approve" | "reject") {
    const question =
      action === "approve"
        ? `ยืนยันว่าเงินเข้าบัญชีแล้วและอนุมัติ ${summary}?`
        : `ปฏิเสธรายการ ${summary}? (ใช้เมื่อไม่พบยอดเงินเข้า)`;
    if (!window.confirm(question)) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId, action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "ดำเนินการไม่สำเร็จ");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void review("approve")}
          disabled={busy !== null}
          className="btn-gold px-4 py-2 text-sm"
        >
          {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          เงินเข้าแล้ว อนุมัติ
        </button>
        <button
          type="button"
          onClick={() => void review("reject")}
          disabled={busy !== null}
          className="btn-quiet border border-white/15"
        >
          {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          ไม่พบยอดเงิน
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
