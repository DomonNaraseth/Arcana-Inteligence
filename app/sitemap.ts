import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, siteUrl } from "@/lib/site";
import { DECK } from "@/lib/tarot/deck";

/** Card ids never change (rule 9), so the static deck lists every card page. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    ...PUBLIC_PATHS.map((path) => ({
      url: `${base}${path === "/" ? "" : path}`,
      changeFrequency: (path === "/daily" ? "daily" : "weekly") as "daily" | "weekly",
      priority: path === "/" ? 1 : path === "/cards" ? 0.9 : 0.7,
    })),
    ...DECK.map((card) => ({
      url: `${base}/cards/${card.id}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
