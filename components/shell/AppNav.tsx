"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  BookHeart,
  ChevronRight,
  Gem,
  History,
  Home,
  LayoutGrid,
  Library,
  ScrollText,
  Sparkles,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";

/** Desktop header, in order. */
const DESKTOP = [
  { href: "/home", label: "หน้าหลัก" },
  { href: "/daily", label: "ไพ่ประจำวัน" },
  { href: "/ask", label: "ถามไพ่" },
  { href: "/history", label: "ประวัติ" },
  { href: "/journal", label: "บันทึก" },
  { href: "/cards", label: "คลังไพ่" },
  { href: "/pricing", label: "แพ็กเกจ" },
];

/** Phone and tablet tab bar; "ถามไพ่" sits in the middle as the main action. */
const TABS = [
  { href: "/home", label: "หน้าหลัก", icon: Home },
  { href: "/daily", label: "ไพ่วันนี้", icon: Sun },
  { href: "/ask", label: "ถามไพ่", icon: Sparkles, primary: true },
  { href: "/history", label: "ประวัติ", icon: History },
];

/** Everything else, in the "เพิ่มเติม" sheet. */
const MORE = [
  { href: "/journal", label: "บันทึกของฉัน", hint: "จดสิ่งที่ไพ่สะท้อนและติดตามผล", icon: BookHeart },
  { href: "/cards", label: "คลังไพ่ 78 ใบ", hint: "ความหมายไพ่ทุกใบ ตั้งตรงและกลับหัว", icon: Library },
  { href: "/pricing", label: "แพ็กเกจและเครดิต", hint: "สมาชิก 30 วัน และแพ็กเติมเครดิต", icon: Gem },
  { href: "/account", label: "บัญชีของฉัน", hint: "เครดิต สมาชิก และการเข้าสู่ระบบ", icon: UserRound },
  { href: "/terms", label: "ข้อตกลงและนโยบาย", hint: "การคืนเงิน ความเป็นส่วนตัว ติดต่อเรา", icon: ScrollText },
];

function isActive(pathname: string, href: string) {
  if (href === "/ask") return pathname.startsWith("/ask") || pathname.startsWith("/reading");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  const moreActive = MORE.some((m) => isActive(pathname, m.href));

  // a link inside the sheet navigates; close it so the new page is visible
  useEffect(() => {
    sheet.current?.close();
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-midnight/85 pt-[env(safe-area-inset-top)] backdrop-blur-md print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-[max(1.25rem,env(safe-area-inset-left))] py-3">
          <Logo href="/home" />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="เมนูหลัก">
            {DESKTOP.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(pathname, l.href) ? "page" : undefined}
                className={clsx(
                  "whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors",
                  isActive(pathname, l.href)
                    ? "bg-gold/15 text-gold-light"
                    : "text-ivory-dim hover:bg-white/5 hover:text-ivory",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/account"
            className={clsx(
              "flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm transition-colors",
              pathname.startsWith("/account")
                ? "border-gold text-gold-light"
                : "border-white/15 text-ivory-dim hover:border-gold/50 hover:text-ivory",
            )}
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            {signedIn ? "บัญชี" : "เข้าสู่ระบบ"}
          </Link>
        </div>
      </header>

      {/* phone and tablet tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-midnight/90 backdrop-blur-xl lg:hidden print:hidden"
        aria-label="เมนูหลัก (มือถือ)"
      >
        <ul className="mx-auto flex max-w-lg items-end justify-between px-[max(0.5rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)]">
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);
            if (t.primary) {
              return (
                <li key={t.href} className="flex flex-1 justify-center">
                  <Link
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className="group -mt-5 flex flex-col items-center gap-1 pb-2 text-xs font-medium text-gold-light"
                  >
                    <span
                      className={clsx(
                        "flex h-14 w-14 items-center justify-center rounded-full bg-gold text-midnight shadow-glow ring-4 ring-midnight transition-transform group-active:scale-95",
                        active && "bg-gold-light",
                      )}
                    >
                      <t.icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    {t.label}
                  </Link>
                </li>
              );
            }
            return (
              <li key={t.href} className="flex-1">
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "relative flex min-h-[3.5rem] flex-col items-center justify-center gap-1 pt-2 pb-2 text-xs transition-colors",
                    active ? "text-gold-light" : "text-ivory-dim active:text-ivory",
                  )}
                >
                  {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gold" aria-hidden="true" />}
                  <t.icon className="h-[22px] w-[22px]" aria-hidden="true" />
                  {t.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => sheet.current?.showModal()}
              aria-haspopup="dialog"
              className={clsx(
                "relative flex min-h-[3.5rem] w-full flex-col items-center justify-center gap-1 pt-2 pb-2 text-xs transition-colors",
                moreActive ? "text-gold-light" : "text-ivory-dim active:text-ivory",
              )}
            >
              {moreActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gold" aria-hidden="true" />}
              <LayoutGrid className="h-[22px] w-[22px]" aria-hidden="true" />
              เพิ่มเติม
            </button>
          </li>
        </ul>
      </nav>

      {/* "เพิ่มเติม" sheet: a native dialog, so focus, Escape and the back gesture behave */}
      <dialog
        ref={sheet}
        aria-labelledby="more-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="sheet m-0 mt-auto w-full max-w-none bg-transparent p-0 text-ivory backdrop:bg-black/60 backdrop:backdrop-blur-sm lg:hidden"
      >
        <div className="mx-auto max-w-lg rounded-t-3xl border border-b-0 border-white/10 bg-navy px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
          <div className="mt-3 flex items-center justify-between px-2">
            <h2 id="more-title" className="text-lg font-semibold">
              เพิ่มเติม
            </h2>
            <button
              type="button"
              onClick={() => sheet.current?.close()}
              aria-label="ปิด"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ivory-dim hover:bg-white/10 hover:text-ivory"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <ul className="mt-1 divide-y divide-white/5">
            {MORE.map((m) => (
              <li key={m.href}>
                <Link
                  href={m.href}
                  onClick={() => sheet.current?.close()}
                  aria-current={isActive(pathname, m.href) ? "page" : undefined}
                  className="flex min-h-[3.75rem] items-center gap-4 rounded-xl px-2 py-2.5 active:bg-white/5"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold">
                    <m.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx("block", isActive(pathname, m.href) ? "text-gold-light" : "text-ivory")}>
                      {m.label}
                    </span>
                    <span className="block truncate text-sm text-ivory-dim">{m.hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ivory-dim" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
