import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/valuation", "/sell", "/buy", "/about", "/contact"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === "" || p === "/valuation" ? "daily" : "monthly",
    priority: p === "" ? 1 : p === "/valuation" ? 0.9 : 0.6,
  }));
}
