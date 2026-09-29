import "server-only";

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { safeFetchHtml } from "@/lib/net/safe-fetch";
import type { IngestResult } from "./index";
import { htmlToSections, partsText } from "./sections";

/* A web page, fetched on the server (feature 18). The fetch goes through
   the SSRF guard (lib/net/safe-fetch.ts); Readability then keeps the
   article and drops navigation, ads and footers, and the article is split
   into sections at its headings. Nothing from the page is ever rendered as
   HTML: only its text is kept. */
export async function ingestUrl(url: string): Promise<IngestResult> {
  const page = await safeFetchHtml(url);
  const { document } = parseHTML(page.body);
  const article = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
  const parts = article?.content ? htmlToSections(article.content) : htmlToSections(page.body);
  const text = partsText(parts);
  if (text.length < 200) {
    throw new Error("That page has almost no readable text (it may need JavaScript or a sign-in). Upload a PDF of it instead.");
  }
  const title = article?.title?.trim() || document.querySelector("title")?.textContent?.trim() || new URL(page.url).hostname;
  return { text, parts, title: title.slice(0, 160), meta: { url: page.url } };
}
