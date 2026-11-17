import { AppNav } from "@/components/shell/AppNav";
import { getContext, supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let signedIn = false;
  const configured = supabaseConfigured();
  if (configured) {
    try {
      signedIn = Boolean((await getContext()).user);
    } catch {
      signedIn = false;
    }
  }

  return (
    <div className="min-h-dvh pb-24 md:pb-0">
      <AppNav signedIn={signedIn} />
      {!configured && (
        <div role="alert" className="border-b border-red-400/30 bg-red-950/40 px-5 py-3 text-center text-sm text-red-200">
          Configuration Missing — ยังไม่ได้ตั้งค่าฐานข้อมูล (NEXT_PUBLIC_SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY, ARCANA_SERVER_SECRET)
        </div>
      )}
      <main className="mx-auto max-w-6xl px-5 py-8 sm:py-12">{children}</main>
      <footer className="mx-auto max-w-6xl px-5 pb-10 text-center text-xs text-ivory-dim/60">
        ไพ่ทาโรต์เป็นเครื่องมือเชิงสัญลักษณ์เพื่อการสะท้อนคิด ไม่ใช่การพยากรณ์ที่รับประกันผล
        และไม่ทดแทนคำแนะนำจากผู้เชี่ยวชาญด้านการแพทย์ กฎหมาย หรือการเงิน
      </footer>
    </div>
  );
}
