import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdminPage } from "@/lib/admin";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  return (
    <>
      <AdminNav role={admin.role} email={admin.email} />
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </>
  );
}
