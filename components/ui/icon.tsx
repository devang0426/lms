import type { LucideIcon, LucideProps } from "lucide-react";

/* Lucide icons with the design's defaults: 1.8 stroke, 18px, round caps.
   Sizes: 18 nav/buttons, 16 inline meta, 12–14 chevrons, 20–26 play. */
export function Icon({
  icon: Glyph,
  size = 18,
  strokeWidth = 1.8,
  ...props
}: { icon: LucideIcon } & LucideProps) {
  const labelled = props["aria-label"] !== undefined;
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      {...props}
    />
  );
}
