"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { Flame, Gift, Loader2, Sparkles } from "lucide-react";
import { CardBack } from "@/components/tarot/CardBack";
import { TarotCardView } from "@/components/tarot/TarotCardView";
import type { DailyMessage } from "@/lib/ai/daily";
import { ShareDaily } from "./ShareDaily";
import { ListenButton } from "@/components/speech/ListenButton";
import { dailyNarration } from "@/lib/speech/narration";
import type { Orientation, TarotCard } from "@/lib/tarot/types";

interface Revealed {
  card: TarotCard;
  orientation: Orientation;
  message: DailyMessage | null;
  /** YYYY-MM-DD, Bangkok */
  day: string;
}

export interface RecentDaily {
  day: string;
  orientation: Orientation;
  card: { id: string; name: string; nameTh: string; image: string };
}

interface Props {
  initial: Revealed | null;
  streak: number;
  recent: RecentDaily[];
  isGuest: boolean;
  /** the AI can write a message of the day */
  messageAvailable: boolean;
  /** 0 when streak rewards are off (or credits are off) */
  streakDays: number;
  streakReward: number;
  signupBonus: number;
}

const shortDay = (day: string) =>
  new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );

export function DailyRitual({
  initial,
  streak: initialStreak,
  recent,
  isGuest,
  messageAvailable,
  streakDays,
  streakReward,
  signupBonus,
}: Props) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [result, setResult] = useState<Revealed | null>(initial);
  const [flipped, setFlipped] = useState(Boolean(initial));
  const [streak, setStreak] = useState(initialStreak);
  const [reward, setReward] = useState(0);
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const askedForMessage = useRef(false);

  async function reveal(): Promise<void> {
    const res = await fetch("/api/daily", { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.card) {
      throw new Error(data?.error?.message ?? "เปิดไพ่ประจำวันไม่สำเร็จ กรุณาลองใหม่");
    }
    setResult({ card: data.card, orientation: data.orientation, message: data.message ?? null, day: data.day });
    setStreak(data.streak ?? 0);
    if (data.reward > 0) setReward(data.reward);
    if (data.isNew) router.refresh();
  }

  async function onReveal() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await reveal();
      // let the face-down card paint once, then turn it over
      requestAnimationFrame(() => setFlipped(true));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // a card revealed earlier today whose message has not been written yet
  useEffect(() => {
    if (!initial || initial.message || !messageAvailable || askedForMessage.current) return;
    askedForMessage.current = true;
    setWriting(true);
    reveal()
      .catch(() => undefined)
      .finally(() => setWriting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rewardsOn = streakDays > 0 && streakReward > 0;
  const inCycle = rewardsOn ? (streak % streakDays === 0 && streak > 0 ? streakDays : streak % streakDays) : 0;
  const toGo = rewardsOn ? streakDays - inCycle : 0;
  const reversed = result?.orientation === "reversed";

  return (
    <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="panel-gold flex flex-col items-center px-5 py-7 text-center sm:px-6 sm:py-10" aria-live="polite">
        {result ? (
          <>
            <TarotCardView
              card={result.card}
              orientation={result.orientation}
              revealed={flipped}
              widthClass="w-40 sm:w-52"
              skipAnimation={Boolean(reduceMotion) || Boolean(initial)}
              priority
            />
            <h2 className="mt-6 text-2xl font-semibold text-gold-light">{result.card.name}</h2>
            <p className="text-sm text-ivory-dim">
              {result.card.nameTh} · {reversed ? "กลับหัว" : "ตั้งตรง"}
            </p>
            <ul className="mt-4 flex flex-wrap justify-center gap-2">
              {(reversed ? result.card.keywordsReversed : result.card.keywords).slice(0, 4).map((k) => (
                <li key={k} className="chip">
                  {k}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void onReveal()}
              disabled={busy}
              aria-label="ไพ่คว่ำ แตะเพื่อเปิดไพ่ประจำวัน"
              className="relative aspect-[10/17] w-40 overflow-hidden rounded-xl shadow-card transition-transform hover:-translate-y-1 focus-visible:-translate-y-1 motion-reduce:transform-none sm:w-52"
            >
              <CardBack className="h-full w-full" />
            </button>
            <p className="mt-5 max-w-xs text-sm text-ivory-dim sm:mt-6">
              ตั้งใจถึงวันนี้ของคุณสักครู่ แล้วแตะไพ่เพื่อเปิด — ไพ่ประจำวันเปิดได้วันละหนึ่งใบ
              และจะไม่เปลี่ยนตลอดทั้งวัน
            </p>
            <button type="button" onClick={() => void onReveal()} disabled={busy} className="btn-gold mt-5 sm:mt-6">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              เปิดไพ่ประจำวัน
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}
      </section>

      <div className="space-y-6">
        {result && (
          <section
            className="panel p-6 sm:p-8"
            aria-labelledby="daily-message-title"
            data-narration-part="daily"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Message of the day</p>
              <ListenButton
                parts={[dailyNarration({ card: result.card, orientation: result.orientation, message: result.message })]}
                scope="daily"
                label="สารประจำวัน"
              />
            </div>
            {result.message ? (
              <>
                <h2 id="daily-message-title" className="mt-3 text-2xl font-semibold">
                  {result.message.theme}
                </h2>
                <p className="mt-4 whitespace-pre-line leading-relaxed text-ivory">{result.message.message}</p>
                <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-gold/20 bg-gold/5 px-4 py-3">
                    <dt className="text-sm text-gold">เปิดรับวันนี้</dt>
                    <dd className="mt-1 text-sm text-ivory">{result.message.embrace}</dd>
                  </div>
                  <div className="rounded-xl border border-white/10 px-4 py-3">
                    <dt className="text-sm text-ivory-dim">ใส่ใจวันนี้</dt>
                    <dd className="mt-1 text-sm text-ivory">{result.message.mind}</dd>
                  </div>
                </dl>
                <p className="mt-5 border-l-2 border-gold/50 pl-4 text-ivory">
                  <span className="block text-sm text-gold">คำถามชวนคิด</span>
                  {result.message.reflection}
                </p>
              </>
            ) : (
              <>
                <h2 id="daily-message-title" className="mt-3 text-2xl font-semibold">
                  ความหมายของไพ่วันนี้
                </h2>
                <p className="mt-4 leading-relaxed text-ivory">
                  {reversed ? result.card.reversedTh : result.card.uprightTh}
                </p>
                <p className="mt-5 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-sm text-ivory">
                  <span className="text-gold">ข้อคิดวันนี้ — </span>
                  {result.card.adviceTh}
                </p>
                <p className="mt-3 flex items-center gap-2 text-xs text-ivory-dim/70" role="status">
                  {writing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> ARCANA กำลังเขียนสารประจำวันจากไพ่ใบนี้…
                    </>
                  ) : (
                    "แสดงความหมายตามฐานความรู้ไพ่ (ยังไม่มีสารประจำวันจาก AI สำหรับไพ่ใบนี้)"
                  )}
                </p>
              </>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/ask?q=${encodeURIComponent(
                  result.message?.reflection ?? `ไพ่ ${result.card.name} วันนี้อยากบอกอะไรกับฉัน`,
                )}`}
                className="btn-gold px-5 py-2.5 text-sm"
              >
                <Sparkles className="h-4 w-4" /> ถามไพ่ต่อจากเรื่องนี้
              </Link>
              <Link href={`/cards/${result.card.id}`} className="btn-ghost px-5 py-2.5 text-sm">
                ความหมายเต็มของไพ่ใบนี้
              </Link>
            </div>
            <ShareDaily
              shared={{ cardId: result.card.id, orientation: result.orientation, day: result.day }}
              cardName={result.card.name}
            />
          </section>
        )}

        <section className="panel p-6" aria-labelledby="streak-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="streak-title" className="flex items-center gap-2 text-xl font-semibold">
              <Flame className="h-5 w-5 text-gold" aria-hidden="true" />
              เปิดไพ่ต่อเนื่อง <span className="lining-nums tabular-nums text-gold-light">{streak}</span> วัน
            </h2>
            {reward > 0 && (
              <p role="status" className="chip">
                <Gift className="h-3.5 w-3.5" aria-hidden="true" /> รับ +{reward} เครดิตแล้ว
              </p>
            )}
          </div>
          {rewardsOn && (
            <>
              <ol className="mt-4 flex gap-2" aria-label={`ความคืบหน้า ${inCycle} จาก ${streakDays} วัน`}>
                {Array.from({ length: streakDays }, (_, i) => (
                  <li
                    key={i}
                    className={
                      i < inCycle
                        ? "h-2 flex-1 rounded-full bg-gold"
                        : "h-2 flex-1 rounded-full bg-white/10"
                    }
                  />
                ))}
              </ol>
              <p className="mt-3 text-sm text-ivory-dim">
                {isGuest ? (
                  <>
                    สมัครสมาชิกฟรีเพื่อสะสมวันต่อเนื่อง — ครบทุก {streakDays} วันรับ {streakReward} เครดิต
                    {signupBonus > 0 && ` และรับ ${signupBonus} เครดิตทันทีที่สมัคร`}{" "}
                    <Link href="/account" className="text-gold underline-offset-4 hover:underline">
                      สมัครฟรีด้วย Google
                    </Link>
                  </>
                ) : toGo === 0 ? (
                  `ครบ ${streakDays} วันแล้ว — เปิดไพ่พรุ่งนี้เพื่อเริ่มรอบใหม่`
                ) : (
                  `เปิดไพ่ต่อเนื่องอีก ${toGo} วัน รับ ${streakReward} เครดิตสำหรับอ่านไพ่`
                )}
              </p>
            </>
          )}
          {recent.length > 0 && (
            <ul className="mt-5 flex gap-3 overflow-x-auto pb-1">
              {recent.map((r) => (
                <li key={r.day} className="shrink-0 text-center">
                  <Link
                    href={`/cards/${r.card.id}`}
                    title={`${r.card.name} · ${r.orientation === "reversed" ? "กลับหัว" : "ตั้งตรง"}`}
                    className="relative block aspect-[10/17] w-12 overflow-hidden rounded-md border border-white/15 transition-colors hover:border-gold/60"
                  >
                    <Image
                      src={r.card.image}
                      alt={`${r.card.name} ${r.orientation === "reversed" ? "กลับหัว" : "ตั้งตรง"}`}
                      fill
                      sizes="48px"
                      className={r.orientation === "reversed" ? "rotate-180 object-cover" : "object-cover"}
                    />
                  </Link>
                  <span className="mt-1 block text-[11px] text-ivory-dim">{shortDay(r.day)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
