"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, BellRing } from "lucide-react";
import { hasNewTransfer, type WaitingSummary } from "@/lib/billing/watch";

const POLL_MS = 30_000;
const BASE_TITLE = "การชำระเงิน";

type Permission = "unsupported" | "default" | "granted" | "denied";

const formatBaht = (minor: number) =>
  `฿${(minor / 100).toLocaleString("th-TH", { minimumFractionDigits: minor % 100 === 0 ? 0 : 2 })}`;

/**
 * Keeps the admin payments page current while it is open: checks for newly
 * reported transfers every 30 seconds, refreshes the list, marks the tab title
 * and — once the admin allows it — raises a browser notification. Works only
 * while this page stays open; it needs no outside service.
 */
export function PaymentWatcher({ initialLatest, initialWaiting }: { initialLatest: string | null; initialWaiting: number }) {
  const router = useRouter();
  const seen = useRef<string | null>(initialLatest);
  const [waiting, setWaiting] = useState(initialWaiting);
  const [permission, setPermission] = useState<Permission>("default");
  const [failing, setFailing] = useState(false);

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : (Notification.permission as Permission));
  }, []);

  useEffect(() => {
    document.title = waiting > 0 ? `(${waiting}) ${BASE_TITLE} · ARCANA` : `${BASE_TITLE} · ARCANA`;
  }, [waiting]);

  useEffect(() => {
    let stopped = false;

    async function check() {
      try {
        const res = await fetch("/api/admin/payments/waiting", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const summary = (await res.json()) as WaitingSummary;
        if (stopped) return;
        setFailing(false);
        setWaiting(summary.waiting);
        if (hasNewTransfer(summary, seen.current)) {
          seen.current = summary.latestClaimAt;
          router.refresh();
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && summary.newest) {
            const notice = new Notification("ARCANA: มีลูกค้าแจ้งโอน", {
              body: `${formatBaht(summary.newest.amountMinor)} · ${summary.newest.packageName} — ตรวจยอดเข้าแล้วกดอนุมัติ`,
              tag: "arcana-transfer",
            });
            notice.onclick = () => {
              window.focus();
              notice.close();
            };
          }
        }
      } catch {
        // e.g. the admin session ended — say so instead of looking alive
        if (!stopped) setFailing(true);
      }
    }

    const timer = setInterval(() => void check(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [router]);

  async function enable() {
    if (typeof Notification === "undefined") return;
    setPermission((await Notification.requestPermission()) as Permission);
  }

  return (
    <div className="panel flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm" role="status">
      <p className={failing ? "text-amber-200" : "text-ivory"}>
        {failing
          ? "ตรวจรายการใหม่ไม่สำเร็จ — กรุณารีเฟรชหน้านี้ (เซสชันผู้ดูแลอาจหมดอายุ)"
          : `กำลังเฝ้าดูการแจ้งโอนใหม่ทุก 30 วินาที ขณะเปิดหน้านี้ไว้${waiting > 0 ? ` · รอตรวจสอบ ${waiting} รายการ` : ""}`}
      </p>
      {permission === "granted" ? (
        <span className="flex items-center gap-2 text-gold-light">
          <BellRing className="h-4 w-4" aria-hidden="true" /> เปิดการแจ้งเตือนบนเบราว์เซอร์แล้ว
        </span>
      ) : permission === "default" ? (
        <button type="button" onClick={() => void enable()} className="btn-quiet border border-gold/40">
          <Bell className="h-4 w-4" /> เปิดการแจ้งเตือนบนเบราว์เซอร์
        </button>
      ) : (
        <span className="flex items-center gap-2 text-ivory-dim">
          <BellOff className="h-4 w-4" aria-hidden="true" />
          {permission === "denied"
            ? "เบราว์เซอร์บล็อกการแจ้งเตือนไว้ — เปิดได้ที่ไอคอนแม่กุญแจข้างที่อยู่เว็บ"
            : "เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน"}
        </span>
      )}
    </div>
  );
}
