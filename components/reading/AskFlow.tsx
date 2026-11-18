"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import { CATEGORY_TH, INTENT_TH, type QuestionAnalysis } from "@/lib/ai/schemas";

interface SpreadSummary {
  id: string;
  nameTh: string;
  nameEn: string;
  descriptionTh: string;
  cardCount: number;
  positions: string[];
}

const EXAMPLES = [
  "ช่วงนี้งานของฉันจะเป็นอย่างไรบ้าง",
  "ฉันควรรับข้อเสนองานใหม่ หรืออยู่ที่เดิมดี",
  "ความสัมพันธ์ของฉันกับเขากำลังไปทางไหน",
  "ธุรกิจที่กำลังจะเริ่มมีโอกาสไปได้ดีไหม",
  "ปีหน้าชีวิตฉันจะเป็นอย่างไร",
];

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error?.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่";
  } catch {
    return "เกิดข้อผิดพลาด กรุณาลองใหม่";
  }
}

export function AskFlow({
  initialQuestion,
  spreads,
}: {
  initialQuestion: string;
  spreads: SpreadSummary[];
}) {
  const router = useRouter();
  const [question, setQuestion] = useState(initialQuestion);
  const [step, setStep] = useState<"input" | "confirm">("input");
  const [analysis, setAnalysis] = useState<QuestionAnalysis | null>(null);
  const [spreadId, setSpreadId] = useState<string>("general");
  const [showAll, setShowAll] = useState(false);
  const [clarification, setClarification] = useState("");
  const [busy, setBusy] = useState<"analyze" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string>("");

  const trimmed = question.trim();
  const selected = spreads.find((s) => s.id === spreadId) ?? spreads[0];

  async function analyze(text: string) {
    if (text.trim().length < 3) {
      setError("กรุณาพิมพ์คำถามอย่างน้อย 3 ตัวอักษร");
      return;
    }
    setBusy("analyze");
    setError(null);
    try {
      const res = await fetch("/api/questions/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text.trim() }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { analysis: QuestionAnalysis };
      setAnalysis(data.analysis);
      setSpreadId(
        spreads.some((s) => s.id === data.analysis.recommended_spread)
          ? data.analysis.recommended_spread
          : (spreads.find((s) => s.id === "general") ?? spreads[0]).id,
      );
      setShowAll(false);
      setClarification("");
      idempotencyKey.current = crypto.randomUUID();
      setStep("confirm");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function refineWithClarification() {
    if (!clarification.trim()) return;
    const merged = `${trimmed} (${clarification.trim()})`.slice(0, 1000);
    setQuestion(merged);
    await analyze(merged);
  }

  async function startReading() {
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          spreadId,
          analysis,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { id: string };
      router.push(`/reading/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <AnimatePresence mode="wait">
        {step === "input" ? (
          <motion.section
            key="input"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
          >
            <p className="eyebrow">Step 1 · Ask</p>
            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">คุณอยากถามไพ่เรื่องอะไร?</h1>
            <p className="mt-3 text-ivory-dim">
              พิมพ์ตามธรรมชาติได้เลย ยิ่งเล่าบริบทชัด คำอ่านยิ่งตรงประเด็น
            </p>

            <form
              className="mt-7"
              onSubmit={(e) => {
                e.preventDefault();
                void analyze(question);
              }}
            >
              <label htmlFor="question" className="sr-only">
                คำถามของคุณ
              </label>
              <textarea
                id="question"
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, 1000))}
                rows={5}
                placeholder="เช่น ช่วงนี้งานของฉันจะเป็นอย่างไรบ้าง มีโอกาสก้าวหน้าไหม"
                className="field resize-none text-lg leading-relaxed"
                autoFocus
              />
              <div className="mt-2 flex items-center justify-between text-xs text-ivory-dim/70">
                <span>ARCANA จะสรุปความเข้าใจให้คุณตรวจสอบก่อนเปิดไพ่</span>
                <span>{question.length}/1000</span>
              </div>

              {error && (
                <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                  {error}
                </p>
              )}

              <button type="submit" disabled={busy !== null || trimmed.length < 3} className="btn-gold mt-6 w-full sm:w-auto">
                {busy === "analyze" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> กำลังทำความเข้าใจคำถาม…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> วิเคราะห์คำถาม
                  </>
                )}
              </button>
            </form>

            <div className="mt-10">
              <p className="text-sm text-ivory-dim">หรือเริ่มจากตัวอย่าง</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setQuestion(ex)}
                    className="rounded-full border border-white/15 px-4 py-2 text-left text-sm text-ivory-dim transition-colors hover:border-gold/50 hover:text-ivory"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.section
            key="confirm"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
          >
            <button type="button" onClick={() => setStep("input")} className="btn-quiet -ml-3">
              <ArrowLeft className="h-4 w-4" /> แก้ไขคำถาม
            </button>
            <p className="eyebrow mt-4">Step 2 · Understanding</p>
            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">ARCANA เข้าใจคำถามของคุณว่า</h1>

            <div className="panel-gold mt-6 p-6 sm:p-8">
              <p className="text-sm text-ivory-dim">คำถามของคุณ</p>
              <p className="mt-1 text-lg text-ivory">“{trimmed}”</p>
              {analysis && (
                <>
                  <p className="mt-5 font-serif text-xl leading-relaxed text-gold-light">
                    {analysis.understanding}
                  </p>
                  <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-ivory-dim">หมวดคำถาม</dt>
                      <dd className="mt-1 text-ivory">{CATEGORY_TH[analysis.category] ?? analysis.category}</dd>
                    </div>
                    <div>
                      <dt className="text-ivory-dim">จุดประสงค์</dt>
                      <dd className="mt-1 text-ivory">{INTENT_TH[analysis.intent] ?? analysis.intent}</dd>
                    </div>
                    <div>
                      <dt className="text-ivory-dim">กรอบเวลา</dt>
                      <dd className="mt-1 text-ivory">{analysis.time_horizon}</dd>
                    </div>
                  </dl>
                  <div className="mt-5">
                    <p className="text-sm text-ivory-dim">มิติที่จะวิเคราะห์</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {analysis.dimensions.map((d) => (
                        <li key={d} className="chip">
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {(analysis.sub_questions?.length ?? 0) >= 2 && (
                    <div className="mt-5">
                      <p className="text-sm text-ivory-dim">คุณถาม {analysis.sub_questions!.length} เรื่อง — ไพ่จะตอบทีละข้อ</p>
                      <ol className="mt-2 space-y-1.5 text-sm text-ivory">
                        {analysis.sub_questions!.map((q, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="font-serif text-gold">{i + 1}.</span>
                            {q}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {(analysis.key_details?.length ?? 0) > 0 && (
                    <div className="mt-5">
                      <p className="text-sm text-ivory-dim">รายละเอียดที่ไพ่จะนำไปใช้ในการตอบ</p>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {analysis.key_details!.map((d) => (
                          <li key={d} className="rounded-full border border-white/15 px-3 py-1 text-xs text-ivory/90">
                            {d}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-ivory-dim">
                        ถ้ามีอะไรไม่ตรง กด “แก้ไขคำถาม” แล้วเล่าเพิ่ม — ยิ่งชัด คำตอบยิ่งตรง
                      </p>
                    </div>
                  )}
                  {analysis.source === "heuristic" && (
                    <p className="mt-5 text-xs text-amber-200/80">
                      หมายเหตุ: ระบบ AI วิเคราะห์คำถามไม่พร้อมใช้งานชั่วคราว จึงจำแนกจากคำสำคัญ
                      คุณสามารถเลือกรูปแบบการวางไพ่เองได้ด้านล่าง
                    </p>
                  )}
                </>
              )}
            </div>

            {analysis?.clarification_question && (
              <div className="panel mt-5 p-6">
                <p className="text-sm text-gold">เพื่อให้อ่านไพ่ได้ตรงขึ้น (ไม่บังคับ)</p>
                <p className="mt-1 text-ivory">{analysis.clarification_question}</p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <label htmlFor="clarify" className="sr-only">
                    คำตอบเพิ่มเติม
                  </label>
                  <input
                    id="clarify"
                    value={clarification}
                    onChange={(e) => setClarification(e.target.value.slice(0, 300))}
                    placeholder="พิมพ์คำตอบสั้น ๆ หรือข้ามไปเปิดไพ่ได้เลย"
                    className="field"
                  />
                  <button
                    type="button"
                    onClick={() => void refineWithClarification()}
                    disabled={!clarification.trim() || busy !== null}
                    className="btn-ghost shrink-0"
                  >
                    {busy === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : "ปรับคำถาม"}
                  </button>
                </div>
              </div>
            )}

            <p className="eyebrow mt-10">Step 3 · Spread</p>
            <h2 className="mt-3 text-2xl font-semibold">รูปแบบการวางไพ่</h2>

            <div className="panel mt-5 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {analysis?.recommended_spread === selected.id && (
                    <span className="chip mb-2">
                      <Sparkles className="h-3 w-3" /> ARCANA แนะนำ
                    </span>
                  )}
                  <h3 className="text-xl font-semibold text-ivory">
                    {selected.nameTh}{" "}
                    <span className="font-sans text-sm font-normal text-ivory-dim">
                      · {selected.nameEn} · {selected.cardCount} ใบ
                    </span>
                  </h3>
                </div>
              </div>
              <p className="mt-2 text-sm text-ivory-dim">{selected.descriptionTh}</p>
              {analysis?.recommended_spread === selected.id && (
                <p className="mt-3 text-sm text-gold-light">เหตุผล: {analysis.spread_reason}</p>
              )}
              <ol className="mt-4 flex flex-wrap gap-2 text-xs text-ivory-dim">
                {selected.positions.map((p, i) => (
                  <li key={i} className="rounded-md border border-white/10 px-2 py-1">
                    <span className="text-gold">{i + 1}</span> {p}
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-5 text-sm text-gold underline-offset-4 hover:underline"
                aria-expanded={showAll}
              >
                {showAll ? "ซ่อนรูปแบบอื่น" : "เลือกรูปแบบการวางไพ่เอง"}
              </button>

              {showAll && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="รูปแบบการวางไพ่">
                  {spreads.map((s) => {
                    const active = s.id === spreadId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setSpreadId(s.id);
                          idempotencyKey.current = crypto.randomUUID();
                        }}
                        className={clsx(
                          "rounded-xl border p-4 text-left transition-colors",
                          active
                            ? "border-gold bg-gold/10"
                            : "border-white/10 hover:border-gold/40",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium text-ivory">{s.nameTh}</span>
                          <span className="flex items-center gap-1 text-xs text-gold">
                            {s.cardCount} ใบ {active && <Check className="h-3.5 w-3.5" />}
                          </span>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-xs text-ivory-dim">
                          {s.descriptionTh}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                {error}
              </p>
            )}

            <div className="mt-8 flex flex-col items-start gap-3">
              <button type="button" onClick={() => void startReading()} disabled={busy !== null} className="btn-gold text-base">
                {busy === "create" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> กำลังสับไพ่…
                  </>
                ) : (
                  <>
                    สับไพ่และเริ่มเปิดไพ่ <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
              <p className="text-xs text-ivory-dim/70">
                ไพ่ถูกสุ่มด้วยระบบสุ่มที่ปลอดภัยและแยกจาก AI — เมื่อสับแล้วไพ่ชุดนี้จะถูกบันทึกถาวรและไม่ถูกเปลี่ยน
              </p>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
