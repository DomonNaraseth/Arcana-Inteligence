import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReadingExperience } from "@/components/reading/ReadingExperience";
import { aiStatus } from "@/lib/ai/provider";
import { getWallet } from "@/lib/credits";
import { getReadingBundle } from "@/lib/data/readings";
import { getSettings, interpretCost } from "@/lib/settings";
import { getContext } from "@/lib/supabase/server";
import { getKnowledge } from "@/lib/tarot/knowledge";

export const metadata: Metadata = { title: "การอ่านไพ่" };

export default async function ReadingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, isGuest } = await getContext();
  const bundle = await getReadingBundle(supabase, id);
  if (!bundle) notFound();

  const [ai, settings, kb] = await Promise.all([
    aiStatus(),
    getSettings(supabase),
    getKnowledge(supabase),
  ]);
  const spread = kb.resolveSpread(bundle.reading.spread_id);
  // effective knowledge (defaults + admin edits) for exactly the cards on the table
  const cards = Object.fromEntries(
    bundle.drawn.map((d) => [d.cardId, kb.requireCard(d.cardId)]),
  );
  const wallet = settings.credits.enabled ? await getWallet(supabase) : null;
  const credit = wallet
    ? {
        balance: wallet.balance,
        interpretCost: interpretCost(
          settings,
          bundle.drawn.filter((d) => !d.isFollowup).length,
        ),
        followupCost: settings.credits.cost_followup,
        clarifierCost: settings.credits.cost_clarifier,
      }
    : null;

  return (
    <ReadingExperience
      reading={{
        id: bundle.reading.id,
        question: bundle.reading.question,
        createdAt: bundle.reading.created_at,
        saved: Boolean(bundle.reading.saved_at),
        understanding: bundle.reading.question_analysis?.understanding ?? null,
      }}
      spread={{
        id: spread.id,
        nameTh: spread.nameTh,
        nameEn: spread.nameEn,
        positions: spread.positions,
      }}
      initialDrawn={bundle.drawn}
      initialCards={cards}
      initialInterpretation={bundle.interpretation}
      initialQuality={bundle.quality}
      initialMessages={bundle.messages}
      aiConfigured={ai.configured}
      credit={credit}
      isGuest={isGuest}
    />
  );
}
