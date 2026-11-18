import type { Metadata } from "next";
import { DailyRitual, type RecentDaily } from "@/components/daily/DailyRitual";
import { aiStatus } from "@/lib/ai/provider";
import { getDailyMessage, getDailyState } from "@/lib/data/daily";
import { formatThaiDate } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getContext } from "@/lib/supabase/server";
import { getKnowledge } from "@/lib/tarot/knowledge";

export const metadata: Metadata = {
  title: "ไพ่ประจำวัน",
  description: "เปิดไพ่ทาโรต์ประจำวันฟรีทุกวัน พร้อมสารประจำวันจาก ARCANA",
  alternates: { canonical: "/daily" },
};

export default async function DailyPage() {
  const { supabase, isGuest } = await getContext();
  const [settings, kb, state, ai] = await Promise.all([
    getSettings(supabase),
    getKnowledge(supabase),
    getDailyState(supabase),
    aiStatus(),
  ]);

  const todayCard = state?.today ? kb.card(state.today.card_id) : undefined;
  const initial =
    state?.today && todayCard
      ? {
          card: todayCard,
          orientation: state.today.orientation,
          message: await getDailyMessage(supabase, {
            cardId: todayCard.id,
            orientation: state.today.orientation,
            kbVersion: kb.version,
          }),
        }
      : null;

  const recent: RecentDaily[] = (state?.recent ?? []).flatMap((r) => {
    const card = kb.card(r.card_id);
    return card
      ? [{ day: r.day, orientation: r.orientation, card: { id: card.id, name: card.name, nameTh: card.nameTh, image: card.image } }]
      : [];
  });

  const rewardsOn = settings.credits.enabled;

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Daily Tarot · {formatThaiDate(new Date().toISOString())}</p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">ไพ่ประจำวันของคุณ</h1>
        <p className="mt-2 max-w-2xl text-ivory-dim">
          เปิดได้ฟรีทุกวัน วันละหนึ่งใบ — ไพ่ถูกสุ่มด้วยระบบสุ่มที่ปลอดภัย ไม่ใช่ AI เลือกให้
          และไม่เปลี่ยนตลอดทั้งวัน
        </p>
      </header>

      <DailyRitual
        initial={initial}
        streak={state?.streak ?? 0}
        recent={recent}
        isGuest={isGuest}
        messageAvailable={settings.daily.ai_message && ai.configured}
        streakDays={rewardsOn ? settings.daily.streak_days : 0}
        streakReward={rewardsOn ? settings.daily.streak_reward : 0}
        signupBonus={rewardsOn ? settings.credits.signup_bonus : 0}
      />

      <p className="text-xs text-ivory-dim/60">
        ไพ่ทาโรต์เป็นเครื่องมือเชิงสัญลักษณ์เพื่อการสะท้อนคิด ไม่ใช่คำพยากรณ์ที่รับประกันผล
      </p>
    </div>
  );
}
