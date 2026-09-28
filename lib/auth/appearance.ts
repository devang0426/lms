/* Clerk component styling from the Studyhall tokens (ui-context.md).
   Colors reference CSS variables; key elements also get token utility
   classes. Clerk's CSS sits in the "clerk" cascade layer, which globals.css
   orders before Tailwind utilities so these classes win. */

export const clerkAppearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "var(--accent-primary)",
    colorForeground: "var(--text-primary)",
    colorMutedForeground: "var(--text-muted)",
    colorBackground: "var(--bg-surface)",
    colorInput: "var(--bg-surface)",
    colorInputForeground: "var(--text-primary)",
    colorNeutral: "var(--text-primary)",
    colorBorder: "var(--border-default)",
    colorRing: "var(--accent-tint)",
    fontFamily: "var(--font-sans)",
    borderRadius: "12px",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none border-0 bg-transparent",
    card: "bg-transparent shadow-none border-0 p-0",
    headerTitle: "font-serif text-h1 font-normal text-ink",
    headerSubtitle: "text-[15px] text-ink-soft",
    socialButtonsBlockButton: "h-[50px] rounded-xl border border-line bg-paper text-ink",
    dividerLine: "bg-line",
    dividerText: "text-meta text-ink-soft",
    formFieldLabel: "text-meta font-medium text-ink",
    formFieldInput: "h-[50px] rounded-xl border border-line bg-paper px-4 text-[15px] text-ink",
    formButtonPrimary:
      "h-[52px] rounded-full bg-terracotta text-[16px] font-medium normal-case text-paper shadow-none hover:bg-terracotta-hover",
    footer: "bg-transparent",
    footerActionLink: "text-terracotta hover:text-terracotta-hover",
  },
} as const;
