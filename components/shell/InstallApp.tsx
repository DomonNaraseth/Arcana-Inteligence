"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, Share, SquarePlus, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Mode = "hidden" | "android" | "ios";

const DISMISS_KEY = "arcana-install-dismissed";
const QUIET_DAYS = 14;

function standalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(at) && Date.now() - at < QUIET_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac with touch
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Invites the visitor to put ARCANA on their home screen: one tap on Android
 * (the browser's own install prompt), short instructions on iPhone and iPad,
 * where Safari offers no prompt. Hidden once installed or dismissed.
 */
export function InstallApp() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (standalone() || recentlyDismissed()) return;
    if (isIos()) {
      setMode("ios");
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    const onInstalled = () => setMode("hidden");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // private mode: it simply shows again next time
    }
    setMode("hidden");
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    setPrompt(null);
    if (choice?.outcome === "accepted") setMode("hidden");
  }

  if (mode === "hidden") return null;

  return (
    <aside className="panel relative flex gap-4 p-4 pr-12 sm:p-5 sm:pr-14" aria-label="ติดตั้งแอป ARCANA">
      <Image src="/icons/icon-192.png" alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-[14px]" />
      <div className="min-w-0">
        <p className="font-medium text-ivory">ใช้ ARCANA เหมือนแอปบนมือถือ</p>
        {mode === "android" ? (
          <>
            <p className="mt-0.5 text-sm text-ivory-dim">เปิดไพ่ประจำวันได้ในแตะเดียวจากหน้าจอโฮม ไม่กินพื้นที่เครื่อง</p>
            <button type="button" onClick={() => void install()} className="btn-gold mt-3 px-5 py-2.5 text-sm">
              <Download className="h-4 w-4" /> ติดตั้งแอป
            </button>
          </>
        ) : (
          <ol className="mt-1 space-y-1 text-sm text-ivory-dim">
            <li className="flex items-center gap-1.5">
              1. แตะปุ่มแชร์ <Share className="h-4 w-4 text-gold" aria-label="(ไอคอนแชร์)" /> ใน Safari
            </li>
            <li className="flex items-center gap-1.5">
              2. เลือก <SquarePlus className="h-4 w-4 text-gold" aria-hidden="true" /> &quot;เพิ่มไปยังหน้าจอโฮม&quot;
            </li>
          </ol>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="ไม่ต้องแสดงอีก"
        className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-ivory-dim hover:bg-white/10 hover:text-ivory"
      >
        <X className="h-5 w-5" />
      </button>
    </aside>
  );
}
