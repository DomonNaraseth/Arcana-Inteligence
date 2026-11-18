"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Loader2, Sparkles, X } from "lucide-react";
import { ListenButton } from "@/components/speech/ListenButton";
import { speechText } from "@/lib/speech/narration";
import type { OracleCard, OracleDeck } from "@/lib/oracle/schemas";
import { OracleCardBack, OracleCardFace } from "./OracleCardFace";

function CardMessage({ card, headingLevel = 2 }: { card: OracleCard; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-gold/80">{card.name_en}</p>
        <H className="mt-1 text-3xl font-semibold text-ivory">{card.name}</H>
        {card.keywords.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="คำสำคัญ">
            {card.keywords.map((k) => (
              <li key={k} className="chip text-xs">
                {k}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="font-serif text-lg leading-[1.85] text-ivory">{card.message}</p>
      {card.affirmation && (
        <blockquote className="rounded-xl border border-gold/30 bg-gold/[0.07] px-5 py-4 font-serif text-base italic leading-relaxed text-gold-light">
          “{card.affirmation}”
        </blockquote>
      )}
      {card.reflection && (
        <p className="text-sm text-ivory-dim">
          <span className="text-gold">คำถามชวนคิด — </span>
          {card.reflection}
        </p>
      )}
      {card.meaning && (
        <details className="group rounded-xl border border-white/10 bg-midnight/40">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm text-ivory [&::-webkit-details-marker]:hidden">
            ความหมายของไพ่ใบนี้ <span className="text-gold transition-transform group-open:rotate-180 inline-block">▾</span>
          </summary>
          <p className="border-t border-white/10 px-4 py-3 text-[15px] leading-[1.9] text-ivory/90">{card.meaning}</p>
        </details>
      )}
    </div>
  );
}

const narration = (c: OracleCard) => [
  {
    id: `oracle-${c.number}`,
    title: `ไพ่ออราเคิล · ${c.name}`,
    text: speechText(
      [`ไพ่ของคุณคือ ${c.name}.`, c.message, c.affirmation && `คำยืนยัน. ${c.affirmation}`, c.reflection && `คำถามชวนคิด. ${c.reflection}`]
        .filter(Boolean)
        .join(" "),
    ),
  },
];

/** A published oracle deck: its story, one card drawn for the visitor, and the whole deck to browse. */
export function OracleDeckView({ deck }: { deck: OracleDeck }) {
  const [phase, setPhase] = useState<"ready" | "drawing" | "revealed">("ready");
  const [drawn, setDrawn] = useState<OracleCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OracleCard | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const result = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  async function draw() {
    if (phase === "drawing") return;
    setPhase("drawing");
    setError(null);
    try {
      const res = await fetch(`/api/oracle/${deck.slug}/draw`, { method: "POST" });
      const data = await res.json().catch(() => null);
      const card = deck.cards.find((c) => c.number === data?.number);
      if (!res.ok || !card) throw new Error(data?.error?.message ?? "ขอสารจากไพ่ไม่สำเร็จ กรุณาลองใหม่");
      setDrawn(card);
      // let the back be seen for a moment before it turns
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(() => {
        setPhase("revealed");
        setTimeout(() => result.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 120);
      }, reduce ? 0 : 450);
    } catch (err) {
      setError((err as Error).message);
      setPhase("ready");
    }
  }

  const c = deck.concept;

  return (
    <div className="mx-auto max-w-5xl space-y-14">
      {/* the deck */}
      <header className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <OracleCardFace image={deck.cover_image} name={deck.title} nameEn={deck.title_en} size="lg" priority className="mx-auto w-52 sm:w-60" />
        <div>
          <p className="eyebrow">Oracle Deck · {deck.card_count} ใบ</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{deck.title}</h1>
          <p className="mt-1 text-sm uppercase tracking-[0.25em] text-gold/80">{deck.title_en}</p>
          <p className="mt-4 font-serif text-lg leading-relaxed text-ivory">{deck.tagline}</p>
          {c.story && <p className="mt-4 whitespace-pre-line text-[15px] leading-[1.9] text-ivory-dim">{c.story}</p>}
        </div>
      </header>

      {/* one card for you */}
      <section aria-labelledby="draw-title" className="panel-gold p-6 sm:p-10">
        <div className="grid items-center gap-10 md:grid-cols-[auto_1fr]">
          <div className="card-scene mx-auto w-52 sm:w-60" aria-hidden={phase !== "revealed"}>
            <div
              className={clsx(
                "relative aspect-[7/12] transition-transform duration-700 [transform-style:preserve-3d] motion-reduce:transition-none",
                phase === "revealed" && "[transform:rotateY(180deg)]",
              )}
            >
              <div className="absolute inset-0 [backface-visibility:hidden]">
                <OracleCardBack image={deck.back_image} className={clsx(phase === "drawing" && "animate-pulse")} />
              </div>
              <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                {drawn && <OracleCardFace image={drawn.image} name={drawn.name} nameEn={drawn.name_en} size="lg" priority />}
              </div>
            </div>
          </div>

          <div ref={result} className="scroll-mt-24">
            {phase === "revealed" && drawn ? (
              <div className="space-y-5" aria-live="polite">
                <div className="flex items-center justify-between gap-3">
                  <p id="draw-title" className="eyebrow">สารจากไพ่ของคุณ</p>
                  <ListenButton parts={narration(drawn)} scope={`oracle:${drawn.number}`} label="สารจากไพ่" />
                </div>
                <CardMessage card={drawn} />
              </div>
            ) : (
              <div>
                <p className="eyebrow">ขอสารจากไพ่หนึ่งใบ</p>
                <h2 id="draw-title" className="mt-3 text-2xl font-semibold">หายใจช้า ๆ แล้วนึกถึงเรื่องที่อยู่ในใจ</h2>
                <p className="mt-3 text-ivory-dim">
                  เมื่อพร้อม กดรับไพ่ ระบบจะสุ่มไพ่หนึ่งใบจากทั้งสำรับอย่างยุติธรรม (AI ไม่ได้เลือกไพ่ให้คุณ) แล้วอ่านสารนั้นอย่างเปิดใจ
                </p>
                {c.how_to_use && <p className="mt-3 text-sm text-ivory-dim">{c.how_to_use}</p>}
                <button type="button" onClick={() => void draw()} disabled={phase === "drawing"} className="btn-gold mt-6">
                  {phase === "drawing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {phase === "drawing" ? "กำลังสับไพ่…" : "รับไพ่ของฉัน"}
                </button>
                {error && (
                  <p role="alert" className="mt-4 text-sm text-red-200">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* the whole deck */}
      <section aria-labelledby="gallery-title">
        <h2 id="gallery-title" className="text-2xl font-semibold">ไพ่ทั้งสำรับ</h2>
        <p className="mt-1 text-sm text-ivory-dim">แตะไพ่เพื่ออ่านความหมายและสาร</p>
        <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
          {deck.cards.map((card) => (
            <li key={card.number}>
              <button
                type="button"
                onClick={() => setOpen(card)}
                className="block w-full rounded-xl transition-transform hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold motion-reduce:transition-none"
                aria-label={`ไพ่ใบที่ ${card.number} ${card.name}`}
              >
                <OracleCardFace image={card.image} name={card.name} number={card.number} size="sm" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        onClick={(e) => e.target === dialog.current && setOpen(null)}
        className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-2xl border border-gold/30 bg-navy p-0 text-ivory backdrop:bg-black/70 backdrop:backdrop-blur-sm"
        aria-label={open ? `ไพ่ ${open.name}` : undefined}
      >
        {open && (
          <div className="relative grid max-h-[85dvh] gap-6 overflow-y-auto p-6 sm:grid-cols-[auto_1fr] sm:p-8">
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label="ปิด"
              className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-ivory-dim hover:bg-white/10 hover:text-ivory"
            >
              <X className="h-5 w-5" />
            </button>
            <OracleCardFace image={open.image} name={open.name} nameEn={open.name_en} number={open.number} className="mx-auto w-44 sm:w-52" />
            <CardMessage card={open} headingLevel={3} />
          </div>
        )}
      </dialog>
    </div>
  );
}
