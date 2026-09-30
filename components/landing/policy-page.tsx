import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { PUBLIC_WIDTH } from "./site-chrome";

/* The privacy and terms pages (feature 34): plain text in a readable
   column, one h2 per topic. */
export function PolicyPage({ eyebrow, title, lead, children }: { eyebrow: string; title: ReactNode; lead: ReactNode; children: ReactNode }) {
  return (
    <article className={cn(PUBLIC_WIDTH, "flex max-w-[760px] flex-col gap-10 pt-14 md:pt-20")}>
      <header className="flex flex-col gap-4">
        <Eyebrow size={12}>{eyebrow}</Eyebrow>
        <h1 className="m-0 font-serif text-[44px] leading-[1.02] font-normal tracking-[-0.02em] md:text-[56px]">{title}</h1>
        <p className="m-0 text-[17px] leading-[1.6] text-ink-soft">{lead}</p>
      </header>
      {children}
    </article>
  );
}

export function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-8 text-body [&>p]:m-0">
      <h2 className="m-0 text-h2 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function PolicyList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
      {items.map((item, i) => (
        <li key={i} className="pl-1">
          {item}
        </li>
      ))}
    </ul>
  );
}
