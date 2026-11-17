import { AlertTriangle, Compass, Eye, Lightbulb, Mountain, ShieldAlert, Sprout } from "lucide-react";
import type { Interpretation } from "@/lib/ai/schemas";
import type { DrawnCard, SpreadPosition, TarotCard } from "@/lib/tarot/types";

function Section({
  n,
  title,
  icon: Icon,
  children,
}: {
  n: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-white/10 pt-7">
      <h3 className="flex items-center gap-3 text-xl font-semibold text-ivory">
        <span className="font-serif text-sm text-gold">{n}</span>
        {Icon && <Icon className="h-5 w-5 text-gold" aria-hidden="true" />}
        {title}
      </h3>
      <div className="mt-3 text-[15.5px] leading-[1.9] text-ivory/90">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((x, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}

export function InterpretationView({
  data,
  drawn,
  positions,
  quality,
  cardOf,
}: {
  data: Interpretation;
  drawn: DrawnCard[];
  positions: SpreadPosition[];
  quality: { passed: boolean; attempts: number; issues: string[] } | null;
  cardOf: (id: string) => TarotCard;
}) {
  const byPosition = new Map(drawn.map((d) => [d.position, d]));

  return (
    <article className="panel p-6 sm:p-10" aria-labelledby="reading-title">
      <header>
        <p className="eyebrow">Your Reading</p>
        <h2 id="reading-title" className="mt-3 text-3xl font-semibold sm:text-4xl">
          {data.title}
        </h2>
        <p className="mt-4">
          <span className="chip px-4 py-1.5 text-sm">{data.tendency}</span>
        </p>
      </header>

      {/* 01 direct answer — always first */}
      <div className="mt-8 rounded-2xl border border-gold/40 bg-gold/[0.07] p-6">
        <h3 className="flex items-center gap-3 text-sm font-medium tracking-wide text-gold">
          <span className="font-serif">01</span> คำตอบโดยตรง
        </h3>
        <p className="mt-3 font-serif text-xl leading-[1.8] text-ivory sm:text-[22px]">
          {data.direct_answer}
        </p>
      </div>

      <div className="mt-8 space-y-7">
        <Section n="02" title="ภาพรวมสถานการณ์">
          <p>{data.overall_situation}</p>
        </Section>

        <Section n="03" title="ไพ่แต่ละใบในตำแหน่งของมัน">
          <div className="space-y-3">
            {data.cards.map((c) => {
              const d = byPosition.get(c.position);
              // card ids were verified against the draw before the reading was saved
              const card = d ? cardOf(d.cardId) : undefined;
              const pos = positions[c.position - 1];
              return (
                <details
                  key={c.position}
                  className="group rounded-xl border border-white/10 bg-midnight/40 open:border-gold/30"
                  open={data.cards.length <= 5}
                >
                  <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/50 font-serif text-sm text-gold">
                      {c.position}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-ivory-dim">{pos?.nameTh}</span>
                      <span className="block font-medium text-gold-light">
                        {card?.name ?? c.card_id}
                        <span className="ml-2 text-xs font-normal text-ivory-dim">
                          {card?.nameTh} · {d?.orientation === "reversed" ? "กลับหัว" : "ตั้งตรง"}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm text-ivory">{c.headline}</span>
                    </span>
                    <span className="mt-1 text-gold transition-transform group-open:rotate-180" aria-hidden="true">
                      ▾
                    </span>
                  </summary>
                  <p className="border-t border-white/10 px-4 pb-4 pt-3 text-[15px] text-ivory/90">
                    {c.interpretation}
                  </p>
                </details>
              );
            })}
          </div>
        </Section>

        <Section n="04" title="ความสัมพันธ์ระหว่างไพ่">
          <p>{data.card_relationships}</p>
          <p className="mt-4 rounded-xl border border-white/10 bg-midnight/40 p-4 text-sm text-ivory-dim">
            <span className="text-gold">พลังงานโดยรวม — </span>
            {data.energy_analysis}
          </p>
        </Section>

        <Section n="05" title="สิ่งที่ซ่อนอยู่" icon={Eye}>
          <p>{data.hidden_factors}</p>
        </Section>

        <Section n="06" title="โอกาส" icon={Sprout}>
          <Bullets items={data.opportunities} />
        </Section>

        <Section n="07" title="อุปสรรค" icon={Mountain}>
          <Bullets items={data.obstacles} />
        </Section>

        <Section n="08" title="แนวโน้มข้างหน้า" icon={Compass}>
          <p>{data.future_direction}</p>
        </Section>

        <Section n="09" title="คำแนะนำ" icon={Lightbulb}>
          <ol className="space-y-3">
            {data.advice.map((a, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs text-gold">
                  {i + 1}
                </span>
                <span>{a}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section n="10" title="สิ่งที่ควรระวัง" icon={ShieldAlert}>
          <Bullets items={data.cautions} />
        </Section>

        {data.timeline && data.timeline.length > 0 && (
          <Section n="11" title="แนวโน้มตามช่วงเวลา">
            <ol className="relative ml-2 space-y-5 border-l border-gold/30 pl-6">
              {data.timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[29px] top-2 h-2.5 w-2.5 rounded-full bg-gold" aria-hidden="true" />
                  <p className="font-medium text-gold-light">{t.period}</p>
                  <p className="text-ivory/90">{t.outlook}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-ivory-dim/70">
              ช่วงเวลาเป็นแนวโน้มเชิงสัญลักษณ์ ไม่ใช่การยืนยันว่าเหตุการณ์จะเกิดในช่วงนั้นแน่นอน
            </p>
          </Section>
        )}

        {data.alternative_scenarios && (
          <Section n={data.timeline?.length ? "12" : "11"} title="ถ้าเลือกทำ หรือเลือกรอ">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-midnight/40 p-4">
                <p className="text-sm font-medium text-gold">หากลงมือ</p>
                <p className="mt-1 text-[15px]">{data.alternative_scenarios.if_act}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-midnight/40 p-4">
                <p className="text-sm font-medium text-gold">หากรอดูก่อน</p>
                <p className="mt-1 text-[15px]">{data.alternative_scenarios.if_wait}</p>
              </div>
            </div>
          </Section>
        )}

        <section className="rounded-2xl border border-gold/30 bg-gradient-to-b from-navy-light/60 to-transparent p-6">
          <h3 className="text-sm font-medium tracking-wide text-gold">บทสรุปจากไพ่</h3>
          <p className="mt-3 font-serif text-lg leading-[1.85] text-ivory">{data.conclusion}</p>
        </section>

        {quality && !quality.passed && (
          <p className="flex gap-2 rounded-xl border border-amber-400/30 bg-amber-950/30 px-4 py-3 text-xs text-amber-100">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            คำอ่านนี้ผ่านการตรวจโครงสร้างและความถูกต้องของไพ่แล้ว แต่ระบบตรวจคุณภาพยังมีข้อสังเกตบางประการ
            โปรดใช้วิจารณญาณประกอบ
          </p>
        )}
      </div>
    </article>
  );
}
