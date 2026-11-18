import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { BuyCredits } from "@/components/account/BuyCredits";
import { GoogleSignInButton } from "@/components/account/GoogleSignInButton";
import { ManageSubscriptionButton, SubscribeButton } from "@/components/account/MembershipActions";
import { billingStatus, cardCheckoutOpen } from "@/lib/billing/provider";
import { promptPayConfig } from "@/lib/billing/promptpay";
import type { MySubscription } from "@/lib/billing/service";
import { getWallet } from "@/lib/credits";
import { getSettings } from "@/lib/settings";
import { getContext } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "แพ็กเกจและเครดิต",
  description: "ไพ่ประจำวันฟรีทุกวัน สมาชิกรายเดือนพร้อมเครดิตอ่านไพ่ และแพ็กเติมเครดิต",
};

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm text-ivory">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { supabase, isGuest } = await getContext();
  const [settings, wallet, sub, role] = await Promise.all([
    getSettings(supabase),
    getWallet(supabase),
    supabase.rpc("arcana_my_subscription"),
    supabase.rpc("arcana_admin_role"),
  ]);
  const cardOpen = cardCheckoutOpen(role.data === "owner" || role.data === "admin");
  const { payment } = await searchParams;
  const billing = billingStatus();
  const c = settings.credits;
  const subscription = (sub.data ?? null) as MySubscription | null;
  const tier = wallet?.tier ?? "free";
  const managed = Boolean(subscription?.active && subscription.source === "stripe" && subscription.manageable);
  // PromptPay, once set up, is the way to pay; the card checkout is the fallback
  const via: "promptpay" | "stripe" | null = !c.enabled
    ? null
    : promptPayConfig(settings)
      ? "promptpay"
      : cardOpen
        ? "stripe"
        : null;
  const canSell = via !== null;
  const prepaid = via === "promptpay";
  const readingsFor = (credits: number) => Math.floor(credits / Math.max(1, c.cost_interpret.medium));

  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <p className="eyebrow">Plans &amp; credits</p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">เริ่มฟรี แล้วเลือกเมื่อพร้อม</h1>
        <p className="mt-3 text-ivory-dim">
          ไพ่ประจำวันเปิดได้ฟรีทุกวัน ส่วนการอ่านไพ่เชิงลึกตามคำถามของคุณใช้เครดิต —
          เครดิตถูกหักหลังได้คำอ่านสำเร็จเท่านั้น
        </p>
      </header>

      {payment === "cancelled" && (
        <p role="status" className="panel px-5 py-4 text-sm text-ivory-dim">
          ยกเลิกการชำระเงินแล้ว ยังไม่มีการตัดเงิน
        </p>
      )}
      {!c.enabled && (
        <p role="status" className="panel border-amber-400/40 px-5 py-4 text-sm text-amber-100">
          ขณะนี้ยังไม่เปิดระบบเครดิต — อ่านไพ่ได้ตามโควตารายวันโดยไม่ต้องใช้เครดิต
          แพ็กเกจด้านล่างจะเริ่มใช้เมื่อเปิดระบบ
        </p>
      )}
      {c.enabled && !canSell && (
        <p role="status" className="panel border-amber-400/40 px-5 py-4 text-sm text-amber-100">
          การชำระเงินออนไลน์ยังไม่เปิดให้บริการ (Configuration Missing) — สมัครฟรีและใช้เครดิตโบนัสได้ตามปกติ
        </p>
      )}

      <section aria-label="แพ็กเกจสมาชิก" className="grid gap-5 lg:grid-cols-3">
        <article className="panel flex flex-col p-6">
          <h2 className="text-xl font-semibold">Free</h2>
          <p className="mt-1 text-sm text-ivory-dim">สมัครฟรี ไม่ต้องใช้บัตร</p>
          <p className="mt-5 text-4xl font-semibold tabular-nums text-ivory">
            ฿0<span className="ml-1 font-sans text-sm font-normal text-ivory-dim">ตลอดไป</span>
          </p>
          <ul className="mt-6 flex-1 space-y-3">
            <Feature>ไพ่ประจำวันพร้อมสารประจำวัน ฟรีทุกวัน</Feature>
            {c.signup_bonus > 0 && <Feature>รับ {c.signup_bonus} เครดิตทันทีที่สมัคร</Feature>}
            {settings.daily.streak_days > 0 && settings.daily.streak_reward > 0 && (
              <Feature>
                เปิดไพ่ประจำวันต่อเนื่องทุก {settings.daily.streak_days} วัน รับ {settings.daily.streak_reward} เครดิต
              </Feature>
            )}
            <Feature>ถามต่อฟรี {c.free_followups.free} ครั้งต่อการอ่าน</Feature>
            <Feature>ประวัติการอ่านไพ่ บันทึก และคลังไพ่ 78 ใบ</Feature>
          </ul>
          <div className="mt-6">
            {isGuest ? (
              <GoogleSignInButton next="/pricing" label="สมัครฟรีด้วย Google" />
            ) : (
              <p className="rounded-full border border-white/15 px-5 py-2.5 text-center text-sm text-ivory-dim">
                {tier === "free" ? "แพ็กเกจปัจจุบันของคุณ" : "รวมอยู่ในแพ็กเกจของคุณ"}
              </p>
            )}
          </div>
        </article>

        {settings.plans.map((plan, i) => {
          const current = tier === plan.id && Boolean(subscription?.active);
          const best = i === settings.plans.length - 1;
          return (
            <article key={plan.id} className={best ? "panel-gold flex flex-col p-6" : "panel flex flex-col p-6"}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                {best && <span className="chip">คุ้มที่สุด</span>}
              </div>
              <p className="mt-1 text-sm text-ivory-dim">
                {prepaid ? "สมาชิก 30 วัน จ่ายครั้งเดียว ไม่ตัดเงินอัตโนมัติ" : "สมาชิกรายเดือน ยกเลิกได้ทุกเมื่อ"}
              </p>
              <p className="mt-5 text-4xl font-semibold tabular-nums text-gold-light">
                ฿{plan.price_thb.toLocaleString("th-TH")}
                <span className="ml-1 font-sans text-sm font-normal text-ivory-dim">
                  {prepaid ? "/30 วัน" : "/เดือน"}
                </span>
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                <Feature>
                  {plan.monthly_credits} เครดิต{prepaid ? "ทันทีที่ชำระ" : "ทุกเดือน"} (อ่านไพ่ชุด 4–7 ใบได้ราว{" "}
                  {readingsFor(plan.monthly_credits)} ครั้ง)
                </Feature>
                <Feature>
                  เฉลี่ย {(plan.price_thb / plan.monthly_credits).toFixed(2)} บาทต่อเครดิต — ถูกกว่าแพ็กเติมเครดิต
                </Feature>
                <Feature>ถามต่อฟรี {c.free_followups[plan.id]} ครั้งต่อการอ่าน</Feature>
                <Feature>เครดิตที่ได้รับไม่หมดอายุ สะสมข้ามเดือนได้</Feature>
                <Feature>ทุกอย่างในแพ็กเกจ Free</Feature>
              </ul>
              <div className="mt-6">
                {prepaid && !isGuest ? (
                  <SubscribeButton
                    planId={plan.id}
                    via="promptpay"
                    label={current ? `ต่ออายุ ${plan.name} อีก 30 วัน` : `สมัคร ${plan.name}`}
                    highlighted={best}
                  />
                ) : current && managed ? (
                  <ManageSubscriptionButton className="btn-ghost w-full" />
                ) : current ? (
                  <p className="rounded-full border border-gold/40 px-5 py-2.5 text-center text-sm text-gold-light">
                    แพ็กเกจปัจจุบันของคุณ
                  </p>
                ) : managed ? (
                  <p className="text-center text-sm text-ivory-dim">
                    เปลี่ยนแพ็กเกจ: ยกเลิกแพ็กเกจปัจจุบันที่{" "}
                    <Link href="/account" className="text-gold underline-offset-4 hover:underline">
                      หน้าบัญชี
                    </Link>{" "}
                    แล้วสมัครใหม่เมื่อครบรอบ
                  </p>
                ) : !canSell ? (
                  <p className="rounded-full border border-white/15 px-5 py-2.5 text-center text-sm text-ivory-dim">
                    เร็ว ๆ นี้
                  </p>
                ) : isGuest ? (
                  <GoogleSignInButton next="/pricing" label="เข้าสู่ระบบเพื่อสมัคร" />
                ) : (
                  <SubscribeButton planId={plan.id} label={`สมัคร ${plan.name}`} highlighted={best} />
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel p-6" aria-labelledby="cost-title">
        <h2 id="cost-title" className="text-xl font-semibold">
          เครดิตใช้ทำอะไรได้บ้าง
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/10 px-4 py-3">
            <dt className="text-ivory-dim">อ่านไพ่ 1–3 ใบ</dt>
            <dd className="mt-1 text-lg tabular-nums text-ivory">{c.cost_interpret.small} เครดิต</dd>
          </div>
          <div className="rounded-xl border border-white/10 px-4 py-3">
            <dt className="text-ivory-dim">อ่านไพ่ 4–7 ใบ</dt>
            <dd className="mt-1 text-lg tabular-nums text-ivory">{c.cost_interpret.medium} เครดิต</dd>
          </div>
          <div className="rounded-xl border border-white/10 px-4 py-3">
            <dt className="text-ivory-dim">อ่านไพ่ 8 ใบขึ้นไป</dt>
            <dd className="mt-1 text-lg tabular-nums text-ivory">{c.cost_interpret.large} เครดิต</dd>
          </div>
          <div className="rounded-xl border border-white/10 px-4 py-3">
            <dt className="text-ivory-dim">ถามต่อ / เปิดไพ่เสริม</dt>
            <dd className="mt-1 text-lg tabular-nums text-ivory">
              {c.cost_followup} / {c.cost_clarifier} เครดิต
            </dd>
            <dd className="text-xs text-ivory-dim">หลังใช้สิทธิ์ถามต่อฟรีครบ</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ivory-dim">
          หากระบบ AI ขัดข้องหรือคำอ่านไม่ผ่านการตรวจคุณภาพ จะไม่มีการหักเครดิต
        </p>

        {settings.packages.length > 0 && (
          <BuyCredits
            packages={settings.packages}
            available={canSell}
            via={via ?? "stripe"}
            testMode={via === "stripe" && !billing.livemode}
            needsAccount={settings.billing.require_account && isGuest}
            isGuest={isGuest}
          />
        )}
      </section>

      <section className="text-sm text-ivory-dim" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-base font-medium text-ivory">
          คำถามที่พบบ่อย
        </h2>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="text-ivory">{prepaid ? "สมาชิกต่ออายุเองหรือไม่" : "ยกเลิกสมาชิกได้อย่างไร"}</dt>
            <dd className="mt-1">
              {prepaid
                ? "ไม่ต่ออายุเองและไม่มีการตัดเงินอัตโนมัติ สมาชิกใช้ได้ 30 วันนับจากวันที่ชำระ ต่ออายุได้เองที่หน้านี้ และเครดิตที่ได้รับไปแล้วยังอยู่กับคุณ"
                : "กด “จัดการสมาชิก” ในหน้าบัญชีได้ทุกเมื่อ สิทธิ์สมาชิกใช้ได้จนครบรอบที่ชำระแล้ว และเครดิตที่ได้รับไปแล้วยังอยู่กับคุณ"}
            </dd>
          </div>
          <div>
            <dt className="text-ivory">ชำระเงินปลอดภัยหรือไม่</dt>
            <dd className="mt-1">
              {prepaid
                ? "โอนผ่าน PromptPay จากแอปธนาคารของคุณเอง ARCANA ไม่ขอและไม่เก็บข้อมูลบัตรหรือรหัสผ่านธนาคาร สลิปถูกตรวจกับเครือข่ายธนาคารและไม่ถูกเก็บไว้"
                : "ชำระบนหน้าของ Stripe โดยตรง ARCANA ไม่เห็นและไม่เก็บข้อมูลบัตรของคุณ"}
            </dd>
          </div>
          <div>
            <dt className="text-ivory">ไพ่ทาโรต์รับประกันผลได้หรือไม่</dt>
            <dd className="mt-1">
              ไม่ได้ ไพ่ทาโรต์เป็นเครื่องมือเชิงสัญลักษณ์เพื่อการสะท้อนคิด
              ไม่ทดแทนคำแนะนำจากผู้เชี่ยวชาญด้านการแพทย์ กฎหมาย หรือการเงิน
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
