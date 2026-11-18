import Link from "next/link";
import { Hourglass } from "lucide-react";
import type { RenewalNotice } from "@/lib/billing/renewal";
import { TIER_TH } from "@/lib/credits";

/** Reminder for a prepaid membership that is about to end or has just ended. */
export function RenewalBanner({ notice }: { notice: RenewalNotice }) {
  const name = TIER_TH[notice.tier];
  const text =
    notice.kind === "ending"
      ? notice.days === 0
        ? `สมาชิก ${name} ของคุณหมดอายุวันนี้`
        : `สมาชิก ${name} ของคุณจะหมดอายุในอีก ${notice.days} วัน`
      : `สมาชิก ${name} ของคุณหมดอายุแล้ว`;
  return (
    <div
      role="status"
      className="panel-gold flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"
    >
      <p className="flex items-center gap-3 text-ivory">
        <Hourglass className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
        <span>
          {text} — ต่ออายุอีก 30 วันเพื่อรับเครดิตชุดใหม่ เครดิตที่เหลืออยู่ยังใช้ได้ตามเดิม
        </span>
      </p>
      <Link href="/pricing" className="btn-gold px-5 py-2 text-sm">
        ต่ออายุ
      </Link>
    </div>
  );
}
