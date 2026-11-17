# ARCANA INTELLIGENCE

**AI Tarot & Life Guidance — Beyond the Cards. Into the Meaning.**

แพลตฟอร์มอ่านไพ่ทาโรต์ด้วย AI ที่ทำ 4 อย่างพร้อมกัน: เข้าใจคำถามจริง → เปิดไพ่อย่างมีหลักการ → วิเคราะห์ไพ่เชื่อมโยงกัน → ตอบตรงประเด็น

```
ถาม → วิเคราะห์คำถาม → เลือก Spread → สุ่มไพ่ (CSPRNG) → เปิดไพ่ → ตีความ 10 ชั้น → ตรวจคุณภาพ → คำตอบ → ถามต่อ
```

## สิ่งที่มีในเวอร์ชันนี้

| โมดูล | สถานะ |
| --- | --- |
| Question Intelligence (จำแนกหมวด/เจตนา/กรอบเวลา/ความกำกวม + ถามกลับ 1 ข้อเมื่อจำเป็น) | ✅ |
| ฐานความรู้ไพ่ Rider-Waite-Smith ครบ 78 ใบ (ตั้งตรง/กลับหัว/รัก/งาน/เงิน/คำแนะนำ) | ✅ |
| Spread 16 รูปแบบ (15 ตามสเปก + อดีต-ปัจจุบัน-อนาคต) เลือกอัตโนมัติหรือเลือกเอง | ✅ |
| Secure Randomization Engine (node:crypto, Fisher–Yates, แยกจาก AI, insert-only) | ✅ |
| Card reveal 3D flip + ปุ่มข้ามแอนิเมชัน + ดูความหมายรายใบ | ✅ |
| AI Interpretation 10 ชั้น → คำอ่าน 12 ส่วน (Structured JSON + Zod) | ✅ |
| Quality Control (ตรวจไพ่/ตำแหน่งด้วยโค้ด + self-check, retry แบบมีขอบเขต) | ✅ |
| Follow-up conversation + เปิดไพ่เสริม (ไม่เปลี่ยนไพ่/คำอ่านเดิม) | ✅ |
| Reading History + ค้นหา, Tarot Journal, คลังไพ่ | ✅ |
| ไพ่ประจำวัน `/daily` — เปิดได้ฟรีวันละใบ (สุ่มด้วย CSPRNG, ไม่เปลี่ยนทั้งวัน), สารประจำวันจาก AI ที่ใช้ร่วมกันต่อไพ่ต่อวัน, นับวันต่อเนื่อง + รางวัลเครดิต | ✅ |
| หน้าแพ็กเกจ `/pricing` — Free / Plus / Premium + แพ็กเติมเครดิต | ✅ |
| สมาชิกรายเดือนผ่าน Stripe Billing (เติมเครดิตทุกรอบบิล, ต่ออายุ/ยกเลิกอัตโนมัติ, Customer Portal, ดึงเครดิตคืนเมื่อคืนเงินแพ็กเติมเครดิต) | ✅ โค้ดพร้อม ทดสอบกับ Stripe sandbox แล้ว — ต้องใส่กุญแจ Stripe ก่อนจึงใช้งานได้ |
| Guest session (ใช้ได้ทันที) + เข้าสู่ระบบด้วย Google / อีเมล (Supabase Auth) + ย้ายประวัติ guest → บัญชี | ✅ (Google ต้องเพิ่ม Redirect URL ใน Supabase — ดูหัวข้อ "เข้าสู่ระบบด้วย Google") |
| บันทึก (ปักหมุด) การอ่านไพ่ + ตัวกรอง "ที่บันทึกไว้" ในประวัติ + พิมพ์/บันทึกเป็น PDF | ✅ |
| AI usage log (token ต่อ feature ต่อ reading) + fair-use quota รายวัน | ✅ |
| Admin dashboard `/admin` — RBAC (Owner / Admin), ภาพรวม + ต้นทุน AI, ผู้ใช้และเครดิต, ตั้งค่าระบบ, audit log + error log | ✅ |
| ระบบเครดิต (หักหลังสำเร็จ, ไม่หักซ้ำ, โบนัสสมัครสมาชิก, ถามต่อฟรีตามแพ็กเกจ) + กำหนดแพ็กเกจด้วยมือได้ | ✅ (ปิดไว้เป็นค่าเริ่มต้น เปิดได้ใน Admin → ตั้งค่าระบบ → “เติมค่าที่แนะนำลงในฟอร์ม”) |
| แก้ความหมายไพ่ 78 ใบ และข้อความของ spread ผ่าน Admin → คลังความรู้ไพ่ (คืนค่าเริ่มต้นได้, มี audit log, ประทับเวอร์ชันกับคำอ่าน) | ✅ |
| ซื้อเครดิตผ่าน Stripe Checkout (บัตร / PromptPay ตามที่เปิดใน Stripe) — webhook มีลายเซ็น, เพิ่มเครดิตแบบไม่ซ้ำ, หน้า Admin → การชำระเงิน | ✅ โค้ดพร้อม — ต้องใส่ `STRIPE_SECRET_KEY` ก่อนจึงใช้งานได้ |
| Custom spread, แชร์ผล, เสียงอ่าน, ภาษี (Stripe Tax), Astrology/BaZi | ⏳ เฟสถัดไป (ดู docs/ARCHITECTURE.md) |

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS · Framer Motion · Supabase (PostgreSQL + Auth + RLS) · Zod · Vitest · Vercel

## เริ่มใช้งาน (local)

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

ตัวแปรสภาพแวดล้อม:

| ตัวแปร | จำเป็น | คำอธิบาย |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL ของโปรเจกต์ Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | publishable/anon key |
| `ARCANA_SERVER_SECRET` | ✅ | secret ≥ 32 ตัวอักษร — ค่า SHA-256 ต้องตรงกับ `arcana_server_config.server_secret_sha256` |
| `ANTHROPIC_API_KEY` | แนะนำ | ถ้าตั้งไว้จะเรียก Anthropic API โดยตรง (มาก่อน Gateway) |
| `ANTHROPIC_MODEL` / `ANTHROPIC_FAST_MODEL` | – | ค่าเริ่มต้น `claude-sonnet-5-5` / `claude-haiku-5-5` |
| `AI_GATEWAY_API_KEY` | – | ใช้ Vercel AI Gateway เมื่อไม่มี Anthropic key (บน Vercel ใช้ OIDC อัตโนมัติ) |
| `AI_GATEWAY_MODEL` / `AI_GATEWAY_CHAT_MODEL` / `AI_GATEWAY_FAST_MODEL` | – | โมเดลบน Gateway (ตีความ / ถามต่อ / วิเคราะห์คำถาม) — ถ้าแผนไม่มีสิทธิ์ใช้ ระบบจะไล่ลองตัวถัดไปอัตโนมัติ |
| `STRIPE_SECRET_KEY` | สำหรับขายเครดิต | `sk_test_…` (ทดสอบ) หรือ `sk_live_…` (จริง) — ไม่ตั้ง = ระบบชำระเงินปิด |
| `STRIPE_WEBHOOK_SECRET` | แนะนำ | signing secret (`whsec_…`) ของ webhook ที่ชี้มา `/api/billing/webhook` |

ค่าที่ปรับได้ขณะรัน (โอกาสไพ่กลับหัว, โควตารายวัน, เครดิต, เปิด/ปิด spread, โมเดล AI, ราคาโมเดล, prompt addendum) อยู่ใน **Admin → ตั้งค่าระบบ** ไม่ใช่ environment variable

ถ้ายังไม่ได้ตั้งค่า AI ระบบจะแสดง **Configuration Missing** — ไม่มีการสร้างคำทำนายปลอม

## Admin

เข้าที่ `/admin` ได้ 2 ทาง:

1. **บัญชี Owner / Admin** — ล็อกอินที่ `/account` ด้วยอีเมลที่อยู่ใน `owner_emails` หรือ `admin_emails` (ตาราง `arcana_server_config`) Owner เป็นผู้เดียวที่แก้รายชื่อ Admin ได้
2. **รหัสผู้ดูแลระบบ** (ระดับ Owner, ใช้เป็นทางสำรอง) — ค่า `ARCANA_ADMIN_KEY` ใน `.env.local`; ฐานข้อมูลเก็บเฉพาะ SHA-256 ที่ `admin_key_sha256` ล็อกหลังพยายามผิด 10 ครั้งใน 15 นาที

สิทธิ์ถูกตัดสินใน SQL (`arcana_admin_role()`) ทุกคำขอ ทุกการเปลี่ยนแปลงของผู้ดูแลถูกบันทึกใน `arcana_audit_logs`

## เข้าสู่ระบบด้วย Google

ใช้ Google provider ของ Supabase Auth (PKCE) ปลายทางหลังล็อกอินคือ `/auth/callback` ซึ่งแลก code เป็น session แล้วย้ายการอ่านไพ่ บันทึก และเครดิตของ guest ในเบราว์เซอร์นั้นเข้าบัญชี

ต้องตั้งค่า 1 อย่างใน Supabase Dashboard → Authentication → URL Configuration → **Redirect URLs** เพิ่ม:

```
https://<โดเมนของแอป>/**
```

(เพิ่ม `http://localhost:3000/**` ด้วยถ้าจะทดสอบบนเครื่อง) ถ้าไม่เพิ่ม หลังล็อกอิน Google ผู้ใช้จะถูกส่งไปที่ Site URL ของโปรเจกต์ Supabase แทนที่จะกลับมาที่แอปนี้

## โมเดลรายได้

| ระดับ | สิ่งที่ได้ | ค่าเริ่มต้น (แก้ได้ใน Admin) |
| --- | --- | --- |
| ฟรี | ไพ่ประจำวัน + สารประจำวันทุกวัน, คลังไพ่, ประวัติ, บันทึก | ไม่มีเครดิตฟรีรายวัน |
| สมัครฟรี | โบนัสสมัคร + รางวัลเปิดไพ่ประจำวันต่อเนื่อง | 6 เครดิต · ทุก 7 วันรับ 3 เครดิต |
| Plus | เครดิตทุกเดือน, ถามต่อฟรี 5 ครั้ง/การอ่าน | ฿149/เดือน → 60 เครดิต |
| Premium | เครดิตทุกเดือน, ถามต่อฟรี 10 ครั้ง/การอ่าน | ฿299/เดือน → 150 เครดิต |
| เติมเครดิต | ซื้อครั้งเดียว | ฿99 → 30 · ฿199 → 70 · ฿399 → 150 |

การอ่านไพ่ใช้ 2 / 3 / 4 เครดิตตามขนาดสเปรด ต้นทุน AI ต่อการอ่านหนึ่งครั้งราว ฿3–4.5 จึงไม่แจกการอ่านฟรีแบบต่อเนื่อง — ใช้ไพ่ประจำวัน (ต้นทุนเกือบศูนย์) เป็นเหตุผลให้ผู้ใช้ฟรีกลับมาทุกวัน เหตุผลและตัวเลขอยู่ใน docs/ARCHITECTURE.md หัวข้อ 6e

## การชำระเงิน (Stripe)

1. สมัคร Stripe แล้วสร้าง Restricted key ที่ให้สิทธิ์ Checkout Sessions, Products, Customer portal (Write) และ Subscriptions (Read) นำมาตั้งเป็น `STRIPE_SECRET_KEY` แบบ Sensitive บน Vercel (เริ่มด้วย `rk_test_…` ของ sandbox เพื่อทดสอบ — ใช้ `sk_…` ได้เช่นกันแต่สิทธิ์กว้างกว่าที่จำเป็น)
2. ใน Stripe → Developers → Webhooks สร้าง endpoint `https://<โดเมน>/api/billing/webhook` เลือก event: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `charge.refunded`, `charge.dispute.created` แล้วนำ signing secret มาตั้งเป็น `STRIPE_WEBHOOK_SECRET`
3. Redeploy แล้วเปิดระบบเครดิตและตรวจราคาแพ็กเกจที่ Admin → ตั้งค่าระบบ

สถานะและขั้นตอนดูได้ที่ Admin → การชำระเงิน ทดสอบบนเครื่องโดยไม่ใช้ Stripe จริงได้ด้วย `node scripts/dev-mock-billing.mjs` (เปิดแอปที่พอร์ต 3001 คู่กับ gateway จำลอง)

ทดสอบกับ Stripe sandbox จริงโดยไม่ต้องใส่ API key ในโปรเจกต์ (ใช้การล็อกอินของ Stripe CLI — `stripe login` แล้วเลือก sandbox; เครื่องมือทั้งสองจะไม่ทำงานถ้า CLI ไม่ได้อยู่ในโหมดทดสอบ):

```bash
node scripts/dev-stripe-sandbox.mjs
```

```bash
STRIPE_SANDBOX=1 npx vitest run tests/integration
```

คำสั่งแรกเปิดแอปที่พอร์ต 3002 พร้อมหน้าชำระเงินและ webhook จริง (ต้องเปิดระบบเครดิตก่อน) คำสั่งที่สองทดสอบเฉพาะตัวเชื่อมต่อ Stripe โดยไม่แตะฐานข้อมูลของแอป บัตรทดสอบ: `4242 4242 4242 4242`

## ฐานข้อมูล

รัน `supabase/migrations/0001_arcana_init.sql`, `0002_arcana_admin_credits.sql`, `0003_arcana_kb_overrides.sql`, `0004_arcana_payments.sql`, `0005_arcana_saved_readings.sql` และ `0006_arcana_daily_subscriptions.sql` ตามลำดับ แล้วบันทึก hash ของ server secret (และ `admin_key_sha256`, `owner_emails` สำหรับ Admin):

```sql
insert into public.arcana_server_config (key, value)
values ('server_secret_sha256', '<sha256 hex ของ ARCANA_SERVER_SECRET>');
```

## คำสั่ง

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

## เอกสาร

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — สถาปัตยกรรม, ฐานข้อมูล, API, AI engine, ความปลอดภัย, roadmap
- [CLAUDE.md](CLAUDE.md) — กฎของโปรเจกต์สำหรับการพัฒนาต่อด้วย Claude Code

## ลิขสิทธิ์ภาพไพ่

ภาพไพ่ Rider-Waite-Smith (Pamela Colman Smith, 1909) เป็นสาธารณสมบัติ ดาวน์โหลดจาก Wikimedia Commons ด้วย `scripts/fetch-cards.mjs` ·
ลายหลังไพ่และโลโก้เป็นงานต้นฉบับของโปรเจกต์นี้

## ข้อจำกัดความรับผิดชอบ

ไพ่ทาโรต์เป็นเครื่องมือเชิงสัญลักษณ์เพื่อการสะท้อนคิด ไม่ใช่วิธีพยากรณ์ที่พิสูจน์ได้ทางวิทยาศาสตร์ และไม่ทดแทนคำแนะนำจากผู้เชี่ยวชาญด้านการแพทย์ กฎหมาย หรือการเงิน
