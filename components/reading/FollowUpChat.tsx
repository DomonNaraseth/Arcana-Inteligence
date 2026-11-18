"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, Loader2, Send } from "lucide-react";
import type { MessageRow } from "@/lib/data/readings";
import type { DrawnCard, TarotCard } from "@/lib/tarot/types";
import { speechText } from "@/lib/speech/narration";
import { ListenButton } from "@/components/speech/ListenButton";

interface ChatItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind: "chat" | "draw";
}

const DRAW_MARK = "\n\n[ผู้ถามกดเปิดไพ่เสริม";

function displayText(m: ChatItem): string {
  return m.role === "user" ? m.content.split(DRAW_MARK)[0] : m.content;
}

export function FollowUpChat({
  readingId,
  initialMessages,
  suggestions,
  extraCount,
  maxExtra,
  onNewCard,
  credit,
  onBalance,
}: {
  readingId: string;
  initialMessages: MessageRow[];
  suggestions: string[];
  extraCount: number;
  maxExtra: number;
  onNewCard: (card: DrawnCard, data: TarotCard | null) => void;
  credit: { balance: number; followupCost: number; clarifierCost: number; freeFollowups: number } | null;
  onBalance: (balance: number) => void;
}) {
  const [messages, setMessages] = useState<ChatItem[]>(
    initialMessages.map((m) => ({ id: m.id, role: m.role, content: m.content, kind: m.kind })),
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  async function send(text: string, drawCard: boolean) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: message, kind: drawCard ? "draw" : "chat" },
    ]);
    setInput("");
    try {
      const res = await fetch(`/api/readings/${readingId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, drawCard }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "ส่งคำถามไม่สำเร็จ กรุณาลองใหม่");
      }
      if (data.newCard) {
        onNewCard(data.newCard as DrawnCard, (data.newCardData as TarotCard | null) ?? null);
      }
      if (typeof data.balance === "number") onBalance(data.balance);
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: data.reply as string, kind: "chat" },
      ]);
    } catch (e) {
      // nothing was saved or charged — restore the draft
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(message);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const asked = messages.filter((m) => m.role === "user").length;
  const freeLeft = credit ? Math.max(0, credit.freeFollowups - asked) : 0;
  const askCost = credit && freeLeft === 0 ? credit.followupCost : 0;
  const drawCost = askCost + (credit?.clarifierCost ?? 0);
  const canAsk = !credit || credit.balance >= askCost;
  const canDraw = extraCount < maxExtra && (!credit || credit.balance >= drawCost);
  const costLabel = (n: number) => (n > 0 ? ` · ${n} เครดิต` : "");

  return (
    <section className="panel p-6 sm:p-8" aria-labelledby="chat-title">
      <p className="eyebrow">Follow-up</p>
      <h2 id="chat-title" className="mt-3 text-2xl font-semibold">
        ถามต่อจากไพ่ชุดนี้
      </h2>
      <p className="mt-2 text-sm text-ivory-dim">
        ARCANA จำคำถาม ไพ่ทุกใบ และคำอ่านเดิมไว้ทั้งหมด — ไพ่ชุดเดิมจะไม่ถูกเปลี่ยน
        และคำอ่านจะไม่เปลี่ยนเพียงเพราะถามซ้ำ
      </p>

      {messages.length > 0 && (
        <div className="mt-6 space-y-4" aria-live="polite">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-gold/15 px-4 py-3 text-ivory"
                    : "max-w-[92%] rounded-2xl rounded-bl-md border border-white/10 bg-midnight/50 px-4 py-3 text-ivory/95"
                }
              >
                {m.role === "user" && m.kind === "draw" && (
                  <span className="chip mb-2">
                    <Layers className="h-3 w-3" /> เปิดไพ่เสริม
                  </span>
                )}
                <p className="whitespace-pre-wrap text-[15px] leading-[1.85]">{displayText(m)}</p>
                {m.role === "assistant" && (
                  <div className="-mb-1 mt-2 flex justify-end">
                    <ListenButton
                      parts={[{ id: `chat-${m.id}`, title: "คำตอบจาก ARCANA", text: speechText(m.content) }]}
                      scope={`chat:${m.id}`}
                      label="คำตอบนี้"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-white/10 bg-midnight/50 px-4 py-3 text-sm text-ivory-dim">
                <Loader2 className="h-4 w-4 animate-spin" /> ARCANA กำลังพิจารณาไพ่…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {messages.length === 0 && suggestions.length > 0 && (
        <div className="mt-5">
          <p className="text-sm text-ivory-dim">คำถามต่อยอดที่น่าสนใจ</p>
          <div className="mt-2 flex flex-col items-start gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy || !canAsk}
                onClick={() => void send(s, false)}
                className="rounded-2xl border border-white/15 px-4 py-2 text-left text-sm text-ivory-dim transition-colors hover:border-gold/50 hover:text-ivory"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input, false);
        }}
      >
        <label htmlFor="followup" className="sr-only">
          คำถามต่อยอด
        </label>
        <textarea
          id="followup"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 1000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(input, false);
            }
          }}
          rows={2}
          placeholder="เช่น แล้วเรื่องนี้จะส่งผลต่อรายได้ของฉันไหม"
          className="field resize-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || !input.trim() || !canAsk} className="btn-gold px-5 py-2.5 text-sm">
            <Send className="h-4 w-4" /> ถามจากไพ่ชุดเดิม{costLabel(askCost)}
          </button>
          <button
            type="button"
            disabled={busy || !input.trim() || !canDraw}
            onClick={() => void send(input, true)}
            className="btn-ghost px-5 py-2.5 text-sm"
            title={
              canDraw
                ? undefined
                : extraCount >= maxExtra
                  ? "เปิดไพ่เสริมครบจำนวนแล้ว"
                  : "เครดิตไม่พอ"
            }
          >
            <Layers className="h-4 w-4" /> ถามพร้อมเปิดไพ่เสริม 1 ใบ{costLabel(drawCost)}
          </button>
          <span className="text-xs text-ivory-dim/70">
            ไพ่เสริม {extraCount}/{maxExtra}
            {credit && freeLeft > 0 && ` · ถามฟรีได้อีก ${freeLeft} ครั้ง`}
            {credit && ` · คงเหลือ ${credit.balance} เครดิต`}
          </span>
        </div>
      </form>
    </section>
  );
}
