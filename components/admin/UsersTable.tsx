"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { formatThaiDate } from "@/lib/format";

export interface AdminUser {
  ref: string;
  kind: "account" | "guest";
  email: string | null;
  readings: number;
  last_active: string | null;
  balance: number;
  tier: "free" | "basic" | "premium" | "unlimited";
}

const TIERS: AdminUser["tier"][] = ["free", "basic", "premium", "unlimited"];
const TIER_LABEL: Record<AdminUser["tier"], string> = {
  free: "Free",
  basic: "Basic",
  premium: "Premium",
  unlimited: "Unlimited",
};
const EXPIRY = [
  { value: "none", label: "ไม่มีวันหมดอายุ" },
  { value: "30", label: "30 วัน" },
  { value: "365", label: "1 ปี" },
];

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message ?? "ดำเนินการไม่สำเร็จ");
  }
}

function ManageRow({ user, onDone }: { user: AdminUser; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState("10");
  const [note, setNote] = useState("");
  const [tier, setTier] = useState(user.tier);
  const [expiry, setExpiry] = useState("none");
  const [busy, setBusy] = useState<"credits" | "tier" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function grant() {
    const n = Number(amount);
    if (!Number.isInteger(n) || n === 0) {
      setError("กรอกจำนวนเครดิตเป็นจำนวนเต็มที่ไม่ใช่ 0 (ติดลบเพื่อปรับลด)");
      return;
    }
    setBusy("credits");
    setError(null);
    try {
      await post("/api/admin/users/credits", { ref: user.ref, amount: n, note });
      onDone(`${n > 0 ? "เพิ่ม" : "ปรับลด"} ${Math.abs(n)} เครดิตให้ ${user.email ?? user.ref} แล้ว`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveTier() {
    setBusy("tier");
    setError(null);
    try {
      const periodEnd =
        expiry === "none" ? null : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString();
      await post("/api/admin/users/tier", { ref: user.ref, tier, periodEnd });
      onDone(`ตั้งแพ็กเกจ ${TIER_LABEL[tier]} ให้ ${user.email ?? user.ref} แล้ว`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 bg-midnight/40 px-4 py-5 md:grid-cols-2">
      <div>
        <h3 className="text-sm font-medium text-gold">ปรับเครดิต</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="w-28">
            <span className="sr-only">จำนวนเครดิต</span>
            <input
              type="number"
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="field py-2 text-sm"
            />
          </label>
          <label className="min-w-0 flex-1">
            <span className="sr-only">หมายเหตุ</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              placeholder="หมายเหตุ (เช่น ชดเชย, โปรโมชัน)"
              className="field py-2 text-sm"
            />
          </label>
          <button type="button" onClick={() => void grant()} disabled={busy !== null} className="btn-gold px-4 py-2 text-sm">
            {busy === "credits" && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก
          </button>
        </div>
        <p className="mt-2 text-xs text-ivory-dim">ใส่ค่าติดลบเพื่อปรับลด ทุกรายการถูกบันทึกใน audit log</p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gold">แพ็กเกจสมาชิก</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <label>
            <span className="sr-only">แพ็กเกจ</span>
            <select value={tier} onChange={(e) => setTier(e.target.value as AdminUser["tier"])} className="field py-2 text-sm">
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">ระยะเวลา</span>
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className="field py-2 text-sm">
              {EXPIRY.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void saveTier()} disabled={busy !== null} className="btn-ghost px-4 py-2 text-sm">
            {busy === "tier" && <Loader2 className="h-4 w-4 animate-spin" />} ตั้งแพ็กเกจ
          </button>
        </div>
        <p className="mt-2 text-xs text-ivory-dim">กำหนดด้วยมือ — ยังไม่ได้เชื่อมระบบชำระเงิน</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-300 md:col-span-2">
          {error}
        </p>
      )}
    </div>
  );
}

export function UsersTable({ users, query }: { users: AdminUser[]; query: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (users.length === 0) {
    return (
      <p className="mt-8 rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center text-ivory-dim">
        {query ? `ไม่พบผู้ใช้ที่ตรงกับ “${query}”` : "ยังไม่มีผู้ใช้"}
      </p>
    );
  }

  return (
    <div className="mt-6">
      {notice && (
        <p role="status" className="mb-4 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold-light">
          {notice}
        </p>
      )}
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs text-ivory-dim">
            <tr className="border-b border-white/10">
              <th scope="col" className="px-4 py-3 font-medium">ผู้ใช้</th>
              <th scope="col" className="px-4 py-3 font-medium">ประเภท</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">การอ่านไพ่</th>
              <th scope="col" className="px-4 py-3 font-medium">ใช้งานล่าสุด</th>
              <th scope="col" className="px-4 py-3 font-medium">แพ็กเกจ</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">เครดิต</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">จัดการ</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map((u) => (
              <UserRows
                key={u.ref}
                user={u}
                open={open === u.ref}
                onToggle={() => setOpen(open === u.ref ? null : u.ref)}
                onDone={(msg) => {
                  setNotice(msg);
                  setOpen(null);
                  router.refresh();
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ivory-dim">แสดงสูงสุด 100 รายการ เรียงตามการใช้งานล่าสุด</p>
    </div>
  );
}

function UserRows({
  user,
  open,
  onToggle,
  onDone,
}: {
  user: AdminUser;
  open: boolean;
  onToggle: () => void;
  onDone: (msg: string) => void;
}) {
  return (
    <>
      <tr>
        <td className="px-4 py-3">
          <span className="block text-ivory">{user.email ?? "ผู้เยี่ยมชม"}</span>
          <span className="block font-mono text-xs text-ivory-dim/70">{user.ref}</span>
        </td>
        <td className="px-4 py-3 text-ivory-dim">{user.kind === "account" ? "บัญชี" : "Guest"}</td>
        <td className="px-4 py-3 text-right tabular-nums text-ivory">{user.readings.toLocaleString("th-TH")}</td>
        <td className="px-4 py-3 text-ivory-dim">
          {user.last_active ? formatThaiDate(user.last_active, true) : "–"}
        </td>
        <td className="px-4 py-3 text-ivory">{TIER_LABEL[user.tier]}</td>
        <td className="px-4 py-3 text-right tabular-nums text-ivory">{user.balance.toLocaleString("th-TH")}</td>
        <td className="px-4 py-3 text-right">
          <button type="button" onClick={onToggle} aria-expanded={open} className="text-gold hover:text-gold-light">
            {open ? "ปิด" : "จัดการ"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="p-0">
            <ManageRow user={user} onDone={onDone} />
          </td>
        </tr>
      )}
    </>
  );
}
