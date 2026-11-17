import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { Sigil } from "@/components/brand/Logo";
import { getAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "เข้าสู่ระบบผู้ดูแล" };

export default async function AdminLoginPage() {
  if (await getAdmin()) redirect("/admin");

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Sigil className="mx-auto h-10 w-10" />
          <p className="eyebrow mt-5">ARCANA Admin</p>
          <h1 className="mt-2 text-3xl font-semibold">เข้าสู่ระบบผู้ดูแล</h1>
        </div>

        <section className="panel mt-8 p-6">
          <h2 className="text-lg font-medium">เข้าด้วยบัญชี Owner / Admin</h2>
          <p className="mt-1 text-sm text-ivory-dim">
            เข้าสู่ระบบด้วยอีเมลที่ได้รับสิทธิ์ แล้วกลับมาที่หน้านี้ ระบบจะพาเข้าแดชบอร์ดให้อัตโนมัติ
          </p>
          <Link href="/account" className="btn-gold mt-4 w-full">
            ไปหน้าเข้าสู่ระบบ
          </Link>
        </section>

        <section className="panel mt-4 p-6">
          <h2 className="text-lg font-medium">หรือใช้รหัสเข้าถึงของผู้ดูแลระบบ</h2>
          <p className="mt-1 text-sm text-ivory-dim">
            รหัสสำรองระดับ Owner (ARCANA_ADMIN_KEY) สำหรับกรณีเข้าด้วยบัญชีไม่ได้
          </p>
          <AdminLogin />
        </section>

        <p className="mt-6 text-center text-sm">
          <Link href="/home" className="text-ivory-dim hover:text-gold-light">
            ← กลับสู่แอป
          </Link>
        </p>
      </div>
    </main>
  );
}
