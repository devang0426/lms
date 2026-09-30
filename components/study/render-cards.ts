import "server-only";

import { renderRichInline } from "@/lib/markdown";
import type { RenderedCard, StudyCard } from "@/lib/study/cards";

/* Flashcards for <FlashcardDeck>, with their Markdown and maths rendered
   (and sanitized) here on the server: the deck then needs none of marked,
   KaTeX or DOMPurify in the browser (feature 29). */
export function renderCards(cards: StudyCard[]): RenderedCard[] {
  return cards.map((c) => ({ ...c, frontHtml: renderRichInline(c.front), backHtml: renderRichInline(c.back) }));
}
