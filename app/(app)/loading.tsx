import { Sigil } from "@/components/brand/Logo";

export default function Loading() {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4" role="status">
      <Sigil className="h-10 w-10 animate-[spin_6s_linear_infinite]" />
      <p className="text-sm text-ivory-dim">กำลังเตรียมพื้นที่อ่านไพ่…</p>
    </div>
  );
}
