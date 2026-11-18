"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-gold">
      <Printer className="h-4 w-4" aria-hidden="true" /> พิมพ์ / บันทึกเป็น PDF
    </button>
  );
}
