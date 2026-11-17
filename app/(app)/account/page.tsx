import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AuthPanel } from "@/components/account/AuthPanel";
import { aiStatus } from "@/lib/ai/provider";
import { TIER_TH, getWallet } from "@/lib/credits";
import { formatThaiDate } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getContext } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "บัญชีของฉัน" };

const KIND_TH: Record<string, string> = {
  daily_grant: "เครดิตฟรีรายวัน",
  admin_grant: "ปรับโดยผู้ดูแล",
  purchase: "เติมเครดิต",
  spend: "ใช้เครดิต",
  refund: "คืนเครดิต",
};
const FEATURE_TH: Record<string, string> = {
  interpret: "อ่านไพ่",
  followup: "ถามต่อ",
  "followup+clarifier": "ถามต่อพร้อมไพ่เสริม",
};

export default async function AccountPage() {
  const { supabase, user, isGuest } = await getContext();

  const [settings, wallet, role, readings, journals, usage, ai] = await Promise.all([
    getSettings(supabase),
    getWallet(supabase),
    supabase.rpc("arcana_admin_role"),
    supabase.from("arcana_readings").select("id", { count: "exact", head: true }),
    supabase.from("arcana_journals").select("id", { count: "exact", head: true }),
    supabase
      .from("arcana_ai_usage")
      .select("feature")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .returns<{ feature: string }[]>(),
    aiStatus(),
  ]);

  const today = usage.data ?? [];
  const used = (f: string) => today.filter((u) => u.feature === f).length;
  const adminRole = role.data === "owner" || role.data === "admin" ? (role.data as string) : null;
  const creditsOn = settings.credits.enabled && wallet;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="eyebrow">My Profile</p>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">บัญชีของฉัน</h1>

      {adminRole && (
        <Link
          href="/admin"
          className="panel-gold mt-6 flex items-center justify-between gap-4 p-5 transition-colors hover:border-gold"
        >
          <span className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-gold" aria-hidden="true" />
            <span>
              <span className="block font-medium text-ivory">
                คุณมีสิทธิ์ {adminRole === "owner" ? "Owner" : "Admin"}
              </span>
              <span className="block text-sm text-ivory-dim">จัดการระบบ ผู้ใช้ เครดิต และการตั้งค่า</span>
            </span>
          </span>
          <span className="text-gold">เปิดแดชบอร์ด →</span>
        </Link>
      )}

      <section className="panel mt-6 p-6">
        <h2 className="text-xl font-semibold">สถานะ</h2>
        <p className="mt-2 text-ivory">
          {isGuest ? (
            <>
              คุณกำลังใช้งานแบบ <span className="text-gold-light">ผู้เยี่ยมชม (Guest)</span> —
              ประวัติการอ่านไพ่ผูกกับเบราว์เซอร์นี้
            </>
          ) : (
            <>
              เข้าสู่ระบบด้วย <span className="text-gold-light">{user?.email}</span>
            </>
          )}
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-ivory-dim">การอ่านไพ่ทั้งหมด</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-gold-light">{readings.count ?? 0}</dd>
          </div>
          <div>
            <dt className="text-ivory-dim">บันทึก</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-gold-light">{journals.count ?? 0}</dd>
          </div>
          {creditsOn ? (
            <div>
              <dt className="text-ivory-dim">เครดิตคงเหลือ</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-gold-light">{wallet.balance}</dd>
            </div>
          ) : (
            <div>
              <dt className="text-ivory-dim">อ่านไพ่ (24 ชม.)</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-gold-light">
                {used("interpret")}
                <span className="text-sm text-ivory-dim">/{settings.limits.daily_readings}</span>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-ivory-dim">ถามต่อ (24 ชม.)</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-gold-light">
              {used("followup")}
              <span className="text-sm text-ivory-dim">/{settings.limits.daily_followups}</span>
            </dd>
          </div>
        </dl>
        <p className="mt-5 text-xs text-ivory-dim/70">
          ระบบ AI: {ai.configured ? "พร้อมใช้งาน" : "ยังไม่ได้ตั้งค่า (Configuration Missing)"}
          {wallet && (
            <>
              {" "}
              · รหัสผู้ใช้สำหรับติดต่อผู้ดูแล: <span className="font-mono text-ivory-dim">{wallet.ref}</span>
            </>
          )}
        </p>
      </section>

      {creditsOn && (
        <section className="panel mt-6 p-6" aria-labelledby="wallet-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="wallet-title" className="text-xl font-semibold">
                เครดิตของฉัน
              </h2>
              <p className="mt-1 text-sm text-ivory-dim">
                แพ็กเกจ {TIER_TH[wallet.tier]} · เติมให้ถึง {wallet.daily} เครดิตทุกวัน
              </p>
            </div>
            <p className="text-4xl font-semibold tabular-nums text-gold-light">
              {wallet.balance}
              <span className="ml-2 font-sans text-sm font-normal text-ivory-dim">เครดิต</span>
            </p>
          </div>

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 px-4 py-3">
              <dt className="text-ivory-dim">อ่านไพ่ 1 ครั้ง</dt>
              <dd className="mt-1 text-ivory">
                {settings.credits.cost_interpret.small}–{settings.credits.cost_interpret.large} เครดิต
                <span className="block text-xs text-ivory-dim">ตามจำนวนไพ่ในสเปรด</span>
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 px-4 py-3">
              <dt className="text-ivory-dim">ถามต่อ 1 ครั้ง</dt>
              <dd className="mt-1 text-ivory">
                {settings.credits.cost_followup === 0 ? "ฟรี" : `${settings.credits.cost_followup} เครดิต`}
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 px-4 py-3">
              <dt className="text-ivory-dim">เปิดไพ่เสริม 1 ใบ</dt>
              <dd className="mt-1 text-ivory">
                {settings.credits.cost_clarifier === 0 ? "ฟรี" : `${settings.credits.cost_clarifier} เครดิต`}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ivory-dim">
            เครดิตถูกหักหลังได้คำอ่านสำเร็จเท่านั้น หากระบบ AI ขัดข้องจะไม่มีการหักเครดิต
          </p>

          {settings.packages.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gold">แพ็กเกจเติมเครดิต</h3>
              <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                {settings.packages.map((p) => (
                  <li key={p.id} className="rounded-xl border border-white/10 px-4 py-3">
                    <p className="font-medium text-ivory">{p.name}</p>
                    <p className="text-sm text-ivory-dim">
                      {p.credits} เครดิต · {p.price_thb.toLocaleString("th-TH")} บาท
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ivory-dim">
                การซื้อเครดิตออนไลน์ยังไม่เปิดให้บริการ (ยังไม่ได้เชื่อมระบบชำระเงิน)
              </p>
            </div>
          )}

          {wallet.transactions.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gold">รายการล่าสุด</h3>
              <ul className="mt-2 divide-y divide-white/5 text-sm">
                {wallet.transactions.map((t, i) => (
                  <li key={i} className="flex items-center justify-between gap-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-ivory">
                        {t.kind === "spend" ? (FEATURE_TH[t.feature ?? ""] ?? "ใช้เครดิต") : KIND_TH[t.kind]}
                      </span>
                      <span className="block text-xs text-ivory-dim">{formatThaiDate(t.created_at, true)}</span>
                    </span>
                    <span className={t.amount > 0 ? "tabular-nums text-gold-light" : "tabular-nums text-ivory-dim"}>
                      {t.amount > 0 ? "+" : ""}
                      {t.amount}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <AuthPanel signedIn={!isGuest} email={user?.email ?? null} />

      <section className="mt-8 text-sm text-ivory-dim">
        <h2 className="text-base font-medium text-ivory">ความเป็นส่วนตัว</h2>
        <p className="mt-2">
          คำถามและคำอ่านของคุณเข้าถึงได้เฉพาะคุณเท่านั้น คุณสามารถลบการอ่านไพ่หรือบันทึกรายการใดก็ได้ถาวรจากหน้าของรายการนั้น
        </p>
      </section>
    </div>
  );
}
