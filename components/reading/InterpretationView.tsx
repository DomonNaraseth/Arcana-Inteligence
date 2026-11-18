"use client";

import { useMemo } from "react";
import { AlertTriangle, Compass, Eye, Lightbulb, Mountain, ShieldAlert, Sprout } from "lucide-react";
import type { Interpretation } from "@/lib/ai/schemas";
import { readingNarration, type NarrationPart } from "@/lib/speech/narration";
import type { DrawnCard, SpreadPosition, TarotCard } from "@/lib/tarot/types";
import { ListenAll } from "@/components/speech/ListenAll";
import { ListenButton } from "@/components/speech/ListenButton";
import { useNarrator } from "@/components/speech/narrator";
import { CardThumb } from "@/components/tarot/CardThumb";
import { CardProse, CardProseProvider, type ProseCard } from "./CardProse";

/** Read-aloud wiring shared by every section of one reading. */
interface Narration {
  parts: NarrationPart[];
  /** id of the part being read right now, if any */
  reading: string | null;
}

function Listen({ id, narration, label }: { id: string; narration: Narration; label: string }) {
  const part = narration.parts.find((p) => p.id === id);
  if (!part) return null;
  return <ListenButton parts={[part]} scope={`reading:${id}`} label={label} />;
}

function Section({
  id,
  n,
  title,
  icon: Icon,
  narration,
  children,
}: {
  id: string;
  n: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  narration: Narration;
  children: React.ReactNode;
}) {
  return (
    <section
      className="border-t border-white/10 pt-7"
      data-narration-part={id}
      data-reading={narration.reading === id || undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-3 pt-2 text-xl font-semibold text-ivory">
          <span className="font-serif text-sm text-gold">{n}</span>
          {Icon && <Icon className="h-5 w-5 text-gold" aria-hidden="true" />}
          {title}
        </h3>
        <Listen id={id} narration={narration} label={`หัวข้อ${title}`} />
      </div>
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
          <span>
            <CardProse text={x} />
          </span>
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
  const parts = useMemo(
    () => readingNarration({ data, drawn, positions, cardOf }),
    [data, drawn, positions, cardOf],
  );
  const n = useNarrator();
  const narration: Narration = {
    parts,
    reading: n.status !== "idle" && n.scope?.startsWith("reading:") ? n.partId : null,
  };
  const proseCards = useMemo<ProseCard[]>(
    () =>
      drawn.map((d) => {
        const c = cardOf(d.cardId);
        return { id: c.id, name: c.name, nameTh: c.nameTh, reversed: d.orientation === "reversed" };
      }),
    [drawn, cardOf],
  );
  const thumb = (position: number, className?: string, sizes?: string) => {
    const d = byPosition.get(position);
    if (!d) return null;
    const c = cardOf(d.cardId);
    return (
      <CardThumb
        image={c.image}
        alt={`${c.name} (${c.nameTh})${d.orientation === "reversed" ? " กลับหัว" : ""}`}
        orientation={d.orientation}
        className={className}
        sizes={sizes}
        badge={position}
      />
    );
  };

  return (
    <CardProseProvider value={proseCards}>
    <article className="panel p-6 sm:p-10" aria-labelledby="reading-title">
      <header>
        <p className="eyebrow">Your Reading</p>
        <h2 id="reading-title" className="mt-3 text-3xl font-semibold sm:text-4xl">
          {data.title}
        </h2>
        <p className="mt-4">
          <span className="chip px-4 py-1.5 text-sm">{data.tendency}</span>
        </p>
        <div className="mt-6 print:hidden">
          <ListenAll parts={parts} scope="reading:all" />
        </div>
      </header>

      {/* 01 direct answer — always first */}
      <div
        className="mt-8 rounded-2xl border border-gold/40 bg-gold/[0.07] p-6"
        data-narration-part="direct"
        data-reading={narration.reading === "direct" || undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-3 pt-3 text-sm font-medium tracking-wide text-gold">
            <span className="font-serif">01</span> คำตอบโดยตรง
          </h3>
          <Listen id="direct" narration={narration} label="คำตอบโดยตรง" />
        </div>
        {data.cards.length <= 12 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="ไพ่ที่เปิดได้">
            {data.cards.map((c) => (
              <li key={c.position}>{thumb(c.position, "w-10 sm:w-12", "48px")}</li>
            ))}
          </ul>
        )}
        <p className="mt-4 font-serif text-lg leading-[1.85] text-ivory sm:text-xl">
          <CardProse text={data.direct_answer} />
        </p>
      </div>

      {/* one answer per question, when several were asked (prompt v3 on) */}
      {data.sub_answers && data.sub_answers.length > 0 && (
        <section
          className="mt-5 rounded-2xl border border-gold/25 bg-navy-light/30 p-5 sm:p-6"
          aria-labelledby="subanswers-title"
          data-narration-part="sub-answers"
          data-reading={narration.reading === "sub-answers" || undefined}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 id="subanswers-title" className="pt-3 text-sm font-medium tracking-wide text-gold">
              คำตอบแยกตามคำถามของคุณ
            </h3>
            <Listen id="sub-answers" narration={narration} label="คำตอบแยกตามคำถาม" />
          </div>
          <ol className="mt-4 space-y-5">
            {data.sub_answers.map((a, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/50 font-serif text-sm text-gold">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-gold-light">{a.question}</p>
                  <p className="mt-1 text-[15px] leading-[1.85] text-ivory/90">
                    <CardProse text={a.answer} />
                  </p>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {a.positions.map((p) => (
                      <span key={p}>{thumb(p, "w-7", "32px")}</span>
                    ))}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* close-to-the-question examples (readings from prompt v2 on) */}
      {data.examples && data.examples.length > 0 && (
        <section
          className="mt-5 rounded-2xl border border-white/10 bg-midnight/40 p-5 sm:p-6"
          aria-labelledby="examples-title"
          data-narration-part="examples"
          data-reading={narration.reading === "examples" || undefined}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 id="examples-title" className="pt-3 text-sm font-medium tracking-wide text-gold">
              ตัวอย่างที่ใกล้กับเรื่องของคุณ
            </h3>
            <Listen id="examples" narration={narration} label="ตัวอย่างที่ใกล้กับเรื่องของคุณ" />
          </div>
          <ul className="mt-4 space-y-4">
            {data.examples.map((e, i) => (
              <li key={i} className="border-l-2 border-gold/40 pl-4">
                {e.dimension && (
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold/70">{e.dimension}</p>
                )}
                <p className="font-medium text-gold-light">{e.title}</p>
                <p className="mt-1 text-[15px] leading-[1.85] text-ivory/90">
                  <CardProse text={e.example} />
                </p>
                <p className="mt-2.5 flex flex-wrap gap-2">
                  {e.positions.map((p) => {
                    const d = byPosition.get(p);
                    if (!d) return null;
                    const card = cardOf(d.cardId);
                    return (
                      <span
                        key={p}
                        className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/[0.06] py-1 pl-1 pr-3 text-xs text-ivory/90"
                      >
                        <CardThumb
                          image={card.image}
                          alt=""
                          orientation={d.orientation}
                          className="w-5 rounded-[3px] border-gold/30"
                          sizes="24px"
                        />
                        ใบที่ {p} · {card.nameTh}
                        {d.orientation === "reversed" && <span className="text-ivory-dim">(กลับหัว)</span>}
                      </span>
                    );
                  })}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ivory-dim/80">
            ตัวอย่างช่วยให้เห็นภาพว่าคำอ่านอาจปรากฏออกมาอย่างไรในเรื่องของคุณ ไม่ใช่การยืนยันว่าจะเกิดขึ้นแบบนี้
          </p>
        </section>
      )}

      <div className="mt-8 space-y-7">
        <Section id="overall" n="02" title="ภาพรวมสถานการณ์" narration={narration}>
          <p>
            <CardProse text={data.overall_situation} />
          </p>
        </Section>

        <section className="border-t border-white/10 pt-7">
          <div className="flex items-start justify-between gap-3">
            <h3 className="flex items-center gap-3 pt-2 text-xl font-semibold text-ivory">
              <span className="font-serif text-sm text-gold">03</span>
              ไพ่แต่ละใบในตำแหน่งของมัน
            </h3>
            {data.cards.length > 1 && (
              <ListenButton
                parts={parts.filter((p) => p.id.startsWith("card-"))}
                scope="reading:cards"
                label="ความหมายไพ่ทุกใบ"
              />
            )}
          </div>
          <div className="mt-3 space-y-3 text-[15.5px] leading-[1.9] text-ivory/90">
            {data.cards.map((c) => {
              const d = byPosition.get(c.position);
              // card ids were verified against the draw before the reading was saved
              const card = d ? cardOf(d.cardId) : undefined;
              const pos = positions[c.position - 1];
              const id = `card-${c.position}`;
              return (
                <details
                  key={c.position}
                  className="group rounded-xl border border-white/10 bg-midnight/40 open:border-gold/30"
                  open={data.cards.length <= 5}
                  data-narration-part={id}
                  data-reading={narration.reading === id || undefined}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-4 p-4 [&::-webkit-details-marker]:hidden">
                    {thumb(c.position, "w-12 sm:w-14 group-open:hidden", "64px")}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-ivory-dim">{pos?.nameTh}</span>
                      <span className="block font-medium text-gold-light">
                        {card?.name ?? c.card_id}
                        <span className="ml-2 text-xs font-normal text-ivory-dim">
                          {card?.nameTh} · {d?.orientation === "reversed" ? "กลับหัว" : "ตั้งตรง"}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm text-ivory">
                        <CardProse text={c.headline} />
                      </span>
                    </span>
                    <span className="mt-1 text-gold transition-transform group-open:rotate-180" aria-hidden="true">
                      ▾
                    </span>
                  </summary>
                  <div className="border-t border-white/10 px-4 pb-4 pt-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      {/* the card itself, larger, while its row is open */}
                      <div className="mx-auto sm:mx-0">{thumb(c.position, "w-36 sm:w-32", "160px")}</div>
                      <p className="flex-1 text-[15px] leading-[1.9] text-ivory/90">
                        <CardProse text={c.interpretation} />
                      </p>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Listen
                        id={id}
                        narration={narration}
                        label={`ไพ่ใบที่ ${c.position}${card ? ` ${card.nameTh}` : ""}`}
                      />
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <Section id="relationships" n="04" title="ความสัมพันธ์ระหว่างไพ่" narration={narration}>
          <p>
            <CardProse text={data.card_relationships} />
          </p>
          <p className="mt-4 rounded-xl border border-white/10 bg-midnight/40 p-4 text-sm leading-[1.85] text-ivory-dim">
            <span className="text-gold">พลังงานโดยรวม — </span>
            <CardProse text={data.energy_analysis} />
          </p>
        </Section>

        <Section id="hidden" n="05" title="สิ่งที่ซ่อนอยู่" icon={Eye} narration={narration}>
          <p>
            <CardProse text={data.hidden_factors} />
          </p>
        </Section>

        <Section id="opportunities" n="06" title="โอกาส" icon={Sprout} narration={narration}>
          <Bullets items={data.opportunities} />
        </Section>

        <Section id="obstacles" n="07" title="อุปสรรค" icon={Mountain} narration={narration}>
          <Bullets items={data.obstacles} />
        </Section>

        <Section id="future" n="08" title="แนวโน้มข้างหน้า" icon={Compass} narration={narration}>
          <p>
            <CardProse text={data.future_direction} />
          </p>
        </Section>

        <Section id="advice" n="09" title="คำแนะนำ" icon={Lightbulb} narration={narration}>
          <ol className="space-y-3">
            {data.advice.map((a, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs text-gold">
                  {i + 1}
                </span>
                <span>
                  <CardProse text={a} />
                </span>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="cautions" n="10" title="สิ่งที่ควรระวัง" icon={ShieldAlert} narration={narration}>
          <Bullets items={data.cautions} />
        </Section>

        {data.timeline && data.timeline.length > 0 && (
          <Section id="timeline" n="11" title="แนวโน้มตามช่วงเวลา" narration={narration}>
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
          <Section
            id="scenarios"
            n={data.timeline?.length ? "12" : "11"}
            title="ถ้าเลือกทำ หรือเลือกรอ"
            narration={narration}
          >
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

        <section
          className="rounded-2xl border border-gold/30 bg-gradient-to-b from-navy-light/60 to-transparent p-6"
          data-narration-part="conclusion"
          data-reading={narration.reading === "conclusion" || undefined}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="pt-3 text-sm font-medium tracking-wide text-gold">บทสรุปจากไพ่</h3>
            <Listen id="conclusion" narration={narration} label="บทสรุปจากไพ่" />
          </div>
          <p className="mt-3 font-serif text-lg leading-[1.85] text-ivory">
            <CardProse text={data.conclusion} />
          </p>
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
    </CardProseProvider>
  );
}
