import type { Metadata } from "next";
import { AuthPanel } from "@/components/account/AuthPanel";
import { aiStatus } from "@/lib/ai/provider";
import { LIMITS } from "@/lib/data/readings";
import { getContext } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "บัญชีของฉัน" };

export default async function AccountPage() {
  const { supabase, user, isGuest } = await getContext();

  const [readings, journals, usage] = await Promise.all([
    supabase.from("arcana_readings").select("id", { count: "exact", head: true }),
    supabase.from("arcana_journals").select("id", { count: "exact", head: true }),
    supabase
      .from("arcana_ai_usage")
      .select("feature, input_tokens, output_tokens, created_at")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .returns<{ feature: string; input_tokens: number; output_tokens: number }[]>(),
  ]);

  const today = usage.data ?? [];
  const used = (f: string) => today.filter((u) => u.feature === f).length;
  const ai = await aiStatus();

  return (
    <div className="mx-auto max-w-3xl">
      <p className="eyebrow">My Profile</p>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">บัญชีของฉัน</h1>

      <section className="panel mt-8 p-6">
        <h2 className="text-xl font-semibold">สถานะ</h2>
        <p className="mt-2 text-ivory">
          {isGuest ? (
            <>
              คุณกำลังใช้งานแบบ <span className="text-gold-light">ผู้เยี่ยมชม (Guest)</span> —
              ประวัติการอ่านไพ่ผูกกับเบราว์เซอร์นี้
            </>
          ) : (
            <>
              เข้าสู่ระบบด้วย <span className="text-gold-light">{user?.email}</span>
            </>
          )}
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-ivory-dim">การอ่านไพ่ทั้งหมด</dt>
            <dd className="mt-1 font-serif text-2xl text-gold-light">{readings.count ?? 0}</dd>
          </div>
          <div>
            <dt className="text-ivory-dim">บันทึก</dt>
            <dd className="mt-1 font-serif text-2xl text-gold-light">{journals.count ?? 0}</dd>
          </div>
          <div>
            <dt className="text-ivory-dim">อ่านไพ่ (24 ชม.)</dt>
            <dd className="mt-1 font-serif text-2xl text-gold-light">
              {used("interpret")}
              <span className="text-sm text-ivory-dim">/{LIMITS.readings}</span>
            </dd>
          </div>
          <div>
            <dt className="text-ivory-dim">ถามต่อ (24 ชม.)</dt>
            <dd className="mt-1 font-serif text-2xl text-gold-light">
              {used("followup")}
              <span className="text-sm text-ivory-dim">/{LIMITS.followups}</span>
            </dd>
          </div>
        </dl>
        <p className="mt-5 text-xs text-ivory-dim/70">
          ระบบ AI:{" "}
          {ai.configured
            ? `พร้อมใช้งาน (${ai.provider === "anthropic" ? "Anthropic API" : "Vercel AI Gateway"})`
            : "ยังไม่ได้ตั้งค่า (Configuration Missing)"}
        </p>
      </section>

      <AuthPanel signedIn={!isGuest} email={user?.email ?? null} />

      <section className="mt-8 text-sm text-ivory-dim">
        <h2 className="text-base font-medium text-ivory">ความเป็นส่วนตัว</h2>
        <p className="mt-2">
          คำถามและคำอ่านของคุณเข้าถึงได้เฉพาะคุณเท่านั้น คุณสามารถลบการอ่านไพ่หรือบันทึกรายการใดก็ได้ถาวรจากหน้าของรายการนั้น
        </p>
      </section>
    </div>
  );
}
