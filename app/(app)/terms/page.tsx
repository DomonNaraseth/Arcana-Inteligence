import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { getContext } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "ข้อตกลง นโยบายคืนเงิน และความเป็นส่วนตัว",
  description: "ข้อตกลงการใช้บริการ นโยบายการชำระเงิน การคืนเงิน และความเป็นส่วนตัวของ ARCANA INTELLIGENCE",
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="panel p-6">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ivory">{children}</div>
    </section>
  );
}

export default async function TermsPage() {
  const { supabase } = await getContext();
  const settings = await getSettings(supabase);
  const b = settings.business;
  const c = settings.credits;
  const hasContact = Boolean(b.contact_email || b.contact_line);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="eyebrow">Terms &amp; policies</p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">ข้อตกลงและนโยบาย</h1>
        <p className="mt-2 text-ivory-dim">
          โปรดอ่านก่อนใช้บริการหรือชำระเงิน การใช้บริการถือว่าคุณยอมรับข้อตกลงนี้
        </p>
      </header>

      <Section id="about" title="1. บริการของเรา">
        <p>
          {b.name} ให้บริการอ่านไพ่ทาโรต์ด้วยระบบ AI เพื่อการสะท้อนคิดและความบันเทิง
          ไพ่ถูกสุ่มด้วยระบบสุ่มของเว็บไซต์ และคำอ่านสร้างโดย AI จากไพ่ที่เปิดได้
        </p>
        <p>
          ไพ่ทาโรต์เป็นเครื่องมือเชิงสัญลักษณ์ ไม่ใช่วิธีพยากรณ์ที่พิสูจน์ได้ทางวิทยาศาสตร์
          เราไม่รับประกันผลลัพธ์หรือความแม่นยำของคำอ่าน และคำอ่านไม่ใช่คำแนะนำทางการแพทย์ กฎหมาย
          การเงิน หรือการลงทุน การตัดสินใจใด ๆ เป็นความรับผิดชอบของคุณเอง
        </p>
        <p>บริการนี้สำหรับผู้ที่มีอายุ 18 ปีขึ้นไป</p>
      </Section>

      <Section id="credits" title="2. เครดิตและแพ็กเกจ">
        <p>
          การอ่านไพ่ใช้เครดิต {c.cost_interpret.small}–{c.cost_interpret.large} เครดิตต่อครั้งตามจำนวนไพ่
          เครดิตถูกหักหลังจากได้คำอ่านสำเร็จเท่านั้น หากระบบขัดข้องหรือคำอ่านไม่ผ่านการตรวจคุณภาพ
          จะไม่มีการหักเครดิต
        </p>
        <p>
          เครดิตที่ซื้อหรือได้รับจากแพ็กเกจสมาชิกไม่หมดอายุ ใช้ได้เฉพาะบนเว็บไซต์นี้
          โอนให้ผู้อื่นหรือแลกเป็นเงินสดไม่ได้ ราคาและจำนวนเครดิตของแต่ละแพ็กเกจแสดงเป็นเงินบาท (THB)
          ที่หน้า{" "}
          <Link href="/pricing" className="text-gold underline-offset-4 hover:underline">
            แพ็กเกจและเครดิต
          </Link>
        </p>
        <p>
          แพ็กเกจสมาชิกมีอายุ 30 วันนับจากวันที่ชำระเงินสำเร็จ ไม่ต่ออายุเองและไม่มีการตัดเงินอัตโนมัติ
          เมื่อครบกำหนดสิทธิ์สมาชิกจะสิ้นสุด แต่เครดิตที่ได้รับไปแล้วยังใช้ได้ต่อ
        </p>
      </Section>

      <Section id="payment" title="3. การชำระเงิน">
        <p>
          ชำระด้วยการโอนเงินผ่าน PromptPay ตามยอดและบัญชีที่แสดงในหน้าชำระเงิน แล้วส่งสลิปการโอน
          เครดิตจะเข้าเมื่อระบบตรวจสลิปกับเครือข่ายธนาคารผ่าน หรือเมื่อผู้ดูแลตรวจสอบยอดเข้าบัญชีแล้ว
        </p>
        <p>
          เราไม่ขอและไม่เก็บหมายเลขบัตร รหัสผ่าน หรือรหัส OTP ของคุณ
          และไม่มีพนักงานคนใดจะขอข้อมูลดังกล่าว ภาพสลิปถูกใช้เพื่อตรวจสอบการโอนเท่านั้นและไม่ถูกเก็บไว้
        </p>
      </Section>

      <Section id="refund" title="4. การคืนเงินและการยกเลิก">
        <p>
          เครดิตเป็นสินค้าดิจิทัลที่ส่งมอบทันที โดยทั่วไปจึงไม่คืนเงินสำหรับเครดิตที่ใช้ไปแล้ว
          เราคืนเงินเต็มจำนวนในกรณีต่อไปนี้ เมื่อแจ้งภายใน 7 วันนับจากวันที่ชำระ
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>โอนเงินแล้วแต่ไม่ได้รับเครดิต และเราตรวจสอบไม่พบวิธีเพิ่มเครดิตให้ได้</li>
          <li>โอนซ้ำหรือโอนเกินยอดโดยไม่ตั้งใจ (คืนส่วนที่ซ้ำหรือเกิน)</li>
          <li>ซื้อแพ็กเกจแล้วยังไม่ได้ใช้เครดิตจากแพ็กเกจนั้นเลย</li>
        </ul>
        <p>
          การคืนเงินทำโดยโอนกลับไปยังบัญชีที่โอนมา ภายใน 7 วันทำการหลังตรวจสอบเสร็จ
          และเครดิตของรายการที่คืนเงินจะถูกหักออก แพ็กเกจสมาชิกไม่ต่ออายุเอง
          จึงไม่ต้องยกเลิก หากไม่ต้องการใช้ต่อเพียงไม่ชำระรอบถัดไป
        </p>
      </Section>

      <Section id="privacy" title="5. ความเป็นส่วนตัว">
        <p>
          เราเก็บข้อมูลเท่าที่จำเป็นต่อการให้บริการ ได้แก่ อีเมลและชื่อจากบัญชี Google เมื่อคุณเข้าสู่ระบบ
          คำถาม ไพ่ที่เปิดได้ คำอ่าน บันทึกของคุณ และประวัติการชำระเงิน (ยอด วันเวลา
          และเลขอ้างอิงการโอน) คำถามและคำอ่านของคุณเข้าถึงได้เฉพาะคุณ
        </p>
        <p>
          คำถามและไพ่ของคุณถูกส่งให้ผู้ให้บริการโมเดล AI เพื่อสร้างคำอ่าน
          และสลิปถูกส่งให้ผู้ให้บริการตรวจสลิปเพื่อยืนยันการโอน เราไม่ขายข้อมูลส่วนบุคคลของคุณ
          คุณลบการอ่านไพ่หรือบันทึกรายการใดก็ได้จากหน้าของรายการนั้น
          และขอให้ลบบัญชีพร้อมข้อมูลทั้งหมดได้ผ่านช่องทางติดต่อด้านล่าง
        </p>
        <p>เว็บไซต์ใช้คุกกี้ที่จำเป็นต่อการเข้าสู่ระบบและการจดจำการอ่านไพ่ของคุณเท่านั้น</p>
      </Section>

      <Section id="contact" title="6. ติดต่อเรา">
        <dl className="space-y-2">
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-ivory-dim">ผู้ให้บริการ</dt>
            <dd>{b.name}</dd>
          </div>
          {b.contact_email && (
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ivory-dim">อีเมล</dt>
              <dd>
                <a href={`mailto:${b.contact_email}`} className="text-gold underline-offset-4 hover:underline">
                  {b.contact_email}
                </a>
              </dd>
            </div>
          )}
          {b.contact_line && (
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ivory-dim">LINE</dt>
              <dd>{b.contact_line}</dd>
            </div>
          )}
          {b.address && (
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ivory-dim">ที่อยู่</dt>
              <dd className="whitespace-pre-line">{b.address}</dd>
            </div>
          )}
        </dl>
        {!hasContact && (
          <p className="text-ivory-dim">ช่องทางติดต่อจะแสดงที่นี่เมื่อผู้ให้บริการตั้งค่าเรียบร้อย</p>
        )}
        <p className="text-ivory-dim">
          เมื่อติดต่อเรื่องการชำระเงิน โปรดแจ้งรหัสผู้ใช้ที่แสดงในหน้าบัญชีของคุณ และเวลาที่โอน
        </p>
      </Section>
    </div>
  );
}
