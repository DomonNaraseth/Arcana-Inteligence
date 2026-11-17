import type { Metadata } from "next";
import { CardLibrary } from "@/components/tarot/CardLibrary";
import { DECK } from "@/lib/tarot/deck";

export const metadata: Metadata = { title: "คลังไพ่ 78 ใบ" };

export default function CardsPage() {
  const cards = DECK.map((c) => ({
    id: c.id,
    name: c.name,
    nameTh: c.nameTh,
    arcana: c.arcana,
    suit: c.suit,
    image: c.image,
    keywords: c.keywords.slice(0, 3),
  }));
  return (
    <div>
      <p className="eyebrow">Tarot Knowledge Base</p>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">คลังไพ่ Rider-Waite-Smith</h1>
      <p className="mt-2 max-w-2xl text-ivory-dim">
        ไพ่ครบ 78 ใบ — Major Arcana 22 ใบ และ Minor Arcana 56 ใบ พร้อมความหมายตั้งตรง กลับหัว
        ความรัก การงาน การเงิน และคำแนะนำ
      </p>
      <CardLibrary cards={cards} />
    </div>
  );
}
