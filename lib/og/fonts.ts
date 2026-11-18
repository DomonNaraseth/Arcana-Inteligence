/**
 * Fonts for generated images. The image renderer needs the font file itself,
 * and only TrueType/OpenType: Google Fonts serves TrueType to a client that
 * does not announce woff2 support, subset to exactly the characters used.
 */

const cache = new Map<string, Promise<ArrayBuffer>>();

export function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer> {
  const chars = Array.from(new Set(Array.from(text))).sort().join("");
  const key = `${family}:${weight}:${chars}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const job = (async () => {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(chars)}`;
    const css = await (await fetch(url)).text();
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
    if (!src) throw new Error(`no TrueType source for ${family}`);
    const res = await fetch(src[1]);
    if (!res.ok) throw new Error(`font download failed: HTTP ${res.status}`);
    return res.arrayBuffer();
  })();
  cache.set(key, job);
  // a failed download must not be cached
  job.catch(() => cache.delete(key));
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return job;
}
