/**
 * Finds drawn cards named in a reading's prose so the page can mark them.
 *
 * English names match anywhere on word boundaries ("The World", "Three of
 * Pentacles"; a leading "The" is optional). Thai names match only right after
 * "ไพ่" — many Thai card names are everyday words ("โลก", "ดวงดาว"), so a bare
 * match would mark ordinary sentences.
 */

export interface MentionCard {
  id: string;
  name: string;
  nameTh: string;
}

export type MentionSegment = { text: string; cardId?: undefined } | { text: string; cardId: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function splitCardMentions(text: string, cards: MentionCard[]): MentionSegment[] {
  if (!text || cards.length === 0) return [{ text }];

  const patterns: { re: string; id: string; len: number }[] = [];
  for (const c of cards) {
    const bare = c.name.replace(/^the\s+/i, "");
    // "The World" or "World"
    patterns.push({ re: `\\b(?:the\\s+)?${escape(bare).replace(/\s+/g, "\\s+")}\\b`, id: c.id, len: c.name.length });
    // "ราชินี เหรียญ" is also written "ราชินีเหรียญ"
    if (c.nameTh) {
      patterns.push({ re: `ไพ่\\s?${escape(c.nameTh.trim()).replace(/\s+/g, "\\s?")}`, id: c.id, len: c.nameTh.length + 3 });
    }
  }
  // longest first, so "Queen of Cups" wins over a shorter overlapping name
  patterns.sort((a, b) => b.len - a.len);
  const re = new RegExp(patterns.map((p, i) => `(?<m${i}>${p.re})`).join("|"), "gi");

  const out: MentionSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    const groups = m.groups ?? {};
    const hit = patterns.findIndex((_, i) => groups[`m${i}`] !== undefined);
    if (hit < 0) continue;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: m[0], cardId: patterns[hit].id });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}
