import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles, Sun } from "lucide-react";
import { dailyMessageSchema, type DailyMessage } from "@/lib/ai/daily";
import { parseSharedDaily, shareImageUrl, thaiDayLabel, type SharedDaily } from "@/lib/share";
import { getContext } from "@/lib/supabase/server";
import { currentKnowledge } from "@/lib/tarot/current";

type Search = Promise<{ c?: string; o?: string; d?: string }>;

async function load(searchParams: Search) {
  const kb = await currentKnowledge();
  const shared = parseSharedDaily(await searchParams, (id) => Boolean(kb.card(id)));
  if (!shared) return null;
  return { shared, card: kb.requireCard(shared.cardId) };
}

async function messageFor(shared: SharedDaily): Promise<DailyMessage | null> {
  const { supabase } = await getContext();
  const { data } = await supabase.rpc("arcana_daily_message_for", {
    p_day: shared.day,
    p_card_id: shared.cardId,
    p_orientation: shared.orientation,
  });
  const parsed = dailyMessageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const found = await load(searchParams);
  if (!found) return { title: "ไม่พบไพ่ที่แชร์", robots: { index: false } };
  const { shared, card } = found;
  const message = await messageFor(shared);
  const title = `ไพ่ประจำวัน: ${card.name} (${card.nameTh})`;
  const description = message?.theme ?? `ไพ่ประจำวัน ${thaiDayLabel(shared.day)} — เปิดไพ่ประจำวันของคุณเองฟรีที่ ARCANA`;
  return {
    title,
    description,
    // many links point at the same card; the card's own page is the one to index
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description,
      images: [{ url: shareImageUrl("", shared, "og"), width: 1200, height: 630, alt: card.name }],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function SharedDailyPage({ searchParams }: { searchParams: Search }) {
  const found = await load(searchParams);
  if (!found) notFound();
  const { shared, card } = found;
  const message = await messageFor(shared);
  const reversed = shared.orientation === "reversed";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="text-center">
        <p className="eyebrow">Daily Tarot · {thaiDayLabel(shared.day)}</p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">มีคนแชร์ไพ่ประจำวันมาให้คุณ</h1>
      </header>

      <section className="panel grid gap-8 p-6 sm:grid-cols-[200px_1fr] sm:p-8">
        <div className="relative mx-auto aspect-[10/17] w-44 overflow-hidden rounded-xl border border-gold/50 shadow-card sm:w-full">
          <Image
            src={card.image}
            alt={`${card.name} ${reversed ? "กลับหัว" : "ตั้งตรง"}`}
            fill
            sizes="200px"
            className={reversed ? "rotate-180 object-cover" : "object-cover"}
            priority
          />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-gold-light">{card.name}</h2>
          <p className="text-sm text-ivory-dim">
            {card.nameTh} · {reversed ? "กลับหัว" : "ตั้งตรง"}
          </p>
          {message ? (
            <>
              <p className="mt-5 font-serif text-xl text-ivory">{message.theme}</p>
              <p className="mt-3 leading-relaxed text-ivory">{message.message}</p>
            </>
          ) : (
            <p className="mt-5 leading-relaxed text-ivory">{reversed ? card.reversedTh : card.uprightTh}</p>
          )}
        </div>
      </section>

      <section className="panel-gold flex flex-col items-center p-8 text-center">
        <h2 className="text-2xl font-semibold">วันนี้ไพ่ของคุณคือใบไหน?</h2>
        <p className="mt-2 max-w-md text-ivory-dim">
          เปิดไพ่ประจำวันได้ฟรีทุกวัน วันละหนึ่งใบ พร้อมสารประจำวันจาก ARCANA ไม่ต้องสมัครก่อน
        </p>
        <Link href="/daily" className="btn-gold mt-6">
          <Sun className="h-4 w-4" /> เปิดไพ่ประจำวันของคุณฟรี
        </Link>
        <Link href={`/cards/${card.id}`} className="mt-4 inline-flex items-center gap-1 text-sm text-gold hover:text-gold-light">
          <Sparkles className="h-4 w-4" /> อ่านความหมายเต็มของไพ่ {card.name}
        </Link>
      </section>
    </div>
  );
}
