import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { requireAdminPage } from "@/lib/admin";
import { aiStatus } from "@/lib/ai/provider";
import { PROMPT_VERSION } from "@/lib/ai/schemas";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { getKnowledge } from "@/lib/tarot/knowledge";

export const metadata: Metadata = { title: "ตั้งค่าระบบ" };

export default async function AdminSettingsPage() {
  const admin = await requireAdminPage();
  const [settings, roles, ai, kb] = await Promise.all([
    getSettings(admin.supabase, { fresh: true }),
    admin.supabase.rpc("arcana_admin_get_admin_emails"),
    aiStatus(),
    getKnowledge(admin.supabase, { fresh: true }),
  ]);
  const roleData = (roles.data ?? { owners: [], admins: [] }) as {
    owners: string[];
    admins: string[];
  };

  return (
    <div>
      <p className="eyebrow">Configuration</p>
      <h1 className="mt-2 text-3xl font-semibold">ตั้งค่าระบบ</h1>
      <p className="mt-1 text-sm text-ivory-dim">
        การเปลี่ยนแปลงมีผลภายในราว 30 วินาที และถูกบันทึกใน audit log ทุกครั้ง
      </p>
      <SettingsForm
        initial={settings}
        recommended={{
          credits: DEFAULT_SETTINGS.credits,
          packages: DEFAULT_SETTINGS.packages,
          plans: DEFAULT_SETTINGS.plans,
          daily: DEFAULT_SETTINGS.daily,
        }}
        role={admin.role}
        owners={roleData.owners}
        admins={roleData.admins}
        spreads={kb.spreads.map((s) => ({ id: s.id, nameTh: s.nameTh, nameEn: s.nameEn, cardCount: s.cardCount }))}
        ai={{
          configured: ai.configured,
          provider: ai.provider,
          promptVersion: PROMPT_VERSION,
          kbVersion: kb.version,
        }}
      />
    </div>
  );
}
