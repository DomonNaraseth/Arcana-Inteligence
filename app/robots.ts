import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/auth/", "/account", "/reading/", "/pay/", "/history", "/journal", "/ask"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
