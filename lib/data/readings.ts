import type { SupabaseClient } from "@supabase/supabase-js";
import type { Interpretation, QuestionAnalysis } from "../ai/schemas";
import type { Usage } from "../ai/engine";
import type { DrawnCard, Orientation } from "../tarot/types";

export interface ReadingRow {
  id: string;
  user_key: string;
  question: string;
  question_analysis: QuestionAnalysis | null;
  spread_id: string;
  status: "drawn" | "interpreted";
  title: string | null;
  tendency: string | null;
  draw_meta: Record<string, unknown> | null;
  created_at: string;
}

export interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind: "chat" | "draw";
  created_at: string;
}

export interface JournalRow {
  id: string;
  reading_id: string | null;
  title: string;
  content: string;
  mood: string | null;
  created_at: string;
}

interface CardRow {
  position: number;
  position_key: string;
  card_id: string;
  orientation: Orientation;
  is_followup: boolean;
}

export function toDrawn(rows: CardRow[]): DrawnCard[] {
  return rows
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((r) => ({
      position: r.position,
      positionKey: r.position_key,
      cardId: r.card_id,
      orientation: r.orientation,
      isFollowup: r.is_followup,
    }));
}

export async function getReadingBundle(db: SupabaseClient, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: reading } = await db
    .from("arcana_readings")
    .select("*")
    .eq("id", id)
    .maybeSingle<ReadingRow>();
  if (!reading) return null;

  const [cards, analysis, messages] = await Promise.all([
    db
      .from("arcana_reading_cards")
      .select("position, position_key, card_id, orientation, is_followup")
      .eq("reading_id", id),
    db
      .from("arcana_reading_analyses")
      .select("content, quality, model, created_at")
      .eq("reading_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        content: Interpretation;
        quality: { passed: boolean; attempts: number; issues: string[] } | null;
        model: string | null;
        created_at: string;
      }>(),
    db
      .from("arcana_messages")
      .select("id, role, content, kind, created_at")
      .eq("reading_id", id)
      .order("created_at", { ascending: true })
      .returns<MessageRow[]>(),
  ]);

  return {
    reading,
    drawn: toDrawn((cards.data ?? []) as CardRow[]),
    interpretation: analysis.data?.content ?? null,
    quality: analysis.data?.quality ?? null,
    messages: messages.data ?? [],
  };
}

export async function logUsage(
  db: SupabaseClient,
  userKey: string,
  feature: string,
  usage: Usage | null,
  readingId?: string,
) {
  if (!usage) return;
  const { error } = await db.from("arcana_ai_usage").insert({
    user_key: userKey,
    feature,
    reading_id: readingId ?? null,
    provider: usage.provider,
    model: usage.model,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
  });
  if (error) console.error("[arcana] failed to log usage", error.message);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fair-use limits per session per 24h — protects AI cost. */
export const LIMITS = {
  readings: Number(process.env.ARCANA_DAILY_READINGS ?? 15),
  followups: Number(process.env.ARCANA_DAILY_FOLLOWUPS ?? 60),
  analyses: Number(process.env.ARCANA_DAILY_ANALYSES ?? 60),
};

export async function withinQuota(
  db: SupabaseClient,
  feature: "interpret" | "followup" | "analyze",
): Promise<boolean> {
  const limit =
    feature === "interpret"
      ? LIMITS.readings
      : feature === "followup"
        ? LIMITS.followups
        : LIMITS.analyses;
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { count, error } = await db
    .from("arcana_ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("feature", feature)
    .gte("created_at", since);
  if (error) return true; // fail open on metering errors, never on auth
  return (count ?? 0) < limit;
}
