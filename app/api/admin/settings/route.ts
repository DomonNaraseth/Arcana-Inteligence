import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, rpcFailure } from "@/lib/admin";
import { fail } from "@/lib/api";
import { SETTING_KEYS, invalidateSettings, settingsSchemas, type SettingKey } from "@/lib/settings";
import { SPREADS } from "@/lib/tarot/spreads";

const bodySchema = z.object({
  key: z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]),
  value: z.unknown(),
});

export const POST = adminRoute(async (admin, req) => {
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("bad_request", "ไม่รู้จักการตั้งค่านี้", 400);

  const { key } = body.data;
  const parsed = settingsSchemas[key].safeParse(body.data.value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      "bad_request",
      `ค่าที่กรอกไม่ถูกต้อง (${issue.path.join(".") || key}: ${issue.message})`,
      400,
    );
  }

  if (key === "disabled_spreads") {
    const ids = parsed.data as string[];
    const known = new Set(SPREADS.map((s) => s.id));
    if (ids.some((id) => !known.has(id))) {
      return fail("bad_request", "มีรหัสรูปแบบการวางไพ่ที่ไม่รู้จัก", 400);
    }
    if (ids.length >= SPREADS.length) {
      return fail("bad_request", "ต้องเปิดรูปแบบการวางไพ่ไว้อย่างน้อย 1 รูปแบบ", 400);
    }
  }

  const { error } = await admin.supabase.rpc("arcana_admin_set_setting", {
    p_key: key,
    p_value: parsed.data,
  });
  if (error) return rpcFailure(error);

  invalidateSettings();
  return NextResponse.json({ ok: true });
});
