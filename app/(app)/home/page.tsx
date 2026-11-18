import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Flame, Sparkles } from "lucide-react";
import { RenewalBanner } from "@/components/account/RenewalBanner";
import { CardBack } from "@/components/tarot/CardBack";
import { renewalNotice, type RenewalNotice } from "@/lib/billing/renewal";
import type { MySubscription } from "@/lib/billing/service";
import { aiStatus } from "@/lib/ai/provider";
import type { ReadingRow } from "@/lib/data/readings";
import { getDailyState, type DailyState } from "@/lib/data/daily";
import { formatThaiDate } from "@/lib/format";
import { getContext, supabaseConfigured } from "@/lib/supabase/server";
import { DEFAULT_KNOWLEDGE, getKnowledge } from "@/lib/tarot/knowledge";

export const metadata: Metadata = { title: "หน้าหลัก" };

const QUICK = [
  { label: "ช่วงนี้การงานของฉันจะเป็นอย่างไร", q: "ช่วงนี้การงานของฉันจะเป็นอย่างไรบ้าง" },
  { label: "ความรักของฉันกำลังไปทางไหน", q: "ความรักของฉันในช่วงนี้กำลังไปในทิศทางไหน" },
  { label: "สิ่งที่ฉันควรรู้ในตอนนี้", q: "มีอะไรที่ฉันควรรู้ในช่วงเวลานี้" },
  { label: "การเงินเดือนนี้", q: "การเงินของฉันเดือนนี้จะเป็นอย่างไร" },
];

export default async function HomePage() {
  let recent: Pick<ReadingRow, "id" | "question" | "spread_id" | "status" | "title" | "tendency" | "created_at">[] = [];
  let daily: DailyState | null = null;
  let renewal: RenewalNotice | null = null;
  let kb = DEFAULT_KNOWLEDGE;
  if (supabaseConfigured()) {
    try {
      const { supabase } = await getContext();
      const [k, d, sub] = await Promise.all([
        getKnowledge(supabase),
        getDailyState(supabase),
        supabase.rpc("arcana_my_subscription"),
      ]);
      kb = k;
      daily = d;
      renewal = renewalNotice((sub.data ?? null) as MySubscription | null);
      const { data } = await supabase
        .from("arcana_readings")
        .select("id, question, spread_id, status, title, tendency, created_at")
        .order("created_at", { ascending: false })
        .limit(4);
      recent = data ?? [];
    } catch {
      // surfaced by the layout's configuration banner
    }
  }

  const todayCard = daily?.today ? kb.card(daily.today.card_id) : undefined;
  const todayReversed = daily?.today?.orientation === "reversed";
  const ai = await aiStatus();

  return (
    <div className="space-y-12">
      {renewal && <RenewalBanner notice={renewal} />}
      {!ai.configured && (
        <div role="alert" className="panel border-amber-400/40 px-5 py-4 text-sm text-amber-100">
          <strong>Configuration Missing:</strong> ยังไม่ได้ตั้งค่า AI (ANTHROPIC_API_KEY)
          — คุณยังเปิดไพ่และดูความหมายรายใบได้ แต่ระบบจะไม่สร้างคำอ่านจนกว่าจะตั้งค่าเสร็จ
        </div>
      )}

      {/* ask CTA */}
      <section className="panel-gold relative overflow-hidden px-6 py-10 sm:px-12 sm:py-14">
        <div className="stars pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="relative">
          <p className="eyebrow">Ask the cards</p>
          <h1 className="mt-4 max-w-2xl text-3xl font-semibold sm:text-5xl">
            วันนี้คุณอยากเข้าใจเรื่องอะไร?
          </h1>
          <p className="mt-4 max-w-xl text-ivory-dim">
            พิมพ์คำถามด้วยภาษาของคุณ ARCANA จะทำความเข้าใจ เลือกรูปแบบการวางไพ่
            และอ่านไพ่ให้อย่างตรงประเด็น
          </p>
          <Link href="/ask" className="btn-gold mt-7">
            <Sparkles className="h-4 w-4" /> เริ่มถามไพ่
          </Link>
          <div className="mt-7 flex flex-wrap gap-2">
            {QUICK.map((x) => (
              <Link
                key={x.label}
                href={`/ask?q=${encodeURIComponent(x.q)}`}
                className="rounded-full border border-white/15 bg-midnight/40 px-4 py-2 text-sm text-ivory-dim transition-colors hover:border-gold/50 hover:text-ivory"
              >
                {x.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        {/* daily card */}
        <section aria-labelledby="daily-title" className="panel p-6 sm:p-8">
          <p className="eyebrow">Daily Tarot · {formatThaiDate(new Date().toISOString())}</p>
          <h2 id="daily-title" className="mt-3 text-2xl font-semibold">
            ไพ่ประจำวันของคุณ
          </h2>
          {todayCard ? (
            <>
              <div className="mt-6 flex gap-5">
                <Link
                  href="/daily"
                  className="relative aspect-[10/17] w-28 shrink-0 overflow-hidden rounded-xl border border-gold/50 shadow-card sm:w-32"
                >
                  <Image
                    src={todayCard.image}
                    alt={todayCard.name}
                    fill
                    sizes="140px"
                    className={todayReversed ? "rotate-180 object-cover" : "object-cover"}
                  />
                </Link>
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold text-gold-light">{todayCard.name}</h3>
                  <p className="text-sm text-ivory-dim">
                    {todayCard.nameTh} · {todayReversed ? "กลับหัว" : "ตั้งตรง"}
                  </p>
                  <p className="mt-3 line-clamp-4 text-sm text-ivory">
                    {todayReversed ? todayCard.reversedTh : todayCard.uprightTh}
                  </p>
                </div>
              </div>
              <Link href="/daily" className="btn-ghost mt-6 px-5 py-2.5 text-sm">
                อ่านสารประจำวันของคุณ <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <div className="mt-6 flex items-center gap-5">
              <Link
                href="/daily"
                aria-label="เปิดไพ่ประจำวัน"
                className="relative aspect-[10/17] w-28 shrink-0 overflow-hidden rounded-xl shadow-card transition-transform hover:-translate-y-1 motion-reduce:transform-none sm:w-32"
              >
                <CardBack className="h-full w-full" />
              </Link>
              <div className="min-w-0">
                <p className="text-ivory">
                  ไพ่ของวันนี้ยังคว่ำอยู่ — เปิดได้ฟรีทุกวัน วันละหนึ่งใบ พร้อมสารประจำวันจาก ARCANA
                </p>
                <Link href="/daily" className="btn-gold mt-4 px-5 py-2.5 text-sm">
                  <Sparkles className="h-4 w-4" /> เปิดไพ่ประจำวัน
                </Link>
              </div>
            </div>
          )}
          {(daily?.streak ?? 0) > 0 && (
            <p className="mt-5 flex items-center gap-2 text-sm text-ivory-dim">
              <Flame className="h-4 w-4 text-gold" aria-hidden="true" />
              เปิดไพ่ต่อเนื่อง {daily?.streak} วัน
            </p>
          )}
        </section>

        {/* recent readings */}
        <section aria-labelledby="recent-title" className="panel p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <h2 id="recent-title" className="text-2xl font-semibold">
              การอ่านไพ่ล่าสุด
            </h2>
            {recent.length > 0 && (
              <Link href="/history" className="text-sm text-gold hover:text-gold-light">
                ดูทั้งหมด
              </Link>
            )}
          </div>
          {recent.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-white/15 px-6 py-10 text-center">
              <p className="text-ivory-dim">ยังไม่มีประวัติการอ่านไพ่</p>
              <Link href="/ask" className="mt-3 inline-flex items-center gap-1 text-gold hover:text-gold-light">
                เริ่มการอ่านไพ่ครั้งแรก <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <ul className="mt-5 divide-y divide-white/10">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/reading/${r.id}`} className="group block py-4">
                    <p className="line-clamp-1 font-medium text-ivory group-hover:text-gold-light">
                      {r.title ?? r.question}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ivory-dim">
                      <span>{kb.spread(r.spread_id)?.nameTh ?? r.spread_id}</span>
                      <span>{formatThaiDate(r.created_at)}</span>
                      {r.status === "interpreted" && r.tendency ? (
                        <span className="chip">{r.tendency}</span>
                      ) : (
                        <span className="chip border-white/20 bg-white/5 text-ivory-dim">รออ่านไพ่</span>
                      )}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <nav aria-label="ลิงก์เพิ่มเติม" className="flex flex-wrap gap-3 text-sm">
        <Link href="/cards" className="btn-quiet border border-white/15">
          คลังไพ่ 78 ใบ
        </Link>
        <Link href="/pricing" className="btn-quiet border border-white/15">
          แพ็กเกจและเครดิต
        </Link>
      </nav>
    </div>
  );
}
