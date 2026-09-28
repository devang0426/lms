import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/* tailwind-merge must know our custom theme keys (app/globals.css @theme),
   otherwise it can't tell `text-h1` (font-size) from `text-ink` (color) and
   would drop one of them. Keep in sync with globals.css. */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "h1", "h2", "h3", "body", "small", "meta", "label"],
      radius: ["tile", "card", "panel"],
      shadow: ["hairline", "raised"],
      color: [
        "cream", "paper", "oat", "line", "line-strong", "ink", "ink-soft",
        "terracotta", "terracotta-hover", "clay", "clay-ink", "clay-stripe",
        "sage", "sage-tint", "sage-ink", "butter", "butter-tint", "butter-ink",
        "stripe", "media", "backdrop", "page", "surface", "sunken",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
