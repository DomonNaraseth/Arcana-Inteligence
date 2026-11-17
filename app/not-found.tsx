import Link from "next/link";
import { Sigil } from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <Sigil className="h-12 w-12" />
      <h1 className="mt-6 text-3xl font-semibold">ไม่พบหน้าที่คุณตามหา</h1>
      <p className="mt-2 text-ivory-dim">
        หน้านี้อาจถูกลบไปแล้ว หรือเป็นการอ่านไพ่ของเบราว์เซอร์/บัญชีอื่น
      </p>
      <Link href="/home" className="btn-gold mt-8">
        กลับหน้าหลัก
      </Link>
    </main>
  );
}
