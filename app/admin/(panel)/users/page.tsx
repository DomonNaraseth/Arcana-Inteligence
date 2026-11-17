import type { Metadata } from "next";
import { UsersTable, type AdminUser } from "@/components/admin/UsersTable";
import { requireAdminPage } from "@/lib/admin";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "ผู้ใช้และเครดิต" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const admin = await requireAdminPage();
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);

  const [{ data, error }, settings] = await Promise.all([
    admin.supabase.rpc("arcana_admin_users", { p_search: q, p_limit: 100 }),
    getSettings(admin.supabase, { fresh: true }),
  ]);
  const users = (data ?? []) as AdminUser[];

  return (
    <div>
      <p className="eyebrow">Users &amp; Credits</p>
      <h1 className="mt-2 text-3xl font-semibold">ผู้ใช้และเครดิต</h1>
      <p className="mt-1 text-sm text-ivory-dim">
        ผู้เยี่ยมชมแสดงด้วยรหัสอ้างอิง (ไม่ใช่ token จริง) — ผู้ใช้ดูรหัสของตัวเองได้ที่หน้าบัญชี
        {!settings.credits.enabled && " · ระบบเครดิตปิดอยู่ ยอดเครดิตจะมีผลเมื่อเปิดใช้ในหน้าตั้งค่า"}
      </p>

      <form className="mt-6 flex max-w-xl gap-3" role="search">
        <label htmlFor="user-q" className="sr-only">
          ค้นหาผู้ใช้
        </label>
        <input
          id="user-q"
          name="q"
          defaultValue={q}
          placeholder="ค้นหาด้วยอีเมลหรือรหัสอ้างอิง"
          className="field py-2.5"
        />
        <button type="submit" className="btn-ghost shrink-0 py-2.5">
          ค้นหา
        </button>
      </form>

      {error ? (
        <p role="alert" className="panel mt-6 border-red-400/30 p-6 text-red-200">
          โหลดรายชื่อผู้ใช้ไม่สำเร็จ กรุณารีเฟรชหน้านี้
        </p>
      ) : (
        <UsersTable users={users} query={q} />
      )}
    </div>
  );
}
