import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin";
import { formatThaiDate } from "@/lib/format";

export const metadata: Metadata = { title: "บันทึกระบบ" };

interface AuditRow {
  id: number;
  actor: string;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

interface ErrorRow {
  id: number;
  user_key: string | null;
  route: string | null;
  code: string;
  message: string | null;
  created_at: string;
}

const ACTION_TH: Record<string, string> = {
  admin_login: "เข้าสู่ระบบด้วยรหัสผู้ดูแล",
  set_setting: "แก้ไขการตั้งค่า",
  set_admin_emails: "แก้ไขรายชื่อแอดมิน",
  grant_credits: "ปรับเครดิตผู้ใช้",
  set_tier: "ตั้งแพ็กเกจผู้ใช้",
  bootstrap_owner: "ตั้งค่า Owner เริ่มต้น",
  payment_paid: "รับชำระเงินและเพิ่มเครดิต",
  set_kb_override: "แก้ไขความรู้ไพ่",
  reset_kb_override: "คืนค่าเริ่มต้นความรู้ไพ่",
};

function summarize(row: AuditRow): string {
  const d = row.detail ?? {};
  if (row.action === "grant_credits") {
    return `${Number(d.amount) > 0 ? "+" : ""}${d.amount} เครดิต → คงเหลือ ${d.balance}${d.note ? ` (${d.note})` : ""}`;
  }
  if (row.action === "set_tier") return `แพ็กเกจ ${d.tier}${d.period_end ? ` ถึง ${formatThaiDate(String(d.period_end))}` : ""}`;
  if (row.action === "set_admin_emails") return `${d.count} อีเมล`;
  if (row.action === "payment_paid") {
    return `${d.package} · +${d.credits} เครดิต · ฿${(Number(d.amount_minor) / 100).toLocaleString("th-TH")}${d.livemode ? "" : " (ทดสอบ)"}`;
  }
  if (row.action === "set_kb_override") {
    const fields = d.new && typeof d.new === "object" ? Object.keys(d.new as object) : [];
    return `ช่องที่แก้: ${fields.join(", ")} (ฉบับที่ ${d.revision})`;
  }
  if (row.action === "reset_kb_override") {
    const fields = d.old && typeof d.old === "object" ? Object.keys(d.old as object) : [];
    return `ยกเลิกการแก้ไขช่อง: ${fields.join(", ")}`;
  }
  if (row.action === "set_setting") {
    const text = JSON.stringify(d.new);
    return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  }
  return "";
}

export default async function AdminLogsPage() {
  const admin = await requireAdminPage();
  const { data, error } = await admin.supabase.rpc("arcana_admin_logs", { p_limit: 100 });

  if (error || !data) {
    return (
      <p role="alert" className="panel border-red-400/30 p-6 text-red-200">
        โหลดบันทึกระบบไม่สำเร็จ กรุณารีเฟรชหน้านี้
      </p>
    );
  }
  const { audit, errors } = data as { audit: AuditRow[]; errors: ErrorRow[] };

  return (
    <div className="space-y-10">
      <div>
        <p className="eyebrow">Logs</p>
        <h1 className="mt-2 text-3xl font-semibold">บันทึกระบบ</h1>
      </div>

      <section aria-labelledby="audit-title">
        <h2 id="audit-title" className="text-xl font-semibold">
          Audit log — การเปลี่ยนแปลงโดยผู้ดูแล
        </h2>
        {audit.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-ivory-dim">
            ยังไม่มีรายการ
          </p>
        ) : (
          <div className="panel mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-ivory-dim">
                <tr className="border-b border-white/10">
                  <th scope="col" className="px-4 py-3 font-medium">เวลา</th>
                  <th scope="col" className="px-4 py-3 font-medium">ผู้ดำเนินการ</th>
                  <th scope="col" className="px-4 py-3 font-medium">การกระทำ</th>
                  <th scope="col" className="px-4 py-3 font-medium">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ivory-dim">{formatThaiDate(a.created_at, true)}</td>
                    <td className="px-4 py-2.5 text-ivory-dim">
                      {a.actor.replace(/^email:/, "").replace("admin-key", "รหัสผู้ดูแล")}
                    </td>
                    <td className="px-4 py-2.5 text-ivory">
                      {ACTION_TH[a.action] ?? a.action}
                      {a.target && <span className="ml-2 font-mono text-xs text-ivory-dim">{a.target}</span>}
                    </td>
                    <td className="max-w-md break-words px-4 py-2.5 text-xs text-ivory-dim">{summarize(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="error-title">
        <h2 id="error-title" className="text-xl font-semibold">
          ข้อผิดพลาดของระบบ
        </h2>
        <p className="mt-1 text-sm text-ivory-dim">
          AI ไม่พร้อมใช้งาน คำอ่านไม่ผ่านการตรวจคุณภาพ และการเข้าสู่ระบบผู้ดูแลที่ล้มเหลว
        </p>
        {errors.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center text-ivory-dim">
            ไม่มีข้อผิดพลาด
          </p>
        ) : (
          <div className="panel mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-ivory-dim">
                <tr className="border-b border-white/10">
                  <th scope="col" className="px-4 py-3 font-medium">เวลา</th>
                  <th scope="col" className="px-4 py-3 font-medium">ประเภท</th>
                  <th scope="col" className="px-4 py-3 font-medium">เส้นทาง</th>
                  <th scope="col" className="px-4 py-3 font-medium">ข้อความ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {errors.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ivory-dim">{formatThaiDate(e.created_at, true)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ivory">{e.code}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ivory-dim">{e.route ?? "–"}</td>
                    <td className="max-w-md break-words px-4 py-2.5 text-xs text-ivory-dim">{e.message ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
