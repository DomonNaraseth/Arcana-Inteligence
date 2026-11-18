"use client";

import { useSyncExternalStore } from "react";
import { speechChunks, type NarrationPart } from "@/lib/speech/narration";

/**
 * One narrator for the whole app, on top of the browser's own speech engine
 * (free, on-device; no text is sent anywhere by us). Text is spoken in short
 * chunks and "pause" remembers the chunk, because several engines cannot
 * pause reliably and some stop on long utterances.
 */

export type NarratorStatus = "idle" | "playing" | "paused";

export interface NarratorState {
  supported: boolean;
  /** the device has reported its voice list (it loads late on some browsers) */
  voicesLoaded: boolean;
  /** a Thai voice is installed on this device */
  hasThaiVoice: boolean;
  status: NarratorStatus;
  /** what started the current run, e.g. "reading:all", "reading:advice", "daily" */
  scope: string | null;
  /** part being read (or paused in) */
  partId: string | null;
  title: string | null;
  index: number;
  total: number;
  rate: number;
}

export const RATES = [0.85, 1, 1.15] as const;
export const RATE_LABEL: Record<number, string> = { 0.85: "ช้า", 1: "ปกติ", 1.15: "เร็ว" };
const RATE_KEY = "arcana-speech-rate";

const IDLE = { status: "idle", scope: null, partId: null, title: null, index: 0, total: 0 } as const;

let state: NarratorState = {
  supported: false,
  voicesLoaded: false,
  hasThaiVoice: false,
  ...IDLE,
  rate: 1,
};
const serverState: NarratorState = { ...state };
const listeners = new Set<() => void>();
let queue: NarrationPart[] = [];
let partIndex = 0;
let chunks: string[] = [];
let chunkIndex = 0;
/** bumped on every play/pause/stop: callbacks from an older run must not advance this one */
let run = 0;
let voice: SpeechSynthesisVoice | null = null;
/** held so the engine's callbacks are not garbage-collected mid-utterance (Chrome) */
let current: SpeechSynthesisUtterance | null = null;
let initialised = false;

function set(patch: Partial<NarratorState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const synth = () => window.speechSynthesis;

function pickVoice() {
  const voices = synth().getVoices();
  const thai = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("th"));
  // prefer a voice installed on the device: works offline and starts faster
  voice = thai.find((v) => v.localService) ?? thai[0] ?? null;
  set({ voicesLoaded: voices.length > 0, hasThaiVoice: Boolean(voice) });
}

function init() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  const supported = "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  let rate = 1;
  try {
    const saved = Number(localStorage.getItem(RATE_KEY));
    if ((RATES as readonly number[]).includes(saved)) rate = saved;
  } catch {
    // keeps the default speed
  }
  set({ supported, rate });
  if (!supported) return;
  pickVoice();
  synth().addEventListener?.("voiceschanged", pickVoice);
  // never keep talking after the page is left
  window.addEventListener("pagehide", () => stop());
}

function speakCurrent(token: number) {
  if (token !== run) return;
  if (chunkIndex >= chunks.length) {
    if (partIndex + 1 >= queue.length) {
      stop();
      return;
    }
    partIndex += 1;
    startPart(token);
    return;
  }
  const u = new SpeechSynthesisUtterance(chunks[chunkIndex]);
  u.lang = "th-TH";
  if (voice) u.voice = voice;
  u.rate = state.rate;
  u.onend = () => {
    if (token !== run) return;
    chunkIndex += 1;
    speakCurrent(token);
  };
  u.onerror = (e) => {
    // "interrupted" / "canceled" come from our own pause and stop
    if (token !== run || e.error === "interrupted" || e.error === "canceled") return;
    chunkIndex += 1;
    speakCurrent(token);
  };
  current = u;
  synth().speak(u);
}

function startPart(token: number) {
  const part = queue[partIndex];
  chunks = speechChunks(part.text);
  chunkIndex = 0;
  set({ status: "playing", partId: part.id, title: part.title, index: partIndex, total: queue.length });
  speakCurrent(token);
}

/**
 * Reads `parts` from `start` to the end. Call it from a tap: iOS only lets a
 * page start speaking in response to the user.
 */
export function play(parts: NarrationPart[], scope: string, start = 0) {
  init();
  if (!state.supported || parts.length === 0) return;
  synth().cancel();
  run += 1;
  queue = parts;
  partIndex = Math.min(Math.max(start, 0), parts.length - 1);
  set({ scope });
  startPart(run);
}

export function pause() {
  if (state.status !== "playing") return;
  run += 1;
  synth().cancel();
  set({ status: "paused" });
}

export function resume() {
  if (state.status !== "paused") return;
  run += 1;
  set({ status: "playing" });
  speakCurrent(run);
}

export function stop() {
  run += 1;
  if (typeof window !== "undefined" && "speechSynthesis" in window) synth().cancel();
  queue = [];
  chunks = [];
  current = null;
  if (state.status !== "idle") set({ ...IDLE });
}

export function skip(delta: 1 | -1) {
  if (state.status === "idle") return;
  const target = partIndex + delta;
  if (target < 0 || target >= queue.length) return;
  synth().cancel();
  run += 1;
  partIndex = target;
  startPart(run);
}

export function cycleRate() {
  init();
  const i = (RATES as readonly number[]).indexOf(state.rate);
  const next = RATES[(i + 1) % RATES.length];
  try {
    localStorage.setItem(RATE_KEY, String(next));
  } catch {
    // remembered for this page only
  }
  set({ rate: next });
  // apply at once: restart the current chunk at the new speed
  if (state.status === "playing") {
    run += 1;
    synth().cancel();
    speakCurrent(run);
  }
}

/** Toggle for one button: start its scope, or pause / resume it if it is the one playing. */
export function toggle(parts: NarrationPart[], scope: string, start = 0) {
  if (state.scope === scope && state.status === "playing") pause();
  else if (state.scope === scope && state.status === "paused") resume();
  else play(parts, scope, start);
}

function subscribe(listener: () => void) {
  init();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNarrator(): NarratorState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => serverState,
  );
}
