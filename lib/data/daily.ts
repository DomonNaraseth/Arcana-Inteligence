import type { SupabaseClient } from "@supabase/supabase-js";
import { dailyMessageSchema, type DailyMessage } from "../ai/daily";
import type { Orientation } from "../tarot/types";

export interface DailyDraw {
  card_id: string;
  orientation: Orientation;
  kb_version: string | null;
}

export interface DailyState {
  /** YYYY-MM-DD, Bangkok time */
  day: string;
  today: DailyDraw | null;
  /** consecutive days, counting today once it is drawn */
  streak: number;
  recent: { day: string; card_id: string; orientation: Orientation }[];
}

export interface DailyDrawResult extends DailyDraw {
  day: string;
  is_new: boolean;
  streak: number;
  /** bonus credits earned by this draw (0 when none) */
  reward: number;
}

export async function getDailyState(supabase: SupabaseClient): Promise<DailyState | null> {
  const { data, error } = await supabase.rpc("arcana_daily_state");
  if (error || !data) {
    if (error) console.error("[arcana] daily state failed:", error.message);
    return null;
  }
  return data as DailyState;
}

export async function recordDailyDraw(
  supabase: SupabaseClient,
  draw: { cardId: string; orientation: Orientation; kbVersion: string },
): Promise<DailyDrawResult> {
  const { data, error } = await supabase.rpc("arcana_daily_draw", {
    p_card_id: draw.cardId,
    p_orientation: draw.orientation,
    p_kb_version: draw.kbVersion,
  });
  if (error || !data) throw new Error(`daily draw failed: ${error?.message ?? "no data"}`);
  return data as DailyDrawResult;
}

/** The shared message of the day for a card, if one has been written. */
export async function getDailyMessage(
  supabase: SupabaseClient,
  draw: { cardId: string; orientation: Orientation; kbVersion: string },
): Promise<DailyMessage | null> {
  const { data, error } = await supabase.rpc("arcana_daily_message_get", {
    p_card_id: draw.cardId,
    p_orientation: draw.orientation,
    p_kb_version: draw.kbVersion,
  });
  if (error || !data) return null;
  const parsed = dailyMessageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Stores a message; returns whichever message is the day's (the first writer wins). */
export async function putDailyMessage(
  supabase: SupabaseClient,
  draw: { cardId: string; orientation: Orientation; kbVersion: string },
  message: DailyMessage,
  meta: { provider: string; model: string; promptVersion: string },
): Promise<DailyMessage> {
  const { data, error } = await supabase.rpc("arcana_daily_message_put", {
    p_card_id: draw.cardId,
    p_orientation: draw.orientation,
    p_kb_version: draw.kbVersion,
    p_content: message,
    p_provider: meta.provider,
    p_model: meta.model,
    p_prompt_version: meta.promptVersion,
  });
  if (error) console.error("[arcana] save daily message failed:", error.message);
  const parsed = dailyMessageSchema.safeParse(data);
  return parsed.success ? parsed.data : message;
}
