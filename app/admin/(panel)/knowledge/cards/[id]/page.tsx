import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CardEditor, type CardFields } from "@/components/admin/CardEditor";
import { requireAdminPage } from "@/lib/admin";
import { ELEMENT_TH, SUIT_TH, getCard } from "@/lib/tarot/deck";
import { getKnowledge } from "@/lib/tarot/knowledge";
import type { TarotCard } from "@/lib/tarot/types";

export const metadata: Metadata = { title: "แก้ไขไพ่" };

const pick = (c: TarotCard): CardFields => ({
  nameTh: c.nameTh,
  keywords: c.keywords,
  keywordsReversed: c.keywordsReversed,
  uprightTh: c.uprightTh,
  reversedTh: c.reversedTh,
  loveTh: c.loveTh,
  careerTh: c.careerTh,
  financeTh: c.financeTh,
  adviceTh: c.adviceTh,
});

export default async function AdminCardEditPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage();
  const { id } = await params;
  const base = getCard(id);
  if (!base) notFound();

  const kb = await getKnowledge(admin.supabase, { fresh: true });
  const card = kb.requireCard(id);
  const index = kb.cards.findIndex((c) => c.id === id);
  const prev = kb.cards[(index - 1 + kb.cards.length) % kb.cards.length];
  const next = kb.cards[(index + 1) % kb.cards.length];

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/knowledge?tab=cards" className="btn-quiet -ml-3">
        <ArrowLeft className="h-4 w-4" /> คลังความรู้ไพ่
      </Link>

      <div className="mt-4 flex gap-5">
        <div className="relative aspect-[10/17] w-24 shrink-0 overflow-hidden rounded-xl border border-gold/50 shadow-card sm:w-28">
          <Image src={card.image} alt={card.name} fill sizes="120px" className="object-cover" priority />
        </div>
        <div className="min-w-0">
          <p className="eyebrow">
            {card.arcana === "major" ? `Major Arcana · ${card.number}` : `Minor Arcana · ชุด${SUIT_TH[card.suit!]}`}
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-gold-light">{card.name}</h1>
          <p className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="chip">ธาตุ{ELEMENT_TH[card.element]}</span>
            <span className="chip border-white/15 bg-white/5 font-mono text-ivory-dim">{card.id}</span>
            {kb.overridden.cards.has(id) ? (
              <span className="chip">แก้ไขแล้ว</span>
            ) : (
              <span className="chip border-white/15 bg-white/5 text-ivory-dim">ค่าเริ่มต้น</span>
            )}
          </p>
          <p className="mt-2 text-sm text-ivory-dim">
            ชื่อภาษาอังกฤษ ชุดไพ่ ธาตุ และภาพ เป็นโครงสร้างของสำรับ แก้ไม่ได้
          </p>
        </div>
      </div>

      <CardEditor key={id} id={id} current={pick(card)} defaults={pick(base)} />

      <nav className="mt-10 flex justify-between border-t border-white/10 pt-6 text-sm" aria-label="ไพ่ก่อนหน้าและถัดไป">
        <Link href={`/admin/knowledge/cards/${prev.id}`} className="text-ivory-dim hover:text-gold-light">
          ← {prev.name}
        </Link>
        <Link href={`/cards/${id}`} className="text-gold hover:text-gold-light">
          ดูหน้าที่ผู้ใช้เห็น
        </Link>
        <Link href={`/admin/knowledge/cards/${next.id}`} className="text-ivory-dim hover:text-gold-light">
          {next.name} →
        </Link>
      </nav>
    </div>
  );
}
