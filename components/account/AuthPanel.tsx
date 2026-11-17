"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function thaiAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (m.includes("email not confirmed")) return "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ (ตรวจกล่องจดหมายของคุณ)";
  if (m.includes("already registered")) return "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ";
  if (m.includes("rate limit")) return "มีการขอส่งอีเมลถี่เกินไป กรุณารอสักครู่แล้วลองใหม่";
  if (m.includes("password")) return "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
  return "ดำเนินการไม่สำเร็จ กรุณาลองใหม่";
}

export function AuthPanel({ signedIn, email }: { signedIn: boolean; email: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [formEmail, setFormEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function claimAndRefresh() {
    await fetch("/api/auth/claim", { method: "POST" }).catch(() => null);
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email: formEmail.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (err) throw err;
        if (data.session) {
          await claimAndRefresh();
        } else {
          setNotice(
            "ส่งอีเมลยืนยันไปที่กล่องจดหมายของคุณแล้ว — กดลิงก์ยืนยันในอีเมล แล้วกลับมาที่หน้านี้เพื่อเข้าสู่ระบบ",
          );
          setMode("signin");
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: formEmail.trim(),
          password,
        });
        if (err) throw err;
        await claimAndRefresh();
      }
      setPassword("");
    } catch (err) {
      setError(thaiAuthError((err as Error).message ?? ""));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.refresh();
    setBusy(false);
  }

  if (signedIn) {
    return (
      <section className="panel mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="text-xl font-semibold">บัญชี</h2>
          <p className="mt-1 text-sm text-ivory-dim">{email}</p>
        </div>
        <button type="button" onClick={() => void signOut()} disabled={busy} className="btn-ghost">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} ออกจากระบบ
        </button>
      </section>
    );
  }

  return (
    <section className="panel mt-6 p-6" aria-labelledby="auth-title">
      <h2 id="auth-title" className="text-xl font-semibold">
        {mode === "signin" ? "เข้าสู่ระบบ" : "สร้างบัญชี"}
      </h2>
      <p className="mt-1 text-sm text-ivory-dim">
        ไม่บังคับ — สร้างบัญชีเพื่อเก็บประวัติการอ่านไพ่ข้ามอุปกรณ์
        ประวัติในเบราว์เซอร์นี้จะถูกย้ายเข้าบัญชีให้อัตโนมัติเมื่อเข้าสู่ระบบ
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="auth-email" className="text-sm text-ivory-dim">
            อีเมล
          </label>
          <input
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            className="field mt-1"
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="text-sm text-ivory-dim">
            รหัสผ่าน {mode === "signup" && "(อย่างน้อย 8 ตัวอักษร)"}
          </label>
          <input
            id="auth-password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field mt-1"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold-light">
            {notice}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={busy} className="btn-gold">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "เข้าสู่ระบบ" : "สร้างบัญชี"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="text-sm text-gold underline-offset-4 hover:underline"
          >
            {mode === "signin" ? "ยังไม่มีบัญชี? สร้างบัญชีใหม่" : "มีบัญชีอยู่แล้ว? เข้าสู่ระบบ"}
          </button>
        </div>
      </form>
    </section>
  );
}
