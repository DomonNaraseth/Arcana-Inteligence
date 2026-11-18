import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Noto_Sans_Thai, Noto_Serif_Thai } from "next/font/google";
import { Tracker } from "@/components/shell/Tracker";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

const thaiSerif = Noto_Serif_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "600"],
  variable: "--font-thai-serif",
  display: "swap",
});

const sans = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "ARCANA INTELLIGENCE — AI Tarot & Life Guidance",
    template: "%s · ARCANA INTELLIGENCE",
  },
  description:
    "นักอ่านไพ่ทาโรต์ AI ส่วนตัว เข้าใจคำถาม เปิดไพ่อย่างมีหลักการ เชื่อมโยงไพ่ทุกใบ และตอบตรงประเด็น — Beyond the Cards. Into the Meaning.",
  openGraph: {
    title: "ARCANA INTELLIGENCE",
    description: "Beyond the Cards. Into the Meaning. — AI Tarot & Life Guidance",
    type: "website",
    locale: "th_TH",
    siteName: "ARCANA INTELLIGENCE",
  },
  twitter: { card: "summary_large_image" },
  // set GOOGLE_SITE_VERIFICATION to the token Search Console gives for the HTML-tag method
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  themeColor: "#101827",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${serif.variable} ${thaiSerif.variable} ${sans.variable}`}>
      <body>
        {children}
        <Tracker />
      </body>
    </html>
  );
}
