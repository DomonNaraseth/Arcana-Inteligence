"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BookHeart, History, Home, Library, Sparkles, UserRound } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

const LINKS = [
  { href: "/home", label: "หน้าหลัก", icon: Home },
  { href: "/ask", label: "ถามไพ่", icon: Sparkles },
  { href: "/history", label: "ประวัติ", icon: History },
  { href: "/journal", label: "บันทึก", icon: BookHeart },
  { href: "/cards", label: "คลังไพ่", icon: Library },
];

function isActive(pathname: string, href: string) {
  if (href === "/ask") return pathname.startsWith("/ask") || pathname.startsWith("/reading");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-midnight/85 backdrop-blur-md print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Logo href="/home" />
          <nav className="hidden items-center gap-1 md:flex" aria-label="เมนูหลัก">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(pathname, l.href) ? "page" : undefined}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm transition-colors",
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
              "flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors",
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

      {/* mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-midnight/95 backdrop-blur-md md:hidden print:hidden"
        aria-label="เมนูหลัก (มือถือ)"
      >
        <ul className="mx-auto flex max-w-md justify-between px-2 pb-[env(safe-area-inset-bottom)]">
          {LINKS.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <li key={l.href} className="flex-1">
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
                    active ? "text-gold" : "text-ivory-dim",
                  )}
                >
                  <l.icon className="h-5 w-5" aria-hidden="true" />
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
