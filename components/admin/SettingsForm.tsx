"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { checkThaiQr } from "@/lib/billing/thaiqr";
import type { SettingKey, Settings } from "@/lib/settings";
import { ShopQrField } from "./ShopQrField";

interface Props {
  initial: Settings;
  /** the shipped pricing model, offered as a one-click starting point */
  recommended: Pick<Settings, "credits" | "packages" | "plans" | "daily">;
  role: "owner" | "admin";
  owners: string[];
  admins: string[];
  spreads: { id: string; nameTh: string; nameEn: string; cardCount: number }[];
  ai: {
    configured: boolean;
    provider: "anthropic" | "vercel-ai-gateway" | null;
    promptVersion: string;
    kbVersion: string;
  };
}

type SaveState = { busy: boolean; ok: boolean; error: string | null };
const idle: SaveState = { busy: false, ok: false, error: null };

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? "บันทึกไม่สำเร็จ");
  return data;
}

function useSaver() {
  const [state, setState] = useState<SaveState>(idle);
  async function run(fn: () => Promise<unknown>) {
    setState({ busy: true, ok: false, error: null });
    try {
      await fn();
      setState({ busy: false, ok: true, error: null });
    } catch (e) {
      setState({ busy: false, ok: false, error: (e as Error).message });
    }
  }
  const saveSetting = (key: SettingKey, value: unknown) =>
    run(() => postJson("/api/admin/settings", { key, value }));
  return { state, run, saveSetting };
}

function Section({
  title,
  description,
  children,
  state,
  onSave,
  saveLabel = "บันทึก",
  disabled,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  state: SaveState;
  onSave?: () => void;
  saveLabel?: string;
  disabled?: boolean;
}) {
  return (
    <section className="panel p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-ivory-dim">{description}</p>}
      <div className="mt-5">{children}</div>
      {state.error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {state.error}
        </p>
      )}
      {onSave && (
        <div className="mt-5 flex items-center gap-3">
          <button type="button" onClick={onSave} disabled={state.busy || disabled} className="btn-gold px-5 py-2.5 text-sm">
            {state.busy && <Loader2 className="h-4 w-4 animate-spin" />} {saveLabel}
          </button>
          {state.ok && (
            <span role="status" className="flex items-center gap-1.5 text-sm text-gold-light">
              <Check className="h-4 w-4" /> บันทึกแล้ว
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function Num({
  label,
  value,
  onChange,
  min = 0,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-ivory-dim">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Math.trunc(Number(e.target.value)))}
          className="field py-2 text-sm tabular-nums"
        />
        {suffix && <span className="shrink-0 text-sm text-ivory-dim">{suffix}</span>}
      </span>
    </label>
  );
}

export function SettingsForm({ initial, recommended, role, owners, admins, spreads, ai }: Props) {
  // ── reading rules ──
  const [reversal, setReversal] = useState(Math.round(initial.reversal_probability * 100));
  const [limits, setLimits] = useState(initial.limits);
  const drawSaver = useSaver();

  // ── credits ──
  const [credits, setCredits] = useState(initial.credits);
  const [packages, setPackages] = useState(initial.packages);
  const creditSaver = useSaver();

  // ── spreads ──
  const [disabled, setDisabled] = useState<string[]>(initial.disabled_spreads);
  const spreadSaver = useSaver();

  // ── models ──
  const [models, setModels] = useState(initial.models);
  const [probe, setProbe] = useState<{ model: string; ok: boolean; detail: string }[] | null>(null);
  const [probing, setProbing] = useState(false);
  const modelSaver = useSaver();

  // ── billing ──
  const [billing, setBilling] = useState(initial.billing);
  const billingSaver = useSaver();

  // ── memberships & daily card ──
  const [plans, setPlans] = useState(initial.plans);
  const [daily, setDaily] = useState(initial.daily);
  const planSaver = useSaver();

  // ── PromptPay & seller identity ──
  const [promptpay, setPromptpay] = useState(initial.promptpay);
  const [business, setBusiness] = useState(initial.business);
  const promptpaySaver = useSaver();
  const promptpayDigits = promptpay.id.replace(/\D/g, "");
  const promptpayIdOk = /^0\d{9}$/.test(promptpayDigits) || /^\d{13}$/.test(promptpayDigits) || /^\d{15}$/.test(promptpayDigits);
  const shopQrOk = checkThaiQr(promptpay.merchant_qr).ok;

  function applyRecommended() {
    // fills the form only — nothing is stored until each section is saved
    setCredits({ ...recommended.credits, enabled: credits.enabled });
    setPackages(recommended.packages);
    setPlans(recommended.plans);
    setDaily(recommended.daily);
  }

  // ── prices ──
  const [prices, setPrices] = useState(
    Object.entries(initial.model_prices).map(([model, p]) => ({ model, ...p })),
  );
  const priceSaver = useSaver();

  // ── prompt ──
  const [addendum, setAddendum] = useState(initial.prompt_addendum.text);
  const promptSaver = useSaver();

  // ── admins ──
  const [adminText, setAdminText] = useState(admins.join("\n"));
  const adminSaver = useSaver();

  async function testModels() {
    const list = [models.gateway_deep, models.gateway_chat, models.gateway_fast]
      .map((m) => m.trim())
      .filter(Boolean);
    const unique = [...new Set(list)];
    if (unique.length === 0) {
      setProbe([{ model: "–", ok: false, detail: "กรอกชื่อโมเดลบน AI Gateway อย่างน้อย 1 ช่องก่อนทดสอบ" }]);
      return;
    }
    setProbing(true);
    try {
      const data = await postJson("/api/admin/ai-probe", { models: unique });
      setProbe(data.results);
    } catch (e) {
      setProbe([{ model: "–", ok: false, detail: (e as Error).message }]);
    } finally {
      setProbing(false);
    }
  }

  const modelFields: { key: keyof Settings["models"]; label: string; placeholder: string }[] = [
    { key: "anthropic_deep", label: "Anthropic · ตีความและถามต่อ", placeholder: "claude-sonnet-5-5" },
    { key: "anthropic_fast", label: "Anthropic · วิเคราะห์คำถาม", placeholder: "claude-haiku-5-5" },
    { key: "gateway_deep", label: "AI Gateway · ตีความ", placeholder: "anthropic/claude-sonnet-5.5" },
    { key: "gateway_chat", label: "AI Gateway · ถามต่อ", placeholder: "anthropic/claude-sonnet-5.5" },
    { key: "gateway_fast", label: "AI Gateway · วิเคราะห์คำถาม", placeholder: "anthropic/claude-haiku-5.5" },
  ];

  return (
    <div className="mt-8 space-y-6">
      <Section
        title="การเปิดไพ่และโควตา"
        description="โควตารายวันใช้เมื่อระบบเครดิตปิดอยู่ (โควตาถามต่อใช้เสมอ เพื่อคุมต้นทุน)"
        state={drawSaver.state}
        onSave={() =>
          drawSaver.run(async () => {
            await postJson("/api/admin/settings", { key: "reversal_probability", value: reversal / 100 });
            await postJson("/api/admin/settings", { key: "limits", value: limits });
          })
        }
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="โอกาสไพ่กลับหัว" value={reversal} onChange={(n) => setReversal(Math.min(100, Math.max(0, n)))} max={100} suffix="%" />
          <Num label="อ่านไพ่ต่อวัน" value={limits.daily_readings} onChange={(n) => setLimits({ ...limits, daily_readings: n })} min={1} suffix="ครั้ง" />
          <Num label="ถามต่อต่อวัน" value={limits.daily_followups} onChange={(n) => setLimits({ ...limits, daily_followups: n })} suffix="ครั้ง" />
          <Num label="วิเคราะห์คำถามต่อวัน" value={limits.daily_analyses} onChange={(n) => setLimits({ ...limits, daily_analyses: n })} min={1} suffix="ครั้ง" />
        </div>
      </Section>

      <Section
        title="เครดิตและแพ็กเกจ"
        description="เมื่อเปิดใช้ การอ่านไพ่จะหักเครดิตแทนโควตารายวัน หักหลังได้คำอ่านสำเร็จเท่านั้น และไม่หักซ้ำ"
        state={creditSaver.state}
        onSave={() =>
          creditSaver.run(async () => {
            await postJson("/api/admin/settings", { key: "credits", value: credits });
            await postJson("/api/admin/settings", { key: "packages", value: packages });
          })
        }
      >
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={credits.enabled}
            onChange={(e) => setCredits({ ...credits, enabled: e.target.checked })}
            className="h-5 w-5 accent-[#C6A15B]"
          />
          <span className="text-ivory">เปิดใช้ระบบเครดิต</span>
        </label>

        <div className="mt-4 rounded-xl border border-gold/25 bg-gold/5 px-4 py-3">
          <p className="text-sm text-ivory">
            ค่าที่แนะนำ: สมัครฟรีรับ {recommended.credits.signup_bonus} เครดิต · อ่านไพ่{" "}
            {recommended.credits.cost_interpret.small}/{recommended.credits.cost_interpret.medium}/
            {recommended.credits.cost_interpret.large} เครดิต · ไม่มีเครดิตฟรีรายวัน (ใช้ไพ่ประจำวันและรางวัลเปิดไพ่ต่อเนื่องแทน)
          </p>
          <button type="button" onClick={applyRecommended} className="btn-quiet mt-2 border border-gold/40">
            เติมค่าที่แนะนำลงในฟอร์ม
          </button>
          <p className="mt-2 text-xs text-ivory-dim">
            ยังไม่บันทึกจนกว่าจะกด “บันทึก” ของหัวข้อนี้ และของหัวข้อ “สมาชิกรายเดือนและไพ่ประจำวัน”
          </p>
        </div>

        <h3 className="mt-6 text-sm font-medium text-gold">เครดิตฟรีรายวันตามแพ็กเกจ</h3>
        <p className="mt-1 text-xs text-ivory-dim">
          ทุกวันระบบเติมยอดให้ถึงจำนวนนี้ (เครดิตส่วนเกินที่ซื้อหรือได้รับแจกจะไม่หาย)
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          {(["free", "basic", "premium", "unlimited"] as const).map((t) => (
            <Num
              key={t}
              label={t.charAt(0).toUpperCase() + t.slice(1)}
              value={credits.daily_free[t]}
              onChange={(n) => setCredits({ ...credits, daily_free: { ...credits.daily_free, [t]: n } })}
            />
          ))}
        </div>

        <h3 className="mt-6 text-sm font-medium text-gold">ราคาเป็นเครดิต</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Num label="ตีความ ≤3 ใบ" value={credits.cost_interpret.small} onChange={(n) => setCredits({ ...credits, cost_interpret: { ...credits.cost_interpret, small: n } })} />
          <Num label="ตีความ 4–7 ใบ" value={credits.cost_interpret.medium} onChange={(n) => setCredits({ ...credits, cost_interpret: { ...credits.cost_interpret, medium: n } })} />
          <Num label="ตีความ ≥8 ใบ" value={credits.cost_interpret.large} onChange={(n) => setCredits({ ...credits, cost_interpret: { ...credits.cost_interpret, large: n } })} />
          <Num label="ถามต่อ 1 ครั้ง" value={credits.cost_followup} onChange={(n) => setCredits({ ...credits, cost_followup: n })} />
          <Num label="ไพ่เสริม 1 ใบ" value={credits.cost_clarifier} onChange={(n) => setCredits({ ...credits, cost_clarifier: n })} />
        </div>

        <h3 className="mt-6 text-sm font-medium text-gold">เครดิตต้อนรับ (ให้ครั้งเดียว)</h3>
        <p className="mt-1 text-xs text-ivory-dim">
          โบนัสสมัครให้เมื่อเข้าสู่ระบบครั้งแรก · เครดิตทดลองของผู้เยี่ยมชมผูกกับเบราว์เซอร์
          (ตั้งเป็น 0 เพื่อให้ต้องสมัครก่อนอ่านไพ่ — ป้องกันการเปิดหน้าต่างใหม่เพื่อรับซ้ำ)
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="โบนัสสมัครสมาชิก" value={credits.signup_bonus} onChange={(n) => setCredits({ ...credits, signup_bonus: n })} suffix="เครดิต" />
          <Num label="ทดลองใช้ (ผู้เยี่ยมชม)" value={credits.guest_trial} onChange={(n) => setCredits({ ...credits, guest_trial: n })} suffix="เครดิต" />
        </div>

        <h3 className="mt-6 text-sm font-medium text-gold">ถามต่อฟรีต่อการอ่านหนึ่งครั้ง</h3>
        <p className="mt-1 text-xs text-ivory-dim">เกินจำนวนนี้จึงคิดราคา “ถามต่อ 1 ครั้ง” ด้านบน</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          {(["free", "basic", "premium", "unlimited"] as const).map((t) => (
            <Num
              key={t}
              label={t === "basic" ? "Plus" : t.charAt(0).toUpperCase() + t.slice(1)}
              value={credits.free_followups[t]}
              onChange={(n) => setCredits({ ...credits, free_followups: { ...credits.free_followups, [t]: n } })}
              suffix="ครั้ง"
            />
          ))}
        </div>

        <h3 className="mt-6 text-sm font-medium text-gold">แพ็กเกจเติมเครดิต</h3>
        <p className="mt-1 text-xs text-ivory-dim">
          ราคาและจำนวนเครดิตที่ขายจริงผ่านระบบชำระเงิน (ขั้นต่ำ 10 บาทต่อแพ็กเกจ)
        </p>
        <div className="mt-3 space-y-2">
          {packages.map((p, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">ชื่อแพ็กเกจ</span>
                <input
                  value={p.name}
                  onChange={(e) =>
                    setPackages(packages.map((x, j) => (j === i ? { ...x, name: e.target.value, id: x.id || `pkg-${i + 1}` } : x)))
                  }
                  placeholder="ชื่อแพ็กเกจ"
                  className="field py-2 text-sm"
                />
              </label>
              <label className="w-28">
                <span className="sr-only">จำนวนเครดิต</span>
                <input
                  type="number"
                  min={1}
                  value={p.credits}
                  onChange={(e) => setPackages(packages.map((x, j) => (j === i ? { ...x, credits: Math.trunc(Number(e.target.value)) } : x)))}
                  className="field py-2 text-sm tabular-nums"
                  aria-label="จำนวนเครดิต"
                />
              </label>
              <label className="w-28">
                <span className="sr-only">ราคา (บาท)</span>
                <input
                  type="number"
                  min={0}
                  value={p.price_thb}
                  onChange={(e) => setPackages(packages.map((x, j) => (j === i ? { ...x, price_thb: Number(e.target.value) } : x)))}
                  className="field py-2 text-sm tabular-nums"
                  aria-label="ราคา (บาท)"
                />
              </label>
              <button
                type="button"
                onClick={() => setPackages(packages.filter((_, j) => j !== i))}
                aria-label={`ลบแพ็กเกจ ${p.name}`}
                className="rounded-full p-2.5 text-ivory-dim hover:bg-white/5 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <p className="text-xs text-ivory-dim/70">คอลัมน์: ชื่อ · เครดิต · ราคา (บาท)</p>
          {packages.length < 12 && (
            <button
              type="button"
              onClick={() => setPackages([...packages, { id: `pkg-${Date.now()}`, name: "", credits: 10, price_thb: 0 }])}
              className="btn-quiet border border-white/15"
            >
              <Plus className="h-4 w-4" /> เพิ่มแพ็กเกจ
            </button>
          )}
        </div>
      </Section>

      <Section
        title="สมาชิกรายเดือนและไพ่ประจำวัน"
        description="สมาชิกรายเดือนเก็บเงินอัตโนมัติผ่าน Stripe และเติมเครดิตให้ทุกรอบบิล การเปลี่ยนราคามีผลกับผู้สมัครใหม่เท่านั้น"
        state={planSaver.state}
        onSave={() =>
          planSaver.run(async () => {
            await postJson("/api/admin/settings", { key: "plans", value: plans });
            await postJson("/api/admin/settings", { key: "daily", value: daily });
          })
        }
      >
        <div className="space-y-3">
          {plans.map((plan, i) => (
            <div key={plan.id} className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem]">
              <label className="block">
                <span className="text-sm text-ivory-dim">
                  ชื่อแพ็กเกจ ({plan.id === "basic" ? "ระดับ Plus" : "ระดับ Premium"})
                </span>
                <input
                  value={plan.name}
                  onChange={(e) => setPlans(plans.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  className="field mt-1 py-2 text-sm"
                />
              </label>
              <Num
                label="ราคาต่อเดือน"
                value={plan.price_thb}
                onChange={(n) => setPlans(plans.map((x, j) => (j === i ? { ...x, price_thb: n } : x)))}
                suffix="บาท"
              />
              <Num
                label="เครดิตต่อเดือน"
                value={plan.monthly_credits}
                onChange={(n) => setPlans(plans.map((x, j) => (j === i ? { ...x, monthly_credits: n } : x)))}
                min={1}
                suffix="เครดิต"
              />
            </div>
          ))}
        </div>

        <h3 className="mt-6 text-sm font-medium text-gold">ไพ่ประจำวัน</h3>
        <label className="mt-3 flex items-center gap-3">
          <input
            type="checkbox"
            checked={daily.ai_message}
            onChange={(e) => setDaily({ ...daily, ai_message: e.target.checked })}
            className="h-5 w-5 accent-[#C6A15B]"
          />
          <span className="text-ivory">ให้ AI เขียนสารประจำวัน (เรียก AI ไม่เกิน 1 ครั้งต่อไพ่ต่อวัน ใช้ร่วมกันทุกคน)</span>
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="รอบเปิดไพ่ต่อเนื่อง" value={daily.streak_days} onChange={(n) => setDaily({ ...daily, streak_days: n })} suffix="วัน" />
          <Num label="รางวัลเมื่อครบรอบ" value={daily.streak_reward} onChange={(n) => setDaily({ ...daily, streak_reward: n })} suffix="เครดิต" />
        </div>
        <p className="mt-2 text-xs text-ivory-dim">ตั้งรอบหรือรางวัลเป็น 0 เพื่อปิดรางวัล (ให้เฉพาะบัญชีที่เข้าสู่ระบบ)</p>
      </Section>

      <Section
        title="PromptPay และข้อมูลผู้ขาย"
        description="ลูกค้าโอนเข้าบัญชีของคุณโดยตรงด้วย QR ที่ระบุยอดไว้แล้ว ชื่อบัญชีและช่องทางติดต่อจะแสดงในหน้าชำระเงินและหน้าข้อตกลง"
        state={promptpaySaver.state}
        disabled={promptpay.enabled && !promptpayIdOk && !shopQrOk}
        onSave={() =>
          promptpaySaver.run(async () => {
            await postJson("/api/admin/settings", { key: "promptpay", value: { ...promptpay, id: promptpayDigits } });
            await postJson("/api/admin/settings", { key: "business", value: business });
          })
        }
      >
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={promptpay.enabled}
            onChange={(e) => setPromptpay({ ...promptpay, enabled: e.target.checked })}
            className="h-5 w-5 accent-[#C6A15B]"
          />
          <span className="text-ivory">เปิดรับชำระเงินด้วย PromptPay</span>
        </label>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-ivory-dim">หมายเลข PromptPay (เบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน/ผู้เสียภาษี 13 หลัก)</span>
            <input
              value={promptpay.id}
              onChange={(e) => setPromptpay({ ...promptpay, id: e.target.value })}
              inputMode="numeric"
              autoComplete="off"
              className="field mt-1 py-2 text-sm tabular-nums"
            />
            {promptpay.id && !promptpayIdOk && !shopQrOk && (
              <span className="mt-1 block text-xs text-amber-200">จำนวนหลักไม่ถูกต้อง — QR จะใช้ไม่ได้</span>
            )}
          </label>
          <label className="block">
            <span className="text-sm text-ivory-dim">ชื่อบัญชีผู้รับ หรือชื่อร้าน (ตามที่แอปธนาคารแสดง)</span>
            <input
              value={promptpay.account_name}
              onChange={(e) => setPromptpay({ ...promptpay, account_name: e.target.value })}
              className="field mt-1 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ivory-dim">คำที่ต้องพบในชื่อผู้รับบนสลิป (ไม่บังคับ เช่น นามสกุล หรือเลขท้ายบัญชี 4 หลัก)</span>
            <input
              value={promptpay.receiver_hint}
              onChange={(e) => setPromptpay({ ...promptpay, receiver_hint: e.target.value })}
              className="field mt-1 py-2 text-sm"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-ivory-dim">
          หลังบันทึก เปิดหน้าแพ็กเกจแล้วลองสแกน QR ด้วยแอปธนาคารของคุณ เพื่อดูว่าชื่อบัญชีที่ขึ้นถูกต้องก่อนให้ลูกค้าใช้
        </p>

        <ShopQrField value={promptpay.merchant_qr} onChange={(v) => setPromptpay({ ...promptpay, merchant_qr: v })} />

        <h3 className="mt-6 text-sm font-medium text-gold">ข้อมูลผู้ขายและช่องทางติดต่อ (แสดงต่อสาธารณะ)</h3>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-ivory-dim">ชื่อผู้ให้บริการ</span>
            <input
              value={business.name}
              onChange={(e) => setBusiness({ ...business, name: e.target.value })}
              className="field mt-1 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ivory-dim">อีเมลติดต่อ</span>
            <input
              type="email"
              value={business.contact_email}
              onChange={(e) => setBusiness({ ...business, contact_email: e.target.value })}
              className="field mt-1 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ivory-dim">LINE ID</span>
            <input
              value={business.contact_line}
              onChange={(e) => setBusiness({ ...business, contact_line: e.target.value })}
              className="field mt-1 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ivory-dim">ที่อยู่ (ไม่บังคับ)</span>
            <input
              value={business.address}
              onChange={(e) => setBusiness({ ...business, address: e.target.value })}
              className="field mt-1 py-2 text-sm"
            />
          </label>
        </div>
      </Section>

      <Section
        title="การชำระเงิน"
        description="กุญแจของผู้ให้บริการชำระเงิน (Stripe) ตั้งใน Environment Variables ไม่ใช่ที่นี่ — ดูขั้นตอนและสถานะที่เมนู “การชำระเงิน”"
        state={billingSaver.state}
        onSave={() => billingSaver.saveSetting("billing", billing)}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-ivory-dim">อัตราแลกเปลี่ยน USD → THB</span>
            <input
              type="number"
              min={1}
              step="0.01"
              value={billing.usd_thb}
              onChange={(e) => setBilling({ ...billing, usd_thb: Number(e.target.value) })}
              className="field mt-1 py-2 text-sm tabular-nums"
            />
            <span className="mt-1 block text-xs text-ivory-dim">
              ใช้แปลงต้นทุน AI (ดอลลาร์) เป็นบาทเพื่อประมาณกำไรขั้นต้นเท่านั้น
            </span>
          </label>
          <label className="flex items-start gap-3 sm:pt-6">
            <input
              type="checkbox"
              checked={billing.require_account}
              onChange={(e) => setBilling({ ...billing, require_account: e.target.checked })}
              className="mt-1 h-5 w-5 accent-[#C6A15B]"
            />
            <span>
              <span className="block text-ivory">ต้องเข้าสู่ระบบก่อนซื้อเครดิต</span>
              <span className="block text-xs text-ivory-dim">
                ปิดไว้ = ผู้เยี่ยมชมซื้อได้ (เครดิตผูกกับเบราว์เซอร์ และย้ายเข้าบัญชีเมื่อเข้าสู่ระบบ)
              </span>
            </span>
          </label>
        </div>
      </Section>

      <Section
        title="รูปแบบการวางไพ่"
        description="ปิดรูปแบบที่ไม่ต้องการให้บริการ ระบบจะไม่แนะนำและไม่ให้เลือกรูปแบบที่ปิด"
        state={spreadSaver.state}
        onSave={() => spreadSaver.saveSetting("disabled_spreads", disabled)}
      >
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {spreads.map((s) => {
            const on = !disabled.includes(s.id);
            return (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-4 py-3 hover:border-gold/40">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setDisabled(on ? [...disabled, s.id] : disabled.filter((x) => x !== s.id))}
                    className="h-4 w-4 accent-[#C6A15B]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ivory">{s.nameTh}</span>
                    <span className="block text-xs text-ivory-dim">
                      {s.nameEn} · {s.cardCount} ใบ
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title="ผู้ให้บริการและโมเดล AI"
        description="เว้นว่างเพื่อใช้ค่าเริ่มต้น ถ้าตั้ง ANTHROPIC_API_KEY ไว้ ระบบจะใช้ Anthropic โดยตรงก่อนเสมอ ถ้าโมเดลบน Gateway ใช้ไม่ได้ ระบบจะไล่ลองตัวสำรองให้อัตโนมัติ"
        state={modelSaver.state}
        onSave={() => modelSaver.saveSetting("models", models)}
      >
        <p className="rounded-xl border border-white/10 bg-midnight/40 px-4 py-3 text-sm">
          <span className="text-ivory-dim">สถานะปัจจุบัน: </span>
          <span className="text-ivory">
            {ai.configured
              ? ai.provider === "anthropic"
                ? "ใช้ Anthropic API โดยตรง"
                : "ใช้ Vercel AI Gateway (ยังไม่ได้ตั้ง ANTHROPIC_API_KEY)"
              : "ยังไม่ได้ตั้งค่าผู้ให้บริการ AI"}
          </span>
          <span className="mt-1 block text-xs text-ivory-dim">
            Prompt {ai.promptVersion} · Knowledge base {ai.kbVersion}
          </span>
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {modelFields.map((f) => (
            <label key={f.key} className="block">
              <span className="text-sm text-ivory-dim">{f.label}</span>
              <input
                value={models[f.key]}
                onChange={(e) => setModels({ ...models, [f.key]: e.target.value.trim().slice(0, 80) })}
                placeholder={f.placeholder}
                className="field mt-1 py-2 font-mono text-sm"
              />
            </label>
          ))}
        </div>
        <div className="mt-4">
          <button type="button" onClick={() => void testModels()} disabled={probing} className="btn-ghost px-4 py-2 text-sm">
            {probing && <Loader2 className="h-4 w-4 animate-spin" />} ทดสอบโมเดลบน AI Gateway
          </button>
          {probe && (
            <ul className="mt-3 space-y-1.5 text-sm" aria-live="polite">
              {probe.map((r) => (
                <li key={r.model} className="flex flex-wrap gap-x-3">
                  <span className={r.ok ? "text-gold-light" : "text-red-300"}>{r.ok ? "ใช้ได้" : "ใช้ไม่ได้"}</span>
                  <span className="font-mono text-ivory">{r.model}</span>
                  {!r.ok && <span className="text-xs text-ivory-dim">{r.detail.slice(0, 120)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section
        title="ราคาโมเดล (สำหรับประมาณต้นทุน)"
        description="หน่วย: ดอลลาร์สหรัฐต่อ 1 ล้าน token ใช้คำนวณต้นทุนโดยประมาณในหน้าภาพรวมเท่านั้น"
        state={priceSaver.state}
        onSave={() =>
          priceSaver.saveSetting(
            "model_prices",
            Object.fromEntries(
              prices.filter((p) => p.model.trim()).map((p) => [p.model.trim(), { input: p.input, output: p.output }]),
            ),
          )
        }
      >
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_6rem_6rem_2.5rem] gap-2 text-xs text-ivory-dim">
            <span>โมเดล</span>
            <span>Token เข้า</span>
            <span>Token ออก</span>
            <span />
          </div>
          {prices.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem_6rem_2.5rem] items-center gap-2">
              <input
                value={p.model}
                onChange={(e) => setPrices(prices.map((x, j) => (j === i ? { ...x, model: e.target.value } : x)))}
                aria-label="ชื่อโมเดล"
                className="field py-2 font-mono text-sm"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={p.input}
                onChange={(e) => setPrices(prices.map((x, j) => (j === i ? { ...x, input: Number(e.target.value) } : x)))}
                aria-label="ราคา token เข้า"
                className="field py-2 text-sm tabular-nums"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={p.output}
                onChange={(e) => setPrices(prices.map((x, j) => (j === i ? { ...x, output: Number(e.target.value) } : x)))}
                aria-label="ราคา token ออก"
                className="field py-2 text-sm tabular-nums"
              />
              <button
                type="button"
                onClick={() => setPrices(prices.filter((_, j) => j !== i))}
                aria-label={`ลบราคา ${p.model}`}
                className="rounded-full p-2 text-ivory-dim hover:bg-white/5 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPrices([...prices, { model: "", input: 0, output: 0 }])}
            className="btn-quiet border border-white/15"
          >
            <Plus className="h-4 w-4" /> เพิ่มโมเดล
          </button>
        </div>
      </Section>

      <Section
        title="แนวทางเพิ่มเติมของนักอ่านไพ่ (Prompt addendum)"
        description="ใช้ปรับน้ำเสียงและสไตล์ของ ARCANA กฎหลักและข้อห้ามด้านความรับผิดชอบแก้จากตรงนี้ไม่ได้ — ถ้าข้อความนี้ขัดกับกฎหลัก AI จะยึดกฎหลัก"
        state={promptSaver.state}
        onSave={() => promptSaver.saveSetting("prompt_addendum", { text: addendum.trim() })}
      >
        <label htmlFor="addendum" className="sr-only">
          แนวทางเพิ่มเติม
        </label>
        <textarea
          id="addendum"
          value={addendum}
          onChange={(e) => setAddendum(e.target.value.slice(0, 2000))}
          rows={5}
          placeholder="เช่น ใช้ภาษากระชับขึ้น ยกตัวอย่างการลงมือทำที่เหมาะกับคนทำงานออฟฟิศ"
          className="field resize-y text-sm"
        />
        <p className="mt-2 text-xs text-ivory-dim">
          {addendum.length}/2000 · ทุกคำอ่านจะบันทึกเวอร์ชันของ prompt ที่ใช้ไว้ด้วย เพื่อย้อนตรวจได้
        </p>
      </Section>

      <Section
        title="ผู้ดูแลระบบ"
        description="Owner มีสิทธิ์ทุกอย่างและเป็นผู้เดียวที่แก้รายชื่อ Admin ได้ ส่วน Admin จัดการผู้ใช้ เครดิต และการตั้งค่าได้"
        state={adminSaver.state}
        onSave={
          role === "owner"
            ? () =>
                adminSaver.run(() =>
                  postJson("/api/admin/admins", {
                    emails: adminText
                      .split(/[\s,;]+/)
                      .map((x) => x.trim())
                      .filter(Boolean),
                  }),
                )
            : undefined
        }
        saveLabel="บันทึกรายชื่อ Admin"
      >
        <h3 className="text-sm font-medium text-gold">Owner</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {owners.length === 0 && <li className="text-sm text-ivory-dim">ยังไม่ได้กำหนด (ใช้รหัสผู้ดูแลระบบ)</li>}
          {owners.map((o) => (
            <li key={o} className="chip px-3 py-1.5 text-sm">
              {o}
            </li>
          ))}
        </ul>
        <h3 className="mt-5 text-sm font-medium text-gold">Admin</h3>
        {role === "owner" ? (
          <>
            <label htmlFor="admin-emails" className="sr-only">
              อีเมลของ Admin
            </label>
            <textarea
              id="admin-emails"
              value={adminText}
              onChange={(e) => setAdminText(e.target.value)}
              rows={3}
              placeholder="อีเมลละ 1 บรรทัด — ต้องเป็นอีเมลที่มีบัญชีและยืนยันแล้ว"
              className="field mt-2 resize-y font-mono text-sm"
            />
          </>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {admins.length === 0 && <li className="text-sm text-ivory-dim">ยังไม่มี Admin</li>}
            {admins.map((a) => (
              <li key={a} className="chip border-white/15 bg-white/5 px-3 py-1.5 text-sm text-ivory-dim">
                {a}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
