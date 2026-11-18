import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { UtmBuilder } from "@/components/admin/UtmBuilder";
import { requireAdminPage } from "@/lib/admin";
import { formatThb } from "@/lib/billing/provider";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "การเติบโต" };

interface Funnel {
  days: number;
  steps: { key: string; count: number }[];
  revenue_minor: number;
  sources: {
    source: string;
    medium: string;
    users: number;
    signups: number;
    readers: number;
    payers: number;
    revenue_minor: number;
  }[];
  top_pages: { path: string; visitors: number }[];
  shares: { channel: string; shares: number; people: number }[];
  quality: { people: number; without_source: number; direct: number };
}

const STEP_TH: Record<string, string> = {
  visitors: "ผู้เข้าชมเว็บ",
  daily: "เปิดไพ่ประจำวัน",
  share: "แชร์ไพ่ประจำวัน",
  signups: "สมัครสมาชิกใหม่",
  readers: "เริ่มอ่านไพ่ (เปิดไพ่ตามคำถาม)",
  interpreted: "ได้คำอ่านจาก AI",
  out_of_credits: "เจอ \"เครดิตไม่พอ\"",
  pricing: "ดูหน้าแพ็กเกจ",
  checkout: "เริ่มชำระเงิน",
  payers: "ชำระเงินสำเร็จ",
};

const SOURCE_TH: Record<string, string> = {
  direct: "พิมพ์ที่อยู่เอง / ไม่ทราบที่มา",
  unknown: "ก่อนเริ่มวัดผล",
};

const PAGE_TH: Record<string, string> = {
  "/": "หน้าแรก",
  "/home": "หน้าหลัก (แอป)",
  "/daily": "ไพ่ประจำวัน",
  "/ask": "ถามไพ่",
  "/history": "ประวัติ",
  "/journal": "บันทึก",
  "/cards": "คลังไพ่",
  "/pricing": "แพ็กเกจ",
  "/account": "บัญชี",
  "/terms": "ข้อตกลง",
  "/reading/[id]": "หน้าผลการอ่านไพ่",
  "/pay/[id]": "หน้าชำระเงิน",
  "/share/daily": "หน้าไพ่ที่มีคนแชร์มา",
};

const CHANNEL_TH: Record<string, string> = {
  native: "แชร์จากมือถือ",
  line: "LINE",
  facebook: "Facebook",
  x: "X",
  copy: "คัดลอกลิงก์",
  download: "บันทึกรูป",
};

const PERIODS = [7, 30, 90];
const MIN_SAMPLE = 30;
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

export default async function AdminGrowthPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const admin = await requireAdminPage();
  const requested = Number((await searchParams).days);
  const days = PERIODS.includes(requested) ? requested : 30;
  const { data, error } = await admin.supabase.rpc("arcana_admin_funnel", { p_days: days });
  const funnel = data as Funnel | null;
  const top = funnel ? Math.max(1, ...funnel.steps.map((s) => s.count)) : 1;
  const visitors = funnel?.steps.find((s) => s.key === "visitors")?.count ?? 0;
  const searchConsole = Boolean(process.env.GOOGLE_SITE_VERIFICATION);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Growth</p>
          <h1 className="mt-2 text-3xl font-semibold">การเติบโต</h1>
          <p className="mt-1 max-w-2xl text-sm text-ivory-dim">
            วัดด้วยระบบของเว็บเอง ไม่ใช้เครื่องมือของบุคคลที่สาม เริ่มเก็บข้อมูลการเข้าชมตั้งแต่ 18 พ.ย. 2569
            ไม่นับการเข้าชมของผู้ดูแลระบบและบอต
          </p>
        </div>
        <nav className="flex gap-1" aria-label="ช่วงเวลา">
          {PERIODS.map((d) => (
            <Link
              key={d}
              href={`/admin/growth?days=${d}`}
              aria-current={d === days ? "page" : undefined}
              className={clsx(
                "rounded-full px-4 py-2 text-sm",
                d === days ? "bg-gold/15 text-gold-light" : "text-ivory-dim hover:bg-white/5 hover:text-ivory",
              )}
            >
              {d} วัน
            </Link>
          ))}
        </nav>
      </div>

      {error || !funnel ? (
        <p role="alert" className="panel border-red-400/30 p-6 text-red-200">
          โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้านี้
        </p>
      ) : (
        <>
          {visitors < MIN_SAMPLE && (
            <p role="status" className="panel border-amber-400/40 px-5 py-4 text-sm text-amber-100">
              ตัวอย่างยังน้อย ({visitors} คน) — ตัวเลขด้านล่างยังใช้สรุปหรือเปรียบเทียบไม่ได้
              ควรรอให้มีผู้เข้าชมอย่างน้อย {MIN_SAMPLE} คนในช่วงที่เลือก
            </p>
          )}

          <section className="panel p-6" aria-labelledby="funnel-title">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="funnel-title" className="text-xl font-semibold">
                เส้นทางผู้ใช้ {funnel.days} วันล่าสุด
              </h2>
              <p className="text-sm text-ivory-dim">
                รายได้จริง <span className="font-sans tabular-nums text-gold-light">{formatThb(funnel.revenue_minor)}</span>
              </p>
            </div>
            <table className="mt-5 w-full text-left text-sm">
              <thead className="text-xs text-ivory-dim">
                <tr className="border-b border-white/10">
                  <th scope="col" className="py-2 pr-4 font-medium">ขั้น</th>
                  <th scope="col" className="w-1/2 py-2 pr-4 font-medium">
                    <span className="sr-only">สัดส่วน</span>
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">คน</th>
                  <th scope="col" className="py-2 text-right font-medium">ต่อผู้เข้าชม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {funnel.steps.map((s) => (
                  <tr key={s.key}>
                    <th scope="row" className="py-2.5 pr-4 font-normal text-ivory">
                      {STEP_TH[s.key] ?? s.key}
                    </th>
                    <td className="py-2.5 pr-4" aria-hidden="true">
                      <div className="h-2 rounded-full bg-white/5">
                        <div
                          className="h-2 rounded-full bg-gold"
                          style={{ width: `${s.count === 0 ? 0 : Math.max(2, (s.count / top) * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-right font-sans tabular-nums text-ivory">{s.count}</td>
                    <td className="py-2.5 text-right font-sans tabular-nums text-ivory-dim">
                      {s.key === "visitors" ? "–" : pct(s.count, visitors)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ivory-dim">
              แต่ละขั้นนับจำนวนคนที่ทำสิ่งนั้นในช่วงเวลาที่เลือก ไม่ใช่กลุ่มคนเดียวกันที่ไล่ผ่านทุกขั้น
              คนที่ใช้หลายอุปกรณ์หรือล้างคุกกี้จะถูกนับเป็นหลายคน และรายได้นับเฉพาะรายการชำระเงินจริงที่สำเร็จ
            </p>
          </section>

          <section className="panel p-6" aria-labelledby="sources-title">
            <h2 id="sources-title" className="text-xl font-semibold">
              มาจากช่องทางไหน
            </h2>
            <p className="mt-1 text-sm text-ivory-dim">
              จัดตามช่องทางแรกที่พาแต่ละคนมาเจอเว็บ (first touch) — เป็นการประมาณ ไม่ใช่ความจริงสมบูรณ์
            </p>
            {funnel.sources.length === 0 ? (
              <p className="mt-4 text-sm text-ivory-dim">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs text-ivory-dim">
                    <tr className="border-b border-white/10">
                      <th scope="col" className="py-2 pr-4 font-medium">ช่องทาง</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">คน</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">สมัคร</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">อ่านไพ่</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">จ่ายเงิน</th>
                      <th scope="col" className="py-2 text-right font-medium">รายได้</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {funnel.sources.map((s) => (
                      <tr key={s.source}>
                        <th scope="row" className="py-2.5 pr-4 font-normal text-ivory">
                          {SOURCE_TH[s.source] ?? s.source}
                          {s.medium && <span className="ml-2 text-xs text-ivory-dim">{s.medium}</span>}
                        </th>
                        <td className="py-2.5 pr-4 text-right font-sans tabular-nums">{s.users}</td>
                        <td className="py-2.5 pr-4 text-right font-sans tabular-nums">{s.signups}</td>
                        <td className="py-2.5 pr-4 text-right font-sans tabular-nums">{s.readers}</td>
                        <td className="py-2.5 pr-4 text-right font-sans tabular-nums">{s.payers}</td>
                        <td className="py-2.5 text-right font-sans tabular-nums text-gold-light">
                          {formatThb(s.revenue_minor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-ivory-dim">
              คุณภาพข้อมูล: {funnel.quality.people} คน · ไม่ทราบที่มา (พิมพ์ที่อยู่เองหรือแอปไม่ส่งข้อมูล){" "}
              {pct(funnel.quality.direct, funnel.quality.people)} · ก่อนเริ่มวัดผล{" "}
              {pct(funnel.quality.without_source, funnel.quality.people)} — ลิงก์ที่แชร์ใน LINE และบางแอปมักไม่บอกที่มา
              ใช้ลิงก์แคมเปญด้านล่างเพื่อให้นับถูกช่องทาง
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="panel p-6" aria-labelledby="pages-title">
              <h2 id="pages-title" className="text-xl font-semibold">
                หน้าที่มีคนเข้ามากที่สุด
              </h2>
              {funnel.shares.length > 0 && (
                <p className="mt-2 text-sm text-ivory-dim">
                  แชร์ไพ่ประจำวัน:{" "}
                  {funnel.shares.map((s) => `${CHANNEL_TH[s.channel] ?? s.channel} ${s.shares}`).join(" · ")}
                  {" "}— คนที่เข้ามาจากลิงก์ที่แชร์จะอยู่ในตารางช่องทางเป็น medium &quot;share&quot;
                </p>
              )}
              {funnel.top_pages.length === 0 ? (
                <p className="mt-4 text-sm text-ivory-dim">ยังไม่มีข้อมูล</p>
              ) : (
                <ul className="mt-4 divide-y divide-white/5 text-sm">
                  {funnel.top_pages.map((p) => (
                    <li key={p.path} className="flex justify-between gap-4 py-2">
                      <span className="min-w-0 truncate text-ivory">
                        {PAGE_TH[p.path] ?? (p.path.startsWith("/cards/") ? `ไพ่ ${p.path.slice(7)}` : p.path)}
                      </span>
                      <span className="shrink-0 font-sans tabular-nums text-ivory-dim">{p.visitors} คน</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel p-6" aria-labelledby="seo-title">
              <h2 id="seo-title" className="text-xl font-semibold">
                การค้นหาบน Google
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ivory-dim">Sitemap</dt>
                  <dd>
                    <a href="/sitemap.xml" className="text-gold underline-offset-4 hover:underline">
                      /sitemap.xml
                    </a>{" "}
                    <span className="text-ivory-dim">(หน้าสาธารณะ 5 หน้า + ไพ่ 78 ใบ)</span>
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ivory-dim">Google Search Console</dt>
                  <dd className={searchConsole ? "text-gold-light" : "text-amber-200"}>
                    {searchConsole ? "ใส่แท็กยืนยันแล้ว" : "NOT CONNECTED"}
                  </dd>
                </div>
              </dl>
              {!searchConsole && (
                <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-ivory-dim">
                  <li>เปิด Google Search Console แล้วเพิ่มพร็อพเพอร์ตีแบบ URL prefix: {siteUrl()}</li>
                  <li>เลือกยืนยันด้วย HTML tag แล้วคัดลอกเฉพาะค่าใน content=&quot;…&quot;</li>
                  <li>
                    ตั้งค่า <code className="font-mono text-gold-light">GOOGLE_SITE_VERIFICATION</code> บน Vercel แล้ว
                    Redeploy จากนั้นกด Verify และส่ง sitemap
                  </li>
                </ol>
              )}
              <p className="mt-4 text-xs text-ivory-dim">
                ข้อมูลคำค้นและอันดับอยู่ใน Search Console ยังไม่ได้ดึงมาแสดงที่นี่
              </p>
            </section>
          </div>
        </>
      )}

      <section className="panel p-6" aria-labelledby="utm-title">
        <h2 id="utm-title" className="text-xl font-semibold">
          สร้างลิงก์แคมเปญ
        </h2>
        <p className="mt-1 text-sm text-ivory-dim">
          ใช้ลิงก์นี้เวลาโพสต์หรือลงโฆษณา คนที่เข้ามาจะถูกนับในตาราง &quot;มาจากช่องทางไหน&quot; ตามชื่อที่ตั้ง
        </p>
        <div className="mt-4">
          <UtmBuilder base={siteUrl()} />
        </div>
      </section>
    </div>
  );
}
