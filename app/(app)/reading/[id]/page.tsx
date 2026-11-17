import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReadingExperience } from "@/components/reading/ReadingExperience";
import { resolveSpread } from "@/lib/ai/engine";
import { aiStatus } from "@/lib/ai/provider";
import { getReadingBundle } from "@/lib/data/readings";
import { getContext } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "การอ่านไพ่" };

export default async function ReadingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await getContext();
  const bundle = await getReadingBundle(supabase, id);
  if (!bundle) notFound();

  const spread = resolveSpread(bundle.reading.spread_id);
  const ai = await aiStatus();

  return (
    <ReadingExperience
      reading={{
        id: bundle.reading.id,
        question: bundle.reading.question,
        createdAt: bundle.reading.created_at,
        understanding: bundle.reading.question_analysis?.understanding ?? null,
      }}
      spread={{
        id: spread.id,
        nameTh: spread.nameTh,
        nameEn: spread.nameEn,
        positions: spread.positions,
      }}
      initialDrawn={bundle.drawn}
      initialInterpretation={bundle.interpretation}
      initialQuality={bundle.quality}
      initialMessages={bundle.messages}
      aiConfigured={ai.configured}
    />
  );
}
