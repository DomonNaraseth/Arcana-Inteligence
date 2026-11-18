import Link from "next/link";
import { Suspense } from "react";
import { AppNav } from "@/components/shell/AppNav";
import { AuthNotice } from "@/components/shell/AuthNotice";
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
    <div className="min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
      <AppNav signedIn={signedIn} />
      <Suspense fallback={null}>
        <AuthNotice />
      </Suspense>
      {!configured && (
        <div role="alert" className="border-b border-red-400/30 bg-red-950/40 px-5 py-3 text-center text-sm text-red-200">
          Configuration Missing — ยังไม่ได้ตั้งค่าฐานข้อมูล (NEXT_PUBLIC_SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY, ARCANA_SERVER_SECRET)
        </div>
      )}
      <main className="mx-auto max-w-6xl px-[max(1.25rem,env(safe-area-inset-left))] py-6 sm:py-10 lg:py-12">{children}</main>
      <footer className="mx-auto max-w-6xl px-5 pb-10 text-center text-xs text-ivory-dim/60">
        ไพ่ทาโรต์เป็นเครื่องมือเชิงสัญลักษณ์เพื่อการสะท้อนคิด ไม่ใช่การพยากรณ์ที่รับประกันผล
        และไม่ทดแทนคำแนะนำจากผู้เชี่ยวชาญด้านการแพทย์ กฎหมาย หรือการเงิน
        <span className="mt-2 block">
          <Link href="/terms" className="underline underline-offset-4 hover:text-ivory">
            ข้อตกลง นโยบายคืนเงิน และความเป็นส่วนตัว
          </Link>
        </span>
      </footer>
    </div>
  );
}
