# Feature 01: Design system CSS

**Status:** Done (2026-09-25)
**Depends on:** —
**Demo step:** all screens

## Goal

Replace the create-next-app styling with the Studyhall design system from
`../ui-context.md`, so every later feature can style with tokens only.

## Scope

**In:**
- CSS custom properties and the Tailwind v4 `@theme` mapping.
- Fonts.
- Base element styles.
- Removing the boilerplate page.

**Out:**
- Components (feature 04).
- Pages (feature 06 onwards).

## Files

- `app/globals.css`: rewrite.
- `app/layout.tsx`:
  - Load the fonts.
  - Set the metadata: title "Studyhall".
  - Style the body.
- `app/page.tsx`: replace with a temporary token preview page (swatches,
  type scale, radii). Feature 06 replaces it.
- Delete `public/next.svg` and `public/vercel.svg` and the other unused
  boilerplate assets.

## Implementation notes

- **Colors:**
  - Define every token from `ui-context.md` on `:root`. That's the core
    palette plus the supporting values (`--bg-base`, `--bg-surface`,
    `--bg-sunken`, `--border-default`, `--border-strong`, `--text-primary`,
    `--text-muted`, `--accent-*`, `--state-*`, `--bg-media`, `--bg-stripe`).
  - Map them in `@theme inline` so utilities read well: `bg-base`,
    `bg-surface`, `bg-sunken`, `border-line`, `text-ink`, `text-ink-soft`,
    `bg-terracotta`, `bg-clay`, `bg-sage`, `bg-sage-tint`, `bg-butter`,
    `bg-butter-tint` and so on. Note the chosen names back in
    `ui-context.md`.
- **Fonts:** load them with `next/font/google`:
  - `Instrument_Serif`: weight 400, normal and italic, variable
    `--font-serif`.
  - `Geist`: variable `--font-sans`.
  - `Geist_Mono`: variable `--font-mono`.
  - Map all three in `@theme` as `font-serif`, `font-sans` and `font-mono`.
- **Radius:** add radius tokens for 10, 20 and 28px (`rounded-card` = 20px
  and so on). Record them in `ui-context.md`.
- **Shadows:** `shadow-hairline` and `shadow-raised`, with the warm
  `rgba(60,40,20,…)` values.
- **Utilities:** add `.bg-stripe` for the placeholder stripe gradient.
- **Base styles:**
  - `body` gets `bg-base` and `text-ink`, the sans font, and 16px/1.6.
  - Links are Terracotta and darken to `#9E4220` on hover.
  - `:focus-visible` shows the Clay-tint ring.
- **Remove:** the `prefers-color-scheme: dark` block. The design is light
  only.
- **Font check:** before writing the font imports, read
  `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`.

## Acceptance criteria

- [x] The preview page shows every color, all three fonts, the type scale,
      the radii and both shadows. It matches the design board.
- [x] `grep -rE "#[0-9A-Fa-f]{6}" app components` finds hex values only in
      `globals.css`.
- [x] No dark mode styles remain.
- [x] `npm run build` passes. `lib/` is temporarily excluded in `tsconfig`;
      see the notes below.

## Implementation notes (as built)

- **Utility color names follow the design palette**, not `bg-base`:
  `cream`/`page`, `paper`/`surface`, `oat`/`sunken`, `line`, `ink`,
  `ink-soft`, `terracotta`, `clay`, `sage`, `butter` and so on. A color
  named `base` would clash with Tailwind's `text-base`. The full table is
  in `ui-context.md`.
- **`next/font` variables use a `-src` suffix** (`--font-geist-src` and so
  on), so the `@theme` `--font-*` tokens don't reference themselves.
- **Type scale utilities added:** `text-display`, `text-h1`–`text-h3`,
  `text-body`, `text-small`, `text-meta`, `text-label`.
- **Removed:** `public/{file,globe,next,vercel,window}.svg`. The default
  `favicon.ico` stays until a Studyhall icon exists.
- **`tsconfig.json` excludes `lib/`** because the unported NitroAI code
  doesn't compile yet (33 missing-module errors). Feature 05 must remove
  this exclude.
