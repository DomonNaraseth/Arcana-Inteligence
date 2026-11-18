import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OracleCardBack, OracleCardFace } from "@/components/oracle/OracleCardFace";
import { PrintButton } from "@/components/oracle/PrintButton";
import { requireAdminPage } from "@/lib/admin";
import { oracleImageUrl, type OracleCard, type OracleDeck } from "@/lib/oracle/schemas";

export const metadata: Metadata = { title: "ไฟล์พิมพ์ไพ่ออราเคิล" };

/** 70×120 mm cards with 3 mm bleed on every side, four to an A4 page. */
const CELL = "h-[126mm] w-[76mm]";

function chunk<T>(list: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
}

function Sheet({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section
      aria-label={label}
      className="sheet mx-auto mb-10 flex min-h-[277mm] w-[190mm] flex-wrap content-start justify-center gap-[6mm] bg-white p-[4mm] print:mb-0 print:p-0"
    >
      {children}
    </section>
  );
}

/** A card cell with its cut line (3 mm inside the bleed). */
function Cell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`relative ${CELL}`}>
      {children}
      <div className="pointer-events-none absolute inset-[3mm] border border-dashed border-white/70 mix-blend-difference" aria-hidden="true" />
    </div>
  );
}

function GuideEntry({ card }: { card: OracleCard }) {
  return (
    <article className="break-inside-avoid border-b border-neutral-300 py-5">
      <div className="flex gap-5">
        {card.image && (
          // eslint-disable-next-line @next/next/no-img-element -- admin-only print page, draft images need the admin cookie
          <img src={oracleImageUrl(card.image)} alt="" className="h-[42mm] w-[24.5mm] shrink-0 rounded object-cover" />
        )}
        <div className="min-w-0">
          <p className="font-serif text-[11pt] text-neutral-500">ไพ่ใบที่ {card.number}</p>
          <h3 className="font-serif text-[16pt] font-semibold text-neutral-900">
            {card.name} <span className="ml-1 text-[10pt] font-normal uppercase tracking-widest text-neutral-500">{card.name_en}</span>
          </h3>
          {card.keywords.length > 0 && <p className="mt-1 text-[9.5pt] text-[#8a6d2f]">{card.keywords.join(" · ")}</p>}
          <p className="mt-2 text-[10.5pt] leading-relaxed text-neutral-800">{card.meaning}</p>
          <p className="mt-2 text-[10.5pt] leading-relaxed text-neutral-800">
            <strong>สารจากไพ่ — </strong>
            {card.message}
          </p>
          <p className="mt-2 text-[10pt] italic text-neutral-700">“{card.affirmation}”</p>
          <p className="mt-1 text-[10pt] text-neutral-700">คำถามชวนคิด: {card.reflection}</p>
        </div>
      </div>
    </article>
  );
}

export default async function OraclePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = await requireAdminPage();
  const { data } = await admin.supabase.rpc("arcana_admin_oracle_get", { p_id: id });
  const deck = data as OracleDeck | null;
  if (!deck) notFound();
  const pages = chunk(deck.cards, 4);
  const c = deck.concept;

  return (
    <div className="min-h-dvh bg-neutral-200 py-8 text-neutral-900 print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          html, body { background: #fff !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .sheet { break-after: page; }
        }
      `}</style>

      <div className="mx-auto mb-8 flex max-w-[190mm] flex-wrap items-center justify-between gap-4 rounded-xl bg-midnight p-5 text-ivory print:hidden">
        <div>
          <p className="font-semibold">{deck.title} — ไฟล์พิมพ์</p>
          <p className="mt-1 text-sm text-ivory-dim">
            {deck.card_count} ใบ · หน้าละ 4 ใบ ({pages.length} หน้า) + หลังไพ่ + คู่มือ · ตั้งค่าพิมพ์: A4, ขนาดจริง 100%, เปิด “กราฟิกพื้นหลัง”
          </p>
          <p className="mt-1 text-xs text-ivory-dim">เส้นประคือแนวตัด (70×120 มม.) ภาพเลยเส้นออกไป 3 มม. เพื่อกันขอบขาว</p>
        </div>
        <PrintButton />
      </div>

      {/* fronts */}
      {pages.map((page, i) => (
        <Sheet key={`f${i}`} label={`หน้าไพ่ ชุดที่ ${i + 1}`}>
          {page.map((card) => (
            <Cell key={card.number}>
              <OracleCardFace bleed image={card.image} name={card.name} nameEn={card.name_en} number={card.number} size="lg" priority />
            </Cell>
          ))}
        </Sheet>
      ))}

      {/* backs: same for every card, print this sheet once per front sheet */}
      <Sheet label="หลังไพ่">
        {Array.from({ length: 4 }, (_, i) => (
          <Cell key={i}>
            <OracleCardBack bleed image={deck.back_image} />
          </Cell>
        ))}
      </Sheet>

      {/* guidebook */}
      <section className="sheet mx-auto w-[190mm] bg-white p-[12mm] print:p-0" aria-label="คู่มือไพ่">
        <header className="border-b-2 border-[#C6A15B] pb-6 text-center">
          <p className="text-[10pt] uppercase tracking-[0.3em] text-[#8a6d2f]">{deck.title_en}</p>
          <h1 className="mt-2 font-serif text-[26pt] font-semibold">{deck.title}</h1>
          <p className="mt-2 text-[11pt] text-neutral-600">{deck.tagline}</p>
        </header>
        {c.guidebook_intro && <p className="mt-6 whitespace-pre-line text-[10.5pt] leading-relaxed">{c.guidebook_intro}</p>}
        {c.story && (
          <>
            <h2 className="mt-6 font-serif text-[14pt] font-semibold">เรื่องราวของสำรับ</h2>
            <p className="mt-2 whitespace-pre-line text-[10.5pt] leading-relaxed">{c.story}</p>
          </>
        )}
        {c.how_to_use && (
          <>
            <h2 className="mt-6 font-serif text-[14pt] font-semibold">วิธีใช้</h2>
            <p className="mt-2 whitespace-pre-line text-[10.5pt] leading-relaxed">{c.how_to_use}</p>
          </>
        )}
        <h2 className="mt-8 font-serif text-[14pt] font-semibold">ความหมายไพ่ทั้ง {deck.card_count} ใบ</h2>
        {deck.cards.map((card) => (
          <GuideEntry key={card.number} card={card} />
        ))}
        <p className="mt-8 text-center text-[8.5pt] text-neutral-500">
          ไพ่ออราเคิลเป็นเครื่องมือเพื่อการสะท้อนคิดและให้กำลังใจ ไม่ใช่การพยากรณ์ที่รับประกันผล · ARCANA INTELLIGENCE
        </p>
      </section>
    </div>
  );
}
