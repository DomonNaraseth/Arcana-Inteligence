import { ImageResponse } from "next/og";
import { dailyMessageSchema } from "@/lib/ai/daily";
import { loadGoogleFont } from "@/lib/og/fonts";
import { breakableThai, clipThai, parseSharedDaily, thaiDayLabel } from "@/lib/share";
import { getSystemClient, supabaseConfigured } from "@/lib/supabase/server";
import { DEFAULT_KNOWLEDGE, getKnowledge } from "@/lib/tarot/knowledge";

const SIZES = { story: { width: 1080, height: 1920 }, og: { width: 1200, height: 630 } } as const;

/**
 * Image of a shared daily card: a tall story for Instagram / TikTok / LINE
 * VOOM and a wide one for link previews. It shows the card and the message of
 * the day that everyone who drew this card that day received — nothing about
 * the person sharing it.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "og" ? "og" : "story";
  const supabase = supabaseConfigured() ? getSystemClient() : null;
  const kb = supabase ? await getKnowledge(supabase) : DEFAULT_KNOWLEDGE;
  const shared = parseSharedDaily(
    { c: url.searchParams.get("c"), o: url.searchParams.get("o"), d: url.searchParams.get("d") },
    (id) => Boolean(kb.card(id)),
  );
  if (!shared) return new Response("Not found", { status: 404 });

  const card = kb.requireCard(shared.cardId);
  const reversed = shared.orientation === "reversed";
  let theme: string | null = null;
  if (supabase) {
    const { data } = await supabase.rpc("arcana_daily_message_for", {
      p_day: shared.day,
      p_card_id: shared.cardId,
      p_orientation: shared.orientation,
    });
    const parsed = dailyMessageSchema.safeParse(data);
    if (parsed.success) theme = parsed.data.theme;
  }
  const fallback = clipThai(card.adviceTh, format === "story" ? 90 : 70);

  const heading = "ไพ่ประจำวันของฉัน";
  const subtitle = `${card.nameTh} · ${reversed ? "กลับหัว" : "ตั้งตรง"} · ${thaiDayLabel(shared.day)}`;
  const line = breakableThai(theme ?? fallback);
  const cta = "เปิดไพ่ประจำวันของคุณฟรี";
  const thaiText = `${heading}${subtitle}${line}${cta}`;

  let fonts;
  try {
    const [regular, bold] = await Promise.all([
      loadGoogleFont("Noto Sans Thai", 500, `${thaiText}0123456789`),
      loadGoogleFont("Noto Sans Thai", 700, thaiText),
    ]);
    fonts = [
      { name: "Thai", data: regular, weight: 500 as const, style: "normal" as const },
      { name: "Thai", data: bold, weight: 700 as const, style: "normal" as const },
    ];
  } catch (err) {
    console.error("[arcana] share image font failed:", err);
    return new Response("Font unavailable", { status: 503, headers: { "cache-control": "no-store" } });
  }

  const cardImage = new URL(card.image, url.origin).toString();
  const site = url.host;
  const size = SIZES[format];
  const story = format === "story";

  const cardEl = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cardImage}
      width={story ? 560 : 300}
      height={story ? 952 : 510}
      style={{
        borderRadius: story ? 28 : 16,
        border: "4px solid #C6A15B",
        ...(reversed ? { transform: "rotate(180deg)" } : {}),
        objectFit: "cover",
      }}
    />
  );

  const texts = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: story ? "center" : "flex-start",
        textAlign: story ? "center" : "left",
        maxWidth: story ? 900 : 700,
      }}
    >
      <div style={{ fontSize: story ? 44 : 30, color: "#C6A15B", fontWeight: 500 }}>{heading}</div>
      <div style={{ marginTop: story ? 18 : 10, fontSize: story ? 78 : 58, fontWeight: 700, fontFamily: "serif", color: "#F0E9DA" }}>
        {card.name}
      </div>
      <div style={{ marginTop: story ? 12 : 6, fontSize: story ? 38 : 28, color: "#F0E9DA", opacity: 0.8, fontWeight: 500 }}>
        {subtitle}
      </div>
      <div
        style={{
          marginTop: story ? 40 : 26,
          fontSize: story ? 52 : 38,
          lineHeight: 1.35,
          fontWeight: 700,
          color: "#F0E9DA",
        }}
      >
        {line}
      </div>
    </div>
  );

  const footer = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: story ? "center" : "flex-start" }}>
      <div style={{ fontSize: story ? 40 : 28, color: "#C6A15B", fontWeight: 700 }}>{cta}</div>
      <div style={{ marginTop: 8, fontSize: story ? 34 : 24, color: "#F0E9DA", opacity: 0.75 }}>
        {`ARCANA INTELLIGENCE · ${site}`}
      </div>
    </div>
  );

  const image = new ImageResponse(
    story ? (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "110px 80px 120px",
          background: "linear-gradient(180deg, #17263C 0%, #101827 75%)",
          fontFamily: "Thai",
        }}
      >
        {cardEl}
        {texts}
        {footer}
      </div>
    ) : (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "60px 70px",
          background: "linear-gradient(135deg, #17263C 0%, #101827 75%)",
          fontFamily: "Thai",
        }}
      >
        {cardEl}
        <div
          style={{
            marginLeft: 60,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {texts}
          {footer}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
  // a day's message never changes once written; until it exists, check again soon
  image.headers.set("cache-control", theme ? "public, max-age=86400, s-maxage=604800" : "public, max-age=300");
  return image;
}
