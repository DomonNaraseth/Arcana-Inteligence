import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { currentKnowledge } from "@/lib/tarot/current";
import { ELEMENT_TH, SUIT_TH } from "@/lib/tarot/deck";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const card = (await currentKnowledge()).card((await params).id);
  return { title: card ? `${card.name} (${card.nameTh})` : "ไม่พบไพ่" };
}

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const kb = await currentKnowledge();
  const card = kb.card((await params).id);
  if (!card) notFound();

  const deck = kb.cards;
  const index = deck.findIndex((c) => c.id === card.id);
  const prev = deck[(index - 1 + deck.length) % deck.length];
  const next = deck[(index + 1) % deck.length];

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/cards" className="btn-quiet -ml-3">
        <ArrowLeft className="h-4 w-4" /> คลังไพ่
      </Link>

      <div className="mt-6 grid gap-8 md:grid-cols-[260px_1fr]">
        <div className="mx-auto w-52 md:w-full">
          <div className="relative aspect-[10/17] overflow-hidden rounded-2xl border border-gold/50 shadow-card">
            <Image src={card.image} alt={card.name} fill sizes="280px" className="object-cover" priority />
          </div>
        </div>

        <div>
          <p className="eyebrow">
            {card.arcana === "major" ? `Major Arcana · ${card.number}` : `Minor Arcana · ชุด${SUIT_TH[card.suit!]}`}
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-gold-light">{card.name}</h1>
          <p className="mt-1 text-lg text-ivory-dim">{card.nameTh}</p>
          <p className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="chip">ธาตุ{ELEMENT_TH[card.element]}</span>
            {card.keywords.map((k) => (
              <span key={k} className="chip border-white/15 bg-white/5 text-ivory-dim">
                {k}
              </span>
            ))}
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <section className="panel p-5">
              <h2 className="text-sm font-medium text-gold">ตั้งตรง (Upright)</h2>
              <p className="mt-2 text-[15px] text-ivory">{card.uprightTh}</p>
            </section>
            <section className="panel p-5">
              <h2 className="text-sm font-medium text-gold">กลับหัว (Reversed)</h2>
              <p className="mt-2 text-[15px] text-ivory">{card.reversedTh}</p>
              <p className="mt-2 text-xs text-ivory-dim">{card.keywordsReversed.join(" · ")}</p>
            </section>
          </div>

          <dl className="mt-4 space-y-4">
            {[
              ["ความรัก", card.loveTh],
              ["การงาน", card.careerTh],
              ["การเงิน", card.financeTh],
            ].map(([label, text]) => (
              <div key={label} className="panel p-5">
                <dt className="text-sm font-medium text-gold">{label}</dt>
                <dd className="mt-1 text-[15px] text-ivory/90">{text}</dd>
              </div>
            ))}
            <div className="panel-gold p-5">
              <dt className="text-sm font-medium text-gold">คำแนะนำจากไพ่</dt>
              <dd className="mt-1 font-serif text-lg text-ivory">{card.adviceTh}</dd>
            </div>
          </dl>
        </div>
      </div>

      <nav className="mt-10 flex justify-between border-t border-white/10 pt-6 text-sm" aria-label="ไพ่ก่อนหน้าและถัดไป">
        <Link href={`/cards/${prev.id}`} className="text-ivory-dim hover:text-gold-light">
          ← {prev.name}
        </Link>
        <Link href={`/cards/${next.id}`} className="text-ivory-dim hover:text-gold-light">
          {next.name} →
        </Link>
      </nav>
    </div>
  );
}
