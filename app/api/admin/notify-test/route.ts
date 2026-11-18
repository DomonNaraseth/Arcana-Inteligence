import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin";
import { fail } from "@/lib/api";
import { notifyAdmin, notifyChannels } from "@/lib/notify";

/** Sends a test notice to every configured channel and reports what each one answered. */
export const POST = adminRoute(async () => {
  if (notifyChannels().length === 0) {
    return fail("bad_request", "ยังไม่ได้ตั้งค่าช่องทางแจ้งเตือน (LINE หรือ Telegram) ใน Environment Variables", 400);
  }
  const results = await notifyAdmin("ARCANA: ข้อความทดสอบการแจ้งเตือน — ถ้าคุณเห็นข้อความนี้ การแจ้งเตือนพร้อมใช้งานแล้ว");
  return NextResponse.json({ results });
});
