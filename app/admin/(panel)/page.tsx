import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { BarList } from "@/components/admin/BarList";
import { DailyBars, type DailyPoint } from "@/components/admin/DailyBars";
import { requireAdminPage } from "@/lib/admin";
import { aiStatus } from "@/lib/ai/provider";
import { CATEGORY_TH } from "@/lib/ai/schemas";
import { estimateCostUsd, getSettings } from "@/lib/settings";
import { getKnowledge } from "@/lib/tarot/knowledge";

export const metadata: Metadata = { title: "ภาพรวม" };

interface UsageRow {
  feature: string;
  provider: string | null;
  model: string | null;
  calls: number;
  input_tokens: number;
  output_tokens: number;
}

interface Overview {
  days: number;
  period: { readings: number; interpreted: number; users: number; accounts: number };
  all_time: { readings: number; users: number };
  followups: number;
  clarifiers: number;
  journals: number;
  returning_users: number;
  daily: DailyPoint[];
  by_spread: { key: string; count: number }[];
  by_category: { key: string; count: number }[];
  usage: UsageRow[];
  quality: { total: number; passed: number; retried: number };
  errors: { code: string; count: number }[];
  credits: { granted: number; spent: number };
}

const RANGES = [7, 30, 90];
const FEATURE_TH: Record<string, string> = {
  interpret: "ตีความไพ่",
  followup: "ถามต่อ",
  analyze: "วิเคราะห์คำถาม",
};

const num = (n: number) => n.toLocaleString("th-TH");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel p-5">
      <p className="text-sm text-ivory-dim">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-ivory">{value}</p>
      {sub && <p className="mt-1 text-xs text-ivory-dim">{sub}</p>}
    </div>
  );
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const admin = await requireAdminPage();
  const requested = Number((await searchParams).days);
  const days = RANGES.includes(requested) ? requested : 30;

  const [{ data, error }, settings, ai, kb] = await Promise.all([
    admin.supabase.rpc("arcana_admin_overview", { p_days: days }),
    getSettings(admin.supabase, { fresh: true }),
    aiStatus(),
    getKnowledge(admin.supabase),
  ]);

  if (error || !data) {
    return (
      <p role="alert" className="panel border-red-400/30 p-6 text-red-200">
        โหลดข้อมูลภาพรวมไม่สำเร็จ กรุณารีเฟรชหน้านี้
      </p>
    );
  }
  const o = data as Overview;

  const costRows = o.usage.map((u) => ({ ...u, cost: estimateCostUsd(u, settings.model_prices) }));
  const totalCost = costRows.reduce((s, r) => s + (r.cost ?? 0), 0);
  const unpriced = costRows.filter((r) => r.cost === null).length;
  const interpretCost = costRows
    .filter((r) => r.feature === "interpret")
    .reduce((s, r) => s + (r.cost ?? 0), 0);
  const interpretCalls = costRows
    .filter((r) => r.feature === "interpret")
    .reduce((s, r) => s + r.calls, 0);
  const errorTotal = o.errors.reduce((s, e) => s + e.count, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Operations</p>
          <h1 className="mt-2 text-3xl font-semibold">ภาพรวมระบบ</h1>
          <p className="mt-1 text-sm text-ivory-dim">
            ตั้งแต่เริ่มต้น: {num(o.all_time.readings)} การอ่านไพ่ · {num(o.all_time.users)} ผู้ใช้
          </p>
        </div>
        {/* filter row sits above everything it scopes */}
        <nav className="flex gap-1 rounded-full border border-white/10 p-1" aria-label="ช่วงเวลา">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/admin?days=${r}`}
              aria-current={r === days ? "true" : undefined}
              className={clsx(
                "rounded-full px-4 py-1.5 text-sm transition-colors",
                r === days ? "bg-gold/15 text-gold-light" : "text-ivory-dim hover:text-ivory",
              )}
            >
              {r} วัน
            </Link>
          ))}
        </nav>
      </div>

      {!ai.configured && (
        <p role="alert" className="panel border-amber-400/40 px-5 py-4 text-sm text-amber-100">
          Configuration Missing — ยังไม่มีผู้ให้บริการ AI ที่ใช้งานได้ ผู้ใช้จะอ่านไพ่ไม่ได้
        </p>
      )}

      <section aria-label="ตัวชี้วัดหลัก" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          label="การอ่านไพ่"
          value={num(o.period.readings)}
          sub={`อ่านจนจบ ${pct(o.period.interpreted, o.period.readings)} (${num(o.period.interpreted)})`}
        />
        <Tile
          label="ผู้ใช้ที่ใช้งาน"
          value={num(o.period.users)}
          sub={`มีบัญชี ${num(o.period.accounts)} · กลับมาใช้ซ้ำ ${pct(o.returning_users, o.period.users)}`}
        />
        <Tile
          label="ถามต่อ"
          value={num(o.followups)}
          sub={`ไพ่เสริม ${num(o.clarifiers)} ใบ · บันทึก ${num(o.journals)}`}
        />
        <Tile
          label="ต้นทุน AI โดยประมาณ"
          value={usd(totalCost)}
          sub={
            interpretCalls > 0
              ? `≈ ${usd(interpretCost / interpretCalls)} ต่อการตีความ 1 ครั้ง`
              : "ยังไม่มีการเรียก AI"
          }
        />
        <Tile
          label="คุณภาพคำอ่าน"
          value={pct(o.quality.passed, o.quality.total)}
          sub={`ผ่านการตรวจ ${num(o.quality.passed)}/${num(o.quality.total)} · ต้องแก้รอบสอง ${num(o.quality.retried)}`}
        />
        <Tile
          label="เครดิต"
          value={settings.credits.enabled ? num(o.credits.spent) : "ปิดอยู่"}
          sub={
            settings.credits.enabled
              ? `ใช้ไป · แจก/เติม ${num(o.credits.granted)}`
              : "ใช้โควตารายวันแทน (เปิดได้ในตั้งค่า)"
          }
        />
        <Tile label="ข้อผิดพลาดของระบบ" value={num(errorTotal)} sub="ดูรายละเอียดในบันทึกระบบ" />
        <Tile label="รายได้" value="–" sub="ยังไม่ได้เชื่อมระบบชำระเงิน" />
      </section>

      <section className="panel p-6" aria-labelledby="daily-title">
        <h2 id="daily-title" className="text-xl font-semibold">
          การอ่านไพ่ต่อวัน
        </h2>
        <p className="mb-5 mt-1 text-sm text-ivory-dim">{days} วันล่าสุด (เวลาประเทศไทย)</p>
        <DailyBars data={o.daily} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-6" aria-labelledby="spread-title">
          <h2 id="spread-title" className="text-xl font-semibold">
            รูปแบบการวางไพ่ยอดนิยม
          </h2>
          <div className="mt-5">
            <BarList
              items={o.by_spread.slice(0, 8).map((s) => ({
                label: kb.spread(s.key)?.nameTh ?? s.key,
                value: s.count,
              }))}
            />
          </div>
        </section>
        <section className="panel p-6" aria-labelledby="category-title">
          <h2 id="category-title" className="text-xl font-semibold">
            หมวดคำถามยอดนิยม
          </h2>
          <div className="mt-5">
            <BarList
              items={o.by_category.slice(0, 8).map((c) => ({
                label: CATEGORY_TH[c.key] ?? (c.key === "unknown" ? "ไม่ระบุ" : c.key),
                value: c.count,
              }))}
            />
          </div>
        </section>
      </div>

      <section className="panel p-6" aria-labelledby="usage-title">
        <h2 id="usage-title" className="text-xl font-semibold">
          การใช้งานและต้นทุน AI
        </h2>
        <p className="mt-1 text-sm text-ivory-dim">
          ต้นทุนคำนวณจากจำนวน token จริง × ราคาต่อล้าน token ที่ตั้งไว้ในหน้าตั้งค่า (เป็นค่าประมาณ ไม่ใช่ใบแจ้งหนี้)
          {unpriced > 0 && ` · มี ${unpriced} รายการที่ยังไม่ได้ตั้งราคาโมเดล`}
        </p>
        {costRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-ivory-dim">ยังไม่มีการเรียก AI ในช่วงเวลานี้</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-ivory-dim">
                <tr className="border-b border-white/10">
                  <th scope="col" className="py-2 pr-4 font-medium">งาน</th>
                  <th scope="col" className="py-2 pr-4 font-medium">โมเดล</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">ครั้ง</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Token เข้า</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Token ออก</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">ต้นทุน</th>
                  <th scope="col" className="py-2 text-right font-medium">ต่อครั้ง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {costRows.map((r) => (
                  <tr key={`${r.feature}-${r.provider}-${r.model}`}>
                    <td className="py-2.5 pr-4 text-ivory">{FEATURE_TH[r.feature] ?? r.feature}</td>
                    <td className="py-2.5 pr-4 text-ivory-dim">
                      {r.model ?? "–"}
                      <span className="ml-2 text-xs text-ivory-dim/60">
                        {r.provider === "anthropic" ? "Anthropic" : "AI Gateway"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-ivory">{num(r.calls)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-ivory-dim">{num(r.input_tokens)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-ivory-dim">{num(r.output_tokens)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-ivory">
                      {r.cost === null ? "ไม่มีราคา" : usd(r.cost)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-ivory-dim">
                      {r.cost === null ? "–" : usd(r.cost / r.calls)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/15">
                  <td colSpan={5} className="py-2.5 pr-4 text-ivory-dim">รวม</td>
                  <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-ivory">{usd(totalCost)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {o.errors.length > 0 && (
        <section className="panel p-6" aria-labelledby="errors-title">
          <div className="flex items-center justify-between">
            <h2 id="errors-title" className="text-xl font-semibold">
              ข้อผิดพลาดตามประเภท
            </h2>
            <Link href="/admin/logs" className="text-sm text-gold hover:text-gold-light">
              ดูบันทึกทั้งหมด
            </Link>
          </div>
          <div className="mt-5">
            <BarList items={o.errors.map((e) => ({ label: e.code, value: e.count }))} />
          </div>
        </section>
      )}
    </div>
  );
}
