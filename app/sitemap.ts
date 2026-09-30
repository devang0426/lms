import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteUrl } from "@/lib/institute";

/* sitemap.xml (feature 34): the public pages only. Nothing that needs a
   session is listed. Built once, statically. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({
    url: siteUrl(path),
    changeFrequency: path === "/welcome" ? "weekly" : "yearly",
    priority: path === "/welcome" ? 1 : 0.3,
  }));
}
