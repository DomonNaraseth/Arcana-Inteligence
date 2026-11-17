// Downloads the 78 Rider-Waite-Smith card images (1909, Pamela Colman Smith —
// public domain) from Wikimedia Commons into public/cards/.
// Usage: node scripts/fetch-cards.mjs
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "cards");
const WIDTH = 420;

const majors = [
  ["the-fool", "RWS_Tarot_00_Fool.jpg"],
  ["the-magician", "RWS_Tarot_01_Magician.jpg"],
  ["the-high-priestess", "RWS_Tarot_02_High_Priestess.jpg"],
  ["the-empress", "RWS_Tarot_03_Empress.jpg"],
  ["the-emperor", "RWS_Tarot_04_Emperor.jpg"],
  ["the-hierophant", "RWS_Tarot_05_Hierophant.jpg"],
  ["the-lovers", "RWS_Tarot_06_Lovers.jpg"],
  ["the-chariot", "RWS_Tarot_07_Chariot.jpg"],
  ["strength", "RWS_Tarot_08_Strength.jpg"],
  ["the-hermit", "RWS_Tarot_09_Hermit.jpg"],
  ["wheel-of-fortune", "RWS_Tarot_10_Wheel_of_Fortune.jpg"],
  ["justice", "RWS_Tarot_11_Justice.jpg"],
  ["the-hanged-man", "RWS_Tarot_12_Hanged_Man.jpg"],
  ["death", "RWS_Tarot_13_Death.jpg"],
  ["temperance", "RWS_Tarot_14_Temperance.jpg"],
  ["the-devil", "RWS_Tarot_15_Devil.jpg"],
  ["the-tower", "RWS_Tarot_16_Tower.jpg"],
  ["the-star", "RWS_Tarot_17_Star.jpg"],
  ["the-moon", "RWS_Tarot_18_Moon.jpg"],
  ["the-sun", "RWS_Tarot_19_Sun.jpg"],
  ["judgement", "RWS_Tarot_20_Judgement.jpg"],
  ["the-world", "RWS_Tarot_21_World.jpg"],
];

const ranks = [
  "ace", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "page", "knight", "queen", "king",
];
const suits = [
  ["wands", "Wands"],
  ["cups", "Cups"],
  ["swords", "Swords"],
  ["pentacles", "Pents"],
];

const files = [...majors];
for (const [suit, prefix] of suits) {
  ranks.forEach((rank, i) => {
    files.push([`${rank}-of-${suit}`, `${prefix}${String(i + 1).padStart(2, "0")}.jpg`]);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function exists(p) {
  try {
    const s = await stat(p);
    return s.size > 5000;
  } catch {
    return false;
  }
}

await mkdir(OUT, { recursive: true });
let ok = 0;
const failed = [];
for (const [id, file] of files) {
  const dest = path.join(OUT, `${id}.jpg`);
  if (await exists(dest)) {
    ok++;
    continue;
  }
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=${WIDTH}`;
  let done = false;
  for (let attempt = 0; attempt < 4 && !done; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "arcana-asset-fetch/1.0 (tarot app build script)" },
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 5000) throw new Error("too small");
      await writeFile(dest, buf);
      ok++;
      done = true;
    } catch (e) {
      await sleep(1500 * (attempt + 1));
      if (attempt === 3) failed.push(`${id} (${file}): ${e.message}`);
    }
  }
  await sleep(350);
}
console.log(`downloaded ${ok}/${files.length}`);
if (failed.length) console.log("FAILED:\n" + failed.join("\n"));
