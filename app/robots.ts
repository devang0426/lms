import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteUrl } from "@/lib/institute";

/* robots.txt (feature 34): crawlers may read the public pages and "/"
   (which sends a signed-out visitor to /welcome), plus the static assets
   those pages need to render. Everything else needs a session, so it's
   kept out of search results. Built once, statically. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/$", ...PUBLIC_PAGES, "/_next/static/"], disallow: "/" },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
