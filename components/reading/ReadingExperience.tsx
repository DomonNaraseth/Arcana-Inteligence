"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import type { Interpretation } from "@/lib/ai/schemas";
import type { MessageRow } from "@/lib/data/readings";
import { formatThaiDate } from "@/lib/format";
import { computeSpreadStats } from "@/lib/tarot/analysis";
import { ELEMENT_TH, requireCard } from "@/lib/tarot/deck";
import type { DrawnCard, SpreadPosition } from "@/lib/tarot/types";
import { TarotCardView } from "@/components/tarot/TarotCardView";
import { CardDetailDialog } from "./CardDetailDialog";
import { FollowUpChat } from "./FollowUpChat";
import { InterpretationView } from "./InterpretationView";
import { JournalQuick } from "./JournalQuick";

const MAX_EXTRA = 3;

const PROGRESS_STEPS = [
  "อ่านความหมายของไพ่แต่ละใบตามตำแหน่ง",
  "วิเคราะห์ธาตุ ชุดไพ่ และสมดุลตั้งตรง–กลับหัว",
  "เชื่อมโยงไพ่ที่เสริมและขัดแย้งกัน",
  "สังเคราะห์คำตอบสำหรับคำถามของคุณ",
  "ตรวจคุณภาพคำอ่านก่อนส่งถึงคุณ",
];

type Quality = { passed: boolean; attempts: number; issues: string[] } | null;

interface Props {
  reading: { id: string; question: string; createdAt: string; understanding: string | null };
  spread: { id: string; nameTh: string; nameEn: string; positions: SpreadPosition[] };
  initialDrawn: DrawnCard[];
  initialInterpretation: Interpretation | null;
  initialQuality: Quality;
  initialMessages: MessageRow[];
  aiConfigured: boolean;
  /** present only when the credit system is switched on */
  credit: {
    balance: number;
    interpretCost: number;
    followupCost: number;
    clarifierCost: number;
  } | null;
}

export function ReadingExperience({
  reading,
  spread,
  initialDrawn,
  initialInterpretation,
  initialQuality,
  initialMessages,
  aiConfigured,
  credit,
}: Props) {
  const router = useRouter();
  const [balance, setBalance] = useState(credit?.balance ?? 0);
  const cannotAfford = credit !== null && balance < credit.interpretCost;
  const [drawn, setDrawn] = useState<DrawnCard[]>(initialDrawn);
  const [interpretation, setInterpretation] = useState(initialInterpretation);
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const [revealed, setRevealed] = useState<Set<number>>(
    () => new Set(initialInterpretation ? initialDrawn.map((d) => d.position) : []),
  );
  const [instant, setInstant] = useState(Boolean(initialInterpretation));
  const [detail, setDetail] = useState<DrawnCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const original = useMemo(() => drawn.filter((d) => !d.isFollowup), [drawn]);
  const extras = useMemo(() => drawn.filter((d) => d.isFollowup), [drawn]);
  const allRevealed = original.every((d) => revealed.has(d.position));
  const revealedCount = original.filter((d) => revealed.has(d.position)).length;
  const stats = useMemo(() => computeSpreadStats(original), [original]);

  const reveal = useCallback((position: number) => {
    setInstant(false);
    setRevealed((prev) => new Set(prev).add(position));
  }, []);

  function revealAll() {
    setInstant(true);
    setRevealed(new Set(drawn.map((d) => d.position)));
  }

  useEffect(() => {
    if (!loading) return;
    setProgress(0);
    const t = setInterval(
      () => setProgress((p) => Math.min(p + 1, PROGRESS_STEPS.length - 1)),
      9000,
    );
    return () => clearInterval(t);
  }, [loading]);

  async function interpret() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/readings/${reading.id}/interpret`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "อ่านไพ่ไม่สำเร็จ กรุณาลองใหม่ ไพ่ของคุณยังอยู่ครบ");
      }
      setInterpretation(data.interpretation as Interpretation);
      setQuality((data.quality as Quality) ?? null);
      if (typeof data.balance === "number") setBalance(data.balance);
      setTimeout(
        () => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        150,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleNewCard(card: DrawnCard) {
    setDrawn((prev) => [...prev, card]);
    setInstant(false);
    setTimeout(() => setRevealed((prev) => new Set(prev).add(card.position)), 400);
  }

  async function remove() {
    if (!window.confirm("ลบการอ่านไพ่นี้ถาวร? ไม่สามารถกู้คืนได้")) return;
    setDeleting(true);
    const res = await fetch(`/api/readings/${reading.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/history");
      router.refresh();
    } else {
      setDeleting(false);
      setError("ลบไม่สำเร็จ กรุณาลองใหม่");
    }
  }

  const cardWidth =
    original.length >= 10 ? "w-[4.6rem] sm:w-28" : original.length >= 6 ? "w-24 sm:w-32" : "w-28 sm:w-36";

  return (
    <div className="space-y-10">
      {/* header */}
      <header className="mx-auto max-w-3xl text-center">
        <p className="eyebrow">
          {spread.nameEn} · {spread.nameTh} · {formatThaiDate(reading.createdAt, true)}
        </p>
        <h1 className="mt-4 text-2xl font-semibold leading-relaxed sm:text-3xl">
          “{reading.question}”
        </h1>
        {reading.understanding && !interpretation && (
          <p className="mt-3 text-sm text-ivory-dim">{reading.understanding}</p>
        )}
      </header>

      {/* reading table */}
      <section aria-label="โต๊ะไพ่" className="panel-gold relative overflow-hidden px-3 py-8 sm:px-8 sm:py-10">
        <div className="stars pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative">
          {!allRevealed && (
            <div className="mb-6 flex flex-wrap items-center justify-center gap-3 text-sm">
              <p className="text-ivory-dim" aria-live="polite">
                แตะไพ่เพื่อเปิดทีละใบ · เปิดแล้ว {revealedCount}/{original.length}
              </p>
              <button type="button" onClick={revealAll} className="btn-quiet border border-white/15">
                เปิดทั้งหมด (ข้ามแอนิเมชัน)
              </button>
            </div>
          )}

          <ol className="flex flex-wrap items-start justify-center gap-x-3 gap-y-6 sm:gap-x-5">
            {original.map((d, i) => {
              const card = requireCard(d.cardId);
              const pos = spread.positions[i];
              const isRevealed = revealed.has(d.position);
              return (
                <motion.li
                  key={d.position}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: instant ? 0 : Math.min(i * 0.07, 0.8), duration: 0.4 }}
                  className={`flex flex-col items-center ${cardWidth}`}
                >
                  <TarotCardView
                    card={card}
                    orientation={d.orientation}
                    revealed={isRevealed}
                    skipAnimation={instant}
                    widthClass="w-full"
                    onClick={() => (isRevealed ? setDetail(d) : reveal(d.position))}
                    ariaLabel={
                      isRevealed
                        ? `ตำแหน่งที่ ${d.position} ${pos?.nameTh}: ${card.name} ${d.orientation === "reversed" ? "กลับหัว" : "ตั้งตรง"} — แตะเพื่อดูความหมาย`
                        : `ตำแหน่งที่ ${d.position} ${pos?.nameTh}: ไพ่คว่ำ แตะเพื่อเปิด`
                    }
                  />
                  <p className="mt-2.5 text-center text-[11px] leading-tight text-gold sm:text-xs">
                    <span className="font-serif">{d.position}</span> · {pos?.nameTh}
                  </p>
                  <p className="mt-0.5 min-h-[2.2em] text-center text-[11px] leading-tight text-ivory-dim sm:text-xs">
                    {isRevealed ? (
                      <>
                        {card.name}
                        {d.orientation === "reversed" && <span className="text-gold-light"> (กลับหัว)</span>}
                      </>
                    ) : (
                      " "
                    )}
                  </p>
                </motion.li>
              );
            })}
          </ol>

          {extras.length > 0 && (
            <div className="mt-8 border-t border-gold/20 pt-6">
              <p className="text-center text-xs tracking-wide text-gold">
                ไพ่เสริม (เปิดเพิ่มภายหลัง — แยกจากไพ่ชุดเดิม)
              </p>
              <ol className="mt-4 flex flex-wrap justify-center gap-4">
                {extras.map((d) => {
                  const card = requireCard(d.cardId);
                  const isRevealed = revealed.has(d.position);
                  return (
                    <li key={d.position} className="flex w-24 flex-col items-center sm:w-28">
                      <TarotCardView
                        card={card}
                        orientation={d.orientation}
                        revealed={isRevealed}
                        skipAnimation={instant}
                        widthClass="w-full"
                        onClick={() => isRevealed && setDetail(d)}
                      />
                      <p className="mt-2 min-h-[2.2em] text-center text-[11px] leading-tight text-ivory-dim">
                        {isRevealed ? card.name : " "}
                        {isRevealed && d.orientation === "reversed" && (
                          <span className="text-gold-light"> (กลับหัว)</span>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {allRevealed && (
            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-7 flex flex-wrap justify-center gap-2 text-xs"
              aria-label="สถิติของไพ่ชุดนี้"
            >
              <li className="chip">Major Arcana {stats.majorCount}/{stats.total}</li>
              <li className="chip">ตั้งตรง {stats.uprightCount} · กลับหัว {stats.reversedCount}</li>
              {stats.dominantElement && <li className="chip">ธาตุเด่น: {ELEMENT_TH[stats.dominantElement]}</li>}
              {stats.missingElements.length > 0 && (
                <li className="chip">ขาดธาตุ: {stats.missingElements.map((e) => ELEMENT_TH[e]).join(", ")}</li>
              )}
            </motion.ul>
          )}
        </div>
      </section>

      {/* interpret CTA / progress */}
      <AnimatePresence mode="wait">
        {!interpretation && allRevealed && !loading && (
          <motion.section
            key="cta"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-auto max-w-2xl text-center"
          >
            <h2 className="text-2xl font-semibold">ไพ่ครบทุกใบแล้ว</h2>
            <p className="mt-2 text-ivory-dim">
              แตะไพ่ใบใดก็ได้เพื่อดูความหมายตามขนบ หรือให้ ARCANA เชื่อมโยงไพ่ทั้งหมดเพื่อตอบคำถามของคุณ
            </p>
            {!aiConfigured && (
              <p role="alert" className="mt-4 rounded-xl border border-amber-400/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
                Configuration Missing — ยังไม่ได้ตั้งค่า AI (ANTHROPIC_API_KEY) ระบบจึงยังสร้างคำอ่านไม่ได้
                ไพ่ชุดนี้ถูกบันทึกไว้แล้ว กลับมาอ่านได้เมื่อระบบพร้อม
              </p>
            )}
            {error && (
              <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => void interpret()}
              disabled={!aiConfigured || cannotAfford}
              className="btn-gold mt-6 text-base"
            >
              {error ? <RotateCcw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {error ? "ลองอ่านไพ่อีกครั้ง" : "ให้ ARCANA อ่านไพ่ชุดนี้"}
            </button>
            {credit && (
              <p className="mt-3 text-sm text-ivory-dim">
                {credit.interpretCost === 0
                  ? "การอ่านไพ่ชุดนี้ไม่ใช้เครดิต"
                  : `ใช้ ${credit.interpretCost} เครดิต · คุณมี ${balance} เครดิต`}
                {cannotAfford && (
                  <span className="mt-1 block text-amber-200">
                    เครดิตไม่พอ — ไพ่ชุดนี้ถูกบันทึกไว้แล้ว กลับมาอ่านได้เมื่อได้รับเครดิตรายวัน{" "}
                    <Link href="/account" className="underline underline-offset-4">
                      ดูเครดิตของฉัน
                    </Link>
                  </span>
                )}
              </p>
            )}
          </motion.section>
        )}

        {loading && (
          <motion.section
            key="progress"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="panel mx-auto max-w-xl p-7"
            aria-live="polite"
            aria-busy="true"
          >
            <h2 className="flex items-center gap-3 text-xl font-semibold">
              <Loader2 className="h-5 w-5 animate-spin text-gold" /> ARCANA กำลังอ่านไพ่ของคุณ
            </h2>
            <ol className="mt-5 space-y-3 text-sm">
              {PROGRESS_STEPS.map((s, i) => (
                <li
                  key={s}
                  className={
                    i < progress ? "flex items-center gap-3 text-ivory-dim" : i === progress ? "flex items-center gap-3 text-ivory" : "flex items-center gap-3 text-ivory-dim/40"
                  }
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {i < progress ? (
                      <Check className="h-4 w-4 text-gold" />
                    ) : i === progress ? (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-gold" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                    )}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
            <p className="mt-5 text-xs text-ivory-dim/70">
              การอ่านเชิงลึกใช้เวลาราว 30–90 วินาที กรุณาอย่าปิดหน้านี้
            </p>
          </motion.section>
        )}
      </AnimatePresence>

      {/* result */}
      {interpretation && (
        <div ref={resultRef} className="mx-auto max-w-3xl scroll-mt-24 space-y-8">
          <InterpretationView
            data={interpretation}
            drawn={original}
            positions={spread.positions}
            quality={quality}
          />
          <FollowUpChat
            readingId={reading.id}
            initialMessages={initialMessages}
            suggestions={interpretation.follow_up_questions}
            extraCount={extras.length}
            maxExtra={MAX_EXTRA}
            onNewCard={handleNewCard}
            credit={
              credit
                ? {
                    balance,
                    followupCost: credit.followupCost,
                    clarifierCost: credit.clarifierCost,
                  }
                : null
            }
            onBalance={setBalance}
          />
          <JournalQuick readingId={reading.id} defaultTitle={interpretation.title} />
        </div>
      )}

      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-sm">
        <Link href="/ask" className="text-gold hover:text-gold-light">
          + เริ่มการอ่านไพ่ใหม่
        </Link>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={deleting}
          className="flex items-center gap-1.5 text-ivory-dim/70 hover:text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" /> ลบการอ่านไพ่นี้
        </button>
      </div>

      {detail && (
        <CardDetailDialog
          card={requireCard(detail.cardId)}
          orientation={detail.orientation}
          positionName={
            detail.isFollowup
              ? "ไพ่เสริม"
              : `ตำแหน่งที่ ${detail.position} · ${spread.positions[detail.position - 1]?.nameTh ?? ""}`
          }
          positionMeaning={detail.isFollowup ? undefined : spread.positions[detail.position - 1]?.meaningTh}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
