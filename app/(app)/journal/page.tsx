import type { Metadata } from "next";
import { JournalBoard } from "@/components/journal/JournalBoard";
import type { JournalRow } from "@/lib/data/readings";
import { getContext } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "สมุดบันทึก" };

export default async function JournalPage() {
  const { supabase } = await getContext();
  const { data } = await supabase
    .from("arcana_journals")
    .select("id, reading_id, title, content, mood, created_at")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<JournalRow[]>();

  return (
    <div className="mx-auto max-w-3xl">
      <p className="eyebrow">Tarot Journal</p>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">สมุดบันทึก</h1>
      <p className="mt-2 text-ivory-dim">
        บันทึกความคิดและความรู้สึกหลังอ่านไพ่ เพื่อย้อนกลับมาเห็นเส้นทางของตัวเอง
      </p>
      <JournalBoard initial={data ?? []} />
    </div>
  );
}
