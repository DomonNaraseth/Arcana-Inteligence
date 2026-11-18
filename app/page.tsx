import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Layers,
  MessageCircle,
  ShieldCheck,
  Shuffle,
  Sparkles,
} from "lucide-react";
import { Logo, Sigil } from "@/components/brand/Logo";
import { SPREADS } from "@/lib/tarot/spreads";

const STEPS = [
  { n: "01", title: "พิมพ์คำถามของคุณ", body: "เล่าเรื่องที่ค้างคาใจด้วยภาษาของคุณเอง ไม่ต้องเลือกหมวดหรือกรอกแบบฟอร์ม" },
  { n: "02", title: "ARCANA ทำความเข้าใจ", body: "AI วิเคราะห์เจตนา กรอบเวลา และมิติที่ต้องอ่าน แล้วสรุปให้คุณตรวจสอบก่อนเปิดไพ่" },
  { n: "03", title: "เปิดไพ่ด้วยมือคุณเอง", body: "ระบบสุ่มไพ่แบบ cryptographic แยกจาก AI โดยสิ้นเชิง คุณแตะเปิดไพ่ทีละใบ" },
  { n: "04", title: "รับคำตอบที่ตรงประเด็น", body: "คำอ่านเชื่อมไพ่ทุกใบเป็นเรื่องเดียว ตอบคำถามก่อน แล้วอธิบายเหตุผลและคำแนะนำ" },
];

const PILLARS = [
  { icon: Sparkles, title: "Question Intelligence", body: "เข้าใจสิ่งที่คุณอยากรู้จริง ๆ ก่อนเปิดไพ่ทุกครั้ง และเลือกรูปแบบการวางไพ่ที่เหมาะกับคำถาม" },
  { icon: Shuffle, title: "สุ่มไพ่อย่างตรวจสอบได้", body: "AI ไม่ได้เลือกไพ่ให้เข้ากับคำตอบที่อยากเล่า ไพ่ทุกใบถูกสุ่มอย่างอิสระและบันทึกถาวร" },
  { icon: Layers, title: "วิเคราะห์ 10 ชั้น", body: "ความหมายรายใบ ตำแหน่ง ธาตุ ชุดไพ่ ไพ่ที่เสริมและขัดกัน สังเคราะห์เป็นเรื่องราวเดียว" },
  { icon: MessageCircle, title: "ถามต่อจากไพ่ชุดเดิม", body: "สนทนาต่อเนื่องโดยจำบริบททั้งหมด เปิดไพ่เสริมได้โดยไม่เปลี่ยนไพ่และคำอ่านเดิม" },
  { icon: BookOpen, title: "คลังความรู้ไพ่ 78 ใบ", body: "ฐานความรู้ Rider-Waite-Smith ที่มีโครงสร้าง ครบทั้งความรัก การงาน การเงิน และคำแนะนำ" },
  { icon: ShieldCheck, title: "ซื่อตรงและรับผิดชอบ", body: "ไม่ฟันธงเกินหลักฐาน ไม่ขู่ ไม่ปลอบเกินจริง ทุกคำอ่านผ่านการตรวจคุณภาพก่อนถึงมือคุณ" },
];

const HERO_CARDS = [
  { src: "/cards/the-star.jpg", alt: "The Star", cls: "-rotate-[10deg] translate-y-6" },
  { src: "/cards/the-high-priestess.jpg", alt: "The High Priestess", cls: "z-10 -translate-y-2 scale-110" },
  { src: "/cards/the-sun.jpg", alt: "The Sun", cls: "rotate-[10deg] translate-y-6" },
];

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="stars pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 pb-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/cards" className="btn-quiet hidden sm:inline-flex">
            คลังไพ่
          </Link>
          <Link href="/home" className="btn-ghost whitespace-nowrap px-5 py-2 text-sm">
            เข้าสู่แอป
          </Link>
        </nav>
      </header>

      <main className="relative">
        {/* hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16">
          <div>
            <p className="eyebrow">AI Tarot &amp; Life Guidance</p>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.1] text-ivory sm:text-6xl lg:text-7xl">
              Beyond the Cards.
              <br />
              <span className="italic text-gold">Into the Meaning.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg text-ivory-dim">
              นักอ่านไพ่ทาโรต์ส่วนตัวของคุณตลอด 24 ชั่วโมง — เข้าใจคำถามก่อนเปิดไพ่
              อ่านไพ่ทุกใบตามตำแหน่ง เชื่อมโยงเป็นเรื่องราวเดียว
              แล้วตอบสิ่งที่คุณอยากรู้อย่างตรงประเด็น
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/ask" className="btn-gold text-base">
                เริ่มถามไพ่ <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="#how" className="btn-ghost">
                ดูวิธีการทำงาน
              </Link>
            </div>
            <p className="mt-5 text-sm text-ivory-dim/70">
              เริ่มได้ทันที ไม่ต้องสมัครสมาชิก · ภาษาไทย · ไพ่ครบ 78 ใบ · {SPREADS.length} รูปแบบการวางไพ่
            </p>
          </div>

          <div className="relative flex items-center justify-center py-8" aria-hidden="true">
            <div className="absolute h-72 w-72 rounded-full bg-gold/10 blur-3xl" />
            <div className="relative flex items-center">
              {HERO_CARDS.map((c, i) => (
                <div
                  key={c.src}
                  className={`relative aspect-[10/17] w-28 overflow-hidden rounded-xl border border-gold/50 shadow-card sm:w-40 ${c.cls} ${i === 1 ? "" : "-mx-3"}`}
                >
                  <Image src={c.src} alt={c.alt} fill sizes="200px" className="object-cover" priority />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* how it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-16">
          <div className="divider-ornament">
            <Sigil className="h-6 w-6" />
          </div>
          <h2 className="mt-8 text-center text-3xl font-semibold sm:text-4xl">
            จากคำถาม สู่คำตอบ
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-ivory-dim">
            ไม่ใช่การสุ่มไพ่แล้วแปลความหมายทีละใบ แต่คือกระบวนการอ่านไพ่แบบนักอ่านมืออาชีพ
          </p>
          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="panel p-6">
                <span className="font-serif text-3xl font-semibold text-gold">{s.n}</span>
                <h3 className="mt-3 text-lg font-medium text-ivory">{s.title}</h3>
                <p className="mt-2 text-sm text-ivory-dim">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* pillars */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <p className="eyebrow text-center">What makes ARCANA different</p>
          <h2 className="mt-4 text-center text-3xl font-semibold sm:text-4xl">
            ศาสตร์แห่งไพ่ × ปัญญาประดิษฐ์
          </h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((p) => (
              <article key={p.title} className="panel p-6 transition-colors hover:border-gold/40">
                <p.icon className="h-6 w-6 text-gold" aria-hidden="true" />
                <h3 className="mt-4 text-lg font-medium text-ivory">{p.title}</h3>
                <p className="mt-2 text-sm text-ivory-dim">{p.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* spreads */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-center text-3xl font-semibold sm:text-4xl">
            {SPREADS.length} รูปแบบการวางไพ่
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-ivory-dim">
            ARCANA เลือกรูปแบบที่เหมาะกับคำถามให้อัตโนมัติ หรือคุณจะเลือกเองก็ได้
          </p>
          <ul className="mt-10 flex flex-wrap justify-center gap-3">
            {SPREADS.map((s) => (
              <li key={s.id} className="rounded-full border border-white/10 bg-navy/60 px-4 py-2 text-sm">
                <span className="text-ivory">{s.nameTh}</span>
                <span className="ml-2 text-gold">{s.cardCount} ใบ</span>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-4xl px-5 py-20">
          <div className="panel-gold px-6 py-14 text-center sm:px-12">
            <Sigil className="mx-auto h-10 w-10" />
            <h2 className="mt-6 text-3xl font-semibold sm:text-4xl">
              มีเรื่องอะไรค้างอยู่ในใจคุณตอนนี้?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-ivory-dim">
              เข้าใจปัจจุบัน สำรวจความเป็นไปได้ แล้วเลือกเส้นทางของคุณอย่างมีสติ
            </p>
            <Link href="/ask" className="btn-gold mt-8 text-base">
              ถามไพ่เลย <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm text-ivory-dim/70 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-serif tracking-[0.2em] text-ivory">ARCANA INTELLIGENCE</p>
            <p className="mt-1">Understand the present. Explore possibilities. Choose your path.</p>
          </div>
          <p className="max-w-md sm:text-right">
            ไพ่ทาโรต์เป็นเครื่องมือเชิงสัญลักษณ์เพื่อการสะท้อนคิด ไม่ใช่การพยากรณ์ที่รับประกันผล
            และไม่ใช่คำแนะนำทางการแพทย์ กฎหมาย หรือการเงิน · ภาพไพ่ Rider-Waite-Smith (1909) เป็นสาธารณสมบัติ ·{" "}
            <Link href="/terms" className="underline underline-offset-4 hover:text-ivory">
              ข้อตกลงและนโยบาย
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
