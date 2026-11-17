import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SpreadEditor, type SpreadFields } from "@/components/admin/SpreadEditor";
import { requireAdminPage } from "@/lib/admin";
import { getKnowledge } from "@/lib/tarot/knowledge";
import { getSettings } from "@/lib/settings";
import { getSpread } from "@/lib/tarot/spreads";
import type { Spread } from "@/lib/tarot/types";

export const metadata: Metadata = { title: "แก้ไขรูปแบบการวางไพ่" };

const pick = (s: Spread): SpreadFields => ({
  nameTh: s.nameTh,
  descriptionTh: s.descriptionTh,
  interpretationStrategyTh: s.interpretationStrategyTh,
  positions: s.positions.map((p) => ({ nameTh: p.nameTh, meaningTh: p.meaningTh })),
});

export default async function AdminSpreadEditPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage();
  const { id } = await params;
  const base = getSpread(id);
  if (!base) notFound();

  const [kb, settings] = await Promise.all([
    getKnowledge(admin.supabase, { fresh: true }),
    getSettings(admin.supabase, { fresh: true }),
  ]);
  const spread = kb.resolveSpread(id);
  const disabled = settings.disabled_spreads.includes(id);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/knowledge?tab=spreads" className="btn-quiet -ml-3">
        <ArrowLeft className="h-4 w-4" /> คลังความรู้ไพ่
      </Link>

      <p className="eyebrow mt-4">
        {spread.nameEn} · {spread.cardCount} ใบ
      </p>
      <h1 className="mt-1 text-3xl font-semibold text-gold-light">{spread.nameTh}</h1>
      <p className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="chip border-white/15 bg-white/5 font-mono text-ivory-dim">{spread.id}</span>
        {kb.overridden.spreads.has(id) ? (
          <span className="chip">แก้ไขแล้ว</span>
        ) : (
          <span className="chip border-white/15 bg-white/5 text-ivory-dim">ค่าเริ่มต้น</span>
        )}
        {disabled && <span className="chip border-amber-400/40 bg-amber-950/30 text-amber-100">ปิดให้บริการอยู่</span>}
      </p>
      <p className="mt-2 text-sm text-ivory-dim">
        จำนวนไพ่และลำดับตำแหน่งเป็นโครงสร้าง แก้ไม่ได้ (การอ่านไพ่เก่าอ้างอิงตำแหน่งเหล่านี้) — เปิด/ปิดรูปแบบได้ที่{" "}
        <Link href="/admin/settings" className="text-gold hover:text-gold-light">
          ตั้งค่าระบบ
        </Link>
      </p>

      <SpreadEditor
        key={id}
        id={id}
        current={pick(spread)}
        defaults={pick(base)}
        positionKeys={base.positions.map((p) => p.nameEn)}
      />
    </div>
  );
}
