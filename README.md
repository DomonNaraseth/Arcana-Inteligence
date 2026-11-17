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
| Reading History + ค้นหา, Tarot Journal, Daily Tarot, คลังไพ่ | ✅ |
| Guest session (ใช้ได้ทันที) + บัญชีอีเมล (Supabase Auth) + ย้ายประวัติ guest → บัญชี | ✅ |
| AI usage log (token ต่อ feature ต่อ reading) + fair-use quota รายวัน | ✅ |
| Admin dashboard, Subscription/Credit, Payment, Custom spread, Astrology/BaZi | ⏳ เฟสถัดไป (ดู docs/ARCHITECTURE.md) |

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
| `AI_GATEWAY_MODEL` / `AI_GATEWAY_FAST_MODEL` | – | โมเดลบน Gateway |
| `ARCANA_REVERSAL_PROBABILITY` | – | โอกาสไพ่กลับหัว 0–1 (ค่าเริ่มต้น 0.35) |
| `ARCANA_DAILY_READINGS` / `ARCANA_DAILY_FOLLOWUPS` | – | โควตาต่อ session ต่อ 24 ชม. (15 / 60) |

ถ้ายังไม่ได้ตั้งค่า AI ระบบจะแสดง **Configuration Missing** — ไม่มีการสร้างคำทำนายปลอม

## ฐานข้อมูล

รัน `supabase/migrations/0001_arcana_init.sql` แล้วบันทึก hash ของ server secret:

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
