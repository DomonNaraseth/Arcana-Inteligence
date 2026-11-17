import type { Metadata } from "next";
import { AskFlow } from "@/components/reading/AskFlow";
import { SPREADS } from "@/lib/tarot/spreads";

export const metadata: Metadata = { title: "ถามไพ่" };

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const spreads = SPREADS.map((s) => ({
    id: s.id,
    nameTh: s.nameTh,
    nameEn: s.nameEn,
    descriptionTh: s.descriptionTh,
    cardCount: s.cardCount,
    positions: s.positions.map((p) => p.nameTh),
  }));
  return <AskFlow initialQuestion={(q ?? "").slice(0, 1000)} spreads={spreads} />;
}
