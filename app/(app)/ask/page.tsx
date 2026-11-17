import type { Metadata } from "next";
import { AskFlow } from "@/components/reading/AskFlow";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { getContext, supabaseConfigured } from "@/lib/supabase/server";
import { enabledSpreads } from "@/lib/tarot/spreads";

export const metadata: Metadata = { title: "ถามไพ่" };

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  let settings = DEFAULT_SETTINGS;
  if (supabaseConfigured()) {
    try {
      settings = await getSettings((await getContext()).supabase);
    } catch {
      // configuration banner is shown by the layout
    }
  }

  const spreads = enabledSpreads(settings.disabled_spreads).map((s) => ({
    id: s.id,
    nameTh: s.nameTh,
    nameEn: s.nameEn,
    descriptionTh: s.descriptionTh,
    cardCount: s.cardCount,
    positions: s.positions.map((p) => p.nameTh),
  }));
  return <AskFlow initialQuestion={(q ?? "").slice(0, 1000)} spreads={spreads} />;
}
