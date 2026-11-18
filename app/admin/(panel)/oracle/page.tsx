import type { Metadata } from "next";
import Link from "next/link";
import { BriefForm } from "@/components/admin/oracle/BriefForm";
import { OracleCardFace } from "@/components/oracle/OracleCardFace";
import { requireAdminPage } from "@/lib/admin";

export const metadata: Metadata = { title: "สร้างไพ่ออราเคิล" };

interface DeckRow {
  id: string;
  slug: string;
  title: string;
  title_en: string;
  tagline: string;
  card_count: number;
  status: "draft" | "published";
  cover_image: string | null;
  updated_at: string;
  cards_written: number;
  cards_painted: number;
}

function Progress({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-ivory-dim">
        <span>{label}</span>
        <span className="tabular-nums">
          {done}/{total}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function AdminOraclePage() {
  const admin = await requireAdminPage();
  const { data } = await admin.supabase.rpc("arcana_admin_oracle_list");
  const decks = (data ?? []) as DeckRow[];

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow">Oracle Studio</p>
        <h1 className="mt-2 text-3xl font-semibold">สร้างไพ่ออราเคิล</h1>
        <p className="mt-1 max-w-2xl text-sm text-ivory-dim">
          ออกแบบสำรับไพ่ของ ARCANA เองด้วย AI: วางคอนเซป เขียนเนื้อหาไพ่ทุกใบ สร้างภาพ ทำไฟล์พิมพ์ และเผยแพร่ให้ผู้ใช้ขอสารจากไพ่ได้
        </p>
      </header>

      {decks.length > 0 && (
        <section aria-labelledby="decks-title">
          <h2 id="decks-title" className="text-xl font-semibold">สำรับของคุณ</h2>
          <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {decks.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/admin/oracle/${d.id}`}
                  className="panel group flex h-full gap-4 p-4 transition-colors hover:border-gold/40"
                >
                  <OracleCardFace image={d.cover_image} name={d.title} size="sm" className="w-24 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-ivory group-hover:text-gold-light">{d.title}</p>
                      <span className={d.status === "published" ? "chip text-[11px]" : "chip border-white/15 bg-transparent text-[11px] text-ivory-dim"}>
                        {d.status === "published" ? "เผยแพร่แล้ว" : "ฉบับร่าง"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-ivory-dim">{d.tagline}</p>
                    <div className="mt-auto space-y-2 pt-3">
                      <Progress label="เนื้อหาไพ่" done={d.cards_written} total={d.card_count} />
                      <Progress label="ภาพไพ่" done={d.cards_painted} total={d.card_count} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BriefForm />

      <aside className="rounded-xl border border-white/10 bg-midnight/40 p-5 text-sm text-ivory-dim">
        <p className="font-medium text-ivory">ค่าใช้จ่ายโดยประมาณ</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>คอนเซปและเนื้อหาไพ่ (Claude): ราว ฿1–2 ต่อไพ่ 8 ใบ</li>
          <li>ภาพไพ่ (Vercel AI Gateway, FLUX.2 [pro]): ราว ฿1.5–2 ต่อภาพ — สำรับ 44 ใบ + ปก + หลังไพ่ ราว ฿70–90 (คิดจากเครดิต AI Gateway ของทีม Vercel)</li>
          <li>สร้างภาพใหม่ได้ทุกเมื่อ ภาพเก่าจะถูกแทนที่ (ไม่เก็บซ้ำ)</li>
        </ul>
      </aside>
    </div>
  );
}
