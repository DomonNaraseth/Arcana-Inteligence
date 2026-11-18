import { ImageResponse } from "next/og";

export const alt = "ARCANA INTELLIGENCE — AI Tarot & Life Guidance";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share preview. Latin text only: the default image font has no Thai glyphs. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #17263C 0%, #101827 70%)",
          color: "#F0E9DA",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            border: "3px solid #C6A15B",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* a drawn star: a text glyph would need a font download at build time */}
          <svg width="64" height="64" viewBox="0 0 100 100">
            <path d="M50 4 L59 41 L96 50 L59 59 L50 96 L41 59 L4 50 L41 41 Z" fill="#C6A15B" />
          </svg>
        </div>
        <div style={{ marginTop: 40, fontSize: 76, letterSpacing: 12 }}>ARCANA</div>
        <div style={{ marginTop: 4, fontSize: 30, letterSpacing: 14, color: "#C6A15B" }}>INTELLIGENCE</div>
        <div style={{ marginTop: 48, fontSize: 34, color: "#F0E9DA", opacity: 0.85 }}>
          AI Tarot &amp; Life Guidance · Free daily card
        </div>
      </div>
    ),
    size,
  );
}
