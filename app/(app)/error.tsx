"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16 text-center" role="alert">
      <h1 className="text-2xl font-semibold">เกิดข้อผิดพลาดบางอย่าง</h1>
      <p className="mt-2 text-ivory-dim">
        ระบบไม่สามารถแสดงหน้านี้ได้ในขณะนี้ ข้อมูลการอ่านไพ่ของคุณยังปลอดภัย
      </p>
      <button type="button" onClick={reset} className="btn-gold mt-8">
        ลองใหม่อีกครั้ง
      </button>
    </div>
  );
}
