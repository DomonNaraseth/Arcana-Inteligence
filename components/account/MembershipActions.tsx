"use client";

import { useState } from "react";
import { Loader2, Settings2, Sparkles } from "lucide-react";

async function redirectTo(endpoint: string, body: unknown, fallback: string): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) throw new Error(data?.error?.message ?? fallback);
  // hand over to the provider's hosted page
  window.location.assign(data.url as string);
}

/** Starts a monthly membership checkout for one plan. */
export function SubscribeButton({
  planId,
  label,
  highlighted,
  via = "stripe",
}: {
  planId: "basic" | "premium";
  label: string;
  highlighted?: boolean;
  /** a recurring card subscription, or a prepaid 30-day membership by PromptPay */
  via?: "stripe" | "promptpay";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await redirectTo(
        via === "promptpay" ? "/api/billing/promptpay" : "/api/billing/subscribe",
        { planId },
        "เริ่มการสมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่",
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className={highlighted ? "btn-gold w-full" : "btn-ghost w-full"}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {label}
      </button>
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
    </>
  );
}

/** Opens the provider's billing portal: cancel, change card, invoices. */
export function ManageSubscriptionButton({ className = "btn-ghost px-5 py-2.5 text-sm" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      await redirectTo("/api/billing/portal", {}, "เปิดหน้าจัดการสมาชิกไม่สำเร็จ กรุณาลองใหม่");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => void open()} disabled={busy} className={className}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
        จัดการสมาชิก
      </button>
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
    </>
  );
}
