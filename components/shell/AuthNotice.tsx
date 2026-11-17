"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, X, XCircle } from "lucide-react";

/**
 * One-time notice after returning from sign-in (`?auth=ok|error`). It reads
 * the outcome once, then removes the parameters from the address bar.
 */
export function AuthNotice() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [notice, setNotice] = useState<{ ok: boolean; claimed: number } | null>(null);

  useEffect(() => {
    const auth = params.get("auth");
    if (auth !== "ok" && auth !== "error") return;
    setNotice({ ok: auth === "ok", claimed: Number(params.get("claimed") ?? 0) || 0 });
    const rest = new URLSearchParams(params.toString());
    rest.delete("auth");
    rest.delete("claimed");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  if (!notice) return null;

  return (
    <div
      role={notice.ok ? "status" : "alert"}
      className={
        notice.ok
          ? "border-b border-gold/30 bg-gold/10 text-gold-light"
          : "border-b border-red-400/30 bg-red-950/40 text-red-200"
      }
    >
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-5 py-3 text-sm">
        {notice.ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <p className="flex-1">
          {notice.ok
            ? notice.claimed > 0
              ? `เข้าสู่ระบบแล้ว — ย้ายการอ่านไพ่ ${notice.claimed} รายการจากเบราว์เซอร์นี้เข้าบัญชีของคุณเรียบร้อย`
              : "เข้าสู่ระบบแล้ว — การอ่านไพ่ของคุณจะถูกเก็บไว้กับบัญชีนี้"
            : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง การอ่านไพ่ในเบราว์เซอร์นี้ยังอยู่ครบ"}
        </p>
        <button
          type="button"
          onClick={() => setNotice(null)}
          aria-label="ปิดข้อความ"
          className="rounded-full p-1 hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
