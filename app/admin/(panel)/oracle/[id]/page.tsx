import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OracleStudio } from "@/components/admin/oracle/OracleStudio";
import { requireAdminPage } from "@/lib/admin";
import type { OracleDeck } from "@/lib/oracle/schemas";

export const metadata: Metadata = { title: "สตูดิโอไพ่ออราเคิล" };

export default async function OracleStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = await requireAdminPage();
  const { data } = await admin.supabase.rpc("arcana_admin_oracle_get", { p_id: id });
  if (!data) notFound();
  return <OracleStudio initialDeck={data as OracleDeck} />;
}
