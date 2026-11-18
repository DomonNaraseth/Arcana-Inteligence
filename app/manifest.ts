import type { MetadataRoute } from "next";

/** Makes ARCANA installable on Android and iOS home screens. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/home",
    name: "ARCANA INTELLIGENCE — ไพ่ทาโรต์ AI",
    short_name: "ARCANA",
    description: "เปิดไพ่ประจำวันฟรีทุกวัน และถามไพ่ทาโรต์กับนักอ่านไพ่ AI ที่ตอบตรงประเด็น",
    lang: "th",
    dir: "ltr",
    // opened from the home screen: counted as the app in Admin -> Growth
    start_url: "/home?utm_source=app&utm_medium=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#101827",
    theme_color: "#101827",
    categories: ["lifestyle", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "เปิดไพ่ประจำวัน",
        short_name: "ไพ่ประจำวัน",
        url: "/daily?utm_source=app&utm_medium=pwa",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "ถามไพ่",
        short_name: "ถามไพ่",
        url: "/ask?utm_source=app&utm_medium=pwa",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
