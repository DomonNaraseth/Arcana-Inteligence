import type { Metadata } from "next";
import Link from "next/link";
import { OracleCardFace } from "@/components/oracle/OracleCardFace";
import { getSystemClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "ไพ่ออราเคิล",
  description: "สำรับไพ่ออราเคิลของ ARCANA — ขอสารจากไพ่หนึ่งใบ เพื่อสะท้อนคิดและให้กำลังใจในวันนี้",
};
export const revalidate = 300;

interface PublishedDeck {
  slug: string;
  title: string;
  title_en: string;
  tagline: string;
  card_count: number;
  cover_image: string | null;
}

export default async function OracleIndexPage() {
  let decks: PublishedDeck[] = [];
  try {
    const { data } = await getSystemClient().rpc("arcana_oracle_published");
    decks = (data ?? []) as PublishedDeck[];
  } catch {
    // database not configured: show the empty state
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="max-w-2xl">
        <p className="eyebrow">Oracle Decks</p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">ไพ่ออราเคิล</h1>
        <p className="mt-3 text-ivory-dim">
          สำรับไพ่ที่ ARCANA ออกแบบขึ้นเอง ตั้งใจถึงเรื่องที่อยู่ในใจ แล้วขอสารจากไพ่หนึ่งใบ — ไพ่ถูกสุ่มอย่างยุติธรรม เพื่อการสะท้อนคิด ไม่ใช่คำทำนาย
        </p>
      </header>

      {decks.length === 0 ? (
        <div className="panel mt-10 p-8 text-center">
          <p className="text-ivory">ยังไม่มีสำรับออราเคิลที่เปิดให้ใช้</p>
          <p className="mt-1 text-sm text-ivory-dim">ระหว่างนี้ลองเปิดไพ่ประจำวัน หรือถามไพ่ทาโรต์ได้เลย</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/daily" className="btn-gold">ไพ่ประจำวัน</Link>
            <Link href="/ask" className="btn-ghost">ถามไพ่</Link>
          </div>
        </div>
      ) : (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((d) => (
            <li key={d.slug}>
              <Link href={`/oracle/${d.slug}`} className="panel group flex h-full flex-col items-center gap-5 p-6 text-center transition-colors hover:border-gold/40">
                <OracleCardFace image={d.cover_image} name={d.title} nameEn={d.title_en} className="w-40 transition-transform duration-500 group-hover:-translate-y-1" />
                <div>
                  <p className="text-lg font-semibold text-ivory group-hover:text-gold-light">{d.title}</p>
                  <p className="mt-1 text-sm text-ivory-dim">{d.tagline}</p>
                  <p className="mt-2 text-xs text-gold/80">{d.card_count} ใบ</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
