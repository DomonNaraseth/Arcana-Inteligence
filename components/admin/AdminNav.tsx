"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { LogOut } from "lucide-react";
import { Sigil } from "@/components/brand/Logo";

const LINKS = [
  { href: "/admin", label: "ภาพรวม" },
  { href: "/admin/growth", label: "การเติบโต" },
  { href: "/admin/users", label: "ผู้ใช้และเครดิต" },
  { href: "/admin/payments", label: "การชำระเงิน" },
  { href: "/admin/knowledge", label: "คลังความรู้ไพ่" },
  { href: "/admin/oracle", label: "สร้างไพ่ออราเคิล" },
  { href: "/admin/settings", label: "ตั้งค่าระบบ" },
  { href: "/admin/logs", label: "บันทึกระบบ" },
];

export function AdminNav({ role, email }: { role: "owner" | "admin"; email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" });
    // an account-based admin stays signed in to the app; send them there
    router.replace(email ? "/account" : "/admin/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-midnight/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
        <Link href="/admin" className="flex items-center gap-2.5">
          <Sigil className="h-7 w-7" />
          <span className="font-serif text-lg tracking-[0.18em] text-ivory">ARCANA</span>
          <span className="rounded-full border border-gold/50 px-2 py-0.5 text-[10px] uppercase tracking-widest text-gold">
            Admin
          </span>
        </Link>

        <nav className="order-3 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto" aria-label="เมนูผู้ดูแล">
          {LINKS.map((l) => {
            const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors",
                  active ? "bg-gold/15 text-gold-light" : "text-ivory-dim hover:bg-white/5 hover:text-ivory",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-ivory-dim sm:inline">{email ?? "รหัสผู้ดูแลระบบ"}</span>
          <span className="chip">{role === "owner" ? "Owner" : "Admin"}</span>
          <Link href="/home" className="text-ivory-dim hover:text-ivory">
            ดูแอป
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="ออกจากโหมดผู้ดูแล"
            className="rounded-full p-2 text-ivory-dim hover:bg-white/5 hover:text-ivory"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
