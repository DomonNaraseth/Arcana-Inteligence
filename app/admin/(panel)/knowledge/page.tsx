import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { KnowledgeCardList } from "@/components/admin/KnowledgeCardList";
import { requireAdminPage } from "@/lib/admin";
import { getKnowledge } from "@/lib/tarot/knowledge";

export const metadata: Metadata = { title: "คลังความรู้ไพ่" };

export default async function AdminKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const admin = await requireAdminPage();
  const tab = (await searchParams).tab === "spreads" ? "spreads" : "cards";
  const kb = await getKnowledge(admin.supabase, { fresh: true });

  const tabs = [
    { id: "cards", label: `ไพ่ ${kb.cards.length} ใบ`, edited: kb.overridden.cards.size },
    { id: "spreads", label: `รูปแบบการวางไพ่ ${kb.spreads.length} แบบ`, edited: kb.overridden.spreads.size },
  ];

  return (
    <div>
      <p className="eyebrow">Tarot Knowledge Base</p>
      <h1 className="mt-2 text-3xl font-semibold">คลังความรู้ไพ่</h1>
      <p className="mt-1 max-w-3xl text-sm text-ivory-dim">
        แก้ข้อความที่ผู้ใช้เห็นและที่ส่งให้ AI ใช้ตีความ โครงสร้างของสำรับ (ชุดไพ่ ธาตุ ลำดับ จำนวนไพ่ในแต่ละรูปแบบ)
        แก้ไม่ได้ ทุกการแก้ไขถูกบันทึกใน audit log และคืนค่าเริ่มต้นได้เสมอ
      </p>
      <p className="mt-2 text-xs text-ivory-dim">
        เวอร์ชันความรู้ปัจจุบัน: <span className="font-mono text-ivory">{kb.version}</span> — ถูกบันทึกไว้กับคำอ่านทุกครั้ง
      </p>

      <nav className="mt-6 flex gap-1 border-b border-white/10" aria-label="ประเภทความรู้">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/admin/knowledge?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={clsx(
              "-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors",
              tab === t.id
                ? "border-gold text-gold-light"
                : "border-transparent text-ivory-dim hover:text-ivory",
            )}
          >
            {t.label}
            {t.edited > 0 && <span className="ml-2 text-xs text-gold">แก้แล้ว {t.edited}</span>}
          </Link>
        ))}
      </nav>

      {tab === "cards" ? (
        <KnowledgeCardList
          cards={kb.cards.map((c) => ({
            id: c.id,
            name: c.name,
            nameTh: c.nameTh,
            arcana: c.arcana,
            suit: c.suit,
            image: c.image,
            edited: kb.overridden.cards.has(c.id),
          }))}
        />
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {kb.spreads.map((s) => (
            <li key={s.id}>
              <Link
                href={`/admin/knowledge/spreads/${s.id}`}
                className="panel block p-5 transition-colors hover:border-gold/40"
              >
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block font-medium text-ivory">{s.nameTh}</span>
                    <span className="block text-xs text-ivory-dim">
                      {s.nameEn} · {s.cardCount} ใบ
                    </span>
                  </span>
                  {kb.overridden.spreads.has(s.id) && <span className="chip shrink-0">แก้แล้ว</span>}
                </span>
                <span className="mt-2 line-clamp-2 block text-sm text-ivory-dim">{s.descriptionTh}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
