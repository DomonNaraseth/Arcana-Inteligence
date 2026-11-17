import { NextResponse } from "next/server";
import { DAILY_PROMPT_VERSION, generateDailyMessage } from "@/lib/ai/daily";
import { handleError } from "@/lib/api";
import { getWallet } from "@/lib/credits";
import {
  getDailyMessage,
  getDailyState,
  putDailyMessage,
  recordDailyDraw,
  type DailyDrawResult,
} from "@/lib/data/daily";
import { logUsage } from "@/lib/data/readings";
import { getSettings } from "@/lib/settings";
import { getContext } from "@/lib/supabase/server";
import { drawDailyCard } from "@/lib/tarot/draw";
import { getKnowledge } from "@/lib/tarot/knowledge";

export const maxDuration = 60;

/**
 * Reveals today's card. The card is drawn here with the secure randomizer and
 * stored once per user per day — calling again returns the same card. The
 * message of the day is shared by everyone who drew the same card today.
 */
export async function POST() {
  try {
    const { supabase, userKey } = await getContext();
    const [settings, kb, state] = await Promise.all([
      getSettings(supabase),
      getKnowledge(supabase),
      getDailyState(supabase),
    ]);

    let draw: DailyDrawResult;
    if (state?.today) {
      draw = { ...state.today, day: state.day, is_new: false, streak: state.streak, reward: 0 };
    } else {
      const picked = drawDailyCard({ reversalProbability: settings.reversal_probability });
      draw = await recordDailyDraw(supabase, { ...picked, kbVersion: kb.version });
    }

    const card = kb.requireCard(draw.card_id);
    const key = { cardId: draw.card_id, orientation: draw.orientation, kbVersion: kb.version };

    let message = await getDailyMessage(supabase, key);
    if (!message && settings.daily.ai_message) {
      const generated = await generateDailyMessage({
        card,
        orientation: draw.orientation,
        dayLabel: new Intl.DateTimeFormat("th-TH", {
          dateStyle: "full",
          timeZone: "Asia/Bangkok",
        }).format(new Date()),
        deck: kb.cards,
        addendum: settings.prompt_addendum.text,
      });
      if (generated) {
        message = await putDailyMessage(supabase, key, generated.message, {
          provider: generated.usage.provider,
          model: generated.usage.model,
          promptVersion: DAILY_PROMPT_VERSION,
        });
        await logUsage(supabase, userKey, "daily", generated.usage);
      }
    }

    const wallet = draw.reward > 0 && settings.credits.enabled ? await getWallet(supabase) : null;

    return NextResponse.json({
      day: draw.day,
      card,
      orientation: draw.orientation,
      isNew: draw.is_new,
      streak: draw.streak,
      reward: draw.reward,
      balance: wallet?.balance ?? null,
      message,
    });
  } catch (err) {
    return handleError(err, "/api/daily");
  }
}
